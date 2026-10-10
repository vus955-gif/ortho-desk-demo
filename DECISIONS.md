# Rejestr decyzji implementacyjnych

Ten plik zapisuje decyzje podjęte przy budowie demo tam, gdzie specyfikacja (dokument projektowy z 24.09.2026,
tabela reguł, skład zestawu testowego) nie rozstrzygała szczegółu, oraz świadome odstępstwa od dokumentu projektowego
wynikające z zakresu tego zadania. Reguły decyzyjne są implementacją tabeli z rozdz. 5; tu opisane są wyłącznie
doprecyzowania warunków, których tabela nie definiuje operacyjnie.

Status każdej decyzji: **do akceptacji autora projektu**.

---

## A. Wejście do pracy

**D-01. Brak folderu `spec/` i listy przypadków testowych.**
W katalogu projektu były trzy PDF-y (dokument projektowy, prezentacja, karta procesu KP-01), bez folderu `spec/`
i bez pliku z ok. 100 przypadkami testowymi. Specyfikacja zawiera skład zestawu (rozdz. 13), ale nie same przypadki.
*Decyzja:* tabelę reguł przepisano wiernie do `spec/rules.md`, a 100 przypadków przygotowano jako **szkic** według
składu i wymagań z rozdz. 13 (`spec/test-cases.json`). Przypadki napisał osobny agent Claude Code, a etykiety sprawdził
drugi, niezależny agent. Etykiety są też sprawdzane testem spójności z regułami (`tests/testset.test.ts`).
Niezależny agent-weryfikator (osobna sesja, zgodnie z KP-01: weryfikator ≠ wykonawca) wskazał przed przebiegiem modelu
2 błędy etykiet i 1 niespójność danych. Poprawiono je: TC-083 (pęknięcie wkładki w trakcie noszenia to awaria podczas
użycia, więc oczekiwana jest ESKALACJA z reguły 1 mimo fałszywego nagłówka „SYSTEM"), TC-084 (numer zamówienia tylko we
wklejonym JSON-ie manipulacji, więc oczekiwane `nr_zamowienia` = null) oraz daty w TC-028 i TC-031 (wkładki dostarczone
12 dni wcześniej). Bez zmian, jako **dyskusyjne do decyzji właściciela**, zostały:
- TC-019, TC-021: sedno pytania jest w załączniku (zdjęcie metki lub opakowania); dosłownie reguła 3 dałaby DRAFT, a D-09 daje AUTO;
- TC-099: pytanie o lateks przy alergii, `pytanie_o_produkt` czy `dobor_zastosowanie`;
- TC-079: czy „proszę odnotować zgnieciony karton" to osobny wątek;
- TC-012, TC-011: AUTO zgodne z regułami, ale z niezadowoleniem lub ukrytą prośbą, którą wielu kierowników dałoby człowiekowi.
*Do zrobienia przez właściciela:* przejrzeć zestaw i powyższe przypadki. Ewaluacja została uruchomiona na tej wersji
zestawu (SHA-256 w `data/eval-results.json`); zmiana zestawu wymaga nowego, świadomego przebiegu (D-24).

**D-02. Nazwy trybów.** Dokument projektowy: AUTO / SZKIC / ESKALACJA. Założenia demo: AUTO / DRAFT / ESKALACJA.
*Decyzja:* w kodzie i UI używane jest `DRAFT` (= SZKIC).

**D-03. PDF-y źródłowe nie trafiają do repozytorium.** Prezentacja zawiera dane kontaktowe autora (telefon).
*Decyzja:* `*.pdf` jest w `.gitignore`. Reguły są w `spec/rules.md` z odwołaniem do rozdziałów źródła.

## B. Zakres i architektura (odstępstwa od dokumentu projektowego)

**D-04. Zakres demo = założenia tego prototypu, nie pełny plan 4-tygodniowy.** Dokument projektowy opisuje pełny przepływ
(poczta przychodząca, oba panele, n8n, D1/R2, deduplikacja, wątki UC7, wysyłka do skrzynek testowych). Ten prototyp
dotyczy publicznego demo triażu: wybór zgłoszenia → klasyfikacja → reguły → szkic → ślad decyzji + strona wyników.
*Decyzja:* elementy spoza zakresu prototypu nie są budowane i nie są deklarowane jako zrobione.

**D-05. Stos: Next.js 16 (App Router) + funkcja serwerowa na Vercel** zamiast Cloudflare Workers/D1/R2 + n8n (ADR-4, ADR-5).
Powód: założenia demo wskazują Vercel i prosty stos. Jedna aplikacja obsługuje UI i API; klucz API jest tylko w zmiennej
środowiskowej funkcji serwerowej. Brak bazy danych, bo demo niczego nie przechowuje (D-16).

**D-06. Model: `claude-haiku-5-5`** zamiast GPT-6 Luna wskazanego w ADR-3. Założenie demo: szybki model (np. Haiku).
ID zweryfikowane w dokumentacji Claude API (stan na 10.2026). Wymienny adapter z ADR-3 zachowany (`lib/llm.ts`,
interfejs `LlmAdapter`). Model ustawia się zmienną `ORTHO_MODEL`.

**D-07. Ustawienia modelu.** Wyjście strukturalne (`output_config.format`, JSON Schema) + walidacja w aplikacji
(`lib/schema.ts`), bo structured outputs nie egzekwują zakresów liczbowych (pewność 0–1 sprawdza kod).
Klasyfikacja: `effort: medium` (domyślny dla Haiku 5.5; rozpoznawanie incydentów bez słów kluczowych korzysta z rozumowania).
Szkice: `effort: low`. Haiku 5.5 nie przyjmuje parametru `temperature`, więc wyniki **nie są deterministyczne**.

## C. Doprecyzowanie reguł (tabela z rozdz. 5)

**D-08. Reguła 1–2 przy błędzie modelu.** Gdy model nie zwróci poprawnego wyniku, flagi są nieznane, więc reguły 1–2
nie mogą zadziałać i sprawa trafia do reguły 3 (DRAFT / ręcznie). Tak wynika z kolejności w tabeli.
*Konsekwencja do świadomej akceptacji:* opis incydentu przy awarii modelu trafia do kolejki ręcznej, a nie do eskalacji.

**D-09. Reguła 3: „rozstrzygnięcie wymaga oceny załącznika".** Specyfikacja nie podaje kryterium, a schemat wyjścia
modelu nie ma pola na tę ocenę. *Decyzja:* warunek liczy kod: **załącznik obecny ORAZ kategoria ∈ {reklamacja, zwrot_wymiana}**
(tam plik jest dowodem w sprawie). Przy statusie i pytaniu o produkt załącznik nie blokuje AUTO („Samo dołączenie pliku
nie wyłącza AUTO"). Stała: `KATEGORIE_WYMAGAJACE_OCENY_ZALACZNIKA` w `lib/rules.ts`.

**D-10. Reguła 5: „poniżej progu" = ściśle mniej niż 0,85.** Pewność 0,85 nie uruchamia reguły 5 (test jednostkowy).

**D-11. Reguła 6, ścieżka statusu.** Zamówienie „przypisane do testowego klienta":
- nadawca musi być profilem testowym (porównanie adresu bez rozróżniania wielkości liter);
- numer podany → musi istnieć i należeć do nadawcy; cudzy numer → DRAFT i **żadne dane tego zamówienia nie trafiają do szkicu**;
- bez numeru → dokładnie jedno zamówienie nadawcy (UC1); 0 lub 2+ → DRAFT z prośbą o numer;
- liczą się zamówienia w każdym statusie (odpowiedź po prostu raportuje status z danych, także „wstrzymane");
- numer bierze się z wyniku modelu; gdy model go nie poda, kod szuka wzorca `ZAM-12345` w treści (deterministyczna kopia zapasowa).

**D-12. Reguła 6, ścieżka FAQ: „jednoznaczne, zatwierdzone źródło".**
1. Produkt musi wynikać z katalogu: kod/nazwa/alias → jeden produkt; słowo typu („stabilizator nadgarstka") → tylko gdy
   w katalogu jest jeden produkt tego typu; gdy kilka (dwie ortezy kolanowe), rozstrzyga zamówienie nadawcy, jeśli zawiera
   dokładnie jeden z nich („Produkt musi odpowiadać katalogowi lub zamówieniu testowemu"). Kilka produktów → brak źródła.
2. Produkt musi mieć zatwierdzone FAQ (w bazie demo: KX-210, KX-300, NX-110, SX-150, CX-40, LX-500; tematy: materiał,
   pielęgnacja, zakładanie). Artykuły wycofane są wykluczone.
3. Temat: rozpoznawany **wyłącznie po słowach kluczowych tematu** każdego artykułu FAQ tego produktu (lista `slowa_kluczowe`
   w `data/kb.json`), z pominięciem słów nazwy produktu. Zero trafień → brak źródła. Trafienia w więcej niż jednym artykule
   → „rozbieżne dopasowania" → DRAFT (np. pytanie jednocześnie o pranie i zakładanie). Słowa z treści artykułu, które
   nie są słowami tematu, się nie liczą (patrz D-28).
4. Pytania o rozmiar to kategoria `dobor_zastosowanie` (DRAFT), także gdy istnieje tabela rozmiarów: wybór rozmiaru jest doborem.

**D-13. Kanał.** Mail i formularz są traktowane jednakowo (rozdz. 5: AUTO dla obu kanałów).

## D. Warstwa AI i źródła

**D-14. Wyszukiwanie: słownikowe (leksykalne), nie wektorowe.** BM25 po fragmentach bazy wiedzy; do każdego fragmentu
indeksowane są tytuł, tekst i ręcznie przygotowana lista słów kluczowych artykułu (PL + EN). Normalizacja: małe litery,
usunięcie polskich znaków diakrytycznych, prosty stemming przez obcinanie końcówek.
Powody: deterministyczność i wyjaśnialność (UI pokazuje wynik dopasowania), brak drugiego dostawcy i klucza (embeddingi),
mała baza. Koszt decyzji: parafrazy i synonimy działają tylko wtedy, gdy są na liście słów kluczowych, a pytania po
angielsku do polskiej bazy działają dzięki angielskim słowom kluczowym.

**D-15. Źródła wybiera kod, model tylko z nich korzysta.** AUTO-status: dane zamówienia nadawcy (+ znaczenie statusów).
AUTO-FAQ: wyłącznie fragmenty jednego dopasowanego artykułu. DRAFT/ESKALACJA: zamówienie nadawcy (jeśli potwierdzone),
4 najlepsze fragmenty BM25, a przy eskalacji fragment o priorytecie incydentów. Model musi wskazać identyfikatory użytych
źródeł; identyfikatory spoza listy są odrzucane i pokazywane w UI.

**D-16. Prompt klasyfikacji** zawiera definicje kategorii i flag ze specyfikacji, doprecyzowane przykładami
(np. czym jest, a czym nie jest `dane_wrazliwe`: sama wzmianka o operacji to jeszcze nie dokumentacja medyczna).
Zgodnie z rozdz. 17 („świadomy kompromis na rzecz czułości") prompt każe przy wątpliwości dodać `mozliwy_incydent`.
Treść klienta jest w wydzielonym bloku danych, a nawiasy `< >` w treści są neutralizowane, żeby nie dało się zamknąć bloku.

**D-17. ESKALACJA.** Model pisze notatkę wewnętrzną dla osoby odpowiedzialnej (co zgłoszono, produkt/zamówienie,
dlaczego eskalacja, czego brakuje, pierwsze kroki), bez kwalifikacji incydentu. Klient dostaje **stały szablon**
potwierdzenia bez udziału AI (UC5). Szablon zawiera jedno zdanie bezpieczeństwa: przy potrzebie pilnej pomocy
kontakt z lekarzem lub 112. *Do akceptacji:* czy to zdanie ma zostać.

**D-18. Oznaczenie AI i forma zwrotu.** Odpowiedzi AUTO mają stałą stopkę „przygotowane automatycznie przez system AI" (rozdz. 12).
Szkice zaczynają się od „Dzień dobry," / „Hello," i nie używają imion ani form Pan/Pani, Mr/Ms; model nie dostaje imienia klienta
(nie jest potrzebne do odpowiedzi). Zapisy przykładów z ewaluacji (`public/snapshots.json`) powstały z promptem szkicu 1.1
i dwa angielskie zawierają jeszcze „Dear Mr./Ms."; nie są nadpisywane, bo to utrwalony przebieg. Prompt klasyfikacji,
który decyduje o wynikach ewaluacji, jest ten sam (klasyfikacja-1.0).

**D-19. Tożsamość nadawcy.** W demo nadawcę wybiera się z listy profili testowych; brak weryfikacji tożsamości
(zgodnie z rozdz. 11: weryfikacja należy do przygotowania wdrożenia).

## E. Bezpieczeństwo i działanie publicznego linku

**D-29. Ryzyko resztkowe: treść odpowiedzi AUTO.** O trybie decydują reguły, ale tekst odpowiedzi AUTO pisze model,
który widzi treść klienta. Próba manipulacji, której klasyfikator nie oznaczy flagą, mogłaby więc wpłynąć na brzmienie
odpowiedzi automatycznej (nie na tryb ani na dobór źródeł). Ograniczenia w demo: AUTO tylko dla statusu i FAQ, źródła
wybiera kod, treść klienta jest w bloku danych, a prompt zakazuje obietnic i porad. Przed realnym wdrożeniem warto
rozważyć szablonowe odpowiedzi AUTO, czyli dane ze źródła wstawiane bez generowania, albo kontrolę wyniku. Zgodnie z rozdz. 11
demo nie deklaruje odporności na wszystkie ataki.

**D-20. Limity.** Treść ≤ 2000 znaków, temat ≤ 150, całe żądanie ≤ 12 KB. Limit na IP: 5/min i 30/h;
limit globalny: 300/h **na instancję funkcji**. Liczniki są w pamięci (bez zewnętrznej bazy), więc przy kilku instancjach
limit jest przybliżony. Twardym limitem kosztu jest **miesięczny limit wydatków w konsoli Anthropic**.

**D-21. Brak zapisu treści odwiedzających.** API przetwarza treść w pamięci, nie loguje jej i nie zapisuje. Poza kontrolą
aplikacji pozostaje polityka retencji dostawcy API (Anthropic) dla treści zapytań.

**D-22. Awaria API.** Dla przykładów: UI pokazuje wynik zapisany podczas przebiegu ewaluacji (`public/snapshots.json`)
z wyraźnym oznaczeniem „Zapis, nie wynik na żywo" i powodem. Dla własnego tekstu: wynik reguły 3 (kolejka ręczna)
z komunikatem o niedostępności modelu. Strona jest statyczna, więc link działa niezależnie od API.

## F. Ewaluacja

**D-23. Przykłady w demo** wybiera stała reguła ustalona przed przebiegiem: **dwa pierwsze przypadki z każdej grupy**
(8 × 2 = 16). Nie są wybierane po wynikach.

**D-24. Jeden przebieg, zapis bez ingerencji.** `npm run eval` przepuszcza wszystkie 100 przypadków przez ten sam pipeline
co demo i zapisuje wynik do `data/eval-results.json`, `public/snapshots.json` i bloku w README. Zestaw ma zapisany
SHA-256; ponowny przebieg na tym samym zestawie wymaga świadomego `--force`. Sprawdzenie połączenia (`npm run smoke`)
używa wiadomości **spoza** zestawu testowego.

**D-25. Definicje metryk.**
- Trafność trybu: tryb systemu = tryb oczekiwany.
- Czułość incydentów: przypadki z oczekiwaną flagą `mozliwy_incydent`, które system **eskalował** (sama flaga to za mało).
- Błędne AUTO: system dał AUTO, a oczekiwano DRAFT lub ESKALACJI.
- Zgodność schematu: odsetek wyników modelu, które przeszły walidację.
- Manipulacje: przypadki z grupy „injection", które dostały AUTO (cel 0), oraz liczba wykrytych flag.
- Wyjaśnienia błędów generuje kod z różnic (flagi, kategoria, pewność, sprawdzenia), a nie model.

**D-26. Test spójności zestawu** (`tests/testset.test.ts`) sprawdza, czy etykiety oczekiwane przepuszczone przez silnik
dają oczekiwany tryb i regułę. Ścieżka FAQ korzysta tu z oczekiwanego źródła, a nie z wyszukiwarki, bo jakość wyszukiwania
mierzy prawdziwy przebieg.

**D-27. Oceniany jest wybór trybu, nie treść szkiców.** Automatyczna ocena faktów w szkicach (rozdz. 13, „Źródła i fakty")
nie jest częścią tego przebiegu. Szkice przykładów są widoczne w demo do oceny przez człowieka.

**D-28. Poprawka sprawdzenia źródła FAQ po kontroli na etykietach zestawu testowego (ujawnienie).**
Przed jakimkolwiek przebiegiem modelu sprawdzono logikę z D-12 na *oczekiwanych* etykietach zestawu (bez modelu).
Pierwsza wersja szukała tematu metodą BM25 po całej treści artykułów z progiem przewagi 1,5×. Dawała AUTO tam, gdzie
reguła wymaga szkicu: przypadkowe słowa z treści artykułu („przed", „lekarz") wyglądały na dopasowanie tematu, a pytanie
o dwa tematy przechodziło próg. Byłyby to 3 błędne AUTO (TC-026, TC-029, TC-030).
*Decyzja:* zmiana **ogólna**, bez edycji bazy wiedzy i słów kluczowych pod konkretne przypadki: temat tylko po słowach
kluczowych, a trafienie w drugi temat oznacza rozbieżność (D-12 pkt 3). Po zmianie na etykietach: 20 z 22 pytań o produkt
zgodnych. Dwa (TC-019, TC-021) zostają jako DRAFT zamiast AUTO, bo słowo kluczowe („szyna", „pokrowiec") należy do dwóch
tematów. To błąd w bezpieczną stronę i **świadomie nie jest dalej dostrajany**: kolejne poprawki pod ten sam zestaw zawyżałyby wynik.
*Konsekwencja dla wyników:* ponieważ błąd znaleziono na zestawie testowym, wynik części „wyszukiwanie" jest nieco
optymistyczny. Wyniki modelu (klasyfikacja) nie są tym dotknięte: model nie widział zestawu przed przebiegiem.
BM25 nadal wybiera fragmenty do szkiców DRAFT i ESKALACJI.

## G. Zmiany po przebiegu ewaluacji (bez wpływu na decyzje)

**D-30. Co zmieniono po ewaluacji i dlaczego wynik pozostaje ważny.** Po przebiegu zmieniono wyłącznie warstwę
prezentacji i dostarczania wyniku: strumieniowanie odpowiedzi API (najpierw decyzja, potem szkic), pasek etapów,
ekran startowy z tabelą reguł, szybkie testy w formularzu, linki `/?przypadek=…`, stronę „Jak to działa", obrazek
podglądu linku i strony błędów. Prompt szkicu zmienił się na 1.2 (D-18). W silniku reguł zmieniono **tylko tekst
uzasadnienia** reguły 7: przywołuje teraz konkretny powód braku AUTO. Warunki, kolejność i progi reguł, prompt
klasyfikacji i wyszukiwanie są bez zmian, a testy jednostkowe silnika przechodzą bez modyfikacji. Test regresji
`tests/replay.test.ts` odtwarza wszystkie 100 zapisanych wyników modelu przez obecny kod i potwierdza 100/100 identycznych
decyzji; jeśli reguły lub wyszukiwanie się zmienią, test to wykaże. Plik
`data/eval-results.json` zawiera teksty uzasadnień z chwili przebiegu i nie jest nadpisywany. Uzasadnienie reguły trafia
też do promptu szkicu, więc szkice na żywo w sprawach z reguły 7 dostają teraz konkretny powód braku AUTO; zapisane
przykłady (`public/snapshots.json`) pokazują wcześniejsze brzmienie. Odporność: zapytanie do modelu jest przerywane, gdy
odwiedzający się rozłączy, a budżety czasu (klasyfikacja 15 s × 2 próby, szkic 12 s) mieszczą się w limicie funkcji (60 s).

**D-31. Szybkie testy w formularzu** (`lib/presets.ts`) to własne przykłady spoza zestawu testowego: manipulacja,
cudze zamówienie, incydent bez słów kluczowych, groźba prawna, pytanie przed zakupem. Wstawiają treść do formularza,
ale niczego nie uruchamiają same, więc nie generują kosztów bez kliknięcia.
