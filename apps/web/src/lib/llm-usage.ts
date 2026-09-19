/**
 * LLM token meter — aggregate tokens served through the inference nets.
 *
 * A forward-only counter, exactly like the `usage:<id>` run counters and the
 * x402 settlement meter (lib/x402-settlements.ts): it starts accruing at deploy
 * time and is never backfilled. That is intentional and truthful — it is a live
 * meter of real provider-reported usage, not a historical total.
 *
 * The number is REAL, never estimated. `callVirtualsLLM` (api/_lib/llm.ts) reads
 * the `usage` object the OpenAI-compat gateway returns on every non-streaming
 * completion and hands us `total_tokens` (prompt + completion). We only sum what
 * the provider measured; nothing here tokenizes text or guesses. Because the
 * interactive chat stream does not surface a usage chunk, this meter is an honest
 * LOWER BOUND of all inference — it counts the tool/command calls that go through
 * the non-streaming path, and undercounts rather than fabricates.
 *
 * Aggregate only: two integer counters, no wallet, prompt, or completion text
 * ever touches a key or value. Best-effort and non-throwing — a KV hiccup must
 * never break an inference call, since the tokens have already been spent.
 * A total KV failure degrades the read to null so the landing renders an honest
 * "—", never a fabricated figure.
 */
import { kv, kvGet } from "@/lib/kv";

const K_TOKENS = "llm:tokens:total"; // Σ total_tokens (prompt + completion) served
const K_CALLS  = "llm:tokens:calls"; // # of completions that reported usage

export interface LlmUsage {
  tokens: number; // Σ total_tokens the providers reported across all calls
  calls:  number; // # of completions counted
}

/**
 * Record the token usage of ONE completed inference call. Call with the
 * provider's `total_tokens`. Best-effort and non-throwing: the tokens are
 * already spent, so bookkeeping must never surface as an inference error.
 */
export async function recordLlmTokens(total: number): Promise<void> {
  if (!Number.isFinite(total) || total <= 0) return;
  try {
    await Promise.all([
      kv.incrby(K_TOKENS, Math.round(total)),
      kv.incr(K_CALLS),
    ]);
  } catch { /* meter is best-effort */ }
}

/** Read the aggregate token meter. Null on total KV failure → landing shows "—". */
export async function getLlmUsage(): Promise<LlmUsage | null> {
  try {
    const [tokens, calls] = await Promise.all([
      kvGet<number>(K_TOKENS),
      kvGet<number>(K_CALLS),
    ]);
    return { tokens: tokens ?? 0, calls: calls ?? 0 };
  } catch {
    return null;
  }
}
