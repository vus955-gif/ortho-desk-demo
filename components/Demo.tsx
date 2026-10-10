"use client";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { MAX_TEMAT, MAX_TRESC } from "../lib/limits";
import type { PipelineResult } from "../lib/pipeline";
import { SZYBKIE_TESTY } from "../lib/presets";
import { isSnapshot, needsSnapshot, settle, type RunAccumulator, type Snapshot } from "../lib/settle";
import { readNdjson } from "../lib/stream";
import { GRUPA_NAZWA, GRUPY, type Przypadek } from "../lib/testcases";
import type { Kanal, Zgloszenie } from "../lib/types";
import { ResultView } from "./ResultView";
import { RulesList } from "./RulesList";
import { Stepper, type Phase } from "./Stepper";

type View =
  | { kind: "idle" }
  | { kind: "run"; phase: Phase; input: Zgloszenie; r: PipelineResult | null; sample: Przypadek | null; recorded: { at: string; reason: string } | null; note: string | null }
  | { kind: "error"; input: Zgloszenie; message: string };

type Tab = "przyklady" | "wlasne";

const CLIENT_TIMEOUT_MS = 50_000;

const toZ = (p: Przypadek): Zgloszenie => ({ kanal: p.kanal, nadawca: p.nadawca, temat: p.temat, tresc: p.tresc, zalacznik: p.zalacznik });

/** Text for the single, always-mounted live region (screen readers). */
function announcement(view: View): string {
  if (view.kind === "idle") return "";
  if (view.kind === "error") return view.message;
  if (!view.r) return "Przetwarzanie zgłoszenia: model opisuje wiadomość.";
  const d = `${view.r.decyzja.tryb}, reguła ${view.r.decyzja.regula.id}: ${view.r.decyzja.regula.nazwa}.`;
  if (view.recorded) return `Zapis, nie wynik na żywo. Decyzja: ${d}`;
  if (view.phase === "drafting") return `Decyzja: ${d} Model pisze tekst.`;
  return `Gotowe. Decyzja: ${d}`;
}

export function Demo({
  przyklady,
  nadawcy,
  nieznany,
  startowy,
}: {
  przyklady: Przypadek[];
  nadawcy: { email: string; nazwa: string }[];
  nieznany: string;
  startowy: Przypadek | null;
}) {
  const [tab, setTab] = useState<Tab>(startowy ? "wlasne" : "przyklady");
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "idle" });
  const [form, setForm] = useState<Zgloszenie>(
    startowy ? toZ(startowy) : { kanal: "mail", nadawca: nadawcy[0]?.email ?? nieznany, temat: "", tresc: "", zalacznik: null },
  );
  // A form loaded from a test case keeps its expected labels until the visitor edits it.
  const [formCase, setFormCase] = useState<Przypadek | null>(startowy);
  const [hint, setHint] = useState<string | null>(
    startowy ? `Przypadek ${startowy.id} z zestawu testowego. Uruchom go na żywo przyciskiem poniżej albo najpierw zmień treść.` : null,
  );
  const snapshot = useRef<Snapshot | null>(null);
  const runId = useRef(0);
  const ctrlRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const tabRefs = { przyklady: useRef<HTMLButtonElement>(null), wlasne: useRef<HTMLButtonElement>(null) };
  const busy = view.kind === "run" && view.phase !== "done";

  useEffect(() => {
    if (startowy) submitRef.current?.focus({ preventScroll: true });
  }, [startowy]);
  // Abort an in-flight request when the page is left.
  useEffect(() => () => ctrlRef.current?.abort(), []);

  async function loadSnapshot(): Promise<Snapshot | null> {
    if (snapshot.current) return snapshot.current; // only successes are cached
    try {
      const res = await fetch("/snapshots.json", { cache: "no-cache" });
      const json: unknown = res.ok ? await res.json() : null;
      if (isSnapshot(json)) snapshot.current = json;
    } catch {
      /* not cached: the next attempt tries again */
    }
    return snapshot.current;
  }

  async function run(z: Zgloszenie, sample: Przypadek | null) {
    const id = ++runId.current;
    ctrlRef.current?.abort();
    const ctrl = new AbortController();
    ctrlRef.current = ctrl;
    // Updates from a superseded run are ignored.
    const set = (u: View | ((v: View) => View)) => {
      if (runId.current === id) setView(u);
    };

    set({ kind: "run", phase: "classifying", input: z, r: null, sample, recorded: null, note: null });
    if (window.matchMedia("(max-width: 900px)").matches) resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    try {
      const acc: RunAccumulator = { r: null, fail: null, status: 0, pending: false };
      const timer = setTimeout(() => ctrl.abort(), CLIENT_TIMEOUT_MS);
      try {
        const res = await fetch("/api/process", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(z),
          signal: ctrl.signal,
        });
        acc.status = res.status;
        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          acc.fail = data?.error ?? `Serwer zwrócił błąd ${res.status}.`;
        } else {
          await readNdjson(res.body, (e) => {
            if (e.etap === "blad") {
              acc.fail = e.error;
              return;
            }
            const pending = e.etap === "decyzja" && e.szkic_w_toku;
            acc.r = e.wynik;
            acc.pending = pending;
            if (!e.wynik.blad_modelu) set((v) => (v.kind === "run" ? { ...v, r: e.wynik, phase: pending ? "drafting" : "done" } : v));
          });
        }
      } catch {
        acc.fail = ctrl.signal.aborted ? "Serwer nie odpowiedział w ciągu 50 s." : "Brak połączenia z serwerem.";
        ctrl.abort();
      } finally {
        clearTimeout(timer);
      }
      if (runId.current !== id) return;

      const snap = needsSnapshot(acc, sample?.id ?? null) ? await loadSnapshot() : null;
      const o = settle(acc, sample?.id ?? null, snap);
      if (o.kind === "success") set((v) => (v.kind === "run" ? { ...v, r: o.r, phase: "done", note: o.note } : v));
      else if (o.kind === "live-fallback") set({ kind: "run", phase: "done", input: z, r: o.r, sample, recorded: null, note: o.note });
      else if (o.kind === "recorded") set({ kind: "run", phase: "done", input: z, r: o.r, sample, recorded: o.recorded, note: null });
      else set({ kind: "error", input: z, message: o.message });
    } catch {
      // Last-resort net: the UI must never stay in a loading state.
      set({ kind: "error", input: z, message: "Nieoczekiwany błąd w przeglądarce. Spróbuj ponownie." });
    }
  }

  const pick = (p: Przypadek) => {
    if (busy) return;
    setSelected(p.id);
    run(toZ(p), p);
  };

  const editCurrent = () => {
    if (view.kind === "idle") return;
    const sample = view.kind === "run" ? view.sample : null;
    setForm(view.input);
    setFormCase(sample);
    setHint(sample ? `Treść przykładu ${sample.id} skopiowana. Zmień ją, np. dopisz polecenie dla systemu, i sprawdź ponownie.` : null);
    setTab("wlasne");
  };

  const loadPreset = (i: number) => {
    const t = SZYBKIE_TESTY[i];
    setForm(t.z);
    setFormCase(null);
    setHint(`Czego się spodziewać: ${t.czego_szukac}`);
    submitRef.current?.focus({ preventScroll: true });
  };

  const edit = (patch: Partial<Zgloszenie>) => {
    setForm((f) => ({ ...f, ...patch }));
    if (formCase) {
      setFormCase(null);
      setHint("Treść zmieniona: to już nie jest przypadek z zestawu, więc oczekiwany wynik nie będzie pokazany.");
    }
  };

  // Tabs pattern: arrow keys move between the two tabs.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const next: Tab = tab === "przyklady" ? "wlasne" : "przyklady";
    setTab(next);
    tabRefs[next].current?.focus();
  };

  const over = form.tresc.length > MAX_TRESC;
  const knownSender = nadawcy.some((n) => n.email === form.nadawca) || form.nadawca === nieznany;
  const starters = (["AUTO", "DRAFT", "ESKALACJA"] as const)
    .map((t) => przyklady.find((p) => p.oczekiwane.tryb === t))
    .filter((p): p is Przypadek => !!p);

  return (
    <div className="bench">
      <h1 className="sr-only">Ortho Desk: demo triażu zgłoszeń klientów</h1>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement(view)}
      </p>
      <aside className="inbox" aria-label="Zgłoszenia">
        <div className="inbox-head">
          <h2>Skrzynka zgłoszeń</h2>
          <p>Przykłady z zestawu testowego albo własne zgłoszenie.</p>
        </div>
        <div className="tabs" role="tablist" aria-label="Źródło zgłoszenia">
          {(["przyklady", "wlasne"] as const).map((t) => (
            <button
              key={t}
              ref={tabRefs[t]}
              role="tab"
              id={`tab-${t}`}
              aria-controls={tab === t ? `panel-${t}` : undefined}
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              onKeyDown={onTabKey}
            >
              {t === "przyklady" ? `Przykłady (${przyklady.length})` : "Własne zgłoszenie"}
            </button>
          ))}
        </div>

        {tab === "przyklady" ? (
          <div className="msglist" role="tabpanel" id="panel-przyklady" aria-labelledby="tab-przyklady">
            {GRUPY.map((g) => {
              const items = przyklady.filter((p) => p.grupa === g);
              if (!items.length) return null;
              return (
                <section key={g} aria-label={GRUPA_NAZWA[g]}>
                  <h3 className="group-head">{GRUPA_NAZWA[g]}</h3>
                  <ul>
                    {items.map((p) => (
                      <li key={p.id}>
                        <button className="msg" aria-pressed={selected === p.id} aria-disabled={busy} onClick={() => pick(p)}>
                          <span className="msg-top">
                            <span>{p.nadawca}</span>
                            <span>{p.id}</span>
                          </span>
                          <span className="msg-subject">{p.temat || "(bez tematu)"}</span>
                          <span className="msg-preview">{p.tresc}</span>
                          {(p.kanal === "formularz" || p.zalacznik) && (
                            <span className="msg-tags">
                              {p.kanal === "formularz" && <span className="tag">formularz</span>}
                              {p.zalacznik && <span className="tag">załącznik</span>}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        ) : (
          <div role="tabpanel" id="panel-wlasne" aria-labelledby="tab-wlasne">
            <form
              className="compose"
              aria-label="Własne zgłoszenie"
              onSubmit={(e) => {
                e.preventDefault();
                if (busy || over || !form.tresc.trim()) return;
                setSelected(formCase?.id ?? null);
                run(form, formCase);
              }}
            >
              <div className="field">
                <span className="label" id="presets-label">Szybkie testy</span>
                <div className="presets" role="group" aria-labelledby="presets-label">
                  {SZYBKIE_TESTY.map((t, i) => (
                    <button key={t.etykieta} type="button" className="chip" onClick={() => loadPreset(i)}>
                      {t.etykieta}
                    </button>
                  ))}
                </div>
                <span className="hint">Gotowe treści spoza zestawu testowego. Wstawiają się do formularza; uruchamiasz je przyciskiem.</span>
              </div>
              {hint && <p className="callout soft">{hint}</p>}
              <div className="row2">
                <div className="field">
                  <label htmlFor="f-nadawca">Nadawca</label>
                  <select id="f-nadawca" value={knownSender ? form.nadawca : nieznany} onChange={(e) => edit({ nadawca: e.target.value })}>
                    {nadawcy.map((n) => (
                      <option key={n.email} value={n.email}>{n.nazwa}</option>
                    ))}
                    <option value={nieznany}>Adres spoza bazy klientów</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="f-kanal">Kanał</label>
                  <select id="f-kanal" value={form.kanal} onChange={(e) => edit({ kanal: e.target.value as Kanal })}>
                    <option value="mail">E-mail</option>
                    <option value="formularz">Formularz</option>
                  </select>
                </div>
              </div>
              <span className="hint">Nadawca to fikcyjny profil testowy. Od niego zależy, czy system może podać status zamówienia.</span>
              <div className="field">
                <label htmlFor="f-temat">Temat</label>
                <input id="f-temat" type="text" maxLength={MAX_TEMAT} value={form.temat} onChange={(e) => edit({ temat: e.target.value })} />
              </div>
              <div className="field">
                <label htmlFor="f-tresc">Treść zgłoszenia</label>
                <textarea id="f-tresc" value={form.tresc} onChange={(e) => edit({ tresc: e.target.value })} aria-describedby="f-licznik" />
                <span id="f-licznik" className={`counter ${over ? "over" : ""}`}>
                  {form.tresc.length} / {MAX_TRESC} znaków{over ? ": za długo" : ""}
                </span>
              </div>
              <label className="check">
                <input type="checkbox" checked={!!form.zalacznik} onChange={(e) => edit({ zalacznik: e.target.checked ? "zdjecie_produktu.jpg" : null })} />
                Dołączono zdjęcie (symulacja, plik nie jest przesyłany)
              </label>
              <button ref={submitRef} className="btn" type="submit" disabled={over || !form.tresc.trim()} aria-disabled={busy}>
                {busy ? "Przetwarzanie…" : "Przetwórz zgłoszenie"}
              </button>
              <span className="hint">Treść trafia do modelu tylko na czas przetwarzania i nie jest zapisywana. Nie wpisuj prawdziwych danych osobowych.</span>
            </form>
          </div>
        )}
      </aside>

      <div ref={resultRef} className="result-col">
        {view.kind === "idle" && (
          <section className="panel intro" aria-labelledby="h-intro">
            <h2 id="h-intro">Jak Ortho Desk decyduje</h2>
            <p className="intro-lede">
              Model językowy tylko opisuje zgłoszenie: kategorię, pewność, flagi ryzyka i dane. Tryb obsługi wybiera kod: pierwsza spełniona reguła z tej listy wygrywa, a reguły ryzyka są na górze.
            </p>
            <RulesList />
            {starters.length > 0 && (
              <>
                <h3 className="starters-head">Zacznij od jednego z trzech</h3>
                <div className="starters">
                  {starters.map((p) => (
                    <button key={p.id} className={`starter ${p.oczekiwane.tryb}`} onClick={() => pick(p)} aria-disabled={busy}>
                      <span className={`starter-mode c-${p.oczekiwane.tryb}`}>{p.oczekiwane.tryb}</span>
                      <span className="starter-title">{p.temat}</span>
                      <span className="starter-meta">{GRUPA_NAZWA[p.grupa]}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {view.kind === "error" && (
          <section className="panel stack">
            <p className="callout err">{view.message}</p>
            <button type="button" className="btn quiet" onClick={editCurrent}>
              Edytuj zgłoszenie
            </button>
          </section>
        )}

        {view.kind === "run" && (
          <div className="case">
            {!view.recorded && <Stepper phase={view.phase} r={view.r} />}
            {view.note && <p className="callout err">{view.note}</p>}
            {view.r ? (
              <ResultView r={view.r} sample={view.sample} recorded={view.recorded} draftPending={view.phase === "drafting"} onEdit={busy ? undefined : editCurrent} />
            ) : (
              <section className="panel" aria-busy="true">
                <div className="original">
                  <p className="meta">
                    {view.input.kanal === "mail" ? "E-mail" : "Formularz"} od {view.input.nadawca}
                  </p>
                  <p className="subject">{view.input.temat || "(bez tematu)"}</p>
                  <p className="body">{view.input.tresc}</p>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
