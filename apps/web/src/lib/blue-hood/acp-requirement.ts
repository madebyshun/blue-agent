/**
 * Blue Hood — how a buyer's `chain` / `side` are read, for BOTH surfaces.
 *
 * WHY THIS FILE EXISTS. These two normalisers used to live only in
 * `acp-seller.ts`, so the paid ACP job path validated them and the free
 * `/api/acp/execution-plan` URL did not. The two disagreed in the worst
 * direction: the free URL is the one a buyer self-tests with BEFORE paying, so
 * `chain=base` returned a Robinhood plan there and then got rejected once money
 * was escrowed, and `side=short` was silently coerced to a buy plan instead of
 * being refused. A buyer who validated against the free endpoint would have
 * built against behaviour the paid path does not honour.
 *
 * Shared here so the two surfaces cannot drift again — pinned by
 * `scripts/acp-requirement-check.ts`, which fails if either surface stops
 * routing through these functions.
 *
 * Neither function throws and neither reaches the network: they turn arbitrary
 * buyer input into a closed union, and `"unknown"` is a REJECT signal, never a
 * default. Callers must reject on it rather than fall back.
 */
import type { AcpSubjectChain, AcpSubjectSide } from "@/lib/blue-hood/acp-jobs";

/**
 * Which desk the ticker trades on. Absent → `"robinhood"`, this offering's only
 * desk, which is why `chain` is genuinely OPTIONAL and must not be advertised as
 * required.
 *
 * An unrecognised value returns `"unknown"` so the caller rejects it. Base is
 * recognised precisely so it can be refused with an accurate reason instead of
 * being mistaken for a typo — a Base ticker answered off the Robinhood desk is a
 * wrong answer the buyer paid for, not a near miss.
 */
export function normalizeChain(v: unknown): AcpSubjectChain {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "robinhood"; // absent → this offering's only desk (stated, not assumed)
  if (s === "robinhood" || s === "robinhoodchain" || s === "rh" || s === "4663") return "robinhood";
  if (s === "base" || s === "8453") return "base";
  return "unknown";
}

/**
 * Which side the buyer is pricing. Absent → `"buy"`, matching every job sold
 * before sell support existed, so no in-flight buyer changes behaviour.
 *
 * An UNRECOGNISED value returns `"unknown"` and gets rejected rather than
 * falling back to `"buy"`. The engine itself coerces anything non-`"sell"` to
 * `"buy"` (`execution-plan.ts:273`), so a silent default here would take money
 * for a buy plan from someone who typed `"short"` and meant to exit. Rejecting
 * is free; a wrong answer the buyer paid escrow for is not.
 *
 * ⚠️ MEASURED 2026-09-25, NVDA @ $25k: a buy plan and a sell plan differ in
 * exactly ONE of 39 leaf fields — `side` itself. The engine's first-order impact
 * is `size/(one_side + size)` against the same reserve, which is genuinely
 * direction-symmetric under xy=k, so route, legs and slippage are identical by
 * construction and not by oversight. What this wiring buys is an ACCURATE
 * RECEIPT, not new analysis: before it, a job asking for `"sell"` was answered
 * with a plan stamped `side: "buy"`, and one asking for `"short"` was silently
 * priced as a buy. Do not let the listing imply we model sell-side effects the
 * engine does not compute — if that ever becomes true, it will be a change in
 * `execution-plan.ts`, not here.
 */
export function normalizeSide(v: unknown): AcpSubjectSide {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return "buy"; // absent → the historical default (stated, not assumed)
  if (s === "buy" || s === "sell") return s;
  return "unknown";
}
