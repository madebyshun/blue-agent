// x402/rh-stock-arb (M5) — Chainlink vs DEX arbitrage delta.
// Price: $0.05
//
// For a given RH RWA ticker, reads:
//   • Chainlink AggregatorV3 latestRoundData (oracle-truth price)
//   • The primary USD-anchored DEX pool on RH Chain — its OWN exchange rate ×
//     the anchor's dollar value (USDG at par, WETH at RH's Chainlink ETH/USD)
// and returns the delta in absolute and percentage terms, plus a directional
// verdict (LONG_DEX, SHORT_DEX, ALIGNED).
//
// This is a real trading signal, not an LLM opinion. The verdict is derived
// deterministically from the numeric delta.
//
// F6 (lib/blue-hood/quarantine.ts) — TWO ENTRY POINTS, ON PURPOSE.
//   • `measureRhStockArb` is the raw reading: the Blue Hood recorder's
//     instrument. The poller builds the RH snapshot out of it and the grader
//     closes open arrows with it; both reach it only through `callRecorderTool`
//     (lib/blue-hood/tool-caller.ts). It is NOT in HANDLERS, so no HTTP door —
//     paid, chat, blue_call — can serve it.
//   • the default export is what HANDLERS["rh-stock-arb"] serves, and it
//     publishes through the quarantine. The diagnosis (2026-09-30) found the
//     "DEX price" was GeckoTerminal's token-level USD figure, not the pool's
//     rate, and this door withheld it with the price, delta and verdict. The
//     price source was FIXED on 2026-10-01 (lib/robinhood/rwa-price.ts,
//     pool-rate block): every reading now carries
//     `dex_price_basis: "pool_rate"`, and the quarantine publishes a stamped
//     reading as measured. The projection stays as the guard that a reading
//     WITHOUT the stamp — a regression to the old figure — is withheld again.
//   • the paid door was HALTED (lib/tool-halts.ts) while the leg was
//     quarantined, because a 200 whose verdict was INSUFFICIENT_DATA by
//     construction still settled. Lifted with the fix: the price it sells is
//     now the pool's own rate.

import { findByTicker, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { resolvePrimaryPool, nyseMarketStatus } from "@/lib/robinhood/rwa-market";
import { publishArbResult } from "@/lib/blue-hood/quarantine";

// Base drift threshold below which we call the pair aligned. During
// regular NYSE hours a fresh feed means a real arb; when the market is
// closed Chainlink freezes on the last print while the DEX keeps trading,
// so we widen the alignment band and flip the verdict prefix to
// "PREMARKET_DRIFT" / "AFTERHOURS_DRIFT" instead of "LONG_DEX" /
// "SHORT_DEX" (see Task #79 / product note in the reviewer feedback).
const ALIGNED_PCT_INHOURS = 0.5;
const ALIGNED_PCT_CLOSED  = 1.5;
// Anything past this while market is OPEN is a legit price-discovery gap.
const FEED_FRESH_MAX_AGE_INHOURS_SECONDS = 15 * 60;

/** The published door — HANDLERS["rh-stock-arb"]. See the F6 note above. */
export default async function handler(req: Request): Promise<Response> {
  const raw = await measureRhStockArb(req);
  const body = (await raw.json()) as Record<string, unknown>;
  return Response.json(publishArbResult(body), { status: raw.status });
}

/** The raw M5 reading — recorder-only. See the F6 note above. */
export async function measureRhStockArb(req: Request): Promise<Response> {
  try {
    let body: { ticker?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const ticker = (body.ticker ?? url.searchParams.get("ticker") ?? "").trim();
    if (!ticker) return Response.json({ error: "Provide `ticker` (e.g. MSTR, AAPL)." }, { status: 400 });

    const token = findByTicker(ticker);
    if (!token) return Response.json({ tool: "rh-stock-arb", ticker, error: "Ticker not in registry." }, { status: 404 });

    const timestamp = new Date().toISOString();
    const market = nyseMarketStatus();

    const [chainlink, primary] = await Promise.all([
      token.chainlinkFeed
        ? chainlinkLatest(token.chainlinkFeed, token.chainlinkHeartbeat ?? 86400)
        : Promise.resolve(null),
      resolvePrimaryPool(token.contract),
    ]);

    const dex = primary.pool;
    // F6 — `price_usd` is the pool's own rate × its anchor, and is null when
    // the anchor could not be valued (WETH with the ETH/USD feed down). A pool
    // with no dollar price cannot be arbed against the oracle.
    const dexPrice = dex?.price_usd ?? null;

    // Cannot arb without both sources — return honest INSUFFICIENT_DATA.
    if (!chainlink || !dex || dexPrice === null) {
      return Response.json({
        tool: "rh-stock-arb",
        ticker: token.ticker,
        name: token.name,
        contract: token.contract,
        verdict: "INSUFFICIENT_DATA",
        // F6 — how this instrument prices the DEX leg, stamped on every
        // reading (lib/blue-hood/quarantine.ts reads it).
        dex_price_basis: primary.price_basis,
        chainlink: chainlink ?? null,
        dex: dex ?? null,
        market,
        // #227 — `no_usd_anchored_pool` is NOT "no pool found". Pools exist;
        // they are all quoted against something that is not a dollar, so there
        // is no USD spot to arb against. Saying "no pool" there would send an
        // agent looking for liquidity that is sitting right in front of it.
        note: !chainlink && !dex
          ? "Neither Chainlink feed nor a USD-anchored DEX pool available for this ticker."
          : !chainlink
            ? "No Chainlink feed available for this ticker."
            : primary.selection === "no_usd_anchored_pool"
              ? `Token has ${primary.pool_count} pool(s) on Robinhood Chain but none quoted against USDG or WETH ($${primary.unanchored_tvl_usd.toFixed(0)} unanchored TVL). A stock-vs-stock pool is an exchange rate, not a USD price, so no arb verdict is possible.`
              : dex && dexPrice === null
                ? `The primary pool (${dex.name}) was read, but its counter-asset's USD value is unavailable right now (the Chainlink ETH/USD read failed or is stale), so the pool has no dollar price to compare with the oracle.`
                : "No DEX pool found for this token on Robinhood Chain.",
        data_sources: [
          chainlink ? "Chainlink AggregatorV3 on-chain (RH Chain)" : null,
          dex ? "api.geckoterminal.com (RH Chain)" : null,
        ].filter(Boolean),
        network: RH_CHAIN,
        timestamp,
      });
    }

    const cl = chainlink.price_usd;
    const dx = dexPrice;
    const abs_delta = dx - cl;
    const pct_delta = (abs_delta / cl) * 100;

    // Verdict — hard-mapped from sign + magnitude + market hours. Two modes:
    //   • arb (market OPEN):    LONG_DEX / SHORT_DEX / ALIGNED
    //   • drift (market CLOSED): PREMARKET_DRIFT / AFTERHOURS_DRIFT / FROZEN_ALIGNED
    // Same numeric delta means very different things depending on whether
    // Wall Street is tickering — a downstream agent MUST see that context.
    const alignedThreshold = market.is_open ? ALIGNED_PCT_INHOURS : ALIGNED_PCT_CLOSED;
    let verdict:
      | "ALIGNED" | "LONG_DEX" | "SHORT_DEX"
      | "FROZEN_ALIGNED" | "PREMARKET_DRIFT" | "AFTERHOURS_DRIFT";
    if (market.is_open) {
      if (Math.abs(pct_delta) < alignedThreshold) verdict = "ALIGNED";
      else if (pct_delta < 0) verdict = "LONG_DEX";
      else verdict = "SHORT_DEX";
    } else {
      if (Math.abs(pct_delta) < alignedThreshold) verdict = "FROZEN_ALIGNED";
      else if (market.session === "premarket")   verdict = "PREMARKET_DRIFT";
      else                                       verdict = "AFTERHOURS_DRIFT";
    }

    // Feed-freshness sanity: during REGULAR hours a Chainlink stock feed
    // should have updated in the last ~15 min. Older == abnormal (and
    // downgrades any verdict's confidence).
    const feed_abnormal_stale = market.is_open && chainlink.age_seconds > FEED_FRESH_MAX_AGE_INHOURS_SECONDS;

    // Warnings: `thin_dex_pool` considers token liquidity summed across pools,
    // not just the primary pool. Otherwise a $21M bankr-robinhood WETH pool + a
    // $850k USDG pool would trigger a dust warning when the token is objectively
    // deep — that would blind downstream consumers (and Blue Hood's dust gate)
    // to real depth. Both of those are anchor-quoted (WETH, USDG), so they still
    // count after #227.
    //
    // #227 — `total_tvl_usd` is now ANCHORED-ONLY. That is a deliberate
    // narrowing of a field that already ships in this paid response: depth
    // against another stock is not depth you can exit into dollars, so it must
    // not silence a thin-pool warning. `unanchored_tvl_usd` is emitted
    // alongside so the excluded liquidity stays visible instead of vanishing —
    // a consumer that sees the total drop can see exactly where it went.
    const warnings: string[] = [];
    if (!market.is_open) warnings.push(`market_closed_session_${market.session}: Chainlink is frozen on the last regular-hours print; DEX keeps trading 24/7. Verdict reflects post-close drift, NOT arb.`);
    if (feed_abnormal_stale) warnings.push(`feed_abnormally_stale: Chainlink last updated ${chainlink.age_seconds}s ago while market is OPEN — expected <${FEED_FRESH_MAX_AGE_INHOURS_SECONDS}s. Treat verdict as low-confidence.`);
    if (primary.total_tvl_usd < 5_000) warnings.push(`thin_dex_pool: only $${primary.total_tvl_usd.toFixed(0)} TVL across ${primary.anchored_pool_count} USD-anchored pool(s) of ${primary.pool_count} total — spot may be dominated by a single trade.`);
    if (primary.anchored_pool_count < primary.pool_count) warnings.push(`unanchored_liquidity_excluded: $${primary.unanchored_tvl_usd.toFixed(0)} sits in ${primary.pool_count - primary.anchored_pool_count} pool(s) quoted against neither USDG nor WETH. That is an exchange rate in another token, not a dollar market, so it is excluded from TVL and from spot.`);

    return Response.json({
      tool: "rh-stock-arb",
      ticker: token.ticker,
      name: token.name,
      contract: token.contract,
      verdict,
      // F6 — see the INSUFFICIENT_DATA branch above. From the pool that was
      // priced, so the stamp cannot outlive the pricing it names.
      dex_price_basis: dex.price_basis,
      market,
      delta: {
        abs_usd: +abs_delta.toFixed(6),
        pct: +pct_delta.toFixed(4),
        aligned_threshold_pct: alignedThreshold,
      },
      chainlink,
      dex: {
        pool_ref: dex.pool_ref,
        is_v4_pool_id: dex.is_v4_pool_id,
        pool_name: dex.name,
        dex_id: dex.dex,
        price_usd: dexPrice,
        /** "pool_rate": this pool's own rate × the anchor's USD value. */
        price_basis: dex.price_basis,
        /** The USD value of one unit of the pool's counter-asset used above. */
        anchor_usd: dex.counterparty_token_price_usd,
        // `tvl_usd` = deprecated alias for `primary_pool_tvl_usd`. Kept
        // for back-compat with agents/tools that already consume it. New
        // consumers should read `primary_pool_tvl_usd` and `total_tvl_usd`
        // explicitly — the naming makes the semantics unambiguous.
        tvl_usd: dex.reserve_usd,
        primary_pool_tvl_usd: dex.reserve_usd,
        // #227 — anchored-only. `unanchored_tvl_usd` accounts for the rest.
        total_tvl_usd: primary.total_tvl_usd,
        unanchored_tvl_usd: primary.unanchored_tvl_usd,
        pool_count: primary.pool_count,
        anchored_pool_count: primary.anchored_pool_count,
        one_side_usd: dex.one_side_usd,
        volume_24h_usd: dex.volume_24h_usd,
        change_24h_pct: dex.change_24h,
        pool_url: dex.url,
        pool_selection: primary.selection,
      },
      warnings,
      data_sources: [
        "Chainlink AggregatorV3 on-chain (RH Chain)",
        "api.geckoterminal.com (RH Chain)",
      ],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-arb failed", message: (e as Error).message }, { status: 500 });
  }
}
