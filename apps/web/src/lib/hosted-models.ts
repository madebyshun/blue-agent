/**
 * Blue Hub hosted `ai_tool` — the model a creator may select.
 *
 * WHY THIS FILE EXISTS. This list was copy-pasted into FOUR places: the
 * submit-form picker (hub/_components/SubmitTool.tsx), the two write paths that
 * validate creator input (api/hub/hosted/route.ts, api/hub/hosted/test/route.ts)
 * and the runner (lib/hub-hosted.ts). All four carried `"claude-haiku-4-5"` and
 * `"claude-sonnet-4-5"`, neither of which the Virtuals catalog has ever listed —
 * four copies is how a stale id survives, because correcting one leaves three.
 * One declaration, four importers; `scripts/model-id-check.ts` enforces that no
 * new model-id literal appears outside the declaration sites.
 *
 * Deliberately zero imports so a `"use client"` component can read it without
 * dragging KV or the LLM client into the browser bundle — which is what blocked
 * hoisting it into `lib/hub-hosted.ts`, the file that otherwise owns this type.
 *
 * ⚠️ SELECTION IS NOT LIVE YET. `runAiTool` dispatches through the shared
 * `callBankrLLM`, which DROPS `opts.model` — so every hosted ai_tool actually
 * runs on `VIRTUALS_DEFAULT_MODEL` no matter what the creator picked. The ids
 * below are real catalog entries so that honouring `config.model` becomes a
 * one-line change instead of a 500, but do NOT make that change on its own:
 * `priceUSDC` is allowed to be 0, so a free tool pinned to the expensive model
 * bills platform inference with no revenue. Coupling model choice to price is
 * ShunTr's call.
 */

/** Creator-selectable models, in picker order. `id` must be a live Virtuals id. */
export const HOSTED_MODELS = [
  // VIRTUALS_DEFAULT_MODEL — also what every hosted tool runs on today.
  { id: "deepseek-deepseek-v4-flash", label: "DeepSeek V4 Flash — fast & cheap" },
  // The `balanced` chat preset's model, so it shares that preset's live-catalog
  // coverage via getAvailablePresets().
  { id: "anthropic-claude-sonnet-5", label: "Claude Sonnet 5 — smarter" },
] as const;

/** Default when a creator supplies no model, or one that fails the allowlist. */
export const HOSTED_MODEL_DEFAULT = HOSTED_MODELS[0].id;

/** Gate for creator-supplied `config.model`. Untrusted input — always check. */
export const HOSTED_MODEL_ALLOWLIST: ReadonlySet<string> = new Set(
  HOSTED_MODELS.map((m) => m.id),
);
