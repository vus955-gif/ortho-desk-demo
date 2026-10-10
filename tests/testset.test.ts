// Consistency of the test set with the rules: if the model returned EXACTLY the expected labels,
// would the engine (with the real order and source checks where the label relies on them) choose
// the expected mode and rule? A failure here means a labelling error or an engine bug, found before
// any model run. This does not test the model.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ARTYKULY } from "../lib/data";
import { checkOrder, ordersOf } from "../lib/orders";
import { decide } from "../lib/rules";
import { GRUPY, wybierzPrzyklady, type ZestawTestowy } from "../lib/testcases";
import type { Klasyfikacja, SourceCheck } from "../lib/types";

const PATH = "spec/test-cases.json";
const set: ZestawTestowy | null = existsSync(PATH) ? JSON.parse(readFileSync(PATH, "utf8")) : null;

describe.skipIf(!set)("test set", () => {
  const cases = set?.przypadki ?? [];

  it("matches the composition from the spec (ch. 13)", () => {
    expect(cases).toHaveLength(100);
    const want = { status: 15, produkt: 15, reklamacja: 15, incydent: 15, dobor: 10, niejasne: 10, injection: 10, angielski: 10 };
    for (const g of GRUPY) expect(cases.filter((c) => c.grupa === g).length, g).toBe(want[g]);
    expect(cases.filter((c) => c.oczekiwane.flagi.includes("mozliwy_incydent")).length).toBeGreaterThanOrEqual(15);
    expect(new Set(cases.map((c) => c.id)).size).toBe(100);
  });

  it("gives 16 demo examples (2 per group)", () => {
    expect(wybierzPrzyklady(cases)).toHaveLength(16);
  });

  it.each(cases.map((c) => [c.id, c] as const))("%s: expected labels lead to the expected mode and rule", (_id, c) => {
    const e = c.oczekiwane;
    const k: Klasyfikacja = {
      kategoria: e.kategoria,
      flagi: e.flagi,
      pewnosc: e.regula === 5 && !e.flagi.includes("wiele_watkow") ? 0.5 : 0.99,
      dane: { nr_zamowienia: e.nr_zamowienia, produkt: e.produkt_kod, opis: null, jezyk: c.grupa === "angielski" ? "en" : "pl" },
      uzasadnienie: "etykieta oczekiwana",
    };
    const orderCheck = checkOrder(c.nadawca, e.nr_zamowienia);
    // The FAQ path uses the labelled source (ground truth), not the retrieval: retrieval quality is
    // measured by the real evaluation run, not assumed here.
    const art = e.zrodlo?.startsWith("kb:") ? ARTYKULY.find((a) => a.id === e.zrodlo!.slice(3)) : undefined;
    const faqOk = e.kategoria === "pytanie_o_produkt" && e.tryb === "AUTO" && !!art && art.typ === "faq_produktu";
    const sourceCheck: SourceCheck = {
      status: faqOk ? "jednoznaczne" : "brak_dopasowania",
      eligible: faqOk,
      produkt: { status: "nieznany", opis: "" },
      artykul: faqOk ? { id: art!.id, wersja: art!.wersja, tytul: art!.tytul } : null,
      ranking: [],
      opis: "",
    };
    const d = decide({ klasyfikacja: k, bladModelu: null, zalacznik: c.zalacznik, orderCheck, sourceCheck });
    expect({ tryb: d.tryb, regula: d.regula.id }).toEqual({ tryb: e.tryb, regula: e.regula });
    if (e.tryb === "AUTO" && e.kategoria === "status_zamowienia") {
      expect(e.zrodlo).toBe(`zamowienie:${orderCheck.zamowienie!.nr}`);
      expect(ordersOf(orderCheck.klient!.id).some((z) => `zamowienie:${z.nr}` === e.zrodlo)).toBe(true);
    }
  });
});
