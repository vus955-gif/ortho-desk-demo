// Regression guard for the published evaluation: replays every recorded model output from
// data/eval-results.json through the CURRENT code checks and rule engine (no API calls) and requires
// the same mode and rule as recorded. If this fails, the published results no longer describe the
// system: re-run the evaluation deliberately (npm run eval -- --force) instead of editing results.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { EvalFile } from "../lib/evaluate";
import { checkOrder, findOrderNumberInText, normalizeOrderNumber, ordersOf } from "../lib/orders";
import { checkFaqSource } from "../lib/retrieval";
import { decide } from "../lib/rules";
import type { Klasyfikacja } from "../lib/types";

const ev = JSON.parse(readFileSync("data/eval-results.json", "utf8")) as EvalFile;
const rows = ev.status === "zakonczono" && ev.wyniki ? ev.wyniki : [];

describe.skipIf(rows.length === 0)("recorded evaluation replay", () => {
  it.each(rows.map((w) => [w.id, w] as const))("%s: current engine reproduces the recorded decision", (_id, w) => {
    const o = w.otrzymane;
    const k: Klasyfikacja | null = o.blad_modelu
      ? null
      : {
          kategoria: o.kategoria as Klasyfikacja["kategoria"],
          pewnosc: o.pewnosc ?? 0,
          flagi: o.flagi,
          dane: { nr_zamowienia: o.nr_zamowienia, produkt: o.produkt, opis: null, jezyk: "pl" },
          uzasadnienie: "replay",
        };
    const nr = normalizeOrderNumber(k?.dane.nr_zamowienia) ?? findOrderNumberInText(`${w.temat} ${w.tresc}`);
    const orderCheck = checkOrder(w.nadawca, nr);
    const sourceCheck = checkFaqSource([k?.dane.produkt, w.temat, w.tresc], orderCheck.klient ? ordersOf(orderCheck.klient.id) : []);
    const d = decide({ klasyfikacja: k, bladModelu: o.blad_modelu, zalacznik: w.zalacznik, orderCheck, sourceCheck });
    expect({ tryb: d.tryb, regula: d.regula.id }).toEqual({ tryb: o.tryb, regula: o.regula });
  });
});
