import { FLAGI, KATEGORIE, type Klasyfikacja } from "./types";

/**
 * JSON Schema sent to the API as a structured-output format. Structured outputs guarantee
 * the shape, but not numeric ranges (minimum/maximum are unsupported there), so the
 * application validates again below. Spec ch. 6: "Aplikacja sprawdza wymagane pola, typy i wartości."
 */
export const KLASYFIKACJA_JSON_SCHEMA = {
  type: "object",
  properties: {
    kategoria: { type: "string", enum: [...KATEGORIE] },
    pewnosc: { type: "number", description: "Pewność kategorii, liczba od 0 do 1." },
    flagi: { type: "array", items: { type: "string", enum: [...FLAGI] } },
    dane: {
      type: "object",
      properties: {
        nr_zamowienia: { anyOf: [{ type: "string" }, { type: "null" }] },
        produkt: { anyOf: [{ type: "string" }, { type: "null" }] },
        opis: { anyOf: [{ type: "string" }, { type: "null" }] },
        jezyk: { type: "string", enum: ["pl", "en"] },
      },
      required: ["nr_zamowienia", "produkt", "opis", "jezyk"],
      additionalProperties: false,
    },
    uzasadnienie: { type: "string" },
  },
  required: ["kategoria", "pewnosc", "flagi", "dane", "uzasadnienie"],
  additionalProperties: false,
} as const;

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  value: Klasyfikacja | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const isStrOrNull = (v: unknown) => v === null || typeof v === "string";

/** Strict validation of the model output against the spec contract. */
export function validateKlasyfikacja(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["wynik nie jest obiektem JSON"], value: null };

  const allowedTop = ["kategoria", "pewnosc", "flagi", "dane", "uzasadnienie"];
  for (const k of Object.keys(raw)) if (!allowedTop.includes(k)) errors.push(`nieznane pole: ${k}`);

  if (!KATEGORIE.includes(raw.kategoria as never)) errors.push(`niedozwolona kategoria: ${String(raw.kategoria)}`);

  if (typeof raw.pewnosc !== "number" || !Number.isFinite(raw.pewnosc)) errors.push("pewnosc nie jest liczbą");
  else if (raw.pewnosc < 0 || raw.pewnosc > 1) errors.push(`pewnosc poza zakresem 0–1: ${raw.pewnosc}`);

  if (!Array.isArray(raw.flagi)) errors.push("flagi nie są listą");
  else {
    for (const f of raw.flagi) if (!FLAGI.includes(f as never)) errors.push(`niedozwolona flaga: ${String(f)}`);
    if (new Set(raw.flagi).size !== raw.flagi.length) errors.push("powtórzone flagi");
  }

  if (!isObj(raw.dane)) errors.push("brak obiektu dane");
  else {
    const d = raw.dane;
    for (const k of Object.keys(d))
      if (!["nr_zamowienia", "produkt", "opis", "jezyk"].includes(k)) errors.push(`nieznane pole dane.${k}`);
    for (const k of ["nr_zamowienia", "produkt", "opis"] as const) {
      if (!(k in d)) errors.push(`brak pola dane.${k}`);
      else if (!isStrOrNull(d[k])) errors.push(`dane.${k} musi być tekstem lub null`);
    }
    if (d.jezyk !== "pl" && d.jezyk !== "en") errors.push(`dane.jezyk musi być pl/en: ${String(d.jezyk)}`);
  }

  if (typeof raw.uzasadnienie !== "string" || raw.uzasadnienie.trim() === "")
    errors.push("brak uzasadnienia");

  if (errors.length) return { ok: false, errors, value: null };
  return { ok: true, errors: [], value: raw as unknown as Klasyfikacja };
}
