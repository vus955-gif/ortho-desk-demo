import { describe, expect, it } from "vitest";
import { checkOrder, findOrderNumberInText, normalizeOrderNumber, ordersOf } from "../lib/orders";
import { checkFaqSource, resolveProduct, search } from "../lib/retrieval";
import { validateKlasyfikacja } from "../lib/schema";
import { normalize, tokens } from "../lib/text";

describe("order check (UC1)", () => {
  it("normalises order numbers", () => {
    expect(normalizeOrderNumber("zam 20417")).toBe("ZAM-20417");
    expect(normalizeOrderNumber("ZAM20417")).toBe("ZAM-20417");
    expect(normalizeOrderNumber("20417")).toBe("ZAM-20417");
    expect(normalizeOrderNumber("brak")).toBeNull();
    expect(findOrderNumberInText("gdzie jest zam-20633?")).toBe("ZAM-20633");
  });
  it("own order with number → eligible", () => {
    const c = checkOrder("anna.kowalska@example.com", "ZAM-20417");
    expect(c.status).toBe("zgodne");
    expect(c.eligible).toBe(true);
    expect(c.zamowienie?.nr).toBe("ZAM-20417");
  });
  it("sender email match is case-insensitive", () => {
    expect(checkOrder("Anna.Kowalska@EXAMPLE.com", null).eligible).toBe(true);
  });
  it("no number + exactly one order → eligible", () => {
    const c = checkOrder("anna.kowalska@example.com", null);
    expect(c.status).toBe("jedno_zamowienie");
    expect(c.eligible).toBe(true);
  });
  it("no number + several orders → ask for the number", () => {
    expect(checkOrder("marek.nowak@example.com", null).status).toBe("wiele_zamowien");
  });
  it("several orders + explicit own number → eligible", () => {
    expect(checkOrder("marek.nowak@example.com", "ZAM-20588").eligible).toBe(true);
  });
  it("someone else's order is never disclosed", () => {
    const c = checkOrder("anna.kowalska@example.com", "ZAM-20502");
    expect(c.status).toBe("inny_klient");
    expect(c.eligible).toBe(false);
    expect(c.zamowienie).toBeNull();
  });
  it("unknown sender, missing order, customer without orders", () => {
    expect(checkOrder("obcy@example.org", "ZAM-20417").status).toBe("nieznany_nadawca");
    expect(checkOrder("obcy@example.org", null).status).toBe("nieznany_nadawca");
    expect(checkOrder("anna.kowalska@example.com", "ZAM-99999").status).toBe("nie_znaleziono");
    expect(checkOrder("tomasz.zielinski@example.com", null).status).toBe("brak_zamowien");
  });
});

describe("text normalisation", () => {
  it("strips Polish diacritics including ł", () => {
    expect(normalize("Łokieć źdźbło Żółw")).toBe("lokiec zdzblo zolw");
  });
  it("stems inflected forms to a shared token", () => {
    expect(tokens("kolanowej")).toEqual(tokens("kolanowego"));
    expect(tokens("pranie")).toEqual(tokens("prania"));
  });
});

describe("product resolution", () => {
  it("by code in any spelling", () => {
    for (const t of ["KX-210", "kx 210", "kx210"]) {
      const r = resolveProduct([`pytanie o ${t}`]);
      expect(r.status === "rozpoznany" && r.kod).toBe("KX-210");
    }
  });
  it("by type when the catalog has one product of that type", () => {
    const r = resolveProduct(["Jak prać stabilizator nadgarstka?"]);
    expect(r.status === "rozpoznany" && r.kod).toBe("NX-110");
  });
  it("generic knee brace is ambiguous…", () => {
    expect(resolveProduct(["Jak prać ortezę kolanową?"]).status).toBe("niejednoznaczny");
  });
  it("…unless the sender owns exactly one of the candidates", () => {
    const r = resolveProduct(["Jak prać ortezę kolanową?"], ordersOf("K-001"));
    expect(r.status === "rozpoznany" && r.kod).toBe("KX-210");
    expect(r.status === "rozpoznany" && r.przez).toBe("zamowienie");
  });
  it("two products named → ambiguous", () => {
    expect(resolveProduct(["Czym różni się KX-210 od KX-300?"]).status).toBe("niejednoznaczny");
  });
  it("unknown product", () => {
    expect(resolveProduct(["Czy macie opaskę na głowę?"]).status).toBe("nieznany");
  });
});

describe("FAQ source check (rule 6, FAQ path)", () => {
  it("one product + one topic → unambiguous approved source", () => {
    const s = checkFaqSource(["Czy ortezę KX-210 można prać w pralce?"]);
    expect(s.status).toBe("jednoznaczne");
    expect(s.artykul?.id).toBe("faq-kx210-pielegnacja");
    expect(s.artykul?.wersja).toBe("1.1"); // never the withdrawn 1.0
  });
  it("English question maps to the Polish article via bilingual keywords", () => {
    const s = checkFaqSource(["How do I wash the NX-110 wrist brace?"]);
    expect(s.status).toBe("jednoznaczne");
    expect(s.artykul?.id).toBe("faq-nx110-pielegnacja");
  });
  it("material question", () => {
    expect(checkFaqSource(["Z jakiego materiału jest pas LX-500?"]).artykul?.id).toBe("faq-lx500-material");
  });
  it("product without FAQ → no source", () => {
    expect(checkFaqSource(["Jak prać ortezę EX-120?"]).status).toBe("brak_faq_produktu");
  });
  it("topic outside the FAQ → no match", () => {
    expect(checkFaqSource(["Ile kosztuje KX-210?"]).status).toBe("brak_dopasowania");
  });
  it("two topics in one question → divergent matches", () => {
    expect(checkFaqSource(["Z jakiego materiału jest KX-210 i jak ją prać w pralce?"]).status).toBe("rozbiezne_dopasowania");
  });
  it("ambiguous product → not eligible", () => {
    expect(checkFaqSource(["Jak prać ortezę kolanową?"]).status).toBe("produkt_niejednoznaczny");
  });
});

describe("general search", () => {
  it("never returns withdrawn articles", () => {
    const res = search("pranie KX-210 w pralce 40 stopni", { k: 20, produkt: "KX-210" });
    expect(res.some((c) => c.fragmentId.includes("@1.0"))).toBe(false);
  });
  it("finds the complaint rules for a complaint", () => {
    const res = search("chcę zareklamować uszkodzony zawias, jak długo trwa rozpatrzenie reklamacji");
    expect(res[0].artykulId).toBe("reg-reklamacje");
  });
  it("hides other products' FAQ unless that product is resolved", () => {
    const res = search("pranie", { k: 50, produkt: "NX-110" });
    expect(res.every((c) => c.produkt === null || c.produkt === "NX-110")).toBe(true);
  });
});

describe("schema validation (spec ch. 6)", () => {
  const ok = {
    kategoria: "reklamacja",
    pewnosc: 0.91,
    flagi: ["mozliwy_incydent"],
    dane: { nr_zamowienia: "ZAM-20417", produkt: "orteza", opis: "otarcie", jezyk: "pl" },
    uzasadnienie: "Opis urazu po użyciu wyrobu.",
  };
  it("accepts the spec example", () => {
    expect(validateKlasyfikacja(ok).ok).toBe(true);
  });
  it.each([
    ["unknown category", { ...ok, kategoria: "spam" }],
    ["confidence > 1", { ...ok, pewnosc: 1.2 }],
    ["confidence as string", { ...ok, pewnosc: "0.9" }],
    ["unknown flag", { ...ok, flagi: ["pilne"] }],
    ["duplicated flag", { ...ok, flagi: ["wiele_watkow", "wiele_watkow"] }],
    ["bad language", { ...ok, dane: { ...ok.dane, jezyk: "de" } }],
    ["missing field", { ...ok, dane: { nr_zamowienia: null, produkt: null, jezyk: "pl" } }],
    ["extra field", { ...ok, tryb: "AUTO" }],
    ["empty justification", { ...ok, uzasadnienie: " " }],
    ["not an object", "AUTO"],
  ])("rejects: %s", (_n, v) => {
    expect(validateKlasyfikacja(v).ok).toBe(false);
  });
});
