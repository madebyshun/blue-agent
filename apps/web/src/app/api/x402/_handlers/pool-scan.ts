// x402/pool-scan — Base trending + new pools + TVL snapshot. No LLM. Price: $0.02
//
// ── WHY THIS FILE LOOKS LIKE THIS (P1-7, 2026-09-27) ─────────────────────────
//
// MEASURED against the live tool on 2026-09-26: AERO came back SIX times as six
// separate rows, and not one row carried a token address. Both halves of that
// are the same defect — the handler was publishing a pool feed while describing
// it as a token feed.
//
//   1. NO ADDRESS. Every row said `symbol: "AERO"` and stopped. An agent that
//      wanted to do anything with a row — check it for a honeypot, price it,
//      look at its holders — had to spend a SECOND tool call resolving that
//      ticker back to an address. That one gap is why a realistic "scan hot
//      pools, filter honeypots" prompt cost 21 tool calls. The fix costs no
//      extra upstream request: GeckoTerminal already ships both legs' addresses
//      in the `relationships` block of the SAME response the prices came in,
//      and `mapGtPool` was simply dropping it on the floor.
//
//      This matters beyond call count. CLAUDE.md hard rule #2: a ticker string
//      never identifies a token, chain + address does. A row reading "AERO"
//      with no address is not a terse answer, it is an unverifiable one — and
//      on a NEW-POOLS feed, which is exactly where freshly-minted impostors
//      appear, it is the unverifiable answer most likely to be acted on.
//
//   2. NO DEDUPE. Six AERO rows is six pools, and the caller could not tell
//      because nothing on the row said which pool. Collapsed here to the
//      deepest-liquidity pool per subject token, with `pool_count` so the
//      collapse is visible rather than silent.
//
//   3. 20/20 JUNK in `new_pools`. Every brand-new empty pool was published
//      beside real ones with nothing separating them. Now filtered at $1k
//      liquidity, reporting `filtered_out_count` — the pattern already used by
//      rh-stock-movers' dust filter, followed here for consistency.
//
// ⚠️ NO NEW GECKOTERMINAL CALLS. There is a per-IP budget on that API and a
// prior P0 from tripping its 429. Everything added here is derived from the
// three calls that were already being made. If a future change needs a field
// GT does not already return in these responses, that is a design change to
// discuss, not a fourth fetch to slip in.
//
// Deterministic throughout: no LLM, no scoring, no verdict. Every field below
// is either a passthrough of provider data or arithmetic over it.
import { getBaseTrending, getBaseNewPools, getBaseTvl, type Pool } from "@/lib/market-data";
import { BASE_MAJORS } from "@/lib/wallet/token-trust";

/** This handler reads Base mainnet only. Stated on every row — CLAUDE.md #1. */
const CHAIN = "base" as const;
const CHAIN_ID = 8453;

/**
 * Pools below this are excluded from `new_pools`.
 *
 * $1,000 is a floor on "is this a market at all", not a quality judgement. A
 * brand-new pool with $40 in it cannot be traded, cannot be evaluated, and is
 * indistinguishable from the empty pools minted in bulk — publishing it next to
 * a real one implies a comparison that does not exist.
 */
export const NEW_POOL_MIN_LIQUIDITY_USD = 1000;

/**
 * Tokens that may not be the SUBJECT of a row.
 *
 * Every pool has two legs and one of them is almost always the money side. A
 * feed that reports the money side is reporting the same four tokens forever.
 *
 * ── Addresses are the real test, and they come from BASE_MAJORS ──────────────
 * ETH / USDC / WETH / cbBTC are matched by ADDRESS off the list this repo
 * already pins in `lib/wallet/token-trust.ts`, so there is no second copy here
 * to drift out of sync.
 *
 * ── VIRTUAL is matched by SYMBOL, and that is a weaker test on purpose ───────
 * This repo pins no VIRTUAL address anywhere (grepped 2026-09-27). CLAUDE.md
 * hard rule #4 forbids inventing one, so the choice is symbol-matching or
 * nothing. Symbol-matching is safe HERE, and only here, because of what it is
 * used for: this set decides which leg gets CALLED the subject, and both legs'
 * addresses are published on the row regardless. The worst case for a token
 * falsely wearing the VIRTUAL ticker is that this picks the other leg as the
 * subject — a presentation choice the caller can audit from the addresses
 * sitting right next to it. It is never an identity claim, and nothing
 * downstream may treat it as one.
 */
const MAJOR_ADDRESSES: ReadonlySet<string> = new Set(
  BASE_MAJORS.map((t) => t.addr.toLowerCase()),
);
const MAJOR_SYMBOLS_WITHOUT_PINNED_ADDRESS: ReadonlySet<string> = new Set(["VIRTUAL"]);

const normSym = (s: string) => (s || "").trim().toUpperCase().replace(/^\$/, "");

/** Is this leg a money-side major, and therefore never the subject? */
export function isMajorLeg(address: string, symbol: string): boolean {
  if (address && MAJOR_ADDRESSES.has(address.toLowerCase())) return true;
  return MAJOR_SYMBOLS_WITHOUT_PINNED_ADDRESS.has(normSym(symbol));
}

export type TokenRef = { address: string | null; symbol: string | null };

export type SubjectToken = TokenRef & {
  /** Which leg of the pair the subject turned out to be. */
  side: "base" | "quote";
};

/**
 * Which leg of the pair is the token this row is ABOUT?
 *
 * ⚠️ THE TOKEN OF INTEREST SITS ON EITHER SIDE. Assuming it is always the base
 * side is a bug this repo has shipped before (#312, and see the whole header of
 * `lib/dex-side.ts` — measured 2026-09-26, USDC's six deepest Base pairs are
 * ALL quote-side, so reading `baseToken` off the deepest answered a USDC
 * question with AERO's price). Both orientations are exercised by
 * `scripts/pool-scan-shape-test.ts`; do not "simplify" this to the base leg.
 *
 * Returns null when neither leg qualifies — a major/major pool such as
 * WETH/USDC genuinely has no subject, and naming one would be a guess. Per
 * CLAUDE.md, "cannot assess" is the answer; the row keeps both addresses so the
 * caller can decide for itself.
 */
export function subjectOf(p: Pool): SubjectToken | null {
  const baseMajor  = isMajorLeg(p.baseAddress,  p.baseSymbol);
  const quoteMajor = isMajorLeg(p.quoteAddress, p.quoteSymbol);

  // Exactly one major → the other leg is the subject. This is the branch that
  // catches the quote-side case: a TKN/WETH pool subjects TKN (base), and a
  // WETH/TKN pool subjects TKN (quote). Same token, either orientation.
  if (baseMajor !== quoteMajor) {
    return quoteMajor
      ? { address: p.baseAddress  || null, symbol: p.baseSymbol  || null, side: "base"  }
      : { address: p.quoteAddress || null, symbol: p.quoteSymbol || null, side: "quote" };
  }
  // Neither is a major (a long-tail pair). GT's own base leg is the one it
  // prices and ranks by, so it is the defensible default rather than a coin flip.
  if (!baseMajor && !quoteMajor) {
    return { address: p.baseAddress || null, symbol: p.baseSymbol || null, side: "base" };
  }
  // Both majors.
  return null;
}

/**
 * Identity key for dedupe.
 *
 * Address when we have one. When we do NOT, the key falls back to the POOL
 * address — never to the symbol. That deliberately refuses to merge: two rows
 * whose identity is unknown are not thereby the same token, and collapsing them
 * on a matching ticker is the exact mistake that let an impostor into the RH
 * registry (#280). Unknown identity costs a duplicate row; a wrong merge costs
 * a wrong answer.
 */
function subjectKey(p: Pool, subject: SubjectToken | null): string {
  if (subject?.address) return `addr:${subject.address.toLowerCase()}`;
  return `pool:${(p.poolAddress || "").toLowerCase()}`;
}

export type PoolRow = {
  // ── pre-existing fields, unchanged. Callers depend on these names. ─────────
  symbol: string;
  price: number | null;
  change24h: number | null;
  volume24h: number | null;
  liquidity: number | null;
  url: string;
  // ── added 2026-09-27 ──────────────────────────────────────────────────────
  chain: typeof CHAIN;
  chain_id: number;
  pool_address: string | null;
  dex: string | null;
  base_token: TokenRef;
  quote_token: TokenRef;
  subject_token: SubjectToken | null;
  /** How many pools for this subject were collapsed into this row. Always ≥ 1. */
  pool_count: number;
};

const ref = (address: string, symbol: string): TokenRef => ({
  address: address || null,
  symbol: symbol || null,
});

/** One GT pool → one output row. `pool_count` is set by the dedupe pass. */
export function toRow(p: Pool, poolCount = 1): PoolRow {
  return {
    symbol: p.baseSymbol,
    price: p.priceUsd,
    change24h: p.change.h24,
    volume24h: p.volume24h,
    liquidity: p.liquidityUsd,
    url: p.url,
    chain: CHAIN,
    chain_id: CHAIN_ID,
    pool_address: p.poolAddress || null,
    dex: p.dex || null,
    base_token: ref(p.baseAddress, p.baseSymbol),
    quote_token: ref(p.quoteAddress, p.quoteSymbol),
    subject_token: subjectOf(p),
    pool_count: poolCount,
  };
}

/**
 * Collapse pools that describe the same subject token, keeping the DEEPEST.
 *
 * Deepest wins because liquidity is what makes the other numbers mean anything
 * — a $40 pool's price is not a price. Null liquidity sorts last rather than as
 * zero: "not reported" is not "empty", and a real pool with a missing field
 * should not lose to a measured-empty one.
 *
 * Group ORDER is the order each subject first appeared upstream, so
 * GeckoTerminal's own trending rank survives the collapse. Re-sorting here
 * would silently replace their ranking with ours while still calling the field
 * "trending".
 */
export function dedupeBySubject(pools: Pool[]): { rows: PoolRow[]; collapsed: number } {
  const groups = new Map<string, Pool[]>();
  for (const p of pools) {
    const key = subjectKey(p, subjectOf(p));
    const g = groups.get(key);
    if (g) g.push(p);
    else groups.set(key, [p]);
  }
  const rows: PoolRow[] = [];
  for (const g of groups.values()) {
    const deepest = g.reduce((best, p) =>
      (p.liquidityUsd ?? -1) > (best.liquidityUsd ?? -1) ? p : best,
    );
    rows.push(toRow(deepest, g.length));
  }
  return { rows, collapsed: pools.length - rows.length };
}

export type NewPoolRow = PoolRow & {
  /** GT's trending/new feeds do not carry pool age. Absent, not zero. */
  age_hours: null;
};

export type FilteredOut = {
  symbol: string;
  pool_address: string | null;
  subject_token: SubjectToken | null;
  liquidity: number | null;
  reason: "below_min_liquidity" | "liquidity_unknown";
};

/**
 * Drop unfundable new pools, and SAY how many were dropped.
 *
 * The count is the point. A filter that quietly shrinks a list turns "there are
 * 3 new pools worth looking at" into something indistinguishable from "there
 * were only 3 new pools", and the caller cannot tell a quiet day from a heavy
 * filter. Same reasoning, and the same field name, as the dust filter in
 * `rh-stock-movers.ts` — kept deliberately consistent so both tools report a
 * filtered universe the same way.
 *
 * `liquidity_unknown` is a SEPARATE reason from `below_min_liquidity`: a pool
 * GT reported no reserve for has not been measured as empty, it has not been
 * measured at all. Both are excluded (an unmeasurable pool cannot be
 * recommended either), but the row says which, so the exclusion is never read
 * back as a claim the pool was empty.
 */
export function filterNewPools(
  pools: Pool[],
  minLiquidityUsd = NEW_POOL_MIN_LIQUIDITY_USD,
): { rows: NewPoolRow[]; filteredOut: FilteredOut[] } {
  const rows: NewPoolRow[] = [];
  const filteredOut: FilteredOut[] = [];
  for (const p of pools) {
    const liq = p.liquidityUsd;
    if (liq === null || !Number.isFinite(liq)) {
      filteredOut.push({
        symbol: p.baseSymbol, pool_address: p.poolAddress || null,
        subject_token: subjectOf(p), liquidity: null, reason: "liquidity_unknown",
      });
      continue;
    }
    if (liq < minLiquidityUsd) {
      filteredOut.push({
        symbol: p.baseSymbol, pool_address: p.poolAddress || null,
        subject_token: subjectOf(p), liquidity: liq, reason: "below_min_liquidity",
      });
      continue;
    }
    rows.push({ ...toRow(p), age_hours: null });
  }
  return { rows, filteredOut };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { limit?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const limit = body.limit ?? (Number(url.searchParams.get("limit") ?? "10") || 10);

    const [trending, fresh, tvl] = await Promise.all([
      getBaseTrending(limit), getBaseNewPools(limit), getBaseTvl(),
    ]);

    const { rows: trendingRows, collapsed } = dedupeBySubject(trending);
    const { rows: newRows, filteredOut } = filterNewPools(fresh);

    return Response.json({
      tool: "pool-scan",
      // Every address below is a Base mainnet address. Base and Robinhood Chain
      // (4663) share no state, so an address without its chain is not an answer.
      chain: CHAIN,
      chain_id: CHAIN_ID,
      base_tvl_usd: tvl?.tvlUsd ?? null,
      tvl_change_24h: tvl?.change1dPct ?? null,
      trending: trendingRows,
      new_pools: newRows,
      dedupe: {
        rule: "one row per subject token, keeping the deepest-liquidity pool; see pool_count",
        pools_in: trending.length,
        rows_out: trendingRows.length,
        collapsed_count: collapsed,
      },
      new_pools_filter: {
        min_liquidity_usd: NEW_POOL_MIN_LIQUIDITY_USD,
        pools_in: fresh.length,
        rows_out: newRows.length,
        filtered_out_count: filteredOut.length,
        filtered_out: filteredOut,
      },
      data_source: "GeckoTerminal + DefiLlama (live)",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "pool-scan failed", message: (e as Error).message }, { status: 500 });
  }
}
