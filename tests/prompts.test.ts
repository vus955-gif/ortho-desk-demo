import { describe, expect, it } from "vitest";
import type { LlmAdapter, LlmCall } from "../lib/llm";
import { processTicket } from "../lib/pipeline";
import { zadanieSzkicu } from "../lib/prompts";
import { TRYBY } from "../lib/types";

describe("draft task prompt", () => {
  it.each(TRYBY)("passes the per-message hints to the model in %s mode", (tryb) => {
    expect(zadanieSzkicu(tryb, "pl", ["WSKAZOWKA-TESTOWA"])).toContain("WSKAZOWKA-TESTOWA");
  });

  it("an AUTO answer to a message with an attachment is told to confirm the attachment", async () => {
    const call = (raw: unknown): LlmCall => ({ raw, error: null, inputTokens: 1, outputTokens: 1, ms: 1, model: "fake" });
    const prompts: string[] = [];
    const adapter: LlmAdapter = {
      classify: async () =>
        call({
          kategoria: "status_zamowienia",
          pewnosc: 0.95,
          flagi: [],
          dane: { nr_zamowienia: null, produkt: null, opis: "gdzie paczka", jezyk: "pl" },
          uzasadnienie: "Pytanie o status.",
        }),
      draft: async (p) => {
        prompts.push(p);
        return call({ tekst: "Paczka jest w drodze.", uzyte_zrodla: ["zamowienie:ZAM-20417"] });
      },
    };
    const r = await processTicket(
      { kanal: "mail", nadawca: "anna.kowalska@example.com", temat: "Paczka", tresc: "Kiedy dotrze paczka? Załączam potwierdzenie.", zalacznik: "potwierdzenie.pdf" },
      adapter,
    );
    expect(r.decyzja.tryb).toBe("AUTO");
    expect(prompts[0]).toContain("TRYB: AUTO");
    expect(prompts[0]).toContain("załącznik został przyjęty");
  });
});
