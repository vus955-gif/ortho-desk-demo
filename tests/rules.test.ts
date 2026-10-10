import { describe, expect, it } from "vitest";
import { decide, PROG_PEWNOSCI, REGULY } from "../lib/rules";
import type { EngineInput, Flaga, Kategoria, Klasyfikacja, OrderCheck, SourceCheck } from "../lib/types";

const order = (eligible: boolean): OrderCheck => ({
  status: eligible ? "zgodne" : "wiele_zamowien",
  eligible,
  klient: null,
  zamowienie: null,
  opis: eligible ? "ok" : "brak",
});
const source = (eligible: boolean): SourceCheck => ({
  status: eligible ? "jednoznaczne" : "brak_dopasowania",
  eligible,
  produkt: { status: "nieznany", opis: "" },
  artykul: null,
  ranking: [],
  opis: eligible ? "ok" : "brak",
});

function klas(kategoria: Kategoria, flagi: Flaga[] = [], pewnosc = 0.95): Klasyfikacja {
  return {
    kategoria,
    pewnosc,
    flagi,
    dane: { nr_zamowienia: null, produkt: null, opis: null, jezyk: "pl" },
    uzasadnienie: "test",
  };
}

function input(partial: Partial<EngineInput> & { klasyfikacja: Klasyfikacja | null }): EngineInput {
  return {
    bladModelu: null,
    zalacznik: null,
    orderCheck: order(true),
    sourceCheck: source(true),
    ...partial,
  };
}

describe("rule table", () => {
  it("has 7 rules in the specified order and modes", () => {
    expect(REGULY.map((r) => [r.id, r.tryb])).toEqual([
      [1, "ESKALACJA"],
      [2, "ESKALACJA"],
      [3, "DRAFT"],
      [4, "DRAFT"],
      [5, "DRAFT"],
      [6, "AUTO"],
      [7, "DRAFT"],
    ]);
    expect(PROG_PEWNOSCI).toBe(0.85);
  });
});

describe("rule 1: possible incident", () => {
  it("escalates regardless of category", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia", ["mozliwy_incydent"]) }));
    expect(d.tryb).toBe("ESKALACJA");
    expect(d.regula.id).toBe(1);
  });
  it("escalates even with very low confidence", () => {
    const d = decide(input({ klasyfikacja: klas("inne", ["mozliwy_incydent"], 0.1) }));
    expect(d.regula.id).toBe(1);
  });
  it("wins over every other flag and over an attachment", () => {
    const d = decide(
      input({
        klasyfikacja: klas("reklamacja", ["podejrzenie_manipulacji", "wiele_watkow", "grozba_prawna", "mozliwy_incydent"], 0.3),
        zalacznik: "foto.jpg",
      }),
    );
    expect(d.regula.id).toBe(1);
    expect(d.slad).toHaveLength(1);
  });
});

describe("rule 2: legal threat or sensitive data", () => {
  it.each<Flaga>(["grozba_prawna", "dane_wrazliwe"])("escalates on %s", (f) => {
    const d = decide(input({ klasyfikacja: klas("reklamacja", [f]) }));
    expect(d.tryb).toBe("ESKALACJA");
    expect(d.regula.id).toBe(2);
  });
  it("beats an otherwise AUTO-eligible status", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia", ["grozba_prawna"]) }));
    expect(d.regula.id).toBe(2);
  });
  it("beats manipulation", () => {
    const d = decide(input({ klasyfikacja: klas("inne", ["podejrzenie_manipulacji", "grozba_prawna"]) }));
    expect(d.regula.id).toBe(2);
  });
});

describe("rule 3: model error or attachment needing assessment", () => {
  it("routes a model/schema error to DRAFT (manual queue)", () => {
    const d = decide(input({ klasyfikacja: null, bladModelu: "timeout" }));
    expect(d.tryb).toBe("DRAFT");
    expect(d.regula.id).toBe(3);
    expect(d.uzasadnienie).toContain("timeout");
  });
  it.each<Kategoria>(["reklamacja", "zwrot_wymiana"])("needs a human when %s has an attachment", (kat) => {
    const d = decide(input({ klasyfikacja: klas(kat), zalacznik: "zdjecie.jpg" }));
    expect(d.regula.id).toBe(3);
  });
  it("does NOT block AUTO for a status question with an attachment", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia"), zalacznik: "potwierdzenie.pdf" }));
    expect(d.tryb).toBe("AUTO");
    expect(d.regula.id).toBe(6);
  });
  it("does NOT block AUTO for a product question with an attachment", () => {
    const d = decide(input({ klasyfikacja: klas("pytanie_o_produkt"), zalacznik: "zdjecie.jpg" }));
    expect(d.tryb).toBe("AUTO");
  });
  it("complaint without attachment falls through to rule 7", () => {
    const d = decide(input({ klasyfikacja: klas("reklamacja") }));
    expect(d.regula.id).toBe(7);
  });
});

describe("rule 4: manipulation", () => {
  it("sends manipulation to DRAFT even if the category would be AUTO", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia", ["podejrzenie_manipulacji"], 0.99) }));
    expect(d.tryb).toBe("DRAFT");
    expect(d.regula.id).toBe(4);
  });
  it("is checked after rule 3 (attachment on a complaint)", () => {
    const d = decide(input({ klasyfikacja: klas("reklamacja", ["podejrzenie_manipulacji"]), zalacznik: "x.jpg" }));
    expect(d.regula.id).toBe(3);
  });
});

describe("rule 5: confidence threshold and multiple threads", () => {
  it("confidence just below the threshold → DRAFT", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia", [], 0.849) }));
    expect(d.regula.id).toBe(5);
  });
  it("confidence exactly at the threshold is NOT low (strictly below)", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia", [], 0.85) }));
    expect(d.regula.id).toBe(6);
  });
  it("multiple threads → DRAFT even with high confidence", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia", ["wiele_watkow"], 0.99) }));
    expect(d.regula.id).toBe(5);
  });
  it("threshold is a parameter", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia", [], 0.9) }), 0.95);
    expect(d.regula.id).toBe(5);
    expect(d.prog_pewnosci).toBe(0.95);
  });
});

describe("rule 6: AUTO paths verified by code", () => {
  it("status with the sender's own order → AUTO", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia"), orderCheck: order(true) }));
    expect(d.tryb).toBe("AUTO");
  });
  it("status without a verified order → DRAFT (rule 7)", () => {
    const d = decide(input({ klasyfikacja: klas("status_zamowienia"), orderCheck: order(false) }));
    expect(d.tryb).toBe("DRAFT");
    expect(d.regula.id).toBe(7);
  });
  it("product question with an unambiguous source → AUTO", () => {
    const d = decide(input({ klasyfikacja: klas("pytanie_o_produkt"), sourceCheck: source(true) }));
    expect(d.tryb).toBe("AUTO");
  });
  it("product question without a source → DRAFT", () => {
    const d = decide(input({ klasyfikacja: klas("pytanie_o_produkt"), sourceCheck: source(false) }));
    expect(d.regula.id).toBe(7);
  });
  it("status path ignores the FAQ source and vice versa", () => {
    expect(decide(input({ klasyfikacja: klas("status_zamowienia"), orderCheck: order(true), sourceCheck: source(false) })).tryb).toBe("AUTO");
    expect(decide(input({ klasyfikacja: klas("pytanie_o_produkt"), orderCheck: order(false), sourceCheck: source(true) })).tryb).toBe("AUTO");
  });
  it.each<Kategoria>(["dobor_zastosowanie", "reklamacja", "zwrot_wymiana", "inne"])(
    "%s is never AUTO, even with eligible checks",
    (kat) => {
      const d = decide(input({ klasyfikacja: klas(kat), orderCheck: order(true), sourceCheck: source(true) }));
      expect(d.tryb).toBe("DRAFT");
      expect(d.regula.id).toBe(7);
    },
  );
});

describe("decision trace", () => {
  it("records every rule up to the one that fired, with only the last one met", () => {
    const d = decide(input({ klasyfikacja: klas("reklamacja") }));
    expect(d.slad.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(d.slad.filter((s) => s.spelniona).map((s) => s.id)).toEqual([7]);
    for (const s of d.slad) expect(s.dlaczego.length).toBeGreaterThan(5);
  });
  it("is deterministic", () => {
    const i = input({ klasyfikacja: klas("pytanie_o_produkt", [], 0.9) });
    expect(decide(i)).toEqual(decide(i));
  });
});
