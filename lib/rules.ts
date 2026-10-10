// Deterministic rule engine (spec ch. 5, ADR-1). The model only describes the message;
// this pure function chooses the mode. First matching rule wins; risk rules come first.
import type { Decyzja, EngineInput, Kategoria, RuleTrace, Tryb } from "./types";

export const WERSJA_REGUL = "1.0";
/** Start value from the spec; a parameter, not a calibrated probability. */
export const PROG_PEWNOSCI = 0.85;
/** Categories whose resolution depends on inspecting an attachment (photo of a defect, document). */
export const KATEGORIE_WYMAGAJACE_OCENY_ZALACZNIKA: Kategoria[] = ["reklamacja", "zwrot_wymiana"];

export const REGULY: { id: number; nazwa: string; tryb: Tryb; warunek: string }[] = [
  { id: 1, nazwa: "Możliwy incydent", tryb: "ESKALACJA", warunek: "Flaga mozliwy_incydent, niezależnie od kategorii i pewności." },
  { id: 2, nazwa: "Groźba prawna lub dane wrażliwe", tryb: "ESKALACJA", warunek: "Flaga grozba_prawna lub dane_wrazliwe." },
  { id: 3, nazwa: "Błąd modelu lub ocena załącznika", tryb: "DRAFT", warunek: "Błąd modelu/schematu albo rozstrzygnięcie wymaga oceny załącznika." },
  { id: 4, nazwa: "Podejrzenie manipulacji", tryb: "DRAFT", warunek: "Flaga podejrzenie_manipulacji (instrukcje dla systemu w treści)." },
  { id: 5, nazwa: "Niska pewność lub wiele wątków", tryb: "DRAFT", warunek: `Pewność poniżej ${String(PROG_PEWNOSCI).replace(".", ",")} lub flaga wiele_watkow.` },
  { id: 6, nazwa: "AUTO: status lub FAQ z jednoznacznego źródła", tryb: "AUTO", warunek: "Status: zamówienie przypisane do klienta testowego. FAQ: jednoznaczne, zatwierdzone źródło." },
  { id: 7, nazwa: "Pozostałe przypadki", tryb: "DRAFT", warunek: "Żadna wcześniejsza reguła nie zadziałała." },
];

const fmt = (n: number) => n.toFixed(2).replace(".", ",");

export function decide(input: EngineInput, prog: number = PROG_PEWNOSCI): Decyzja {
  const k = input.klasyfikacja;
  const flagi = new Set(k?.flagi ?? []);
  const slad: RuleTrace[] = [];

  const step = (id: number, spelniona: boolean, dlaczego: string): Decyzja | null => {
    const r = REGULY[id - 1];
    slad.push({ id, nazwa: r.nazwa, tryb: r.tryb, spelniona, dlaczego });
    if (!spelniona) return null;
    return {
      tryb: r.tryb,
      regula: { id, nazwa: r.nazwa },
      uzasadnienie: dlaczego,
      slad,
      wersja_regul: WERSJA_REGUL,
      prog_pewnosci: prog,
    };
  };

  // 1. possible incident: always first, regardless of category and confidence
  const r1 = step(
    1,
    flagi.has("mozliwy_incydent"),
    k === null
      ? "Brak wyniku modelu, więc flagi ryzyka nie są znane."
      : flagi.has("mozliwy_incydent")
        ? "Model oznaczył flagę mozliwy_incydent (uraz lub awaria podczas użycia)."
        : "Brak flagi mozliwy_incydent.",
  );
  if (r1) return r1;

  // 2. legal threat or sensitive medical data
  const r2hit = flagi.has("grozba_prawna") || flagi.has("dane_wrazliwe");
  const r2 = step(
    2,
    r2hit,
    r2hit
      ? `Flaga ${[...flagi].filter((f) => f === "grozba_prawna" || f === "dane_wrazliwe").join(" i ")}: sprawa wymaga oceny człowieka.`
      : "Brak flag grozba_prawna i dane_wrazliwe.",
  );
  if (r2) return r2;

  // 3. model/schema error, or the decision needs an attachment the AI did not inspect
  const needsAttachment =
    k !== null && input.zalacznik !== null && KATEGORIE_WYMAGAJACE_OCENY_ZALACZNIKA.includes(k.kategoria);
  const r3 = step(
    3,
    k === null || needsAttachment,
    k === null
      ? `Błąd modelu lub schematu (${input.bladModelu ?? "brak wyniku"}): sprawa do obsługi ręcznej.`
      : needsAttachment
        ? `Załącznik „${input.zalacznik}" przy kategorii ${k.kategoria}: AI nie analizuje plików, ocenę robi pracownik.`
        : input.zalacznik
          ? `Załącznik jest, ale kategoria ${k.kategoria} nie wymaga jego oceny (samo dołączenie pliku nie wyłącza AUTO).`
          : "Poprawny wynik modelu, brak załącznika do oceny.",
  );
  if (r3) return r3;
  // From here on k is non-null (rule 3 caught the null case).
  const kk = k!;

  // 4. instructions for the system inside the message
  const r4 = step(
    4,
    flagi.has("podejrzenie_manipulacji"),
    flagi.has("podejrzenie_manipulacji")
      ? "Model wykrył instrukcje dla systemu w treści; żadne działanie z nich nie wynika, sprawa trafia do pracownika."
      : "Brak flagi podejrzenie_manipulacji.",
  );
  if (r4) return r4;

  // 5. low confidence or several threads
  const low = kk.pewnosc < prog;
  const multi = flagi.has("wiele_watkow");
  const r5 = step(
    5,
    low || multi,
    low && multi
      ? `Pewność ${fmt(kk.pewnosc)} < ${fmt(prog)} i flaga wiele_watkow.`
      : low
        ? `Pewność ${fmt(kk.pewnosc)} jest poniżej progu ${fmt(prog)}.`
        : multi
          ? "Flaga wiele_watkow: kilka spraw wymaga uporządkowania przez pracownika."
          : `Pewność ${fmt(kk.pewnosc)} ≥ ${fmt(prog)}, jeden wątek.`,
  );
  if (r5) return r5;

  // 6. AUTO only for the two paths with a source verified by code
  let r6hit = false;
  let r6why: string;
  if (kk.kategoria === "status_zamowienia") {
    r6hit = input.orderCheck.eligible;
    r6why = r6hit
      ? `Status zamówienia z danych systemu. ${input.orderCheck.opis}`
      : `Status, ale bez potwierdzonego zamówienia nadawcy. ${input.orderCheck.opis}`;
  } else if (kk.kategoria === "pytanie_o_produkt") {
    r6hit = input.sourceCheck.eligible;
    r6why = r6hit
      ? `Publiczne pytanie o produkt. ${input.sourceCheck.opis}`
      : `Pytanie o produkt bez jednoznacznego źródła. ${input.sourceCheck.opis}`;
  } else {
    r6why = `Kategoria ${kk.kategoria} nie należy do ścieżek AUTO (status, publiczne FAQ).`;
  }
  const r6 = step(6, r6hit, r6why);
  if (r6) return r6;

  // Rule 7 restates the concrete reason AUTO was not possible, so the verdict explains itself.
  const r7why =
    kk.kategoria === "status_zamowienia" || kk.kategoria === "pytanie_o_produkt"
      ? `Brak warunków do AUTO, więc szkic dla pracownika. ${r6why}`
      : `Kategoria ${kk.kategoria} nie ma ścieżki AUTO, więc szkic do akceptacji pracownika.`;
  return step(7, true, r7why)!;
}
