// In-memory sliding-window rate limit. Best effort: each serverless instance keeps its own counters
// (see DECISIONS.md). The hard cost cap is the monthly spend limit set in the Anthropic Console.

export interface Limit {
  max: number;
  windowMs: number;
}

export const LIMITY_IP: Limit[] = [
  { max: 5, windowMs: 60_000 }, // 5 per minute
  { max: 30, windowMs: 60 * 60_000 }, // 30 per hour
];
export const LIMIT_GLOBALNY: Limit = { max: 300, windowMs: 60 * 60_000 }; // per instance per hour

export class RateLimiter {
  private hits = new Map<string, number[]>();
  constructor(private limits: Limit[]) {}

  /** Returns seconds to wait if the key is over a limit, otherwise records the hit and returns 0. */
  check(key: string, now = Date.now()): number {
    const longest = Math.max(...this.limits.map((l) => l.windowMs));
    const arr = (this.hits.get(key) ?? []).filter((t) => now - t < longest);
    for (const l of this.limits) {
      const inWindow = arr.filter((t) => now - t < l.windowMs);
      if (inWindow.length >= l.max) {
        this.hits.set(key, arr);
        return Math.ceil((inWindow[0] + l.windowMs - now) / 1000);
      }
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.prune(now, longest);
    return 0;
  }

  private prune(now: number, longest: number) {
    for (const [k, v] of this.hits) if (v.every((t) => now - t >= longest)) this.hits.delete(k);
  }
}

/** Client IP as seen by Vercel's proxy (first x-forwarded-for entry), falling back to x-real-ip. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
