// Test-set types and the fixed rule for choosing demo examples.
import type { Flaga, Kanal, Kategoria, Tryb, Zgloszenie } from "./types";

export const GRUPY = ["status", "produkt", "reklamacja", "incydent", "dobor", "niejasne", "injection", "angielski"] as const;
export type Grupa = (typeof GRUPY)[number];

export const GRUPA_NAZWA: Record<Grupa, string> = {
  status: "Status zamówienia",
  produkt: "Pytanie o produkt",
  reklamacja: "Reklamacja i zwrot",
  incydent: "Możliwy incydent",
  dobor: "Dobór i zastosowanie",
  niejasne: "Niejasne i wielowątkowe",
  injection: "Próba manipulacji",
  angielski: "Po angielsku",
};

export interface Przypadek {
  id: string;
  grupa: Grupa;
  kanal: Kanal;
  nadawca: string;
  temat: string;
  tresc: string;
  zalacznik: string | null;
  oczekiwane: {
    kategoria: Kategoria;
    flagi: Flaga[];
    tryb: Tryb;
    regula: number;
    nr_zamowienia: string | null;
    produkt_kod: string | null;
    zrodlo: string | null;
    fakty: string[];
  };
  uwagi: string;
}

export interface ZestawTestowy {
  wersja: string;
  opis: string;
  przypadki: Przypadek[];
}

export const toZgloszenie = (p: Przypadek): Zgloszenie => ({
  kanal: p.kanal,
  nadawca: p.nadawca,
  temat: p.temat,
  tresc: p.tresc,
  zalacznik: p.zalacznik,
});

/**
 * Demo examples are chosen by a fixed rule decided BEFORE the evaluation run:
 * the first two cases of every group, in file order (8 groups × 2 = 16).
 */
export function wybierzPrzyklady(przypadki: Przypadek[], naGrupe = 2): Przypadek[] {
  return GRUPY.flatMap((g) => przypadki.filter((p) => p.grupa === g).slice(0, naGrupe));
}
