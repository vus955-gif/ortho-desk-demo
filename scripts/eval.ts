// One-command evaluation: `npm run eval`.
// Runs every test case through the real pipeline (real model, real rules), then writes:
//   data/eval-results.json   all results + metrics (read by the "Wyniki" page)
//   public/snapshots.json    full results of the demo examples (fallback when the API is down)
//   README.md                the block between <!-- EVAL:START --> and <!-- EVAL:END -->
// Results are written as produced. Re-running over an existing run of the same test set requires --force.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createAnthropicAdapter, MODEL_CONFIG } from "../lib/llm";
import { metrics, toWynik, type EvalFile, type Metryki, type WynikPrzypadku } from "../lib/evaluate";
import { processTicket, type PipelineResult } from "../lib/pipeline";
import { PROMPT_KLASYFIKACJI_WERSJA, PROMPT_SZKICU_WERSJA } from "../lib/prompts";
import { PROG_PEWNOSCI, WERSJA_REGUL } from "../lib/rules";
import { GRUPY, toZgloszenie, wybierzPrzyklady, type Grupa, type ZestawTestowy } from "../lib/testcases";

const GROUP_EN: Record<Grupa, string> = {
  status: "Order status",
  produkt: "Product question",
  reklamacja: "Complaint / return",
  incydent: "Possible incident",
  dobor: "Product selection / use",
  niejasne: "Unclear / multi-topic",
  injection: "Prompt injection",
  angielski: "English",
};

const SET_PATH = "spec/test-cases.json";
const OUT_PATH = "data/eval-results.json";
const SNAP_PATH = "public/snapshots.json";
const CONCURRENCY = 4;

async function pool<T, R>(items: T[], n: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i], i);
      }
    }),
  );
  return out;
}

function readmeBlock(m: Metryki, meta: NonNullable<EvalFile["meta"]>, wyniki: WynikPrzypadku[]): string {
  const mx = m.macierz;
  const rows = (["AUTO", "DRAFT", "ESKALACJA"] as const)
    .map((e) => `| **${e}** | ${mx[e].AUTO} | ${mx[e].DRAFT} | ${mx[e].ESKALACJA} |`)
    .join("\n");
  const groups = GRUPY.map((g) => `| ${GROUP_EN[g]} | ${m.per_grupa[g].trafne}/${m.per_grupa[g].wszystkie} |`).join("\n");
  const errors = wyniki.filter((w) => !w.trafny_tryb);
  return `_Single run on ${meta.zakonczono.slice(0, 10)}, model \`${meta.model}\`, ${meta.zestaw.liczba} cases (test set SHA-256 \`${meta.zestaw.sha256.slice(0, 12)}…\`). Numbers are copied from \`data/eval-results.json\` by the eval script; nothing was edited or re-run selectively._

| Metric | Result | Target in spec |
|---|---|---|
| Mode accuracy (AUTO / DRAFT / ESKALACJA) | **${m.trafnosc_trybu.trafne}/${m.trafnosc_trybu.wszystkie} (${m.trafnosc_trybu.proc}%)** | (no target) |
| Possible incidents escalated | ${m.czulosc_incydentow.eskalowane.trafne}/${m.czulosc_incydentow.eskalowane.wszystkie} | 100% |
| Wrong AUTO (AUTO where a human was expected) | ${m.bledne_auto} | 0 |
| Category accuracy | ${m.trafnosc_kategorii.trafne}/${m.trafnosc_kategorii.wszystkie} (${m.trafnosc_kategorii.proc}%) | no drop vs. baseline |
| Schema-valid model output | ${m.zgodnosc_schematu.trafne}/${m.zgodnosc_schematu.wszystkie} | 100% |
| Injection attempts that got AUTO | ${m.manipulacje.wszystkie - m.manipulacje.bez_auto}/${m.manipulacje.wszystkie} | 0 |
| Expected AUTO that went to a human | ${m.pominiete_auto} | (no target) |
| Model cost of the whole run | $${m.koszt_usd} | ~$0.08 (spec estimate) |

Confusion matrix (rows: expected, columns: system):

| expected \\ system | AUTO | DRAFT | ESKALACJA |
|---|---|---|---|
${rows}

Per group (mode correct / cases):

| Group | Correct |
|---|---|
${groups}

${errors.length} mode errors, each with an automatic explanation, are listed on the **Wyniki** page of the demo.`;
}

function writeReadme(m: Metryki, meta: NonNullable<EvalFile["meta"]>, wyniki: WynikPrzypadku[]) {
  if (!existsSync("README.md")) return;
  const readme = readFileSync("README.md", "utf8");
  const re = /<!-- EVAL:START -->[\s\S]*?<!-- EVAL:END -->/;
  if (re.test(readme)) writeFileSync("README.md", readme.replace(re, `<!-- EVAL:START -->\n${readmeBlock(m, meta, wyniki)}\n<!-- EVAL:END -->`));
}

async function main() {
  // Re-render the README block from the saved results, without calling the model again.
  if (process.argv.includes("--readme-only")) {
    const saved = JSON.parse(readFileSync(OUT_PATH, "utf8")) as EvalFile;
    if (saved.status !== "zakonczono" || !saved.meta || !saved.metryki || !saved.wyniki) throw new Error("Brak zapisanych wyników.");
    writeReadme(saved.metryki, saved.meta, saved.wyniki);
    console.log(`README odświeżone z ${OUT_PATH} (bez wywołań modelu).`);
    return;
  }
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* optional */
  }
  const force = process.argv.includes("--force");
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Brak ANTHROPIC_API_KEY. Dodaj go do .env.local (zob. .env.example) i uruchom ponownie.");
    process.exit(1);
  }

  const raw = readFileSync(SET_PATH, "utf8");
  const sha256 = createHash("sha256").update(raw).digest("hex");
  const set = JSON.parse(raw) as ZestawTestowy;

  if (existsSync(OUT_PATH) && !force) {
    const prev = JSON.parse(readFileSync(OUT_PATH, "utf8")) as EvalFile;
    if (prev.status === "zakonczono" && prev.meta?.zestaw.sha256 === sha256) {
      console.error(`Ten zestaw testowy został już oceniony (${prev.meta.zakonczono}). Wyniki nie są nadpisywane.`);
      console.error("Świadome ponowienie przebiegu: npm run eval -- --force");
      process.exit(2);
    }
  }

  const przyklady = new Set(wybierzPrzyklady(set.przypadki).map((p) => p.id));
  const llm = createAnthropicAdapter({ classify: { timeoutMs: 60_000, maxRetries: 4 }, draft: { timeoutMs: 60_000, maxRetries: 4 } });
  const started = new Date();
  console.log(`Ewaluacja: ${set.przypadki.length} przypadków, model ${MODEL_CONFIG.model}, współbieżność ${CONCURRENCY}`);

  const snapshots: Record<string, PipelineResult> = {};
  let done = 0;
  const wyniki = await pool(set.przypadki, CONCURRENCY, async (p) => {
    const r = await processTicket(toZgloszenie(p), llm, { withDraft: przyklady.has(p.id) });
    if (przyklady.has(p.id)) snapshots[p.id] = r;
    const w = toWynik(p, r);
    done++;
    console.log(`${String(done).padStart(3)}/${set.przypadki.length} ${p.id} ${w.trafny_tryb ? "ok " : "BŁĄD"} oczek. ${p.oczekiwane.tryb.padEnd(9)} sys. ${r.decyzja.tryb.padEnd(9)} r${r.decyzja.regula.id}`);
    return w;
  });
  const finished = new Date();

  const m = metrics(wyniki);
  const meta: NonNullable<EvalFile["meta"]> = {
    rozpoczeto: started.toISOString(),
    zakonczono: finished.toISOString(),
    czas_s: Math.round((finished.getTime() - started.getTime()) / 1000),
    model: MODEL_CONFIG.model,
    effort_klasyfikacji: MODEL_CONFIG.classifyEffort,
    effort_szkicu: MODEL_CONFIG.draftEffort,
    prompt_klasyfikacji: PROMPT_KLASYFIKACJI_WERSJA,
    prompt_szkicu: PROMPT_SZKICU_WERSJA,
    wersja_regul: WERSJA_REGUL,
    prog_pewnosci: PROG_PEWNOSCI,
    zestaw: { plik: SET_PATH, wersja: set.wersja, sha256, liczba: set.przypadki.length },
    przyklady_demo: [...przyklady],
    uwaga: "Jeden przebieg na danych syntetycznych. Model jest niedeterministyczny; ponowny przebieg może dać inne liczby.",
  };
  const file: EvalFile = { status: "zakonczono", meta, metryki: m, wyniki };
  writeFileSync(OUT_PATH, JSON.stringify(file, null, 2) + "\n");
  writeFileSync(SNAP_PATH, JSON.stringify({ wygenerowano: meta.zakonczono, model: meta.model, wyniki: snapshots }) + "\n");

  writeReadme(m, meta, wyniki);

  console.log("\n=== Wynik ===");
  console.log(`Trafność trybu: ${m.trafnosc_trybu.trafne}/${m.trafnosc_trybu.wszystkie} (${m.trafnosc_trybu.proc}%)`);
  console.log(`Incydenty eskalowane: ${m.czulosc_incydentow.eskalowane.trafne}/${m.czulosc_incydentow.eskalowane.wszystkie}`);
  console.log(`Błędne AUTO: ${m.bledne_auto}`);
  console.log(`Trafność kategorii: ${m.trafnosc_kategorii.trafne}/${m.trafnosc_kategorii.wszystkie}`);
  console.log(`Zgodność schematu: ${m.zgodnosc_schematu.trafne}/${m.zgodnosc_schematu.wszystkie}`);
  console.log(`Koszt: $${m.koszt_usd}, czas: ${meta.czas_s} s`);
  console.log(`Zapisano: ${OUT_PATH}, ${SNAP_PATH}, README.md`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
