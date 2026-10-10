// Knowledge-base retrieval. LEXICAL (dictionary-based) search, not vector search:
// BM25 over knowledge-base fragments, with each article's curated keyword list (PL + EN) indexed
// alongside its text. Product matching uses the catalog's codes, names, aliases and type words.
import { ARTYKULY, PRODUKTY } from "./data";
import { containsPhrase, normalize, tokens } from "./text";
import type { Artykul, Produkt, ProductResolution, ScoredChunk, SourceCheck, Zamowienie } from "./types";

// ---------- product resolution (spec ch. 6: "Produkt musi odpowiadać katalogowi lub zamówieniu testowemu") ----------

function codePattern(kod: string): RegExp {
  const [a, b] = kod.toLowerCase().split("-");
  return new RegExp(`(^|[^a-z0-9])${a}[\\s-]?${b}($|[^0-9])`);
}

export function resolveProduct(
  texts: (string | null | undefined)[],
  senderOrders: Zamowienie[] = [],
  produkty: Produkt[] = PRODUKTY,
): ProductResolution {
  const hay = normalize(texts.filter(Boolean).join(" \n "));

  // 1) specific mention: product code, full name or a model alias
  const specific = produkty.filter(
    (p) => codePattern(p.kod).test(hay) || containsPhrase(hay, p.nazwa) || p.aliasy.some((a) => containsPhrase(hay, a)),
  );
  if (specific.length === 1)
    return { status: "rozpoznany", kod: specific[0].kod, przez: "kod_lub_nazwa", opis: `Produkt wskazany wprost: ${specific[0].nazwa}.` };
  if (specific.length > 1)
    return { status: "niejednoznaczny", kandydaci: specific.map((p) => p.kod), opis: `Wiadomość wskazuje kilka produktów: ${specific.map((p) => p.kod).join(", ")}.` };

  // 2) type words ("stabilizator nadgarstka"): unambiguous only if one catalog product has that type…
  const byType = produkty.filter((p) => p.slowa_typu.some((w) => containsPhrase(hay, w)));
  if (byType.length === 1)
    return { status: "rozpoznany", kod: byType[0].kod, przez: "typ", opis: `Jedyny produkt tego typu w katalogu: ${byType[0].nazwa}.` };
  if (byType.length > 1) {
    // …or if the sender's own orders narrow it down to exactly one of the candidates.
    const owned = new Set(senderOrders.flatMap((z) => z.produkty.map((p) => p.kod)));
    const narrowed = byType.filter((p) => owned.has(p.kod));
    if (narrowed.length === 1)
      return { status: "rozpoznany", kod: narrowed[0].kod, przez: "zamowienie", opis: `Typ pasuje do kilku produktów; nadawca zamówił tylko ${narrowed[0].nazwa}.` };
    return { status: "niejednoznaczny", kandydaci: byType.map((p) => p.kod), opis: `Opis pasuje do kilku produktów: ${byType.map((p) => p.kod).join(", ")}.` };
  }
  return { status: "nieznany", opis: "Nie rozpoznano produktu z katalogu." };
}

// ---------- BM25 index over approved fragments ----------

interface IndexedDoc {
  chunk: Omit<ScoredChunk, "score">;
  tf: Map<string, number>;
  len: number;
}

const K1 = 1.2;
const B = 0.75;

function buildIndex(artykuly: Artykul[]) {
  const docs: IndexedDoc[] = [];
  for (const a of artykuly) {
    for (const f of a.fragmenty) {
      const toks = tokens([a.tytul, f.tekst, a.slowa_kluczowe.join(" ")].join(" "));
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      docs.push({
        chunk: { fragmentId: f.id, artykulId: a.id, wersja: a.wersja, tytul: a.tytul, produkt: a.produkt, temat: a.temat, tekst: f.tekst },
        tf,
        len: toks.length,
      });
    }
  }
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(docs.length, 1);
  return { docs, df, avgLen, n: docs.length };
}

const INDEX = buildIndex(ARTYKULY);

function bm25(queryTokens: string[], doc: IndexedDoc, index = INDEX): number {
  let score = 0;
  for (const q of new Set(queryTokens)) {
    const f = doc.tf.get(q);
    if (!f) continue;
    const df = index.df.get(q) ?? 0;
    const idf = Math.log(1 + (index.n - df + 0.5) / (df + 0.5));
    score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * doc.len) / index.avgLen)));
  }
  return score;
}

/** General top-k search used to ground drafts (complaint rules, warranty, returns, product FAQ…). */
export function search(query: string, opts: { k?: number; produkt?: string | null } = {}): ScoredChunk[] {
  const q = tokens(query);
  const k = opts.k ?? 4;
  return INDEX.docs
    // product-specific articles only for the resolved product; general articles always
    .filter((d) => d.chunk.produkt === null || (opts.produkt != null && d.chunk.produkt === opts.produkt))
    .map((d) => ({ ...d.chunk, score: bm25(q, d) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

// ---------- rule 6 (FAQ): "publiczna informacja z jednoznacznego, zatwierdzonego źródła" ----------
// The topic is recognised ONLY by each FAQ article's curated topic keywords (not by words that happen
// to occur in the article prose). Exactly one article may match; a match in a second article means
// "rozbieżne dopasowania" (spec ch. 6) and the case goes to a human.

export function checkFaqSource(
  texts: (string | null | undefined)[],
  senderOrders: Zamowienie[] = [],
): SourceCheck {
  const produkt = resolveProduct(texts, senderOrders);
  const base = { artykul: null, ranking: [] as SourceCheck["ranking"] };
  if (produkt.status === "nieznany")
    return { ...base, status: "brak_produktu", eligible: false, produkt, opis: "Nie rozpoznano produktu, więc nie ma jednoznacznego źródła." };
  if (produkt.status === "niejednoznaczny")
    return { ...base, status: "produkt_niejednoznaczny", eligible: false, produkt, opis: produkt.opis };

  const p = PRODUKTY.find((x) => x.kod === produkt.kod)!;
  const faq = ARTYKULY.filter((a) => a.typ === "faq_produktu" && a.produkt === p.kod);
  if (faq.length === 0)
    return { ...base, status: "brak_faq_produktu", eligible: false, produkt, opis: `Baza wiedzy nie ma zatwierdzonego FAQ dla ${p.kod}.` };

  // Words naming the product itself say nothing about the topic.
  const identity = new Set(tokens([p.kod, p.nazwa, ...p.aliasy, ...p.slowa_typu].join(" ")));
  const q = new Set(tokens(texts.filter(Boolean).join(" ")).filter((t) => !identity.has(t)));
  const ranking = faq
    .map((a) => {
      const kw = new Set(tokens(a.slowa_kluczowe.join(" ")));
      const trafienia = [...q].filter((t) => kw.has(t));
      return { artykulId: a.id, score: trafienia.length, trafienia };
    })
    .sort((a, b) => b.score - a.score);

  const [top, second] = ranking;
  if (!top || top.score === 0)
    return { ...base, ranking, status: "brak_dopasowania", eligible: false, produkt, opis: `Pytanie nie pasuje do tematów FAQ ${p.kod} (materiał, pielęgnacja, zakładanie).` };
  if (second && second.score > 0)
    return {
      ...base,
      ranking,
      status: "rozbiezne_dopasowania",
      eligible: false,
      produkt,
      opis: `Pytanie dotyczy kilku tematów (${top.artykulId}: ${top.trafienia.join(", ")}; ${second.artykulId}: ${second.trafienia.join(", ")}); brak jednego źródła.`,
    };

  const art = faq.find((a) => a.id === top.artykulId)!;
  return {
    status: "jednoznaczne",
    eligible: true,
    produkt,
    artykul: { id: art.id, wersja: art.wersja, tytul: art.tytul },
    ranking,
    opis: `Jednoznaczne źródło: ${art.tytul} (v${art.wersja}); słowa tematu: ${top.trafienia.join(", ")}.`,
  };
}

export function chunksOfArticle(artykulId: string): ScoredChunk[] {
  return INDEX.docs.filter((d) => d.chunk.artykulId === artykulId).map((d) => ({ ...d.chunk, score: 0 }));
}
