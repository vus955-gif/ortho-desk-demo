import { describe, expect, it } from "vitest";
import { clientIp, RateLimiter } from "../lib/ratelimit";

describe("rate limiter", () => {
  it("allows up to the limit, then asks to wait", () => {
    const rl = new RateLimiter([{ max: 3, windowMs: 60_000 }]);
    const t = 1_000_000;
    expect(rl.check("ip", t)).toBe(0);
    expect(rl.check("ip", t + 1)).toBe(0);
    expect(rl.check("ip", t + 2)).toBe(0);
    expect(rl.check("ip", t + 3)).toBeGreaterThan(0);
    expect(rl.check("other", t + 3)).toBe(0);
  });
  it("frees capacity after the window passes", () => {
    const rl = new RateLimiter([{ max: 1, windowMs: 1000 }]);
    expect(rl.check("ip", 0)).toBe(0);
    expect(rl.check("ip", 500)).toBe(1);
    expect(rl.check("ip", 1001)).toBe(0);
  });
  it("enforces every configured window", () => {
    const rl = new RateLimiter([
      { max: 10, windowMs: 1000 },
      { max: 2, windowMs: 60_000 },
    ]);
    expect(rl.check("ip", 0)).toBe(0);
    expect(rl.check("ip", 5000)).toBe(0);
    expect(rl.check("ip", 10_000)).toBeGreaterThan(0);
  });
  it("reads the client IP from proxy headers", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
    expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
    expect(clientIp(new Headers())).toBe("unknown");
  });
});
