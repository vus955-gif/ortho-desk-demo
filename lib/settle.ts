// What the demo shows once a request has ended. Pure, so every failure path is unit-tested.
import type { PipelineResult } from "./pipeline";

export interface Snapshot {
  wygenerowano: string;
  wyniki: Record<string, PipelineResult>;
}

export interface RunAccumulator {
  r: PipelineResult | null; // last result received from the stream
  fail: string | null; // transport / server error message
  status: number; // HTTP status (0 if no response)
  pending: boolean; // the last event announced a draft that never arrived
}

export type Outcome =
  | { kind: "success"; r: PipelineResult; note: string | null }
  | { kind: "live-fallback"; r: PipelineResult; note: string } // model failed; rule 3 result from the server
  | { kind: "recorded"; r: PipelineResult; recorded: { at: string; reason: string } }
  | { kind: "error"; message: string };

export const isSnapshot = (x: unknown): x is Snapshot =>
  typeof x === "object" &&
  x !== null &&
  typeof (x as Snapshot).wygenerowano === "string" &&
  typeof (x as Snapshot).wyniki === "object" &&
  (x as Snapshot).wyniki !== null;

/** True when the outcome depends on the recorded snapshot (a test-set example whose live run failed). */
export const needsSnapshot = (acc: RunAccumulator, sampleId: string | null) => !!sampleId && !(acc.r && !acc.r.blad_modelu);

export function settle(acc: RunAccumulator, sampleId: string | null, snap: Snapshot | null): Outcome {
  const r = acc.r;
  if (r && !r.blad_modelu)
    return { kind: "success", r, note: acc.pending ? "Połączenie przerwało się przed szkicem; decyzja reguł jest kompletna." : null };

  const reason = r?.blad_modelu ? `Model nie odpowiedział (${r.blad_modelu}).` : (acc.fail ?? "Nieznany błąd.");

  if (!sampleId) {
    if (r) return { kind: "live-fallback", r, note: `${reason} Tak działa reguła 3: sprawa trafia do kolejki ręcznej.` };
    const userFixable = acc.status === 400 || acc.status === 413 || acc.status === 429;
    return { kind: "error", message: userFixable ? reason : `${reason} W systemie sprawa trafiłaby do kolejki ręcznej (reguła 3).` };
  }

  const rec = snap?.wyniki[sampleId];
  if (snap && rec) return { kind: "recorded", r: rec, recorded: { at: snap.wygenerowano, reason } };
  if (r)
    return {
      kind: "live-fallback",
      r,
      note: `${reason} Zapisu tego przykładu nie ma, więc widać, co robi system bez modelu: reguła 3, kolejka ręczna.`,
    };
  return { kind: "error", message: `${reason} Zapis wyniku tego przykładu nie jest dostępny.` };
}
