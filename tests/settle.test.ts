import { describe, expect, it } from "vitest";
import type { PipelineResult } from "../lib/pipeline";
import { isSnapshot, needsSnapshot, settle, type RunAccumulator, type Snapshot } from "../lib/settle";

const res = (blad: string | null = null) => ({ blad_modelu: blad }) as unknown as PipelineResult;
const acc = (p: Partial<RunAccumulator>): RunAccumulator => ({ r: null, fail: null, status: 200, pending: false, ...p });
const snap: Snapshot = { wygenerowano: "2026-10-10T13:30:23Z", wyniki: { "TC-001": res() } };

describe("settle: what the demo shows after a request", () => {
  it("success", () => {
    expect(settle(acc({ r: res() }), "TC-001", null).kind).toBe("success");
  });
  it("stream cut after the decision keeps the decision and says the draft is missing", () => {
    const o = settle(acc({ r: res(), pending: true }), null, null);
    expect(o.kind).toBe("success");
    expect(o.kind === "success" && o.note).toMatch(/przed szkicem/);
  });
  it("custom message + model failure → rule-3 result with an explanation", () => {
    const o = settle(acc({ r: res("timeout") }), null, null);
    expect(o.kind).toBe("live-fallback");
    expect(o.kind === "live-fallback" && o.note).toMatch(/reguła 3/);
  });
  it("custom message + rate limit → plain message without a misleading rule-3 note", () => {
    const o = settle(acc({ fail: "Limit zapytań", status: 429 }), null, null);
    expect(o).toEqual({ kind: "error", message: "Limit zapytań" });
  });
  it("custom message + server unreachable → message mentions the manual queue", () => {
    const o = settle(acc({ fail: "Brak połączenia z serwerem.", status: 0 }), null, null);
    expect(o.kind === "error" && o.message).toMatch(/kolejki ręcznej/);
  });
  it("example + API failure → recorded result, labelled with the reason", () => {
    const o = settle(acc({ fail: "Limit zapytań", status: 429 }), "TC-001", snap);
    expect(o.kind).toBe("recorded");
    expect(o.kind === "recorded" && o.recorded.reason).toBe("Limit zapytań");
  });
  it("example without a recording + model failure → live rule-3 result", () => {
    expect(settle(acc({ r: res("timeout") }), "TC-050", snap).kind).toBe("live-fallback");
  });
  it("example without a recording + no response → error, never a stuck state", () => {
    expect(settle(acc({ fail: "x", status: 0 }), "TC-050", null).kind).toBe("error");
  });
  it("needsSnapshot only for failed examples", () => {
    expect(needsSnapshot(acc({ r: res() }), "TC-001")).toBe(false);
    expect(needsSnapshot(acc({ r: res("x") }), "TC-001")).toBe(true);
    expect(needsSnapshot(acc({ fail: "x" }), null)).toBe(false);
  });
  it("validates the snapshot file shape", () => {
    expect(isSnapshot(snap)).toBe(true);
    expect(isSnapshot({ wygenerowano: "x" })).toBe(false);
    expect(isSnapshot(null)).toBe(false);
    expect(isSnapshot({ wygenerowano: "x", wyniki: null })).toBe(false);
  });
});
