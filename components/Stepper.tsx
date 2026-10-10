import type { PipelineResult } from "../lib/pipeline";

export type Phase = "classifying" | "drafting" | "done";

type State = "pending" | "active" | "done" | "error" | "skipped";

const STATE_TEXT: Record<State, string> = { pending: "oczekuje", active: "w toku", done: "ukończony", error: "błąd", skipped: "pominięty" };

/** Real progress of one message through the pipeline, driven by server events (no fake timers). */
export function Stepper({ phase, r }: { phase: Phase; r: PipelineResult | null }) {
  const modelFailed = !!r?.blad_modelu;
  const draftLabel = r?.decyzja.tryb === "ESKALACJA" ? "Model pisze notatkę" : "Model pisze szkic";
  const steps: { label: string; state: State; detail: string }[] = [
    {
      label: "Model opisuje zgłoszenie",
      state: !r ? "active" : modelFailed ? "error" : "done",
      detail: !r ? "kategoria, flagi, dane" : modelFailed ? "brak wyniku" : `${(r.czasy_ms.klasyfikacja / 1000).toFixed(1).replace(".", ",")} s`,
    },
    {
      label: "Kod sprawdza dane",
      state: r ? "done" : "pending",
      detail: "zamówienie i źródło",
    },
    {
      label: "Reguły wybierają tryb",
      state: r ? "done" : "pending",
      detail: r ? `${r.decyzja.tryb}, reguła ${r.decyzja.regula.id}` : "7 reguł po kolei",
    },
    {
      label: draftLabel,
      state: !r ? "pending" : modelFailed ? "skipped" : phase === "drafting" ? "active" : r.szkic ? "done" : r.blad_szkicu ? "error" : "skipped",
      detail:
        !r || phase === "drafting"
          ? "tylko z wybranych źródeł"
          : modelFailed
            ? "pominięty"
            : r.szkic
              ? `${(r.czasy_ms.szkic / 1000).toFixed(1).replace(".", ",")} s`
              : "brak",
    },
  ];
  return (
    <ol className="stepper" aria-label="Przebieg przetwarzania">
      {steps.map((s, i) => (
        <li key={s.label} className={`step ${s.state}`} aria-current={s.state === "active" ? "step" : undefined}>
          <span className="dot" aria-hidden="true">{s.state === "done" ? "✓" : s.state === "error" ? "!" : i + 1}</span>
          <span className="step-text">
            <span className="step-label">
              {s.label}
              <span className="sr-only">: {STATE_TEXT[s.state]}</span>
            </span>
            <span className="step-detail">{s.detail}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
