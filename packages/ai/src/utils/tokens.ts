/**
 * Lightweight token counting using `gpt-tokenizer` (BPE for cl100k_base /
 * o200k_base). Used for prompt budgeting BEFORE we send a request — the
 * providers' own token counters in the response remain the source of truth
 * for billing.
 *
 * We intentionally dynamic-require to keep typecheck green on hermetic
 * sandboxes that don't have the optional dependency installed.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
let cachedEncoder: { encode: (s: string) => number[] } | null = null;

function getEncoder(): { encode: (s: string) => number[] } | null {
  if (cachedEncoder) return cachedEncoder;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('gpt-tokenizer') as any;
    // gpt-tokenizer >=2 exports default cl100k_base encoder at module root.
    if (typeof mod?.encode === 'function') {
      cachedEncoder = mod as { encode: (s: string) => number[] };
      return cachedEncoder;
    }
    if (typeof mod?.default?.encode === 'function') {
      cachedEncoder = mod.default as { encode: (s: string) => number[] };
      return cachedEncoder;
    }
  } catch {
    // Library missing — fall back to char-based approximation below.
  }
  return null;
}

/**
 * Estimate the number of tokens in `text`. Falls back to a `chars / 4`
 * approximation if the optional `gpt-tokenizer` dependency is unavailable.
 *
 * The `_model` arg is reserved for future per-model tokenizers; ignored for
 * now since BPE cl100k_base is good enough for budgeting against OpenAI and
 * Anthropic alike (Anthropic doesn't expose a tokenizer publicly).
 */
export function countTokens(text: string, _model?: string): number {
  const enc = getEncoder();
  if (enc) return enc.encode(text).length;
  return Math.max(1, Math.ceil(text.length / 4));
}
