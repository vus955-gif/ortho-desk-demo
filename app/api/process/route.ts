// POST /api/process: runs one message through the pipeline. The API key is read from the server
// environment only; visitors' text is processed in memory and never written to logs or storage.
import { createAnthropicAdapter } from "../../../lib/llm";
import { MAX_BODY_BYTES, MAX_NADAWCA, MAX_TEMAT, MAX_TRESC, MAX_ZALACZNIK } from "../../../lib/limits";
import { processTicket } from "../../../lib/pipeline";
import { clientIp, LIMIT_GLOBALNY, LIMITY_IP, RateLimiter } from "../../../lib/ratelimit";
import type { Zgloszenie } from "../../../lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Live budgets in lib/llm.ts: classification 15 s × 2 attempts + draft 12 s ≈ 42 s, under this limit.
export const maxDuration = 60;

const perIp = new RateLimiter(LIMITY_IP);
const globalLimiter = new RateLimiter([LIMIT_GLOBALNY]);
const llm = createAnthropicAdapter();

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

function parse(body: unknown): { ok: true; z: Zgloszenie } | { ok: false; error: string } {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Nieprawidłowe dane." };
  const b = body as Record<string, unknown>;
  const kanal = b.kanal === "formularz" ? "formularz" : b.kanal === "mail" ? "mail" : null;
  if (!kanal) return { ok: false, error: "Nieprawidłowy kanał." };
  if (typeof b.tresc !== "string" || b.tresc.trim().length === 0) return { ok: false, error: "Treść zgłoszenia jest pusta." };
  if (b.tresc.length > MAX_TRESC) return { ok: false, error: `Treść jest za długa (limit ${MAX_TRESC} znaków).` };
  const temat = typeof b.temat === "string" ? b.temat : "";
  if (temat.length > MAX_TEMAT) return { ok: false, error: `Temat jest za długi (limit ${MAX_TEMAT} znaków).` };
  const nadawca = typeof b.nadawca === "string" ? b.nadawca.trim() : "";
  if (!/^[^\s@]{1,64}@[^\s@]{1,60}$/.test(nadawca) || nadawca.length > MAX_NADAWCA)
    return { ok: false, error: "Nieprawidłowy adres nadawcy." };
  const zal = b.zalacznik;
  if (zal !== null && zal !== undefined && (typeof zal !== "string" || zal.length > MAX_ZALACZNIK))
    return { ok: false, error: "Nieprawidłowa nazwa załącznika." };
  return { ok: true, z: { kanal, nadawca, temat, tresc: b.tresc, zalacznik: typeof zal === "string" && zal ? zal : null } };
}

export async function POST(req: Request): Promise<Response> {
  const len = Number(req.headers.get("content-length") ?? "0");
  if (len > MAX_BODY_BYTES) return json(413, { error: "Zgłoszenie jest za duże." });

  const wait = perIp.check(clientIp(req.headers));
  if (wait > 0)
    return json(429, { error: `Limit zapytań dla Twojego adresu IP. Spróbuj ponownie za ${wait} s.` }, { "retry-after": String(wait) });
  if (globalLimiter.check("all") > 0) return json(429, { error: "Demo osiągnęło godzinny limit zapytań. Spróbuj później." });

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return json(413, { error: "Zgłoszenie jest za duże." });
    body = JSON.parse(text);
  } catch {
    return json(400, { error: "Nieprawidłowy JSON." });
  }
  const p = parse(body);
  if (!p.ok) return json(400, { error: p.error });

  // Streamed as NDJSON: the rule decision is sent as soon as it exists (≈ after classification),
  // the draft follows in a second line. Each line is one complete JSON object.
  const encoder = new TextEncoder();
  const z = p.z;
  // Stop paying for model calls nobody will read: abort when the visitor disconnects.
  const abort = new AbortController();
  req.signal.addEventListener("abort", () => abort.abort(), { once: true });
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (o: unknown) => {
        if (abort.signal.aborted) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(o) + "\n"));
        } catch {
          abort.abort(); // the client already closed the stream
        }
      };
      try {
        const result = await processTicket(z, llm, {
          withDraft: true,
          signal: abort.signal,
          onDecision: (partial, pending) => send({ etap: "decyzja", wynik: partial, szkic_w_toku: pending }),
        });
        send({ etap: "gotowe", wynik: result });
      } catch {
        // Deliberately no logging of the request body.
        send({ etap: "blad", error: "Błąd przetwarzania po stronie serwera." });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      abort.abort();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

export function GET(): Response {
  return json(405, { error: "Użyj metody POST." }, { allow: "POST" });
}
