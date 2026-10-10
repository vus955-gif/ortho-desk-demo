// Lexical text processing shared by product matching and knowledge-base search.
// Deliberately simple and deterministic: lowercase, strip Polish diacritics, crude suffix stemming.

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

const STOPWORDS = new Set(
  [
    // pl
    "a", "aby", "albo", "ale", "bo", "by", "byc", "bym", "ci", "co", "czy", "dla", "do", "dzien", "dobry",
    "gdy", "go", "i", "ich", "ile", "im", "ja", "jak", "jaka", "jaki", "jakie", "jako", "je", "jego", "jej",
    "jest", "jestem", "jesli", "juz", "ktora", "ktore", "ktory", "lub", "ma", "mam", "mi", "mnie", "moge",
    "moj", "moja", "moje", "mojej", "mojego", "na", "nam", "nas", "nie", "o", "od", "po", "pod", "pan",
    "pani", "panstwa", "panstwo", "pozdrawiam", "prosze", "przez", "przy", "sa", "sie", "so", "ta", "tak",
    "te", "tego", "tej", "ten", "to", "tez", "tu", "w", "we", "witam", "wlasnie", "z", "za", "ze", "zeby",
    "bardzo", "dziekuje", "uprzejmie", "chcialabym", "chcialbym", "moglibyscie", "mozna", "czyli",
    // en
    "an", "and", "are", "be", "can", "could", "do", "does", "for", "hello", "hi", "how", "i", "in", "is",
    "it", "me", "my", "of", "on", "or", "please", "regards", "should", "thanks", "thank", "the", "to",
    "what", "with", "would", "you", "your", "this", "that", "there",
  ].map(normalize),
);

// Longest suffixes first. Applied once, only when the remaining stem keeps >= 4 characters.
const SUFFIXES = [
  "owego", "owej", "owym", "ami", "ach", "ego", "emu", "owi", "iem", "ing", "ie", "om", "ow", "ej",
  "ia", "ii", "ym", "im", "ed", "es", "a", "e", "i", "o", "u", "y", "s",
];

export function stem(token: string): string {
  let t = token;
  for (const suf of SUFFIXES) {
    if (t.endsWith(suf) && t.length - suf.length >= 4) {
      t = t.slice(0, -suf.length);
      break;
    }
  }
  return t.slice(0, 6);
}

/** Normalised, stopword-filtered, stemmed tokens. */
export function tokens(s: string): string[] {
  return normalize(s)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t))
    .map(stem);
}

/** Whole-phrase match on normalised text (word boundaries on both ends). */
export function containsPhrase(haystackNorm: string, phrase: string): boolean {
  const p = normalize(phrase).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/[\s-]+/g, "[\\s-]*");
  return new RegExp(`(^|[^a-z0-9])${p}($|[^a-z0-9])`).test(haystackNorm);
}
