// x402/rh-sector-basket (P4) — multi-buy plan for a sector or basket.
// Price: $0.10
//
// Input: a sector name (or comma-separated list of tickers) + total USD to
// deploy. Output: per-ticker allocation, live spot price, expected units
// received per ticker. Feeds directly into rh-stock-swap-prepare for
// execution.
//
// Weighting modes:
//   • "equal"          — split total evenly across constituents (default)
//   • "market-cap"     — proxied by Chainlink price × TVL (v1 approximation)
//                       Note: real market cap isn't observable on-chain; this
//                       uses pool TVL as a rough liquidity-weighted proxy.
//
// #231 — THIS TOOL SIZES REAL BUYS, so every number it emits must be dollars.
// The `dex-spot` price fallback and the TVL weighting both go through
// `resolvePrimaryPool` (dollar-anchored counterparty, USDG preferred). A
// constituent with no dollar-anchored pool gets NO price and NO weight — it
// lands in `unpriced_legs` with a reason instead of being silently dropped, so
// a basket that shrank is visibly a basket that shrank.

import { RH_CHAIN, RWA_TOKENS, findByTicker } from "@/lib/robinhood/rwa-registry";
import { chainlinkLatest } from "@/lib/robinhood/rwa-price";
import { resolvePrimaryPool } from "@/lib/robinhood/rwa-market";

const KNOWN_SECTORS = ["tech", "consumer", "finance", "energy", "materials", "space", "etf", "etf-tech", "etf-bond", "etf-metals", "etf-index"] as const;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: {
      sector?: string;
      tickers?: string[];
      total_usd?: number;
      weighting?: string;
      max_constituents?: number;
    } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);

    const sector = (body.sector ?? url.searchParams.get("sector") ?? "").trim().toLowerCase();
    const tickersRaw = body.tickers ?? (url.searchParams.get("tickers") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const totalUsd = Math.max(0.01, Number(body.total_usd ?? url.searchParams.get("total_usd") ?? 100));
    const weighting = ((body.weighting ?? url.searchParams.get("weighting") ?? "equal") as string).toLowerCase();
    const maxN = Math.max(1, Math.min(20, Number(body.max_constituents ?? url.searchParams.get("max_constituents") ?? 10)));

    const timestamp = new Date().toISOString();

    // ── Assemble constituents ───────────────────────────────────────────
    let constituents: typeof RWA_TOKENS = [];
    if (tickersRaw.length) {
      constituents = tickersRaw
        .map((t) => findByTicker(t))
        .filter((t): t is (typeof RWA_TOKENS)[number] => !!t);
    } else if (sector) {
      constituents = RWA_TOKENS.filter(
        (t) =>
          (t.sector ?? "").toLowerCase() === sector ||
          (t.sector ?? "").toLowerCase().startsWith(sector),
      );
    } else {
      return Response.json({
        error: "Provide `sector` (e.g. 'tech') or `tickers` (e.g. ['AAPL','TSLA','NVDA']).",
        known_sectors: KNOWN_SECTORS,
      }, { status: 400 });
    }

    if (!constituents.length) {
      return Response.json({
        tool: "rh-sector-basket",
        sector,
        constituents: [],
        note: sector ? `No tokens in the canonical RWA registry match sector "${sector}".` : "No tickers resolved.",
        known_sectors: KNOWN_SECTORS,
        network: RH_CHAIN, timestamp,
      });
    }

    constituents = constituents.slice(0, maxN);

    // ── Live prices + weighting proxies ─────────────────────────────────
    const NO_PRIMARY = {
      pool: null, selection: "pool_lookup_failed",
      pool_count: 0, anchored_pool_count: 0,
      total_tvl_usd: 0, unanchored_tvl_usd: 0,
    } as const;
    const enriched = await Promise.all(
      constituents.map(async (t) => {
        const [oracle, primary] = await Promise.all([
          t.chainlinkFeed ? chainlinkLatest(t.chainlinkFeed, t.chainlinkHeartbeat ?? 86400) : Promise.resolve(null),
          resolvePrimaryPool(t.contract).catch(() => NO_PRIMARY),
        ]);
        // #231. The `dex-spot` fallback now reads the DOLLAR-anchored primary
        // pool. It used to read `pools[0]` — the deepest pool of any quote
        // asset — so a constituent could be priced off a stock-vs-stock pair
        // and that exchange rate folded straight into a buy plan. Constituents
        // without a fresh Chainlink feed are exactly the ones taking this path,
        // which is what made it the sharp edge rather than a corner case.
        const dexSpot = primary.pool?.price_usd ?? null;
        const price_usd = oracle && !oracle.is_stale ? oracle.price_usd : dexSpot;
        const price_source: "chainlink" | "dex-spot" | null =
          oracle && !oracle.is_stale ? "chainlink" : dexSpot !== null ? "dex-spot" : null;
        // Anchored-only TVL (#227's split). This drives BOTH the tvl weighting
        // denominator AND the MIN_TVL_USD dust gate below, so unanchored depth
        // leaking in here would both over-weight a leg and wave it past a gate
        // on liquidity that cannot be sold for dollars.
        return {
          token: t,
          price_usd,
          price_source,
          total_tvl_usd: primary.total_tvl_usd,
          unanchored_tvl_usd: primary.unanchored_tvl_usd,
          pool_selection: primary.selection,
          pool_count: primary.pool_count,
          anchored_pool_count: primary.anchored_pool_count,
        };
      }),
    );

    const priced = enriched.filter((r) => r.price_usd !== null && r.price_usd > 0);
    // Constituents we could not price. These used to vanish from the response
    // entirely — the basket just came back smaller with no explanation, and
    // anchoring makes that path MORE common, so it gets a name now.
    const unpriced_legs = enriched
      .filter((r) => !(r.price_usd !== null && r.price_usd > 0))
      .map((r) => ({
        ticker: r.token.ticker,
        pool_count: r.pool_count,
        anchored_pool_count: r.anchored_pool_count,
        pool_selection: r.pool_selection,
        reason: r.pool_selection === "no_usd_anchored_pool"
          ? `no live Chainlink feed, and all ${r.pool_count} DEX pool(s) are quoted against another equity or a memecoin — an exchange rate is not a price, so this leg cannot be sized (#231)`
          : r.pool_selection === "no_pool_found"
            ? "no live Chainlink feed and no DEX pool on Robinhood Chain"
            : "no live price source right now (stale oracle and no usable pool price)",
      }));
    if (!priced.length) {
      return Response.json({
        tool: "rh-sector-basket",
        constituents: enriched.map((e) => e.token.ticker),
        legs: [],
        unpriced_legs,
        note: "None of the constituents have a live DOLLAR price source right now — see unpriced_legs for the reason per ticker.",
        network: RH_CHAIN, timestamp,
      });
    }

    // ── Compute weights ─────────────────────────────────────────────────
    let weights: Record<string, number> = {};
    if (weighting === "market-cap" || weighting === "tvl") {
      const denom = priced.reduce((s, r) => s + Math.max(0, r.total_tvl_usd), 0);
      if (denom > 0) {
        for (const r of priced) weights[r.token.ticker] = r.total_tvl_usd / denom;
      } else {
        // Fall back to equal-weight if no TVL data — tell the caller.
        for (const r of priced) weights[r.token.ticker] = 1 / priced.length;
      }
    } else {
      for (const r of priced) weights[r.token.ticker] = 1 / priced.length;
    }

    // ── Dust gate: skip legs whose dollar pools would eat a $20 allocation ─
    // Same threshold as M4 movers. A leg that lands in a $217-TVL pool is
    // a slippage disaster; we still surface it as `skipped_legs` so the
    // caller sees WHY, but don't recommend it. The figure compared here is
    // ANCHORED TVL (#227/#231) — depth you can actually exit to dollars.
    const MIN_TVL_USD = 5_000;
    const MIN_VOLUME_USD = 500;

    // ── Build allocation legs ───────────────────────────────────────────
    const rawLegs = priced.map((r) => {
      const w = weights[r.token.ticker] ?? 0;
      const amount_usd = +(totalUsd * w).toFixed(4);
      const expected_units = r.price_usd ? amount_usd / r.price_usd : null;
      const tvl = r.total_tvl_usd;
      const tradable = tvl >= MIN_TVL_USD;
      return {
        ticker: r.token.ticker,
        name: r.token.name,
        contract: r.token.contract,
        weight: +w.toFixed(6),
        amount_usd,
        price_usd: r.price_usd,
        price_source: r.price_source,
        pool_selection: r.pool_selection,
        expected_units,
        liquidity_check: {
          tvl_usd: tvl,                                  // dollar-anchored pools only
          unanchored_tvl_usd: r.unanchored_tvl_usd,      // excluded, shown so nothing hides
          min_tvl_usd: MIN_TVL_USD,
          tradable,
        },
        hint: { next_tool: "rh-stock-swap-prepare", side: "buy", denom: "USDG" },
      };
    });
    const legs = rawLegs.filter((l) => l.liquidity_check.tradable);
    const skipped_legs = rawLegs
      .filter((l) => !l.liquidity_check.tradable)
      .map((l) => ({ ticker: l.ticker, reason: `dollar-anchored pool TVL $${l.liquidity_check.tvl_usd.toFixed(0)} < min $${MIN_TVL_USD} — buying $${l.amount_usd} here is slippage disaster` }));
    // Renormalize weights over the tradable legs so total allocation still
    // sums to `totalUsd` instead of leaving money uninvested silently.
    const totalTradableWeight = legs.reduce((s, l) => s + l.weight, 0);
    if (totalTradableWeight > 0 && totalTradableWeight < 1) {
      for (const l of legs) {
        l.weight = +(l.weight / totalTradableWeight).toFixed(6);
        l.amount_usd = +(totalUsd * l.weight).toFixed(4);
        l.expected_units = l.price_usd ? l.amount_usd / l.price_usd : null;
      }
    }
    void MIN_VOLUME_USD;

    return Response.json({
      tool: "rh-sector-basket",
      sector: sector || null,
      weighting_used: (weighting === "market-cap" || weighting === "tvl") ? "tvl" : "equal",
      total_usd: totalUsd,
      constituent_count: legs.length,
      requested_constituent_count: constituents.length,
      legs,
      skipped_legs,
      // Constituents that never reached the weighting step at all (#231).
      // Distinct from `skipped_legs`: those had a dollar price and failed the
      // dust gate; these have no dollar price to begin with.
      unpriced_legs,
      warnings: [
        ...(skipped_legs.length > 0
          ? [`${skipped_legs.length} constituent(s) skipped by dust liquidity gate (min $${MIN_TVL_USD} dollar-anchored pool TVL) — weights renormalized over the remaining tradable legs`]
          : []),
        ...(unpriced_legs.length > 0
          ? [`${unpriced_legs.length} constituent(s) have no live DOLLAR price and were never allocated — see unpriced_legs. This basket covers ${legs.length} of the ${constituents.length} tickers requested.`]
          : []),
      ],
      known_sectors: KNOWN_SECTORS,
      note: legs.length === 0
        ? "No constituent has enough dollar-anchored pool liquidity to trade cleanly — try a different sector or lower `min_tvl_usd`."
        : "For each leg, call rh-stock-swap-prepare with { ticker, side: 'buy', amount: amount_usd, denom: 'USDG' } to obtain the unsigned tx sequence.",
      data_sources: ["Chainlink AggregatorV3 on-chain (RH Chain)", "api.geckoterminal.com (RH Chain)"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-sector-basket failed", message: (e as Error).message }, { status: 500 });
  }
}
