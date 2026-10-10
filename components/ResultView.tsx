import type { PipelineResult } from "../lib/pipeline";
import { REGULY } from "../lib/rules";
import type { Przypadek } from "../lib/testcases";
import type { Tryb } from "../lib/types";

export const TRYB_OPIS: Record<Tryb, string> = {
  AUTO: "Odpowiedź automatyczna bez udziału pracownika",
  DRAFT: "Szkic do akceptacji pracownika",
  ESKALACJA: "Natychmiast do osoby odpowiedzialnej",
};

export const KATEGORIA_NAZWA: Record<string, string> = {
  status_zamowienia: "Status zamówienia",
  pytanie_o_produkt: "Pytanie o produkt",
  dobor_zastosowanie: "Dobór lub zastosowanie",
  reklamacja: "Reklamacja",
  zwrot_wymiana: "Zwrot lub wymiana",
  inne: "Inne",
};

const RISK_FLAGS = new Set(["mozliwy_incydent", "grozba_prawna", "dane_wrazliwe"]);

function Ladder({ r }: { r: PipelineResult }) {
  const fired = r.decyzja.regula.id;
  return (
    <ol className="ladder" aria-label="Reguły decyzyjne w kolejności sprawdzania">
      {REGULY.map((rule) => {
        const t = r.decyzja.slad.find((s) => s.id === rule.id);
        const state = !t ? "skipped" : rule.id === fired ? `fired ${rule.tryb}` : "passed";
        return (
          <li key={rule.id} className={`rung ${state}`} aria-current={rule.id === fired ? "step" : undefined}>
            <span className="num">{rule.id}</span>
            <span className="cond">{rule.nazwa}</span>
            <span className={`mchip c-${rule.tryb}`}>{rule.tryb}</span>
            <span className="reason">
              {t ? (rule.id === fired ? `Zadziałała. ${t.dlaczego}` : `Nie dotyczy. ${t.dlaczego}`) : "Niesprawdzana: wcześniejsza reguła już zdecydowała."}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function Draft({ r, pending }: { r: PipelineResult; pending: boolean }) {
  const s = r.szkic;
  return (
    <section className="panel stack" aria-labelledby="h-draft">
      <h2 id="h-draft">
        {r.decyzja.tryb === "AUTO" ? "Odpowiedź do klienta" : r.decyzja.tryb === "DRAFT" ? "Szkic odpowiedzi do klienta" : "Notatka dla osoby odpowiedzialnej"}
      </h2>
      {r.uwagi.map((u) => (
        <p key={u} className="callout">{u}</p>
      ))}
      {pending && (
        <div className="pending">
          <span className="pending-bar" aria-hidden="true" />
          <span>
            Model pisze {r.decyzja.tryb === "ESKALACJA" ? "notatkę" : "tekst"} wyłącznie z {r.zrodla.length}{" "}
            {r.zrodla.length === 1 ? "źródła wybranego" : "źródeł wybranych"} przez kod. Decyzja powyżej jest już ostateczna.
          </span>
        </div>
      )}
      {r.blad_szkicu && <p className="callout err">{r.blad_szkicu}</p>}
      {s && (
        <div>
          <p className="letter-label">
            <strong className={`c-${r.decyzja.tryb}`}>{r.decyzja.tryb}</strong>
            <span className="sub">
              {s.rodzaj === "odpowiedz_auto"
                ? "W systemie wysyłana bez akceptacji (w demo nic nie jest wysyłane)."
                : s.rodzaj === "szkic_do_akceptacji"
                  ? "Pracownik sprawdza, poprawia i dopiero wtedy wysyła."
                  : "Alert wewnętrzny. Merytoryczną odpowiedź przygotowuje człowiek."}
            </span>
          </p>
          <div className="letter">{s.tekst}</div>
        </div>
      )}
      {s?.potwierdzenie_dla_klienta && (
        <div>
          <p className="letter-label">
            <strong>Potwierdzenie przyjęcia dla klienta</strong>
            <span className="sub">Stały szablon, bez udziału AI.</span>
          </p>
          <div className="letter">{s.potwierdzenie_dla_klienta}</div>
        </div>
      )}
      {s && s.odrzucone_zrodla.length > 0 && (
        <p className="callout err">Model powołał się na źródła spoza listy; odrzucono: {s.odrzucone_zrodla.join(", ")}.</p>
      )}
    </section>
  );
}

function Sources({ r, pending }: { r: PipelineResult; pending: boolean }) {
  return (
    <section className="panel" aria-labelledby="h-src">
      <h2 id="h-src">Źródła szkicu</h2>
      <p className="src-text" style={{ marginBottom: "0.6rem" }}>
        Źródła wybiera kod: dane zamówienia nadawcy albo fragmenty zatwierdzonej bazy wiedzy znalezione wyszukiwaniem słownikowym (BM25). Model może korzystać tylko z nich.
      </p>
      {r.zrodla.length === 0 ? (
        <p className="src-text">Brak źródeł dla tego zgłoszenia.</p>
      ) : (
        <ul className="sources">
          {r.zrodla.map((s) => (
            <li key={s.id}>
              <div className="src-head">
                <span className="src-id">{s.id}</span>
                <span>{s.tytul}</span>
                <span className="src-unused">v{s.wersja}{s.score !== null ? `, trafność ${s.score}` : ""}</span>
                {!pending && r.szkic && (s.uzyte ? <span className="src-used">użyte w szkicu</span> : <span className="src-unused">nieużyte</span>)}
              </div>
              <p className="src-text">{s.tekst}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Classification({ r }: { r: PipelineResult }) {
  const k = r.klasyfikacja;
  return (
    <section className="panel" aria-labelledby="h-cls">
      <h2 id="h-cls">Co rozpoznał model</h2>
      {!k ? (
        <p className="callout err">Brak poprawnego wyniku modelu: {r.blad_modelu}</p>
      ) : (
        <dl className="facts">
          <dt>Kategoria</dt>
          <dd>{KATEGORIA_NAZWA[k.kategoria]} <span className="src-id">({k.kategoria})</span></dd>
          <dt>Pewność</dt>
          <dd>
            <span className="meter">
              <span className="meter-track" aria-hidden="true">
                <span className="meter-fill" style={{ width: `${Math.round(k.pewnosc * 100)}%` }} />
                <span className="meter-mark" style={{ left: `${r.decyzja.prog_pewnosci * 100}%` }} title="próg" />
              </span>
              <span>{k.pewnosc.toFixed(2).replace(".", ",")} (próg {r.decyzja.prog_pewnosci.toFixed(2).replace(".", ",")})</span>
            </span>
          </dd>
          <dt>Flagi</dt>
          <dd>
            {k.flagi.length === 0 ? "brak" : (
              <span className="flags">
                {k.flagi.map((f) => <span key={f} className={`flag ${RISK_FLAGS.has(f) ? "" : "soft"}`}>{f}</span>)}
              </span>
            )}
          </dd>
          <dt>Nr zamówienia</dt>
          <dd>{k.dane.nr_zamowienia ?? "brak"}</dd>
          <dt>Produkt</dt>
          <dd>{k.dane.produkt ?? "brak"}</dd>
          <dt>Opis</dt>
          <dd>{k.dane.opis ?? "brak"}</dd>
          <dt>Język</dt>
          <dd>{k.dane.jezyk}</dd>
          <dt>Uzasadnienie</dt>
          <dd>{k.uzasadnienie}</dd>
        </dl>
      )}
      <h3 style={{ margin: "1rem 0 0.4rem" }}>Co sprawdził kod</h3>
      <dl className="facts">
        <dt>Zamówienie</dt>
        <dd>
          {k && k.kategoria !== "status_zamowienia" && <span className="src-unused">(nie wpływa na tryb przy tej kategorii) </span>}
          {r.sprawdzenie_zamowienia.opis}
        </dd>
        <dt>Źródło FAQ</dt>
        <dd>
          {k && k.kategoria !== "pytanie_o_produkt" ? (
            <span className="src-unused">Nie dotyczy: liczy się tylko przy pytaniu o produkt.</span>
          ) : (
            r.sprawdzenie_zrodla.opis
          )}
        </dd>
      </dl>
    </section>
  );
}

function Trace({ r }: { r: PipelineResult }) {
  const trace = {
    czas: r.czas,
    model: r.model,
    klasyfikacja: r.klasyfikacja,
    walidacja_schematu: r.walidacja,
    blad_modelu: r.blad_modelu,
    sprawdzenie_zamowienia: { status: r.sprawdzenie_zamowienia.status, opis: r.sprawdzenie_zamowienia.opis },
    sprawdzenie_zrodla: {
      status: r.sprawdzenie_zrodla.status,
      produkt: r.sprawdzenie_zrodla.produkt,
      artykul: r.sprawdzenie_zrodla.artykul,
      ranking: r.sprawdzenie_zrodla.ranking,
    },
    decyzja: { tryb: r.decyzja.tryb, regula: r.decyzja.regula, wersja_regul: r.decyzja.wersja_regul, prog: r.decyzja.prog_pewnosci },
    zrodla_szkicu: r.zrodla.map((s) => ({ id: s.id, wersja: s.wersja, uzyte: s.uzyte })),
    czasy_ms: r.czasy_ms,
    koszt: r.koszt,
  };
  return (
    <section className="panel">
      <details className="trace">
        <summary>Ślad decyzji: JSON klasyfikacji, reguła, czas</summary>
        <dl className="trace-meta">
          <dt>Reguła</dt>
          <dd>#{r.decyzja.regula.id} {r.decyzja.regula.nazwa} (reguły v{r.decyzja.wersja_regul})</dd>
          <dt>Model</dt>
          <dd>{r.model.id}, prompty {r.model.prompt_klasyfikacji} / {r.model.prompt_szkicu}</dd>
          <dt>Czas</dt>
          <dd>klasyfikacja {r.czasy_ms.klasyfikacja} ms, szkic {r.czasy_ms.szkic} ms, razem {r.czasy_ms.razem} ms</dd>
          <dt>Koszt</dt>
          <dd>{r.koszt.tokeny_wejscie} + {r.koszt.tokeny_wyjscie} tokenów, ok. {r.koszt.usd.toFixed(5)} USD</dd>
        </dl>
        <pre>{JSON.stringify(trace, null, 2)}</pre>
      </details>
    </section>
  );
}

export function ResultView({
  r,
  sample,
  recorded,
  draftPending = false,
  onEdit,
}: {
  r: PipelineResult;
  sample?: Przypadek | null;
  recorded?: { at: string; reason: string } | null;
  draftPending?: boolean;
  onEdit?: () => void;
}) {
  const z = r.wejscie;
  const expected = sample?.oczekiwane ?? null;
  return (
    <div className="case">
      {recorded && (
        <div className="recorded">
          <strong>Zapis, nie wynik na żywo.</strong> {recorded.reason} Pokazujemy wynik tego przykładu zapisany podczas lokalnego przebiegu ewaluacji ({new Date(recorded.at).toLocaleString("pl-PL")}).
        </div>
      )}
      <section className="panel">
        <div className="original">
          <p className="meta">
            {z.kanal === "mail" ? "E-mail" : "Formularz"} od {z.nadawca}
            {z.zalacznik ? `, załącznik: ${z.zalacznik}` : ""}
          </p>
          <p className="subject">{z.temat || "(bez tematu)"}</p>
          <p className="body">{z.tresc}</p>
        </div>
        {onEdit && (
          <button type="button" className="linkbtn" onClick={onEdit}>
            Zmień treść i sprawdź ponownie
          </button>
        )}
      </section>

      <section className={`verdict ${r.decyzja.tryb}`}>
        <p className="mode">{r.decyzja.tryb}</p>
        <p className="what">{TRYB_OPIS[r.decyzja.tryb]}. Reguła {r.decyzja.regula.id}: {r.decyzja.regula.nazwa}.</p>
        <p className="why">{r.decyzja.uzasadnienie}</p>
        {expected && sample && (
          <div className="expected">
            <p>
              <strong>{expected.tryb === r.decyzja.tryb ? "Zgodne z oczekiwaniem." : "Niezgodne z oczekiwaniem."}</strong>{" "}
              Zestaw testowy ({sample.id}) oczekuje: {expected.tryb}, reguła {expected.regula}, kategoria {expected.kategoria}
              {expected.flagi.length ? `, flagi: ${expected.flagi.join(", ")}` : ""}.
            </p>
            {sample.uwagi && <p className="expected-why">Po co ten przypadek: {sample.uwagi}</p>}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="h-rules">
        <h2 id="h-rules">Dlaczego ten tryb</h2>
        <Ladder r={r} />
      </section>

      <Draft r={r} pending={draftPending} />
      <Sources r={r} pending={draftPending} />
      <Classification r={r} />
      <Trace r={r} />
    </div>
  );
}
