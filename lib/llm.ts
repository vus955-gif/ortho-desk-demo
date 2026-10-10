// Model adapter (spec ADR-3: one model behind a replaceable adapter). The rest of the system talks
// to the LlmAdapter interface only, so tests can inject a fake and the model can be swapped.
import Anthropic from "@anthropic-ai/sdk";
import { KLASYFIKACJA_JSON_SCHEMA } from "./schema";
import { SYSTEM_KLASYFIKACJA, SYSTEM_SZKIC, SZKIC_JSON_SCHEMA, userKlasyfikacja } from "./prompts";
import type { Zgloszenie } from "./types";

export const MODEL_ID = process.env.ORTHO_MODEL || "claude-haiku-5-5";
type Effort = "low" | "medium" | "high";
const CLASSIFY_EFFORT = (process.env.ORTHO_CLASSIFY_EFFORT as Effort) || "medium";
const DRAFT_EFFORT = (process.env.ORTHO_DRAFT_EFFORT as Effort) || "low";

/** USD per 1M tokens for claude-haiku-5-5, prompts ≤100K tokens (Anthropic pricing as of 2026-10). */
export const PRICE_PER_MTOK = { input: 0.1, output: 0.5 };

export interface LlmCall {
  raw: unknown | null; // parsed JSON or null
  error: string | null; // API / parsing error, if any
  inputTokens: number;
  outputTokens: number;
  ms: number;
  model: string;
}

export interface CallOptions {
  signal?: AbortSignal; // aborts the HTTP call, e.g. when the visitor disconnects
}

export interface LlmAdapter {
  classify(z: Zgloszenie, o?: CallOptions): Promise<LlmCall>;
  draft(userPrompt: string, o?: CallOptions): Promise<LlmCall>;
}

/** Per-call time budget. Live: both calls must fit the serverless function limit; eval: generous retries. */
export interface Budget {
  timeoutMs: number;
  maxRetries: number;
}

export class ModelUnavailableError extends Error {}

export function costUsd(inputTokens: number, outputTokens: number): number {
  return (inputTokens * PRICE_PER_MTOK.input + outputTokens * PRICE_PER_MTOK.output) / 1_000_000;
}

function describeError(e: unknown): string {
  if (e instanceof ModelUnavailableError) return e.message;
  if (e instanceof Anthropic.APIUserAbortError) return "przerwane: klient się rozłączył";
  if (e instanceof Anthropic.AuthenticationError) return "błąd uwierzytelnienia API (klucz)";
  if (e instanceof Anthropic.RateLimitError) return "limit zapytań API (429)";
  if (e instanceof Anthropic.APIConnectionTimeoutError) return "przekroczony czas odpowiedzi modelu";
  if (e instanceof Anthropic.APIConnectionError) return "brak połączenia z API";
  if (e instanceof Anthropic.APIError) return `błąd API ${e.status ?? ""}`.trim();
  return "nieznany błąd modelu";
}

export function createAnthropicAdapter(
  opts: { classify?: Budget; draft?: Budget } = {},
): LlmAdapter {
  const classifyBudget = opts.classify ?? { timeoutMs: 15_000, maxRetries: 1 };
  const draftBudget = opts.draft ?? { timeoutMs: 12_000, maxRetries: 0 };
  let client: Anthropic | null = null;
  const getClient = () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new ModelUnavailableError("brak klucza API na serwerze");
    client ??= new Anthropic();
    return client;
  };

  async function call(
    system: string,
    user: string,
    schema: Record<string, unknown>,
    effort: Effort,
    maxTokens: number,
    budget: Budget,
    o: CallOptions = {},
  ): Promise<LlmCall> {
    const t0 = Date.now();
    try {
      const res = await getClient().messages.create(
        {
          model: MODEL_ID,
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort, format: { type: "json_schema", schema } },
        },
        { timeout: budget.timeoutMs, maxRetries: budget.maxRetries, signal: o.signal },
      );
      const base = {
        inputTokens: res.usage.input_tokens,
        outputTokens: res.usage.output_tokens,
        ms: Date.now() - t0,
        model: res.model,
      };
      if (res.stop_reason === "refusal") return { ...base, raw: null, error: "model odmówił odpowiedzi (refusal)" };
      if (res.stop_reason === "max_tokens") return { ...base, raw: null, error: "odpowiedź ucięta (max_tokens)" };
      // Thinking blocks may precede the answer: read the text block by type, not by position.
      const text = res.content.find((b) => b.type === "text");
      if (!text || text.type !== "text") return { ...base, raw: null, error: "brak bloku tekstowego w odpowiedzi" };
      try {
        return { ...base, raw: JSON.parse(text.text), error: null };
      } catch {
        return { ...base, raw: null, error: "odpowiedź nie jest poprawnym JSON" };
      }
    } catch (e) {
      return { raw: null, error: describeError(e), inputTokens: 0, outputTokens: 0, ms: Date.now() - t0, model: MODEL_ID };
    }
  }

  return {
    classify: (z, o) => call(SYSTEM_KLASYFIKACJA, userKlasyfikacja(z), KLASYFIKACJA_JSON_SCHEMA as never, CLASSIFY_EFFORT, 4000, classifyBudget, o),
    draft: (userPrompt, o) => call(SYSTEM_SZKIC, userPrompt, SZKIC_JSON_SCHEMA as never, DRAFT_EFFORT, 4000, draftBudget, o),
  };
}

export const MODEL_CONFIG = { model: MODEL_ID, classifyEffort: CLASSIFY_EFFORT, draftEffort: DRAFT_EFFORT };
