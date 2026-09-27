// x402/hood-live — the Blue Hood drift board as a machine-readable feed: every
// tokenized stock both desks are watching right now, with its Chainlink oracle
// price, its deepest-pool DEX spot, and the drift between them.
//
// Price: free. It is a READ of a cron's output — one KV command, zero upstream
// HTTP — so there is no compute to bill for, and the board it mirrors is already
// public at /hood. Charging for the same rows behind a different URL would be
// charging for the URL.
//
// ── What "live" means here, precisely ──────────────────────────────────────
// It is the newest completed poll cycle, NOT a fresh quote. The poll cron runs on
// a 5-minute cadence; this reads whatever it last stored. So `as_of`,
// `data_age_seconds` and `is_stale` are part of the answer, not decoration — an
// agent that acts on a drift number without reading them is acting on a price
// from up to a cycle ago. Threshold for `is_stale` matches the /hood header
// banner (15 min) so the API and the UI can never disagree about whether the
// desk is healthy.
//
// ── TWO DESKS, AND A ROW IS MEANINGLESS WITHOUT ITS CHAIN ──────────────────
// CLAUDE.md hard rule 1. NVDA, META, GOOGL and AAPL exist on BOTH live venues as
// DIFFERENT tokens in DIFFERENT pools, so the ticker string does not identify
// anything: only chain + address does. Every row therefore carries `chain`,
// `chain_id` and an `explorer` link built from ITS OWN chain — a Basescan URL for
// a 4663 address resolves to nothing, and vice versa.
//
// The `chain` INPUT and a row's `chain` FIELD are two different absences and are
// spelled differently on purpose (#206, the third instance of that family):
//   • an absent row field means Robinhood — every row written before the Base
//     desk existed genuinely is RH, which is what `chainOf` preserves;
//   • an absent INPUT means the caller named no chain, so BOTH desks match.
// `parseHoodChain` returns `undefined` rather than defaulting, and `matchesChain`
// applies the row default only on the row side. Collapsing those two made Blue
// Chat answer "drift on NVDA on Base" with a graded Robinhood arrow.
//
// ── Base rows must SAY they are Base ───────────────────────────────────────
// `kvGet<BaseDeskLatest>` is an unchecked cast over whatever JSON is at that key,
// so the type binds the WRITER and proves nothing here — a blob from an older
// deploy can hold rows with no `chain` at all. `partitionBaseRows` is the check,
// and an unattributed row is DROPPED and COUNTED, never rendered: showing nothing
// is recoverable, showing NVDA's Base row under a Robinhood identity is #161.
// The shortfall is reported as `base_desk.unattributed` so `count` can never be
// quietly below what the desk actually polled.
//
// ── BLIND is not DOWN ──────────────────────────────────────────────────────
// `kvGetProbe`, not `kvGet`, on the RH snapshot. A swallowed throw returns null,
// which reads as "the poller has not run" — the exact blind message that masked
// the 2026-07-27 Upstash-cap outage. The engine can be perfectly healthy behind
// an unreadable KV, so `kv_error` (we cannot see) and `never_polled` (there is
// nothing to see) stay separate answers. Base, by contrast, is read with the
// swallowing `kvGet` deliberately: it is additive, and a Base-side KV problem
// must not take the Robinhood desk down with it.
//
// ── NO hit-rate lives here ────────────────────────────────────────────────
// This is the live board; the scoreboard is `hood-track-record`, which owns the
// sample gate. Do not add an accuracy percentage to this response — the rows here
// are ungraded by construction (grading needs a forward window), so any rate
// computed from them would be a number about a different population than the one
// it appeared next to.
//
// NO LLM ANYWHERE IN THIS FILE. Every field is a stored measurement.
import { kvGet, kvGetProbe } from "@/lib/kv";
import {
  KV_SNAPSHOT_LATEST,
  KV_BASE_ROWS_LATEST,
  BASE_ROWS_MAX_AGE_MS,
} from "@/lib/blue-hood/kv-keys";
import {
  chainOf,
  matchesChain,
  parseHoodChain,
  partitionBaseRows,
  type BaseDeskLatest,
  type HoodChain,
  type HoodSnapshot,
  type TickerSnapshot,
} from "@/lib/blue-hood/types";
import { TX_CHAINS } from "@/lib/tx-chains";

/** Same 15-min threshold the /hood header banner uses. */
const STALE_AFTER_S = 15 * 60;

/**
 * Per-row shape. `polled_at_ms` is dropped (a UI-internal offset from cycle
 * start) exactly as `/api/acp/drift` drops it.
 */
function shapeRow(r: TickerSnapshot) {
  const chain: HoodChain = chainOf(r);
  const meta = TX_CHAINS[chain];
  return {
    ticker: r.ticker,
    // Chain first and non-negotiable: an address without its chain is unreadable
    // and the same ticker is a different token on the other desk.
    chain,
    chain_id: meta.chainId,
    chain_label: meta.label,
    name: r.name,
    contract: r.contract,
    explorer: `${meta.explorer}/address/${r.contract}`,
    explorer_name: meta.explorerName,
    verdict: r.verdict,
    oracle_usd: r.oracle_usd,
    dex_usd: r.dex_usd,
    drift_pct: r.drift_pct,
    /** The pool the swap route uses — the depth at the price you would trade at. */
    primary_pool_tvl_usd: r.tvl_usd,
    /** SUM across every pool for this token on this chain. The dust gate reads
     *  this one; a thin primary pool next to a deep WETH pool is still deep. */
    total_tvl_usd: r.total_tvl_usd,
    volume_24h_usd: r.volume_24h_usd,
    pool_ref: r.pool_ref,
    is_v4_pool_id: r.is_v4_pool_id,
    market_session: r.market.session,
    market_is_open: r.market.is_open,
    // ⚠️ `data_age_s` MEANS DIFFERENT THINGS ON THE TWO DESKS — DEX cache age on
    // Robinhood, Chainlink round age on Base (types.ts spells this out). Shipping
    // the bare number would invite a consumer to average the two and call the
    // result "freshness", mixing DEX latency with oracle latency. The basis
    // travels with the value so that is impossible to do by accident.
    data_age_s: r.data_age_s,
    data_age_basis: chain === "base" ? "chainlink_round_age" : "dex_cache_age",
    oracle_updated_at: r.oracle_updated_at ?? null,
    warnings: r.warnings,
    ...(r.error ? { error: r.error } : {}),
  };
}

export default async function handler(req: Request): Promise<Response> {
  try {
    // The free path in `[tool]/route.ts` rebuilds the inner request WITHOUT the
    // query string, so the body is the real channel; the URL is read too so a
    // direct call (internal bypass, local curl) behaves the same way.
    let body: { chain?: unknown } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const rawChain = body.chain ?? url.searchParams.get("chain") ?? undefined;
    // `undefined` means "no filter", NEVER "robinhood". A bad value is rejected
    // rather than silently becoming a chain choice.
    const want = parseHoodChain(
      typeof rawChain === "string" ? rawChain.trim().toLowerCase() : rawChain,
    );
    if (rawChain !== undefined && rawChain !== null && String(rawChain) !== "" && want === undefined) {
      return Response.json(
        {
          error: `Unknown chain "${String(rawChain)}". Blue Hood watches two venues: "base" (8453) and "robinhood" (4663). Omit \`chain\` for both.`,
        },
        { status: 400 },
      );
    }

    const probe = await kvGetProbe<HoodSnapshot>(KV_SNAPSHOT_LATEST);

    if (probe.status === "error") {
      // We are BLIND, not down. Never report this as "the poller has not run".
      return Response.json(
        {
          error: "kv_unreachable",
          detail: probe.message,
          note: "Snapshot state is UNKNOWN, not empty. The poll engine may be healthy behind an unreadable KV — this is a monitoring blackout, not a confirmed outage. See /api/hood/health for the full discrimination.",
        },
        { status: 503 },
      );
    }
    if (probe.status === "miss") {
      return Response.json(
        {
          error: "never_polled",
          note: "No snapshot has been stored yet (cold start). This is a real, different answer from `kv_unreachable` above.",
        },
        { status: 503 },
      );
    }

    const rh = probe.value;

    // ── Base desk: additive, and never allowed to break Robinhood ───────────
    // Ordering mirrors /api/hood/snapshot exactly: freshness gate FIRST, then the
    // attribution check, so a stale blob never reaches the partition.
    let baseRows: TickerSnapshot[] = [];
    let baseStale = false;
    let baseUnattributed = 0;
    try {
      const baseLatest = await kvGet<BaseDeskLatest>(KV_BASE_ROWS_LATEST);
      if (baseLatest?.rows?.length) {
        const ageMs = Date.now() - new Date(baseLatest.started_at).getTime();
        if (Number.isFinite(ageMs) && ageMs <= BASE_ROWS_MAX_AGE_MS) {
          const split = partitionBaseRows(baseLatest.rows);
          baseRows = split.attributed;
          if (split.unattributed.length > 0) {
            baseUnattributed = split.unattributed.length;
            console.error(
              `[hood-live] dropped ${baseUnattributed} Base row(s) with no chain marker: ` +
                split.unattributed.map((r) => r.ticker).join(", "),
            );
          }
        } else {
          // Present but old. Drop the rows and SAY so — a stale stock price that
          // looks live is worse than no price, because it is actionable.
          baseStale = true;
        }
      }
    } catch {
      // Swallowed on purpose. Base is additive; Robinhood is the heartbeat.
    }

    const merged = [...rh.tickers, ...baseRows];
    const rows = merged.filter((r) => matchesChain(r, want)).map(shapeRow);

    const ageMs = Date.now() - new Date(rh.finished_at).getTime();
    const data_age_seconds = Math.max(0, Math.round(ageMs / 1000));

    return Response.json({
      tool: "hood-live",
      as_of: rh.finished_at,
      data_age_seconds,
      is_stale: data_age_seconds > STALE_AFTER_S,
      stale_after_seconds: STALE_AFTER_S,
      poll_cadence_seconds: 300,
      chain_filter: want ?? "both",
      market: {
        is_open: rh.metrics.market_is_open,
        session: rh.metrics.market_session,
      },
      // What the caller is NOT being told, made machine-readable. `watched` alone
      // reads like full coverage: watched + not_enabled = feed_eligible, and
      // feed_eligible + no_chainlink_feed = registry_total. Robinhood-only —
      // these counters come off the RH snapshot and the Base desk keeps no
      // registry of its own, so they are namespaced rather than summed.
      robinhood_coverage: {
        registry_total: rh.metrics.registry_total,
        feed_eligible: rh.metrics.tokens_eligible ?? null,
        watched: rh.metrics.tokens_watched,
        not_enabled: rh.metrics.tokens_not_enabled ?? null,
        no_chainlink_feed: rh.metrics.tokens_no_feed,
        errored: rh.metrics.tokens_errored,
      },
      // Explicit desk state, so "no Base rows" is a readable answer rather than
      // looking like a bug. `count: 0` with `status: "live"` is a real state:
      // the desk is watching and nothing drifted past threshold.
      base_desk: {
        status: baseRows.length ? "live" : baseStale ? "stale" : "offline",
        count: baseRows.length,
        // 0 in every healthy cycle. Non-zero means rows were polled that this
        // reader refused to attribute, so `count` is BELOW what the desk saw.
        unattributed: baseUnattributed,
      },
      // ⚠️ EVERY COUNT NAMES ITS OWN POPULATION, because two populations exist here
      // and they differ whenever `chain_filter` is set. The first shape of this
      // block was `{returned, robinhood, base}` with `robinhood` counted PRE-filter
      // and `returned` POST-filter, so `chain=base` answered
      // `returned: 0, robinhood: 24` — 24 Robinhood rows advertised on a response
      // that returned none. That is the same defect the "NO hit-rate lives here"
      // note at the top of this file refuses: a number sitting next to a different
      // population than the one it describes. `returned_*` sum to `returned`;
      // `available_*` are what the desks polled this cycle and ignore the filter.
      counts: {
        returned: rows.length,
        returned_robinhood: rows.filter((r) => r.chain === "robinhood").length,
        returned_base: rows.filter((r) => r.chain === "base").length,
        available_robinhood: merged.filter((r) => chainOf(r) === "robinhood").length,
        available_base: baseRows.length,
      },
      rows,
      data_sources: [
        "Blue Hood poll snapshot (Vercel KV) — Chainlink AggregatorV3 oracle + GeckoTerminal/DexScreener pool spot, stored by the 5-min cron",
      ],
      note: "Prices are from the last completed poll cycle, not a fresh quote. Read `data_age_seconds` and `is_stale` before acting. Rows are UNGRADED — for the graded record and its hit-rate, call `hood-track-record`.",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json(
      { error: `hood-live failed: ${(e as Error).message}` },
      { status: 502 },
    );
  }
}
