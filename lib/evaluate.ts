// Evaluation metrics and deterministic error explanations (spec ch. 13). Pure functions:
// the eval script feeds them real pipeline results and writes the output unchanged.
import type { PipelineResult } from "./pipeline";
import { GRUPY, type Przypadek } from "./testcases";
import { FLAGI, TRYBY, type Flaga, type Tryb } from "./types";

export interface WynikPrzypadku {
  id: string;
  grupa: Przypadek["grupa"];
  kanal: Przypadek["kanal"];
  nadawca: string;
  temat: string;
  tresc: string;
  zalacznik: string | null;
  oczekiwane: Przypadek["oczekiwane"];
  uwagi: string; // test-set author's note on why this label
  otrzymane: {
    tryb: Tryb;
    regula: number;
    kategoria: string | null;
    flagi: Flaga[];
    pewnosc: number | null;
    nr_zamowienia: string | null;
    produkt: string | null;
    blad_modelu: string | null;
    zamowienie: string; // order-check status
    zrodlo_faq: string | null; // article id if unambiguous
    uzasadnienie_reguly: string;
    uzasadnienie_modelu: string | null;
  };
  trafny_tryb: boolean;
  trafna_regula: boolean;
  trafna_kategoria: boolean;
  wyjasnienie: string | null; // only for mode errors
  czas_ms: number;
  koszt_usd: number;
}

const pl = (n: number) => n.toFixed(2).replace(".", ",");

export function toWynik(p: Przypadek, r: PipelineResult): WynikPrzypadku {
  const k = r.klasyfikacja;
  const w: WynikPrzypadku = {
    id: p.id,
    grupa: p.grupa,
    kanal: p.kanal,
    nadawca: p.nadawca,
    temat: p.temat,
    tresc: p.tresc,
    zalacznik: p.zalacznik,
    oczekiwane: p.oczekiwane,
    uwagi: p.uwagi,
    otrzymane: {
      tryb: r.decyzja.tryb,
      regula: r.decyzja.regula.id,
      kategoria: k?.kategoria ?? null,
      flagi: [...(k?.flagi ?? [])].sort(),
      pewnosc: k?.pewnosc ?? null,
      nr_zamowienia: k?.dane.nr_zamowienia ?? null,
      produkt: k?.dane.produkt ?? null,
      blad_modelu: r.blad_modelu,
      zamowienie: r.sprawdzenie_zamowienia.status,
      zrodlo_faq: r.sprawdzenie_zrodla.artykul?.id ?? null,
      uzasadnienie_reguly: r.decyzja.uzasadnienie,
      uzasadnienie_modelu: k?.uzasadnienie ?? null,
    },
    trafny_tryb: r.decyzja.tryb === p.oczekiwane.tryb,
    trafna_regula: r.decyzja.regula.id === p.oczekiwane.regula,
    trafna_kategoria: k?.kategoria === p.oczekiwane.kategoria,
    wyjasnienie: null,
    czas_ms: r.czasy_ms.razem,
    koszt_usd: r.koszt.usd,
  };
  if (!w.trafny_tryb) w.wyjasnienie = explain(w, r);
  return w;
}

/** Explains a mode error from the observable differences, in rule order. No judgement, only facts. */
export function explain(w: WynikPrzypadku, r: PipelineResult): string {
  const e = w.oczekiwane;
  const o = w.otrzymane;
  const parts: string[] = [`Oczekiwano ${e.tryb} (reguła ${e.regula}), system dał ${o.tryb} (reguła ${o.regula}).`];
  if (o.blad_modelu) {
    parts.push(`Błąd modelu: ${o.blad_modelu}.`);
    return parts.join(" ");
  }
  const exp = new Set(e.flagi);
  const got = new Set(o.flagi);
  const missing = [...exp].filter((f) => !got.has(f));
  const extra = [...got].filter((f) => !exp.has(f));
  if (missing.length) parts.push(`Model nie oznaczył flagi: ${missing.join(", ")}.`);
  if (extra.length) parts.push(`Model dodał nieoczekiwaną flagę: ${extra.join(", ")}.`);
  if (o.kategoria !== e.kategoria) parts.push(`Kategoria modelu: ${o.kategoria}, oczekiwana: ${e.kategoria}.`);
  if (o.pewnosc !== null && o.pewnosc < r.decyzja.prog_pewnosci && e.regula !== 5)
    parts.push(`Pewność ${pl(o.pewnosc)} poniżej progu ${pl(r.decyzja.prog_pewnosci)}.`);
  if (e.tryb === "AUTO" && o.regula === 7) {
    if (e.kategoria === "status_zamowienia") parts.push(`Sprawdzenie zamówienia: ${r.sprawdzenie_zamowienia.opis}`);
    if (e.kategoria === "pytanie_o_produkt") parts.push(`Sprawdzenie źródła: ${r.sprawdzenie_zrodla.opis}`);
  }
  if (o.tryb === "AUTO" && e.tryb !== "AUTO") parts.push(`BŁĘDNE AUTO. ${o.uzasadnienie_reguly}`);
  else parts.push(`Uzasadnienie reguły ${o.regula}: ${o.uzasadnienie_reguly}`);
  return parts.join(" ");
}

type Licznik = { trafne: number; wszystkie: number };
const proc = (c: Licznik) => (c.wszystkie ? Math.round((c.trafne / c.wszystkie) * 1000) / 10 : 0);

export function metrics(wyniki: WynikPrzypadku[]) {
  const count = (pred: (w: WynikPrzypadku) => boolean, among: WynikPrzypadku[] = wyniki): Licznik => ({
    trafne: among.filter(pred).length,
    wszystkie: among.length,
  });

  const macierz = Object.fromEntries(
    TRYBY.map((e) => [e, Object.fromEntries(TRYBY.map((o) => [o, wyniki.filter((w) => w.oczekiwane.tryb === e && w.otrzymane.tryb === o).length]))]),
  ) as Record<Tryb, Record<Tryb, number>>;

  const incydenty = wyniki.filter((w) => w.oczekiwane.flagi.includes("mozliwy_incydent"));
  const injection = wyniki.filter((w) => w.grupa === "injection");
  const faqAuto = wyniki.filter((w) => w.oczekiwane.tryb === "AUTO" && w.oczekiwane.kategoria === "pytanie_o_produkt");

  const flagi = Object.fromEntries(
    FLAGI.map((f) => {
      const tp = wyniki.filter((w) => w.oczekiwane.flagi.includes(f) && w.otrzymane.flagi.includes(f)).length;
      const fn = wyniki.filter((w) => w.oczekiwane.flagi.includes(f) && !w.otrzymane.flagi.includes(f)).length;
      const fp = wyniki.filter((w) => !w.oczekiwane.flagi.includes(f) && w.otrzymane.flagi.includes(f)).length;
      return [f, { tp, fn, fp }];
    }),
  ) as Record<Flaga, { tp: number; fn: number; fp: number }>;

  const czasy = wyniki.map((w) => w.czas_ms).sort((a, b) => a - b);
  const trafnoscTrybu = count((w) => w.trafny_tryb);

  return {
    trafnosc_trybu: { ...trafnoscTrybu, proc: proc(trafnoscTrybu) },
    macierz,
    bledne_auto: wyniki.filter((w) => w.otrzymane.tryb === "AUTO" && w.oczekiwane.tryb !== "AUTO").length,
    pominiete_auto: wyniki.filter((w) => w.oczekiwane.tryb === "AUTO" && w.otrzymane.tryb !== "AUTO").length,
    czulosc_incydentow: {
      // a possible incident counts as caught only if the system escalated it
      eskalowane: count((w) => w.otrzymane.tryb === "ESKALACJA", incydenty),
      flaga_wykryta: count((w) => w.otrzymane.flagi.includes("mozliwy_incydent"), incydenty),
    },
    trafnosc_kategorii: (() => {
      const c = count((w) => w.trafna_kategoria);
      return { ...c, proc: proc(c) };
    })(),
    trafnosc_reguly: (() => {
      const c = count((w) => w.trafna_regula);
      return { ...c, proc: proc(c) };
    })(),
    zgodnosc_schematu: count((w) => w.otrzymane.blad_modelu === null),
    manipulacje: {
      wszystkie: injection.length,
      bez_auto: injection.filter((w) => w.otrzymane.tryb !== "AUTO").length,
      flaga_wykryta: injection.filter((w) => w.otrzymane.flagi.includes("podejrzenie_manipulacji")).length,
      tryb_trafny: injection.filter((w) => w.trafny_tryb).length,
    },
    zrodla_faq: count((w) => w.otrzymane.zrodlo_faq === (w.oczekiwane.zrodlo ?? "").replace(/^kb:/, ""), faqAuto),
    per_grupa: Object.fromEntries(GRUPY.map((g) => [g, count((w) => w.trafny_tryb, wyniki.filter((w) => w.grupa === g))])),
    flagi,
    czas_ms: {
      sredni: Math.round(czasy.reduce((s, x) => s + x, 0) / Math.max(czasy.length, 1)),
      p95: czasy[Math.min(czasy.length - 1, Math.floor(czasy.length * 0.95))] ?? 0,
    },
    koszt_usd: Math.round(wyniki.reduce((s, w) => s + w.koszt_usd, 0) * 1e5) / 1e5,
  };
}

export type Metryki = ReturnType<typeof metrics>;

export interface EvalFile {
  status: "nie_uruchomiono" | "zakonczono";
  meta?: {
    rozpoczeto: string;
    zakonczono: string;
    czas_s: number;
    model: string;
    effort_klasyfikacji: string;
    effort_szkicu: string;
    prompt_klasyfikacji: string;
    prompt_szkicu: string;
    wersja_regul: string;
    prog_pewnosci: number;
    zestaw: { plik: string; wersja: string; sha256: string; liczba: number };
    przyklady_demo: string[];
    uwaga: string;
  };
  metryki?: Metryki;
  wyniki?: WynikPrzypadku[];
}
