import type { Metadata } from "next";
import Link from "next/link";
import evalJson from "../../data/eval-results.json";
import type { EvalFile, WynikPrzypadku } from "../../lib/evaluate";
import { GRUPA_NAZWA, GRUPY } from "../../lib/testcases";
import { FLAGI, TRYBY } from "../../lib/types";

export const metadata: Metadata = { title: "Ortho Desk: wyniki ewaluacji" };

const data = evalJson as unknown as EvalFile;

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 1000) / 10}%`.replace(".", ",") : "–";
}

function ErrorItem({ w }: { w: WynikPrzypadku }) {
  return (
    <details>
      <summary>
        <strong>{w.id}</strong>
        <span>{GRUPA_NAZWA[w.grupa]}</span>
        <span>
          oczekiwano <strong className={`c-${w.oczekiwane.tryb}`}>{w.oczekiwane.tryb}</strong>, system{" "}
          <strong className={`c-${w.otrzymane.tryb}`}>{w.otrzymane.tryb}</strong>
        </span>
        <span style={{ color: "var(--muted)" }}>{w.temat}</span>
      </summary>
      <p className="explain">{w.wyjasnienie}</p>
      <p className="explain">
        <Link href={`/?przypadek=${w.id}`}>Otwórz {w.id} w demo i uruchom na żywo</Link>
      </p>
      <pre>
        {`Nadawca: ${w.nadawca} (${w.kanal})${w.zalacznik ? `, załącznik: ${w.zalacznik}` : ""}
Treść: ${w.tresc}

Model: kategoria=${w.otrzymane.kategoria}, pewność=${w.otrzymane.pewnosc}, flagi=[${w.otrzymane.flagi.join(", ")}]
Uzasadnienie modelu: ${w.otrzymane.uzasadnienie_modelu ?? "brak"}
Oczekiwane: kategoria=${w.oczekiwane.kategoria}, flagi=[${w.oczekiwane.flagi.join(", ")}], reguła ${w.oczekiwane.regula}
Uwaga do etykiety: ${w.uwagi || "–"}`}
      </pre>
    </details>
  );
}

export default function Wyniki() {
  if (data.status !== "zakonczono" || !data.meta || !data.metryki || !data.wyniki) {
    return (
      <main className="results">
        <h1 className="headline">Ewaluacja nie została jeszcze uruchomiona</h1>
        <div className="prose lede">
          <p>
            Wyniki powstają jednym poleceniem <code>npm run eval</code>: wszystkie przypadki testowe przechodzą przez ten sam pipeline co demo (model, sprawdzenia kodu, reguły). Plik z wynikami trafia do repozytorium bez ręcznych poprawek.
          </p>
        </div>
      </main>
    );
  }

  const { meta, metryki: m, wyniki } = data;
  const errors = wyniki.filter((w) => !w.trafny_tryb);
  const wrongAuto = errors.filter((w) => w.otrzymane.tryb === "AUTO");
  const missedEsc = errors.filter((w) => w.oczekiwane.tryb === "ESKALACJA");
  const missedAuto = errors.filter((w) => w.oczekiwane.tryb === "AUTO");
  const rest = errors.filter((w) => !wrongAuto.includes(w) && !missedEsc.includes(w) && !missedAuto.includes(w));
  const inc = m.czulosc_incydentow.eskalowane;

  return (
    <main className="results">
      <div>
        <h1 className="headline">
          Tryb trafny w {m.trafnosc_trybu.trafne} na {m.trafnosc_trybu.wszystkie} zgłoszeń testowych
        </h1>
        <p className="lede">
          Jeden przebieg z {new Date(meta.zakonczono).toLocaleDateString("pl-PL")} na {meta.zestaw.liczba} syntetycznych zgłoszeniach, model {meta.model}. Wyniki są zapisane tak, jak wyszły: bez poprawek i bez wybierania przypadków. Dotyczą danych testowych, nie realnego ruchu.
        </p>
      </div>

      <dl className="kv" aria-label="Najważniejsze metryki">
        <div>
          <dt>Trafność wyboru trybu</dt>
          <dd>{pct(m.trafnosc_trybu.trafne, m.trafnosc_trybu.wszystkie)} <small>{m.trafnosc_trybu.trafne}/{m.trafnosc_trybu.wszystkie}</small></dd>
        </div>
        <div>
          <dt>Możliwe incydenty eskalowane</dt>
          <dd className={inc.trafne === inc.wszystkie ? "ok" : "bad"}>{inc.trafne}/{inc.wszystkie}</dd>
          <p className="target">cel w specyfikacji: 100%</p>
        </div>
        <div>
          <dt>Błędne AUTO</dt>
          <dd className={m.bledne_auto === 0 ? "ok" : "bad"}>{m.bledne_auto}</dd>
          <p className="target">cel: 0 (AUTO tam, gdzie powinien zdecydować człowiek)</p>
        </div>
        <div>
          <dt>Trafność kategorii</dt>
          <dd>{pct(m.trafnosc_kategorii.trafne, m.trafnosc_kategorii.wszystkie)} <small>{m.trafnosc_kategorii.trafne}/{m.trafnosc_kategorii.wszystkie}</small></dd>
        </div>
        <div>
          <dt>Wynik zgodny ze schematem</dt>
          <dd className={m.zgodnosc_schematu.trafne === m.zgodnosc_schematu.wszystkie ? "ok" : "bad"}>
            {m.zgodnosc_schematu.trafne}/{m.zgodnosc_schematu.wszystkie}
          </dd>
          <p className="target">cel: 100%</p>
        </div>
        <div>
          <dt>Manipulacje z wynikiem AUTO</dt>
          <dd className={m.manipulacje.bez_auto === m.manipulacje.wszystkie ? "ok" : "bad"}>
            {m.manipulacje.wszystkie - m.manipulacje.bez_auto}/{m.manipulacje.wszystkie}
          </dd>
          <p className="target">flaga wykryta w {m.manipulacje.flaga_wykryta}/{m.manipulacje.wszystkie}</p>
        </div>
      </dl>

      <section className="panel">
        <h2>Macierz pomyłek</h2>
        <p className="lede" style={{ marginTop: 0, marginBottom: "0.8rem" }}>Wiersze: tryb oczekiwany w zestawie testowym. Kolumny: tryb wybrany przez system.</p>
        <div className="tablewrap">
          <table className="matrix">
            <thead>
              <tr>
                <th>oczekiwany \ system</th>
                {TRYBY.map((t) => <th key={t} className={`c-${t}`} style={{ textAlign: "center" }}>{t}</th>)}
                <th className="num">razem</th>
              </tr>
            </thead>
            <tbody>
              {TRYBY.map((e) => {
                const row = m.macierz[e];
                const total = TRYBY.reduce((s, o) => s + row[o], 0);
                return (
                  <tr key={e}>
                    <th className={`c-${e}`}>{e}</th>
                    {TRYBY.map((o) => (
                      <td key={o} className={`cell ${row[o] === 0 ? "zero" : e === o ? "diag" : "off"}`}>{row[o]}</td>
                    ))}
                    <td className="num">{total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Błędy ({errors.length})</h2>
        <p className="lede" style={{ marginTop: 0, marginBottom: "0.6rem" }}>
          Wyjaśnienia generuje kod z różnic między oczekiwaniem a wynikiem: brakujące lub nadmiarowe flagi, kategoria, pewność, sprawdzenia zamówienia i źródła. Najpierw błędy najgroźniejsze.
        </p>
        {errors.length === 0 && <p>Brak błędów wyboru trybu w tym przebiegu.</p>}
        {wrongAuto.length > 0 && <h3 style={{ margin: "0.8rem 0 0.3rem" }}>Błędne AUTO ({wrongAuto.length})</h3>}
        <div className="errlist">{wrongAuto.map((w) => <ErrorItem key={w.id} w={w} />)}</div>
        {missedEsc.length > 0 && <h3 style={{ margin: "0.8rem 0 0.3rem" }}>Nieeskalowane, choć powinny ({missedEsc.length})</h3>}
        <div className="errlist">{missedEsc.map((w) => <ErrorItem key={w.id} w={w} />)}</div>
        {missedAuto.length > 0 && <h3 style={{ margin: "0.8rem 0 0.3rem" }}>Oczekiwano AUTO, trafiło do człowieka ({missedAuto.length})</h3>}
        <div className="errlist">{missedAuto.map((w) => <ErrorItem key={w.id} w={w} />)}</div>
        {rest.length > 0 && <h3 style={{ margin: "0.8rem 0 0.3rem" }}>Pozostałe ({rest.length})</h3>}
        <div className="errlist">{rest.map((w) => <ErrorItem key={w.id} w={w} />)}</div>
      </section>

      <section className="panel">
        <details className="allcases">
          <summary>
            <h2>Wszystkie przypadki ({wyniki.length})</h2>
            <span className="lede">Pełna lista wyników tego przebiegu, bez wyboru. Każdy przypadek można otworzyć w demo.</span>
          </summary>
          <div className="tablewrap">
            <table>
              <thead>
                <tr>
                  <th>Przypadek</th>
                  <th>Grupa</th>
                  <th>Temat</th>
                  <th>Oczekiwany</th>
                  <th>System</th>
                  <th className="num">Reguła</th>
                  <th>Wynik</th>
                </tr>
              </thead>
              <tbody>
                {wyniki.map((w) => (
                  <tr key={w.id}>
                    <td><Link href={`/?przypadek=${w.id}`}>{w.id}</Link></td>
                    <td>{GRUPA_NAZWA[w.grupa]}</td>
                    <td>{w.temat}</td>
                    <td className={`c-${w.oczekiwane.tryb}`}>{w.oczekiwane.tryb}</td>
                    <td className={`c-${w.otrzymane.tryb}`}>{w.otrzymane.tryb}</td>
                    <td className="num">{w.otrzymane.regula}{w.trafna_regula ? "" : ` (ocz. ${w.oczekiwane.regula})`}</td>
                    <td>{w.trafny_tryb ? <span className="ok">zgodny</span> : <strong className="bad">błąd</strong>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <section className="panel">
        <h2>Trafność w grupach</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Grupa</th><th className="num">Tryb trafny</th><th className="num">%</th></tr>
            </thead>
            <tbody>
              {GRUPY.map((g) => (
                <tr key={g}>
                  <td>{GRUPA_NAZWA[g]}</td>
                  <td className="num">{m.per_grupa[g].trafne}/{m.per_grupa[g].wszystkie}</td>
                  <td className="num">{pct(m.per_grupa[g].trafne, m.per_grupa[g].wszystkie)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <h2>Flagi</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr><th>Flaga</th><th className="num">wykryte</th><th className="num">pominięte</th><th className="num">nadmiarowe</th></tr>
            </thead>
            <tbody>
              {FLAGI.map((f) => (
                <tr key={f}>
                  <td><code>{f}</code></td>
                  <td className="num">{m.flagi[f].tp}</td>
                  <td className="num">{m.flagi[f].fn}</td>
                  <td className="num">{m.flagi[f].fp}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel prose">
        <h2>Jak powstał ten wynik</h2>
        <ul>
          <li>Zestaw: {meta.zestaw.liczba} syntetycznych zgłoszeń ({meta.zestaw.plik}, SHA-256 <code>{meta.zestaw.sha256.slice(0, 16)}…</code>), zamrożony przed przebiegiem.</li>
          <li>Model {meta.model} (klasyfikacja: effort {meta.effort_klasyfikacji}), prompt {meta.prompt_klasyfikacji}, reguły v{meta.wersja_regul}, próg pewności {String(meta.prog_pewnosci).replace(".", ",")}.</li>
          <li>Każde zgłoszenie przeszło ten sam pipeline co demo: klasyfikacja, walidacja schematu, sprawdzenie zamówienia i źródła, reguły.</li>
          <li>Koszt modelu całego przebiegu: {m.koszt_usd} USD; średni czas na zgłoszenie {m.czas_ms.sredni} ms (p95 {m.czas_ms.p95} ms).</li>
          <li>{meta.uwaga}</li>
          <li>Zastrzeżenie: przed przebiegiem logikę sprawdzania źródła FAQ poprawiono po kontroli na etykietach tego zestawu (bez modelu), więc wynik ścieżki FAQ może być nieco optymistyczny. Szczegóły: DECISIONS.md, D-28.</li>
          <li>Przykłady w demo to dwa pierwsze przypadki z każdej grupy, wybrane regułą ustaloną przed przebiegiem.</li>
        </ul>
      </section>
    </main>
  );
}
