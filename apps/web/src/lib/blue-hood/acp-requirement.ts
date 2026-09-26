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

/**
 * Which KEYS a buyer may use to carry each field, in precedence order.
 *
 * 🔴 SHARING THE NORMALISER WAS NOT ENOUGH — the aliases have to be shared too.
 * The first fix moved `normalizeChain`/`normalizeSide` here so the two surfaces
 * could not disagree about what a VALUE means. They still disagreed about which
 * KEY carries it: the paid path read `chain ?? chain_id ?? chainId` while the
 * free URL read `chain` alone, so the alias arrived as `undefined` there and
 * defaulted to "robinhood" instead of being rejected.
 *
 * MEASURED in production 2026-09-26, /api/acp/execution-plan?ticker=NVDA&size_usd=1000:
 *   chain=base        400 unsupported_chain    (agrees with the paid path)
 *   chain_id=8453     200 Robinhood plan       (paid path REFUSES)
 *   chainId=8453      200 Robinhood plan       (paid path REFUSES)
 *   side=short        400 unsupported_side     (agrees)
 *   direction=short   200 stamped side:"buy"   (paid path REFUSES)
 *   action=sell       200 priced as a BUY      (paid path prices a SELL)
 *
 * Same failure direction as the original bug, one layer up: the free URL — the
 * one a buyer self-tests against before escrowing — is the PERMISSIVE one, so it
 * answers confidently for a desk it cannot price. `action=sell` is the sharpest
 * of the six: both surfaces return 200 and they return a different product.
 *
 * Read through `readRequirement` rather than spelling any of these out at a call
 * site. Two hand-written alias lists is the same class of drift as two parsers,
 * and it already cost one round-trip to find twice.
 */
export const REQUIREMENT_KEYS = {
  ticker:   ["ticker", "symbol"],
  size_usd: ["size_usd", "sizeUsd", "size"],
  chain:    ["chain", "chain_id", "chainId"],
  side:     ["side", "direction", "action"],
} as const;

export type RawRequirement = {
  ticker: string;
  size_usd: number;
  chain: AcpSubjectChain;
  side: AcpSubjectSide;
};

/**
 * Pull a buyer's requirement out of anything key-addressable — `get` is
 * `(k) => url.searchParams.get(k)` on the free URL and `(k) => obj[k]` on the
 * paid path, which is the whole point: one alias table, two shapes of input.
 *
 * An empty or whitespace-only value counts as ABSENT and falls through to the
 * next alias, so `?chain=&chain_id=8453` reads the 8453 rather than stopping at
 * the blank. Nothing here throws, reaches the network, or defaults `chain`/`side`
 * on an unreadable value — `"unknown"` is returned for the caller to reject.
 */
export function readRequirement(get: (key: string) => unknown): RawRequirement {
  const pick = (keys: readonly string[]): unknown => {
    for (const k of keys) {
      const v = get(k);
      if (v !== undefined && v !== null && String(v).trim() !== "") return v;
    }
    return undefined;
  };
  return {
    ticker: String(pick(REQUIREMENT_KEYS.ticker) ?? "").trim(),
    size_usd: Number(pick(REQUIREMENT_KEYS.size_usd)),
    chain: normalizeChain(pick(REQUIREMENT_KEYS.chain)),
    side: normalizeSide(pick(REQUIREMENT_KEYS.side)),
  };
}
