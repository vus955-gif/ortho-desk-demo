import { describe, expect, it } from "vitest";
import type { PipelineResult } from "../lib/pipeline";
import { isSnapshot, needsSnapshot, settle, type RunAccumulator, type Snapshot } from "../lib/settle";
import { REGULY } from "../lib/rules";
import type { Decyzja } from "../lib/types";

const decyzja = (tryb: "AUTO" | "DRAFT"): Decyzja => ({
  tryb,
  regula: tryb === "AUTO" ? { id: 6, nazwa: REGULY[5].nazwa } : { id: 7, nazwa: REGULY[6].nazwa },
  uzasadnienie: "test",
  slad: [{ id: tryb === "AUTO" ? 6 : 7, nazwa: "x", tryb, spelniona: true, dlaczego: "test" }],
  wersja_regul: "1.1",
  prog_pewnosci: 0.85,
});
const res = (blad: string | null = null, tryb: "AUTO" | "DRAFT" = "DRAFT") =>
  ({ blad_modelu: blad, decyzja: decyzja(tryb) }) as unknown as PipelineResult;
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
  it("stream cut after a conditional AUTO → not shown as AUTO: without a checked answer it is DRAFT (rule 7)", () => {
    const o = settle(acc({ r: res(null, "AUTO"), pending: true }), "TC-001", snap);
    expect(o.kind).toBe("success");
    if (o.kind !== "success") return;
    expect(o.r.decyzja.tryb).toBe("DRAFT");
    expect(o.r.decyzja.regula.id).toBe(7);
    expect(o.note).toMatch(/nie zostało potwierdzone/);
  });
  it("a completed AUTO result is shown as it came", () => {
    const o = settle(acc({ r: res(null, "AUTO") }), null, null);
    expect(o.kind === "success" && o.r.decyzja.tryb).toBe("AUTO");
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
