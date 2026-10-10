// Connectivity check with ONE message that is NOT part of the test set (so the test set stays unseen
// until the single evaluation run). Usage: npm run smoke
import { createAnthropicAdapter } from "../lib/llm";
import { processTicket } from "../lib/pipeline";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* optional */
  }
  const r = await processTicket(
    {
      kanal: "formularz",
      nadawca: "ewa.wisniewska@example.com",
      temat: "Test połączenia",
      tresc: "Dzień dobry, kiedy mniej więcej dotrze moja orteza na kostkę? Pozdrawiam",
      zalacznik: null,
    },
    createAnthropicAdapter({ classify: { timeoutMs: 60_000, maxRetries: 2 }, draft: { timeoutMs: 60_000, maxRetries: 2 } }),
  );
  console.log(JSON.stringify({ blad_modelu: r.blad_modelu, klasyfikacja: r.klasyfikacja, tryb: r.decyzja.tryb, regula: r.decyzja.regula, czasy_ms: r.czasy_ms, koszt: r.koszt }, null, 2));
  console.log("\n--- szkic ---\n" + (r.szkic?.tekst ?? r.blad_szkicu));
  process.exit(r.blad_modelu ? 1 : 0);
}
main();
