// x402/safe-trending — Base trending tokens, each carrying its own safety read.
// Price: $0.15 — NO LLM anywhere. Every field is a provider passthrough, an
// on-chain read, or arithmetic over those two.
//
// ── WHY THIS TOOL EXISTS (P2-2) ──────────────────────────────────────────────
//
// MEASURED 2026-09-26: the realistic prompt "find hot Base pools and tell me
// which ones aren't honeypots" cost 21 tool calls — one `pool-scan`, then a
// `honeypot-check` and a `liquidity-depth` per token, serially, because the
// agent had no way to know a row was worth checking until it had checked it.
// This collapses that into one call. The saving is not convenience: at 21 calls
// an agent runs out of context before it runs out of tokens to check.
//
// ── WHAT "SAFE" MEANS HERE, AND WHAT IT DOES NOT ─────────────────────────────
//
// SAFE = tradeable with a VERIFIED tax. Nothing more. A clean scan is not a buy
// signal and this file must never grow one — no score, no verdict word, no
// ranking by momentum. The name is the most dangerous thing about the tool, so
// the description carries the caveat and so does `disclaimer` on every response.
//
// ── NO LLM, DELIBERATELY ─────────────────────────────────────────────────────
//
// `honeypot-check` spends two LLM passes per token. Ten tokens would be twenty
// passes, which blows both the latency budget and the Virtuals credit budget,
// and buys nothing: the only fields here that decide anything are the tax read
// and the depth math, and both are code. The model's contribution to
// `honeypot-check` is prose, and prose does not scale to a batch. Callers that
// want the write-up call `honeypot-check` on the one row they care about.
//
// So `verdict` and `action` are computed by the SAME exported arithmetic
// `honeypot-check` uses (`HONEYPOT_SELL_TAX_BPS`, `honeypotAction`), not by a
// second copy of the rules that can drift from it.
//
// ⚠️ ONE GeckoTerminal CALL. Per the header of `pool-scan.ts` there is a per-IP
// budget on that API and a prior P0 from tripping its 429. The per-token work
// below is `eth_call` against Base RPC, which is a different budget. Do not add
// a DexScreener or GT fetch per token.
//
// ⚠️ A TOKEN THAT FAILS ITS CHECK IS NEVER SILENTLY DROPPED. It comes back with
// `status: "error"` and its reason. A batch tool that quietly shrinks turns "3
// tokens passed" into something indistinguishable from "only 3 were looked at",
// and the caller cannot tell a quiet market from a broken RPC. The identity
// `scanned === passed + excluded + errored` is asserted in the guard suite.
import { getBaseTrending, type Pool } from "@/lib/market-data";
import { readTokenTax, type TaxRead, TAX_UNREAD } from "@/lib/token-tax";
import { classifyToken } from "@/lib/wallet/token-trust";
import { dedupeBySubject, type SubjectToken } from "./pool-scan";
import { HONEYPOT_SELL_TAX_BPS, honeypotAction } from "./honeypot-check";
import { slippagePct, exitRiskFor } from "./liquidity-depth";

/** Base mainnet only. Stated on every row — CLAUDE.md hard rule #1. */
const CHAIN = "base" as const;
const CHAIN_ID = 8453;

export const DEFAULT_MIN_LIQUIDITY_USD = 500_000;
export const DEFAULT_LIMIT = 10;
/** Upper bound on tokens scanned per call — each one costs three `eth_call`s. */
export const MAX_LIMIT = 25;

/** Sell tax above this is a cost warning, not a trap. The trap threshold is
 *  `HONEYPOT_SELL_TAX_BPS` (50%) and lives in `honeypot-check`. */
export const HIGH_TAX_BPS = 500; // 5%
/** fdv/mcap above this is a large unvested overhang. */
export const UNLOCK_OVERHANG_RATIO = 3;
export const MICRO_CAP_USD = 5_000_000;
export const DUMPING_PCT = -15;
export const CHURN_RATIO = 1.2;
export const ARB_FLOW_RATIO = 5;
export const ARB_FLOW_MAX_ABS_CHANGE_PCT = 2;

export type SafeTrendingFlag =
  | "TAX_UNVERIFIED"
  | "HIGH_TAX"
  | "BLACKLIST_CAPABLE"
  | "UNLOCK_OVERHANG"
  | "MICRO_CAP"
  | "DUMPING"
  | "CHURN"
  | "ARB_FLOW"
  | "IMPERSONATION_CHECK";

export type HoneypotSummary = {
  verdict: "SAFE" | "SUSPICIOUS" | "HONEYPOT";
  /** Mirrors `honeypot-check`'s clamp: 90 is unreachable without a tax read. */
  confidence: number;
  action: string;
  tax_read: TaxRead["tax_read"];
  tax_units: TaxRead["tax_units"];
  buy_tax: number | null;
  sell_tax: number | null;
  buy_tax_pct: string | null;
  sell_tax_pct: string | null;
  has_blacklist: boolean | null;
  template: TaxRead["template"];
};

export type SafeTrendingRow = {
  status: "ok" | "error";
  address: string | null;
  symbol: string | null;
  chain: typeof CHAIN;
  chain_id: number;
  price_usd: number | null;
  change_24h: number | null;
  liquidity_usd: number | null;
  volume_24h: number | null;
  /** 24h volume ÷ pool liquidity. Null when either side is unmeasured. */
  vol_liq_ratio: number | null;
  market_cap_usd: number | null;
  fdv_usd: number | null;
  /** Only when GT reported BOTH figures — see the Pool.marketCap warning. */
  fdv_mcap_ratio: number | null;
  honeypot: HoneypotSummary | null;
  slippage_1k_pct: number | null;
  exit_risk: "LOW" | "MEDIUM" | "HIGH" | null;
  flags: SafeTrendingFlag[];
  pool_address: string | null;
  dex: string | null;
  pool_count: number;
  url: string;
  /** Present only on `status: "error"`. Why this row could not be scanned. */
  error: string | null;
};

export type Excluded = {
  address: string | null;
  symbol: string | null;
  liquidity_usd: number | null;
  reason: "below_min_liquidity" | "liquidity_unknown" | "no_subject_token" | "no_address";
};

/**
 * `confidence` for a batch row.
 *
 * `honeypot-check` derives its number from an LLM and then clamps it. There is
 * no LLM here, so there is no number to clamp — the confidence IS the evidence
 * state, stated directly. 85 for a successful tax read is deliberately below
 * that tool's 90+ ceiling: this scan reads the tax but skips the Basescan
 * verification and DEX-identity passes it also runs, so it has strictly less
 * evidence and must not claim the same certainty.
 */
export function batchConfidence(tax: TaxRead, isHoneypot: boolean): number {
  if (isHoneypot) return 95;              // a measured ≥50% sell tax is not a judgement call
  return tax.tax_read === "template" ? 85 : 50;
}

export function summarizeHoneypot(tax: TaxRead): HoneypotSummary {
  const isHoneypot = tax.sell_tax != null && tax.sell_tax >= HONEYPOT_SELL_TAX_BPS;
  const confidence = batchConfidence(tax, isHoneypot);
  // Same shape as honeypot-check: HONEYPOT when measured, SAFE only once the
  // tax read succeeded, SUSPICIOUS otherwise. An unread tax can never reach
  // SAFE here, which is the whole point of the tool's name.
  const verdict: HoneypotSummary["verdict"] = isHoneypot
    ? "HONEYPOT"
    : confidence >= 70
      ? "SAFE"
      : "SUSPICIOUS";
  return {
    verdict,
    confidence,
    action: honeypotAction(verdict, tax.tax_read),
    tax_read: tax.tax_read,
    tax_units: tax.tax_units,
    buy_tax: tax.buy_tax,
    sell_tax: tax.sell_tax,
    buy_tax_pct: tax.buy_tax_pct,
    sell_tax_pct: tax.sell_tax_pct,
    has_blacklist: tax.has_blacklist,
    template: tax.template,
  };
}

const ratio = (a: number | null, b: number | null): number | null =>
  a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && b > 0
    ? +(a / b).toFixed(3)
    : null;

/**
 * Every flag is a derivation from a measured number. None is inferred from an
 * ABSENT one: a null input yields no flag rather than a pessimistic one, per
 * CLAUDE.md ("missing data → unknown, never a fabricated negative"). The single
 * exception is `TAX_UNVERIFIED`, which flags the absence itself and says so.
 */
export function deriveFlags(input: {
  tax: TaxRead;
  changeH24: number | null;
  volLiq: number | null;
  fdvMcap: number | null;
  marketCap: number | null;
  impostor: boolean;
}): SafeTrendingFlag[] {
  const f: SafeTrendingFlag[] = [];
  const { tax, changeH24, volLiq, fdvMcap, marketCap, impostor } = input;

  if (tax.tax_read !== "template") f.push("TAX_UNVERIFIED");
  if (tax.sell_tax != null && tax.sell_tax > HIGH_TAX_BPS) f.push("HIGH_TAX");
  if (tax.has_blacklist === true) f.push("BLACKLIST_CAPABLE");
  if (fdvMcap != null && fdvMcap > UNLOCK_OVERHANG_RATIO) f.push("UNLOCK_OVERHANG");
  if (marketCap != null && marketCap < MICRO_CAP_USD) f.push("MICRO_CAP");
  if (changeH24 != null && changeH24 < DUMPING_PCT) f.push("DUMPING");
  if (volLiq != null && volLiq > CHURN_RATIO) f.push("CHURN");
  // Heavy turnover with a flat price is flow passing through, not demand —
  // worth naming separately from CHURN because it reads as volume to a caller
  // ranking on volume, which is exactly what this tool does.
  if (volLiq != null && volLiq > ARB_FLOW_RATIO && changeH24 != null &&
      Math.abs(changeH24) < ARB_FLOW_MAX_ABS_CHANGE_PCT) f.push("ARB_FLOW");
  if (impostor) f.push("IMPERSONATION_CHECK");

  return f;
}

/**
 * Unflagged rows first, each group by 24h volume descending.
 *
 * Flagged rows are RANKED LAST, never removed. Hiding them would make the
 * feed's own filter invisible and would quietly re-answer "what is trending"
 * as "what we approve of". Errored rows sort after both — they carry no volume
 * to rank on and no finding to report.
 */
export function rankRows(rows: SafeTrendingRow[]): SafeTrendingRow[] {
  const tier = (r: SafeTrendingRow) =>
    r.status === "error" ? 2 : r.flags.length === 0 ? 0 : 1;
  return [...rows].sort((a, b) => {
    const t = tier(a) - tier(b);
    if (t !== 0) return t;
    return (b.volume_24h ?? -1) - (a.volume_24h ?? -1);
  });
}

/** The deduped pool row plus the two market-cap legs pool-scan does not carry. */
type PoolRow = ReturnType<typeof dedupeBySubject>["rows"][number];
type EnrichedPool = PoolRow & {
  market_cap_usd: number | null;
  fdv_usd: number | null;
  mcap_fallback: number | null;
};

type Candidate = {
  subject: SubjectToken & { address: string };
  pool: EnrichedPool;
};

/** One token's on-chain leg. Isolated so a single RPC failure cannot take the batch down. */
async function scanOne(c: Candidate): Promise<SafeTrendingRow> {
  return buildRow(c, await readTokenTax(c.subject.address), null);
}

function buildRow(c: Candidate, tax: TaxRead, error: string | null): SafeTrendingRow {
  const p = c.pool;
  const volLiq = ratio(p.volume24h, p.liquidity);
  // Both figures or neither — `marketCap` alone silently falls back to fdv and
  // would compute a ratio of exactly 1 for every token GT gives no mcap for.
  const fdvMcap = ratio(p.fdv_usd, p.market_cap_usd);
  const impostor =
    classifyToken(
      { address: c.subject.address, symbol: c.subject.symbol ?? "" },
      "base",
    ) === "impostor";

  return {
    status: error ? "error" : "ok",
    address: c.subject.address,
    symbol: c.subject.symbol,
    chain: CHAIN,
    chain_id: CHAIN_ID,
    price_usd: p.price,
    change_24h: p.change24h,
    liquidity_usd: p.liquidity,
    volume_24h: p.volume24h,
    vol_liq_ratio: volLiq,
    market_cap_usd: p.market_cap_usd,
    fdv_usd: p.fdv_usd,
    fdv_mcap_ratio: fdvMcap,
    // On an errored row the tax is TAX_UNREAD, so the summary honestly reports
    // SUSPICIOUS / TAX_UNVERIFIED rather than a verdict nobody measured.
    honeypot: summarizeHoneypot(tax),
    slippage_1k_pct: slippagePct(1_000, p.liquidity),
    exit_risk: exitRiskFor(p.liquidity),
    flags: deriveFlags({
      tax,
      changeH24: p.change24h,
      volLiq,
      fdvMcap,
      marketCap: p.market_cap_usd ?? p.mcap_fallback,
      impostor,
    }),
    pool_address: p.pool_address,
    dex: p.dex,
    pool_count: p.pool_count,
    url: p.url,
    error,
  };
}

function enrich(row: PoolRow, pool: Pool | undefined): EnrichedPool {
  return {
    ...row,
    market_cap_usd: pool?.marketCapReported ?? null,
    fdv_usd: pool?.fdv ?? null,
    mcap_fallback: pool?.marketCap ?? null,
  };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { min_liquidity_usd?: number; limit?: number; include_new?: boolean } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const numParam = (k: string) => {
      const v = url.searchParams.get(k);
      return v == null ? undefined : Number(v);
    };

    const rawLimit = body.limit ?? numParam("limit") ?? DEFAULT_LIMIT;
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(MAX_LIMIT, Math.trunc(rawLimit)))
      : DEFAULT_LIMIT;
    const rawMin = body.min_liquidity_usd ?? numParam("min_liquidity_usd") ?? DEFAULT_MIN_LIQUIDITY_USD;
    const minLiquidityUsd = Number.isFinite(rawMin) && rawMin >= 0 ? rawMin : DEFAULT_MIN_LIQUIDITY_USD;

    // Ask GT for extra pools so the liquidity filter has something to work on:
    // `limit` is the number of tokens the caller wants BACK, and the filter
    // runs before the cap. One request either way.
    const pools = await getBaseTrending(Math.min(MAX_LIMIT * 2, Math.max(limit * 3, 20)));
    const { rows: deduped } = dedupeBySubject(pools);

    const byPool = new Map(
      pools.map((p) => [(p.poolAddress || "").toLowerCase(), p] as const),
    );

    const candidates: Candidate[] = [];
    const excluded: Excluded[] = [];

    for (const row of deduped) {
      const subject = row.subject_token;
      if (!subject) {
        excluded.push({
          address: null, symbol: row.symbol, liquidity_usd: row.liquidity,
          reason: "no_subject_token",
        });
        continue;
      }
      if (!subject.address) {
        // No address means no tax read and no identity check. Per hard rule #2
        // a ticker is not a token, so this is excluded rather than guessed at.
        excluded.push({
          address: null, symbol: subject.symbol, liquidity_usd: row.liquidity,
          reason: "no_address",
        });
        continue;
      }
      if (row.liquidity == null || !Number.isFinite(row.liquidity)) {
        excluded.push({
          address: subject.address, symbol: subject.symbol, liquidity_usd: null,
          reason: "liquidity_unknown",
        });
        continue;
      }
      if (row.liquidity < minLiquidityUsd) {
        excluded.push({
          address: subject.address, symbol: subject.symbol, liquidity_usd: row.liquidity,
          reason: "below_min_liquidity",
        });
        continue;
      }
      candidates.push({
        subject: { ...subject, address: subject.address },
        pool: enrich(row, byPool.get((row.pool_address || "").toLowerCase())),
      });
    }

    const capped = candidates.slice(0, limit);

    // allSettled, not all: one token's RPC failure must cost that token its
    // row, never the whole batch. A rejection still produces a row — with
    // `status: "error"` and TAX_UNREAD — so the identity below holds.
    const settled = await Promise.allSettled(capped.map(scanOne));
    const rows: SafeTrendingRow[] = settled.map((s, i) =>
      s.status === "fulfilled"
        ? s.value
        : buildRow(capped[i], TAX_UNREAD, (s.reason as Error)?.message ?? "scan failed"),
    );

    const ranked = rankRows(rows);
    const errored = ranked.filter((r) => r.status === "error").length;

    return Response.json({
      tool: "safe-trending",
      chain: CHAIN,
      chain_id: CHAIN_ID,
      tokens: ranked,
      filter: {
        min_liquidity_usd: minLiquidityUsd,
        limit,
        // `include_new` is accepted and echoed but does nothing yet: new pools
        // are a second GT request and the per-IP budget is the reason this tool
        // makes one. Echoed rather than ignored so a caller can see it was read.
        include_new: Boolean(body.include_new ?? (url.searchParams.get("include_new") === "true")),
        include_new_supported: false,
      },
      counts: {
        // scanned === passed + excluded + errored, always. Asserted in the
        // guard suite; it is what lets a caller tell a quiet market from a
        // heavy filter from a broken RPC.
        pools_in: pools.length,
        scanned: deduped.length,
        passed: ranked.length - errored,
        excluded: excluded.length,
        errored,
        capped_out: Math.max(0, candidates.length - capped.length),
      },
      excluded,
      ranking: "unflagged first by 24h volume, then flagged, then errored — flagged rows are never hidden",
      disclaimer:
        "SAFE here means tradeable with a VERIFIED buy/sell tax read from the contract on Base 8453. It is not a buy signal, not a price opinion, and not a full audit — no LLM produced any number on this page. Tokens whose tax could not be read are labelled TAX_UNVERIFIED, which is unverified, not clean.",
      data_source: "GeckoTerminal trending (live) + Base RPC eth_call tax read",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: "safe-trending failed", message: (e as Error).message },
      { status: 500 },
    );
  }
}
