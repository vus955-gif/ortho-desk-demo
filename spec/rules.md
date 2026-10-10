# Ortho Desk: reguły decyzyjne (transkrypcja specyfikacji)

Źródło: *Ortho Desk: dokument projektowy demo* (24.09.2026), rozdz. 5 „Kategorie, flagi i reguły",
rozdz. 6 „Warstwa AI" oraz slajd „04: Reguły i kalibracja" z prezentacji projektu.
Ten plik jest przepisaniem, a nie nową wersją. Doprecyzowania implementacyjne są w `DECISIONS.md`.

Nazewnictwo trybów: specyfikacja używa nazw AUTO / SZKIC / ESKALACJA, a demo używa AUTO / **DRAFT** / ESKALACJA
(DRAFT = SZKIC).

## Kategorie

`status_zamowienia` · `pytanie_o_produkt` · `dobor_zastosowanie` · `reklamacja` · `zwrot_wymiana` · `inne`

## Flagi (niezależne od kategorii)

| Flaga | Znaczenie wg specyfikacji |
|---|---|
| `mozliwy_incydent` | uraz lub awaria podczas użycia |
| `grozba_prawna` | zgłoszenie wymagające oceny człowieka |
| `dane_wrazliwe` | szczegółowa dokumentacja medyczna |
| `wiele_watkow` | kilka spraw w jednej wiadomości |
| `podejrzenie_manipulacji` | instrukcje dla systemu w treści |

## Tabela reguł: pierwszy spełniony warunek wygrywa

| # | Warunek | Tryb |
|---|---|---|
| 1 | Flaga `mozliwy_incydent`, niezależnie od kategorii i pewności | ESKALACJA |
| 2 | Flaga `grozba_prawna` lub `dane_wrazliwe` | ESKALACJA |
| 3 | Błąd modelu/schematu albo rozstrzygnięcie wymaga oceny załącznika (AI nie analizuje plików) | DRAFT (SZKIC / ręcznie) |
| 4 | Flaga `podejrzenie_manipulacji` (instrukcje dla systemu w treści) | DRAFT |
| 5 | Pewność poniżej progu (start: 0,85) lub flaga `wiele_watkow` | DRAFT |
| 6 | Mail lub formularz + kategoria AUTO + jednoznaczne źródło. Status: zamówienie przypisane do testowego klienta (jego dane). FAQ produktu: zatwierdzona baza, bez wymogu zamówienia | AUTO |
| 7 | Wszystkie pozostałe | DRAFT |

Zasady towarzyszące (cytaty ze specyfikacji, skrócone):

- „Samo dołączenie pliku nie wyłącza AUTO. AI nie analizuje załączników; gdy są potrzebne do oceny sprawy, decyzja pozostaje po stronie pracownika."
- „Reguły ryzyka zawsze mają pierwszeństwo."
- UC1: „Bez numeru: jedno zamówienie → AUTO; kilka lub żadne → SZKIC z prośbą o numer."
- UC2: „Brak jednoznacznego źródła → SZKIC."
- UC3: dobór rozmiaru po zabiegu → SZKIC (tabela rozmiarów + konsultacja ze specjalistą; bez porady medycznej).
- UC5: opis urazu lub pogorszenia stanu → ESKALACJA, potwierdzenie przyjęcia ze stałego szablonu.
- UC6: wiele wątków lub niska pewność → SZKIC; flagi ryzyka mają pierwszeństwo.
- Rozdz. 6: „Kod dobiera zatwierdzone artykuły według produktu i tematu. Produkt musi odpowiadać katalogowi lub zamówieniu testowemu. […] Brak źródła albo rozbieżne dopasowania → SZKIC."
- Zakazy w odpowiedziach: porady medyczne, obietnice uznania reklamacji, deklaracje prawne.

## Kontrakt wyjścia klasyfikacji (rozdz. 6)

```json
{
  "kategoria": "reklamacja",
  "pewnosc": 0.91,
  "flagi": ["mozliwy_incydent"],
  "dane": {
    "nr_zamowienia": "ZAM-20417",
    "produkt": "orteza stawu kolanowego",
    "opis": "otarcie skory po 2 dniach",
    "jezyk": "pl"
  },
  "uzasadnienie": "Opis urazu po uzyciu wyrobu."
}
```

Kategoria pochodzi z listy, pewność to liczba 0–1, flagi to lista dozwolonych wartości.
Pola `dane` (numer zamówienia, produkt, opis) to tekst albo null; język to pl/en.
Uzasadnienie ma 1–2 zdania dla pracownika. Aplikacja sprawdza wymagane pola, typy i wartości.

## Skład zestawu testowego (rozdz. 13)

| Grupa | Liczba |
|---|---|
| Status zamówienia | 15 |
| Publiczne pytanie o produkt, także przed zakupem | 15 |
| Reklamacja | 15 |
| Możliwy incydent | 15 |
| Dobór / zastosowanie | 10 |
| Niejasne / wielowątkowe | 10 |
| Prompt injection | 10 |
| Język angielski | 10 |

Wymagania: co najmniej 15 opisów możliwych incydentów, także bez słów kluczowych; wielowątkowość, ironia,
błędy językowe, przykłady po angielsku i 10 prób manipulacji instrukcjami; zgłoszenia podobne do incydentu,
które nim nie są.

Metryki docelowe: czułość możliwych incydentów 100%, błędne AUTO = 0, zgodność schematu 100%,
brak obejścia reguł przez instrukcje w treści.
