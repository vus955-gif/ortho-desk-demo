// Domain types for Ortho Desk. Names follow the owner's specification (Polish field names
// in the model contract), so the JSON shown in the UI matches the design document 1:1.

export const KATEGORIE = [
  "status_zamowienia",
  "pytanie_o_produkt",
  "dobor_zastosowanie",
  "reklamacja",
  "zwrot_wymiana",
  "inne",
] as const;
export type Kategoria = (typeof KATEGORIE)[number];

export const FLAGI = [
  "mozliwy_incydent",
  "grozba_prawna",
  "dane_wrazliwe",
  "wiele_watkow",
  "podejrzenie_manipulacji",
] as const;
export type Flaga = (typeof FLAGI)[number];

export const TRYBY = ["AUTO", "DRAFT", "ESKALACJA"] as const;
export type Tryb = (typeof TRYBY)[number];

export type Jezyk = "pl" | "en";
export type Kanal = "mail" | "formularz";

/** The model's output contract (spec ch. 6). */
export interface Klasyfikacja {
  kategoria: Kategoria;
  pewnosc: number;
  flagi: Flaga[];
  dane: {
    nr_zamowienia: string | null;
    produkt: string | null;
    opis: string | null;
    jezyk: Jezyk;
  };
  uzasadnienie: string;
}

/** A customer message as it enters the system. */
export interface Zgloszenie {
  kanal: Kanal;
  nadawca: string; // e-mail of the sender (fictional test profiles)
  temat: string;
  tresc: string;
  zalacznik: string | null; // file name only; files are never sent to the model
}

// ---------- fictional reference data ----------

export interface Produkt {
  kod: string;
  nazwa: string;
  typ: string;
  aliasy: string[];
  slowa_typu: string[];
}

export interface Klient {
  id: string;
  email: string;
  nazwa: string;
  jezyk: Jezyk;
}

export interface Zamowienie {
  nr: string;
  klient_id: string;
  produkty: { kod: string; nazwa: string; rozmiar: string; ilosc: number }[];
  status: string;
  powod_wstrzymania?: string;
  data_zamowienia: string;
  data_wysylki: string | null;
  przewoznik: string | null;
  nr_przesylki: string | null;
  przewidywana_dostawa: string | null;
  data_dostawy?: string;
}

export interface Artykul {
  id: string;
  wersja: string;
  status: "zatwierdzony" | "wycofany";
  obowiazuje_od: string;
  typ: string;
  produkt: string | null;
  temat: string;
  tytul: string;
  slowa_kluczowe: string[];
  fragmenty: { id: string; tekst: string }[];
}

// ---------- deterministic checks computed by code (not by the model) ----------

export type OrderCheckStatus =
  | "zgodne" // number given, belongs to the sender
  | "jedno_zamowienie" // no number, sender has exactly one order
  | "wiele_zamowien" // no number, sender has 2+ orders
  | "brak_zamowien" // known sender without orders
  | "nieznany_nadawca" // sender is not a test customer
  | "nie_znaleziono" // number given, does not exist
  | "inny_klient"; // number exists but belongs to another customer

export interface OrderCheck {
  status: OrderCheckStatus;
  eligible: boolean; // true only for zgodne / jedno_zamowienie
  klient: Klient | null;
  zamowienie: Zamowienie | null;
  opis: string; // human-readable explanation (Polish)
}

export type ProductResolution =
  | { status: "rozpoznany"; kod: string; przez: "kod_lub_nazwa" | "typ" | "zamowienie"; opis: string }
  | { status: "niejednoznaczny"; kandydaci: string[]; opis: string }
  | { status: "nieznany"; opis: string };

export interface ScoredChunk {
  fragmentId: string;
  artykulId: string;
  wersja: string;
  tytul: string;
  produkt: string | null;
  temat: string;
  tekst: string;
  score: number;
}

export type SourceCheckStatus =
  | "jednoznaczne"
  | "brak_produktu"
  | "produkt_niejednoznaczny"
  | "brak_faq_produktu"
  | "brak_dopasowania"
  | "rozbiezne_dopasowania";

export interface SourceCheck {
  status: SourceCheckStatus;
  eligible: boolean;
  produkt: ProductResolution;
  artykul: { id: string; wersja: string; tytul: string } | null;
  ranking: { artykulId: string; score: number; trafienia?: string[] }[];
  opis: string;
}

// ---------- rule engine ----------

export interface RuleTrace {
  id: number;
  nazwa: string;
  tryb: Tryb;
  spelniona: boolean;
  dlaczego: string;
}

export interface Decyzja {
  tryb: Tryb;
  regula: { id: number; nazwa: string };
  uzasadnienie: string;
  slad: RuleTrace[]; // every rule evaluated up to and including the one that fired
  wersja_regul: string;
  prog_pewnosci: number;
}

export interface EngineInput {
  klasyfikacja: Klasyfikacja | null; // null = model or schema error
  bladModelu: string | null;
  zalacznik: string | null;
  orderCheck: OrderCheck;
  sourceCheck: SourceCheck;
}
