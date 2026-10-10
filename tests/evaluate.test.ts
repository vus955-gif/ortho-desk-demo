import { describe, expect, it } from "vitest";
import { metrics, toWynik } from "../lib/evaluate";
import type { PipelineResult } from "../lib/pipeline";
import { decide } from "../lib/rules";
import type { Przypadek } from "../lib/testcases";
import type { Flaga, Kategoria, Tryb } from "../lib/types";

function przypadek(id: string, tryb: Tryb, regula: number, kategoria: Kategoria, flagi: Flaga[] = [], grupa: Przypadek["grupa"] = "status"): Przypadek {
  return {
    id, grupa, kanal: "mail", nadawca: "a@example.com", temat: "t", tresc: "x", zalacznik: null,
    oczekiwane: { kategoria, flagi, tryb, regula, nr_zamowienia: null, produkt_kod: null, zrodlo: null, fakty: [] },
    uwagi: "",
  };
}

function wynik(kategoria: Kategoria, flagi: Flaga[], pewnosc = 0.95, orderOk = true): PipelineResult {
  const klasyfikacja = { kategoria, pewnosc, flagi, dane: { nr_zamowienia: null, produkt: null, opis: null, jezyk: "pl" as const }, uzasadnienie: "u" };
  const orderCheck = { status: orderOk ? ("zgodne" as const) : ("wiele_zamowien" as const), eligible: orderOk, klient: null, zamowienie: null, opis: "o" };
  const sourceCheck = { status: "brak_dopasowania" as const, eligible: false, produkt: { status: "nieznany" as const, opis: "" }, artykul: null, ranking: [], opis: "s" };
  const decyzja = decide({ klasyfikacja, bladModelu: null, zalacznik: null, orderCheck, sourceCheck });
  return {
    wersja_wyniku: 1, czas: "", wejscie: { kanal: "mail", temat: "", tresc: "", zalacznik: null, nadawca: "" },
    klasyfikacja, surowy_wynik_modelu: klasyfikacja, walidacja: { ok: true, bledy: [] }, blad_modelu: null,
    sprawdzenie_zamowienia: orderCheck, sprawdzenie_zrodla: sourceCheck, decyzja, szkic: null, blad_szkicu: null,
    zrodla: [], uwagi: [], model: { id: "m", prompt_klasyfikacji: "", prompt_szkicu: "", effort_klasyfikacji: "", effort_szkicu: "" },
    koszt: { tokeny_wejscie: 10, tokeny_wyjscie: 5, usd: 0.001 }, czasy_ms: { klasyfikacja: 100, szkic: 0, razem: 100 },
  };
}

describe("evaluation metrics", () => {
  const ws = [
    toWynik(przypadek("A", "AUTO", 6, "status_zamowienia"), wynik("status_zamowienia", [])), // correct
    toWynik(przypadek("B", "ESKALACJA", 1, "reklamacja", ["mozliwy_incydent"], "incydent"), wynik("reklamacja", [])), // missed incident
    toWynik(przypadek("C", "DRAFT", 7, "reklamacja"), wynik("status_zamowienia", [])), // wrong AUTO
    toWynik(przypadek("D", "DRAFT", 4, "inne", ["podejrzenie_manipulacji"], "injection"), wynik("inne", ["podejrzenie_manipulacji"])), // correct
  ];
  const m = metrics(ws);

  it("counts mode accuracy and the confusion matrix", () => {
    expect(m.trafnosc_trybu).toEqual({ trafne: 2, wszystkie: 4, proc: 50 });
    expect(m.macierz.AUTO.AUTO).toBe(1);
    expect(m.macierz.ESKALACJA.DRAFT).toBe(1);
    expect(m.macierz.DRAFT.AUTO).toBe(1);
    expect(m.macierz.DRAFT.DRAFT).toBe(1);
    const total = Object.values(m.macierz).flatMap((r) => Object.values(r)).reduce((a, b) => a + b, 0);
    expect(total).toBe(4);
  });
  it("counts wrong AUTO and incident sensitivity", () => {
    expect(m.bledne_auto).toBe(1);
    expect(m.czulosc_incydentow.eskalowane).toEqual({ trafne: 0, wszystkie: 1 });
    expect(m.flagi.mozliwy_incydent).toEqual({ tp: 0, fn: 1, fp: 0 });
  });
  it("tracks injection handling", () => {
    expect(m.manipulacje).toEqual({ wszystkie: 1, bez_auto: 1, flaga_wykryta: 1, tryb_trafny: 1 });
  });
  it("explains errors from observable differences", () => {
    expect(ws[0].wyjasnienie).toBeNull();
    expect(ws[1].wyjasnienie).toContain("nie oznaczył flagi: mozliwy_incydent");
    expect(ws[2].wyjasnienie).toContain("BŁĘDNE AUTO");
    expect(ws[2].wyjasnienie).toContain("Kategoria modelu: status_zamowienia");
  });
});
