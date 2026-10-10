import { describe, expect, it } from "vitest";
import { readNdjson, type StreamEvent } from "../lib/stream";

function streamOf(chunks: Uint8Array[], onCancel?: () => void): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(ch);
      c.close();
    },
    cancel() {
      onCancel?.();
    },
  });
}

/** Byte offset of the first byte of `ch` within the UTF-8 encoding of `text`. */
const byteOffset = (text: string, ch: string) => new TextEncoder().encode(text.slice(0, text.indexOf(ch))).length;

describe("NDJSON reader", () => {
  it("handles chunks cut inside multi-byte characters and inside lines", async () => {
    const text = '{"etap":"blad","error":"źle"}\n{"etap":"blad","error":"żółw"}\n';
    const bytes = new TextEncoder().encode(text);
    const insideZ1 = byteOffset(text, "ź") + 1; // between the two bytes of "ź"
    const insideZ2 = byteOffset(text, "ż") + 1; // between the two bytes of "ż"
    expect(bytes[insideZ1 - 1] >= 0x80 && bytes[insideZ1] >= 0x80).toBe(true); // really mid-character
    const chunks = [bytes.slice(0, insideZ1), bytes.slice(insideZ1, insideZ2), bytes.slice(insideZ2)];
    const events: StreamEvent[] = [];
    await readNdjson(streamOf(chunks), (e) => events.push(e));
    expect(events).toEqual([
      { etap: "blad", error: "źle" },
      { etap: "blad", error: "żółw" },
    ]);
  });

  it("accepts a last line without a trailing newline and skips blank lines", async () => {
    const bytes = new TextEncoder().encode('\n{"etap":"blad","error":"a"}\n\n{"etap":"blad","error":"b"}');
    const events: StreamEvent[] = [];
    await readNdjson(streamOf([bytes]), (e) => events.push(e));
    expect(events.map((e) => (e.etap === "blad" ? e.error : ""))).toEqual(["a", "b"]);
  });

  it("rethrows on a malformed line, after delivering the good ones", async () => {
    const enc = new TextEncoder();
    const events: StreamEvent[] = [];
    const s = streamOf([enc.encode('{"etap":"blad","error":"ok"}\n{"etap":'), enc.encode("\n")]);
    await expect(readNdjson(s, (e) => events.push(e))).rejects.toThrow();
    expect(events).toHaveLength(1);
  });

  it("cancels the stream when the callback throws", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new TextEncoder().encode('{"etap":"blad","error":"x"}\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      readNdjson(body, () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(cancelled).toBe(true);
  });
});
