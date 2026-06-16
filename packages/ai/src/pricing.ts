/**
 * Provider pricing constants for cost tracking.
 *
 * These are written to `ai_usage_logs.cost_usd` per call. The values reflect
 * list-price USD per 1M tokens at the time of authoring (May 2026); they are
 * intentionally simple constants — when providers change prices the human
 * developer updates this file in a single PR and the entire AI surface picks
 * up the new rates.
 *
 * NB: rates are expressed in USD per 1 MILLION tokens to match how providers
 * publish them; convert at the call site:
 *
 *     const cost = (tokens / 1_000_000) * RATE;
 */

export const EMBEDDING_PRICE_USD_PER_1M_TOKENS = 0.02; // text-embedding-3-small

/**
 * Anthropic chat models — separate input / output rates because Anthropic
 * (like OpenAI) prices them differently. Map keyed by model name so unknown
 * models fall through to zero (don't crash the API on a new model name).
 */
export const ANTHROPIC_CHAT_PRICES_USD_PER_1M_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
  'claude-sonnet-4-20250514': { input: 3.0, output: 15.0 },
  'claude-3-5-sonnet-20241022': { input: 3.0, output: 15.0 },
  'claude-3-5-haiku-20241022': { input: 0.8, output: 4.0 },
  'claude-opus-4-5': { input: 15.0, output: 75.0 },
};

/** Default chat model used by `ChatService` when the caller omits one. */
export const DEFAULT_CHAT_MODEL = 'claude-sonnet-4-5';

/** Default embedding model used by `EmbeddingsService`. 1536-dim. */
export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

export function computeEmbeddingCostUsd(totalTokens: number): number {
  return (totalTokens / 1_000_000) * EMBEDDING_PRICE_USD_PER_1M_TOKENS;
}

export function computeChatCostUsd(
  model: string,
  promptTokens: number,
  completionTokens: number,
): number {
  const price = ANTHROPIC_CHAT_PRICES_USD_PER_1M_TOKENS[model];
  if (!price) return 0;
  return (
    (promptTokens / 1_000_000) * price.input +
    (completionTokens / 1_000_000) * price.output
  );
}
