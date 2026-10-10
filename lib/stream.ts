// Reader for the NDJSON stream of POST /api/process (one JSON object per line).
import type { PipelineResult } from "./pipeline";

export type StreamEvent =
  | { etap: "decyzja"; wynik: PipelineResult; szkic_w_toku: boolean }
  | { etap: "gotowe"; wynik: PipelineResult }
  | { etap: "blad"; error: string };

/**
 * Calls onEvent for every complete line. Network chunks may split lines and multi-byte characters.
 * On a malformed line (or a throwing callback) the stream is cancelled and the error rethrown,
 * so the server stops working on a response nobody will read.
 */
export async function readNdjson(body: ReadableStream<Uint8Array>, onEvent: (e: StreamEvent) => void): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const flush = (final: boolean) => {
    let i: number;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onEvent(JSON.parse(line) as StreamEvent);
    }
    if (final && buf.trim()) {
      const last = buf;
      buf = "";
      onEvent(JSON.parse(last) as StreamEvent);
    }
  };
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      flush(false);
    }
    buf += decoder.decode();
    flush(true);
  } catch (e) {
    await reader.cancel().catch(() => {});
    throw e;
  } finally {
    reader.releaseLock();
  }
}
