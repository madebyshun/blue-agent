// x402/rh-stock-movers (M4) — top RH RWA gainers/losers 24h.
// Price: $0.05
//
// Pulls top pools on Robinhood Chain by 24h volume, cross-references against
// the canonical RH RWA registry (drops non-RWA pools like ROBINHOOD/WETH), and
// ranks by 24h price change.
//
// Real data only — no fabricated movers. If < 3 registered RWA pools show up
// with volume, returns an empty list rather than pad the response.
//
// #231 — A RANKING IS A DOLLAR CLAIM. Only dollar-anchored pools can rank:
// `change_24h` on a stock-vs-stock pool is the move in the EXCHANGE RATE
// between two equities, so a token could top the gainers list while its own
// dollar price fell — the counterparty just fell harder. Tokens whose pools
// are all unanchored are dropped into `excluded_unanchored`, never silently.

import { RWA_TOKENS, RH_CHAIN } from "@/lib/robinhood/rwa-registry";
import { poolsForToken, topPools, anchoredPools, resolvePrimaryPool, type PoolMeta } from "@/lib/robinhood/rwa-market";

// Dust-pool filter — protects the ranking from thin-liquidity noise.
// A pool with $453 TVL and $0.01 24h volume can quote AAPL at $868 for a
// single wrong-way trade; that's not a "mover", that's a broken quote. We
// require a floor of BOTH TVL and 24h volume before a pool can rank.
const DEFAULT_MIN_TVL_USD    = 5_000;
const DEFAULT_MIN_VOLUME_USD = 500;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { limit?: number; min_tvl_usd?: number; min_volume_24h_usd?: number } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(20, Number(body.limit ?? url.searchParams.get("limit") ?? 5)));
    const minTvl    = Math.max(0, Number(body.min_tvl_usd    ?? url.searchParams.get("min_tvl_usd")    ?? DEFAULT_MIN_TVL_USD));
    const minVolume = Math.max(0, Number(body.min_volume_24h_usd ?? url.searchParams.get("min_volume_24h_usd") ?? DEFAULT_MIN_VOLUME_USD));

    const timestamp = new Date().toISOString();

    // Pull each candidate token's deepest pool. `poolsForToken` resolves the
    // price correctly whichever side of the pool the token sits on, which
    // topPools alone cannot do — that is why the per-token call still happens.
    //
    // What topPools IS good for is deciding *who* to ask about. This used to
    // fan out over the whole registry, which was ~20 calls when the registry
    // held 26 rows and became 203 the moment the registry was completed from
    // the factory log — 203 concurrent GeckoTerminal requests, i.e. a rate-limit
    // wall and a slower, worse answer. Most RH stock tokens have no pool at
    // all, and a token absent from the volume-ranked pool list cannot be a top
    // mover by definition, so it costs nothing to skip it. The registry
    // intersection still does the real work: it drops non-RWA pools, and it is
    // what keeps an impersonator's pool out of the ranking.
    const stocks = RWA_TOKENS.filter((t) => t.kind === "stock" || t.kind === "etf");
    const traded = new Set<string>();
    for (const p of await topPools(100)) {
      if (p.base_token) traded.add(p.base_token);
      if (p.quote_token) traded.add(p.quote_token);
    }
    const candidates = stocks.filter((t) => traded.has(t.contract.toLowerCase()));

    type Scan =
      | { ok: true; rwa: (typeof RWA_TOKENS)[number]; pool: PoolMeta; is_primary_pool: boolean }
      | { ok: false; rwa: (typeof RWA_TOKENS)[number]; unanchored: false }
      | { ok: false; rwa: (typeof RWA_TOKENS)[number]; unanchored: true; pool_count: number; unanchored_tvl_usd: number };

    const perToken = await Promise.all(
      candidates.map(async (rwa): Promise<Scan | null> => {
        try {
          const pools = await poolsForToken(rwa.contract);
          if (!pools.length) return null;
          // #231. Only a dollar-anchored pool may rank. `poolsForToken` already
          // orients price/change to OUR SIDE of the pool — that part was always
          // correct — but side is not denomination, and the two were being read
          // as the same guarantee. A move measured against another equity is
          // not a move in dollars, so unanchored-only tokens leave the ranking.
          const anchored = anchoredPools(pools);
          if (!anchored.length) {
            return {
              ok: false, rwa, unanchored: true,
              pool_count: pools.length,
              unanchored_tvl_usd: pools.reduce((s, p) => s + (p.reserve_usd || 0), 0),
            };
          }
          // Prefer the SAME pool the rest of the catalog calls primary (M1/M2/
          // M5/L1) so a mover row and an OHLC series for one ticker describe one
          // pool. `resolvePrimaryPool` re-reads the memoized GT URL, so this
          // costs no extra network. Fall back to the deepest anchored pool that
          // does report a change — a primary with `change_24h === null` would
          // otherwise drop a real mover.
          const primary = await resolvePrimaryPool(rwa.contract);
          const best = primary.pool && primary.pool.change_24h !== null
            ? primary.pool
            : anchored.find((p) => p.change_24h !== null) ?? null;
          if (!best) return { ok: false, rwa, unanchored: false };
          return { ok: true, rwa, pool: best, is_primary_pool: best.pool_ref === primary.pool?.pool_ref };
        } catch {
          return null;
        }
      }),
    );

    type WithToken = {
      rwa: (typeof RWA_TOKENS)[number];
      pool: PoolMeta;
      is_primary_pool: boolean;
      token_change_24h: number;
      token_price_usd: number;
    };
    // Tokens that trade only against non-dollar assets. Reported, never dropped
    // in silence — an absent ticker should be explainable, not mysterious.
    const excluded_unanchored = perToken
      .filter((r): r is Extract<Scan, { ok: false; unanchored: true }> => r?.ok === false && r.unanchored)
      .map((r) => ({
        ticker: r.rwa.ticker,
        pool_count: r.pool_count,
        unanchored_tvl_usd: +r.unanchored_tvl_usd.toFixed(2),
        reason: "no pool quoted against a dollar-anchored asset (USDG/WETH) — a move against another equity is not a move in dollars",
      }));
    const raw: WithToken[] = perToken
      .filter((r): r is Extract<Scan, { ok: true }> => r?.ok === true)
      .map((r) => ({
        rwa: r.rwa,
        pool: r.pool,
        is_primary_pool: r.is_primary_pool,
        // pool.change_24h + pool.price_usd are already for OUR token (poolsForToken
        // selects the correct side per token) and the pool is dollar-anchored
        // (checked above), so this is a move in dollars.
        token_change_24h: r.pool.change_24h!,
        token_price_usd: r.pool.price_usd,
      }));
    // Dust filter: drop pools that don't clear TVL + volume floors. A pool
    // showing an absurd -12.75% "move" on $453 TVL and $0.008 24h volume is
    // noise, not a signal. Filtered pools surface as `filtered_out` for
    // transparency (so agents can inspect if desired).
    const rwaPools: WithToken[] = [];
    const filtered_out: Array<{ ticker: string; tvl_usd: number; volume_24h_usd: number | null; reason: string }> = [];
    for (const r of raw) {
      const tvl = r.pool.reserve_usd;
      const vol = r.pool.volume_24h_usd ?? 0;
      if (tvl < minTvl) {
        filtered_out.push({ ticker: r.rwa.ticker, tvl_usd: tvl, volume_24h_usd: r.pool.volume_24h_usd, reason: `TVL $${tvl.toFixed(0)} < min $${minTvl}` });
        continue;
      }
      if (vol < minVolume) {
        filtered_out.push({ ticker: r.rwa.ticker, tvl_usd: tvl, volume_24h_usd: r.pool.volume_24h_usd, reason: `24h vol $${vol.toFixed(2)} < min $${minVolume}` });
        continue;
      }
      rwaPools.push(r);
    }

    // If zero pools with change, return an empty response honestly. With ≥1
    // real signal we surface it — better honest partial data than nothing.
    if (rwaPools.length === 0) {
      return Response.json({
        tool: "rh-stock-movers",
        gainers: [],
        losers: [],
        note: excluded_unanchored.length
          ? `No RWA token on Robinhood Chain currently reports a 24h change from a DOLLAR-ANCHORED pool. ${excluded_unanchored.length} token(s) do have pools, but only against another equity or a memecoin — see excluded_unanchored. That is an exchange-rate move, not a price move, so it cannot rank (#231).`
          : "No RWA tokens on Robinhood Chain currently report a 24h change via GeckoTerminal — DEX liquidity is still forming.",
        universe: {
          registered_tokens: stocks.length,
          tokens_with_pool_change: raw.length,
          tokens_after_dust_filter: 0,
          tokens_excluded_unanchored: excluded_unanchored.length,
        },
        anchor_filter: { excluded_unanchored },
        data_sources: ["api.geckoterminal.com (RH Chain)"],
        network: RH_CHAIN,
        timestamp,
      });
    }

    const asRow = (r: WithToken) => ({
      ticker: r.rwa.ticker,
      name: r.rwa.name,
      contract: r.rwa.contract,
      kind: r.rwa.kind,
      sector: r.rwa.sector ?? null,
      price_usd: r.token_price_usd,
      change_24h_pct: r.token_change_24h,
      change_1h_pct: r.pool.change_1h,
      volume_24h_usd: r.pool.volume_24h_usd,
      tvl_usd: r.pool.reserve_usd,
      pool_ref: r.pool.pool_ref,
      pool_address: r.pool.address,
      pool_name: r.pool.name,
      pool_url: r.pool.url,
      // True when this row's pool is the same one resolvePrimaryPool hands the
      // other tools. False means the primary reported no 24h change and we used
      // the deepest anchored pool that did — still dollars, different pool.
      is_primary_pool: r.is_primary_pool,
    });

    // Filter by sign so a token with -1.56% never appears in gainers when
    // ranking is thin, and vice-versa. Zero-change goes in neither list.
    const gainers = rwaPools
      .filter((r) => r.token_change_24h > 0)
      .sort((a, b) => b.token_change_24h - a.token_change_24h)
      .slice(0, limit)
      .map(asRow);
    const losers = rwaPools
      .filter((r) => r.token_change_24h < 0)
      .sort((a, b) => a.token_change_24h - b.token_change_24h)
      .slice(0, limit)
      .map(asRow);

    return Response.json({
      tool: "rh-stock-movers",
      timeframe: "24h",
      gainers,
      losers,
      universe: {
        registered_tokens: stocks.length,
        tokens_with_pool_change: raw.length,
        tokens_after_dust_filter: rwaPools.length,
        tokens_excluded_unanchored: excluded_unanchored.length,
      },
      // #231. Separate from the dust filter on purpose: dust is "too small to
      // trust", unanchored is "not measured in dollars at all". Collapsing them
      // would let a real dollar market look like noise, and vice versa.
      anchor_filter: {
        rule: "only pools quoted against a dollar-anchored asset (USDG/WETH) may rank",
        excluded_unanchored,
      },
      dust_filter: {
        min_tvl_usd: minTvl,
        min_volume_24h_usd: minVolume,
        filtered_out_count: filtered_out.length,
        filtered_out,
      },
      warnings: rwaPools.length === 0 && raw.length > 0
        ? ["all tokens_with_pool_change were filtered by the dust threshold — pass lower `min_tvl_usd` / `min_volume_24h_usd` to see the raw universe"]
        : [],
      data_sources: ["api.geckoterminal.com (RH Chain)", "docs.robinhood.com/chain/contracts"],
      network: RH_CHAIN,
      timestamp,
    });
  } catch (e) {
    return Response.json({ error: "rh-stock-movers failed", message: (e as Error).message }, { status: 500 });
  }
}
