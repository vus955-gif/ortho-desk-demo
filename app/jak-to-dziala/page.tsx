import type { Metadata } from "next";
import Link from "next/link";
import evalJson from "../../data/eval-results.json";
import { RulesList } from "../../components/RulesList";
import type { EvalFile } from "../../lib/evaluate";

export const metadata: Metadata = { title: "Ortho Desk: jak to działa" };

const REPO = "https://github.com/vus955-gif/ortho-desk-demo";
const ev = evalJson as unknown as EvalFile;

export default function JakToDziala() {
  const m = ev.status === "zakonczono" ? ev.metryki : undefined;
  return (
    <main className="results about">
      <div>
        <h1 className="headline">Model opisuje. Reguły decydują. Ryzyko trafia do człowieka.</h1>
        <p className="lede">
          Ortho Desk to demo obsługi zgłoszeń klientów dla fikcyjnego producenta ortez i stabilizatorów. Pokazuje jedną zasadę: model językowy rozumie treść wiadomości, ale o tym, co się z nią stanie, decydują jawne, testowane reguły.
        </p>
      </div>

      <section className="panel prose">
        <h2>Problem</h2>
        <p>
          Wszystkie wiadomości trafiają do jednej kolejki: pytanie o paczkę, prośba o instrukcję prania, reklamacja i, czasem, opis urazu po użyciu wyrobu medycznego. Pracownik czyta każdą tylko po to, żeby ją posortować. Proste sprawy czekają, a ta jedna groźna może utonąć.
        </p>
        <p>
          Koszt błędu jest nierówny. Zła data dostawy to niedogodność. Przeoczony incydent dotyczy zdrowia pacjenta i obowiązków producenta. Dlatego celem nie jest „AI odpowiada na wszystko", tylko: zdjąć z ludzi rutynę tam, gdzie to bezpieczne, a sprawy ryzykowne pokazać człowiekowi od razu.
        </p>
      </section>

      <section className="panel">
        <h2>Droga jednego zgłoszenia</h2>
        <ol className="flow">
          <li>
            <strong>Model opisuje wiadomość.</strong> Claude Haiku 5.5 zwraca JSON w stałym schemacie: kategorię, pewność, flagi ryzyka, numer zamówienia, produkt i krótkie uzasadnienie. Nie ma narzędzi ani dostępu do danych; treść klienta jest dla niego wyłącznie danymi.
          </li>
          <li>
            <strong>Kod sprawdza wynik.</strong> Walidacja schematu, a potem dwa sprawdzenia niezależne od modelu: czy zamówienie należy do nadawcy i czy baza wiedzy ma dokładnie jedno zatwierdzone źródło odpowiedzi.
          </li>
          <li>
            <strong>Reguły wybierają tryb.</strong> Siedem reguł sprawdzanych po kolei; wygrywa pierwsza spełniona, a reguły ryzyka są na górze.
          </li>
          <li>
            <strong>Model pisze tekst ze źródeł wybranych przez kod:</strong> odpowiedź, szkic dla pracownika albo notatkę dla osoby odpowiedzialnej. Przy eskalacji klient dostaje stałe potwierdzenie bez udziału AI.
          </li>
        </ol>
      </section>

      <section className="panel">
        <h2>Trzy tryby</h2>
        <dl className="modes">
          <div className="mode-card AUTO">
            <dt className="c-AUTO">AUTO</dt>
            <dd>Odpowiedź bez udziału pracownika. Tylko status zamówienia nadawcy albo publiczne pytanie o produkt z jednym zatwierdzonym źródłem.</dd>
          </div>
          <div className="mode-card DRAFT">
            <dt className="c-DRAFT">DRAFT</dt>
            <dd>Szkic odpowiedzi do akceptacji. Reklamacje, zwroty, dobór, sprawy niejasne, próby manipulacji, brak źródła.</dd>
          </div>
          <div className="mode-card ESKALACJA">
            <dt className="c-ESKALACJA">ESKALACJA</dt>
            <dd>Natychmiast do osoby odpowiedzialnej. Możliwy incydent, groźba prawna albo szczegółowa dokumentacja medyczna.</dd>
          </div>
        </dl>
      </section>

      <section className="panel">
        <h2>Reguły</h2>
        <RulesList />
      </section>

      <section className="panel prose">
        <h2>Wyszukiwanie w bazie wiedzy</h2>
        <p>
          Wyszukiwanie jest <strong>słownikowe, nie wektorowe</strong>. Fragmenty do szkiców wybiera algorytm BM25 po słowach i ich prostych odmianach. Do odpowiedzi AUTO na pytanie o produkt wymagane jest trafienie w dokładnie jeden temat artykułu według listy słów kluczowych; dwa tematy albo żaden oznaczają szkic dla człowieka. Taki wybór jest przewidywalny i daje się wyjaśnić: w demo widać, które fragmenty i w jakiej wersji posłużyły do odpowiedzi.
        </p>
      </section>

      <section className="panel prose">
        <h2>Bezpieczeństwo i prywatność</h2>
        <ul>
          <li>Klucz API jest wyłącznie na serwerze; przeglądarka rozmawia tylko z własnym API demo.</li>
          <li>Limit zapytań na adres IP i limit długości zgłoszenia; treści wpisywanych przez odwiedzających nie zapisujemy.</li>
          <li>Instrukcje ukryte w wiadomości nie dają modelowi żadnych uprawnień: wykryta próba manipulacji kończy się szkicem dla człowieka.</li>
          <li>Gdy model nie odpowiada, sprawa trafia do kolejki ręcznej (reguła 3), a przykłady pokazują zapisany wynik z wyraźnym oznaczeniem.</li>
        </ul>
      </section>

      <section className="panel prose">
        <h2>Czego to demo nie robi</h2>
        <ul>
          <li>Nie łączy się z prawdziwą pocztą, sklepem ani ERP; dane są fikcyjne i nic nie jest wysyłane.</li>
          <li>Nie analizuje załączników; sprawy, które ich wymagają, zostają u człowieka.</li>
          <li>Nie weryfikuje tożsamości nadawcy; w realnym wdrożeniu to osobny etap.</li>
          <li>
            Wyniki ewaluacji{m ? ` (tryb trafny w ${m.trafnosc_trybu.trafne}/${m.trafnosc_trybu.wszystkie}, incydenty eskalowane ${m.czulosc_incydentow.eskalowane.trafne}/${m.czulosc_incydentow.eskalowane.wszystkie})` : ""} dotyczą syntetycznego zestawu testowego, nie realnego ruchu. Szczegóły na stronie <Link href="/wyniki">Wyniki ewaluacji</Link>.
          </li>
        </ul>
      </section>

      <section className="panel prose">
        <h2>Autorstwo</h2>
        <p>
          Specyfikację, reguły decyzyjne, skład zestawu testowego i kryteria oceny przygotował autor projektu. Kod wygenerował Claude Code według tej specyfikacji. Wiadomości testowe napisał Claude Code według składu ze specyfikacji, a ich etykiety sprawdził osobny, niezależny agent.
        </p>
        <p>
          Kod źródłowy, rejestr decyzji implementacyjnych i surowe wyniki ewaluacji: <a href={REPO}>github.com/vus955-gif/ortho-desk-demo</a>.
        </p>
      </section>
    </main>
  );
}
