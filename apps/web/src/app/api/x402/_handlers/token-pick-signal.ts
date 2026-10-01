// x402/token-pick-signal
// The top Base token by an on-chain QUALITY score, from REAL Base pools
// (GeckoTerminal trending + new). Candidates are hard-filtered for quality
// (liquidity, volume, anti-pump, thin-liq-vs-mcap), then SCORED in code
// (liquidity health, turnover, momentum, divergence). A `context` that names a
// focus (volume / momentum / divergence) re-weights that score, and the
// response then says so (`score_basis`) — see contextWeights.
//
// 🔴 FACTS ONLY since 2026-09-30 (plan §3 fix 3, §7 #8). It used to return
// "BUY / WATCH / SKIP" plus a model-written thesis, entry, kill-criterion and
// horizon — a trade call, however carefully the verdict was code-mapped. The
// rebuild's rule is that BlueAgent emits measured facts and nothing that
// tells a user what to buy. So: the ranked facts, the score and what went
// into it, the caution flags — and no verdict word, no entry, no model call.
//
// Cap is a RESULT, not an input: the tool scans every size and returns the best
// by quality. A cap tier is applied ONLY when the user explicitly asks for one
// (e.g. "low-cap"); otherwise size is ignored.
// Price: $0.20

import { getBaseTrending, getBaseNewPools, type Pool } from "@/lib/market-data";

// ── Quality thresholds (FIX 1) ───────────────────────────────────────────────
const MIN_LIQ = 50_000; // filter out thin liquidity
const MIN_VOL = 20_000; // filter out dead tokens

// Denominator / blue-chip assets are NOT "picks" — they appear as the base
// symbol of quote pairs (e.g. WETH/USDC) and would always top a liquidity-
// weighted score. Exclude them so the tool surfaces real opportunity tokens.
const QUOTE_DENYLIST = new Set([
  "WETH", "ETH", "WBTC", "CBBTC", "CBETH", "WSTETH", "WEETH", "RETH", "EZETH",
  "USDC", "USDT", "DAI", "USDBC", "EURC", "GHO", "FRAX", "LUSD", "USDE", "SUSDE",
  "MIM", "CRVUSD", "USD+", "DOLA",
]);

// ── Cap tiers (FIX 5/6) — only applied when the user explicitly asks ──────────
const CAP_TIERS = { micro: 10_000_000, low: 50_000_000, small: 100_000_000 } as const;
type CapTier = keyof typeof CAP_TIERS;

function parseCapTier(ctx: string): { tier: CapTier; max: number } | null {
  const c = ctx.toLowerCase();
  if (/micro[\s-]?cap/.test(c)) return { tier: "micro", max: CAP_TIERS.micro };
  if (/low[\s-]?cap/.test(c))   return { tier: "low",   max: CAP_TIERS.low };
  if (/small[\s-]?cap/.test(c)) return { tier: "small", max: CAP_TIERS.small };
  return null;
}

function capLabel(mcap: number | null): string {
  if (mcap == null) return "unknown";
  if (mcap < CAP_TIERS.micro) return "micro";
  if (mcap < CAP_TIERS.low)   return "low";
  if (mcap < CAP_TIERS.small) return "small";
  if (mcap < 1_000_000_000)   return "mid";
  return "large";
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const fmtUsd = (n: number | null) =>
  n == null ? "?" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;
const fmtPct = (n: number | null) => (n == null ? "?" : `${n > 0 ? "+" : ""}${n.toFixed(1)}%`);

// ── FIX 1 — hard quality filter (always applied) ─────────────────────────────
function passesQuality(p: Pool): boolean {
  const liq = p.liquidityUsd, vol = p.volume24h, mcap = p.marketCap;
  const h1 = p.change.h1, h24 = p.change.h24;
  if (liq == null || liq < MIN_LIQ) return false;            // thin liquidity
  if (vol == null || vol < MIN_VOL) return false;            // dead token
  // anti-pump: a sharp 1h spike that is ~the entire 24h move. The 5% floor
  // keeps genuinely flat tokens (divergence alpha) from being nuked.
  if (h1 != null && h24 != null && Math.abs(h1) >= 5 && Math.abs(h1) >= Math.abs(h24) * 0.95) return false;
  // thin liquidity vs mcap → exit risk
  if (mcap != null && mcap > 0 && liq < mcap * 0.02) return false;
  return true;
}

// ── FIX 2 — on-chain sub-scores (0..1), combined into a 0-100 quality score ───
function subScores(p: Pool) {
  const liq = p.liquidityUsd ?? 0;
  const vol = p.volume24h ?? 0;
  const mcap = p.marketCap;
  const h1 = p.change.h1 ?? 0, h6 = p.change.h6 ?? 0, h24 = p.change.h24 ?? 0;
  const turnover = liq > 0 ? vol / liq : 0;

  const liqHealth  = clamp01(Math.log10(Math.max(liq, 1) / MIN_LIQ) / Math.log10(200)); // $50K→0 .. $10M→1
  const volMom     = clamp01(turnover / 4);                                              // turnover 0..4x
  const liqMcap    = mcap && mcap > 0 ? clamp01((liq / mcap - 0.02) / 0.13) : 0.5;        // 2%..15% of mcap
  const accel      = h1 - h6 / 6;                                                         // 1h pace vs 6h pace
  const momentum   = clamp01(0.5 + h6 * 0.02 + accel * 0.03);                             // steady climb + acceleration
  const flat       = Math.abs(h24) <= 15 ? 1 : clamp01(1 - (Math.abs(h24) - 15) / 35);
  const divergence = clamp01((turnover - 0.5) / 2) * flat;                                // high turnover + flat price = accumulation

  return { turnover, liqHealth, volMom, liqMcap, momentum, divergence };
}

const FIXED_W = { liq: 0.25, vol: 0.25, lm: 0.20, mom: 0.15, div: 0.15 };

function qualityScore(s: ReturnType<typeof subScores>): number {
  return Math.round(100 * (
    FIXED_W.liq * s.liqHealth + FIXED_W.vol * s.volMom + FIXED_W.lm * s.liqMcap +
    FIXED_W.mom * s.momentum + FIXED_W.div * s.divergence
  ));
}

// Context-weighted score. 🔴 THE SCORE THAT ORDERS THE LIST IS THE SCORE SHOWN
// (2026-10-01). This used to be a hidden `rank` that chose the pick while the
// summary and the card printed the fixed-weight `quality` and called the pick
// "Highest on-chain quality score" — so with the Hub's own default context
// ("rising volume, real liquidity") the pick could score 58 above a "Next: B
// (61)" on the same card. Now `score` IS this number, the summary names the
// weighting that produced it, and the fixed-weight number ships beside it as
// `quality_score`. With no matching context the weights are FIXED_W and the
// two are equal.
export function contextWeights(ctx: string): { w: typeof FIXED_W; focus: string[] } {
  const c = ctx.toLowerCase();
  const w = { ...FIXED_W };
  const focus: string[] = [];
  if (/volume|liquid|turnover|active/.test(c))                           { w.vol += 0.15; focus.push("volume"); }
  if (/momentum|rising|breakout|trend|runner|pump|moving|climb/.test(c)) { w.mom += 0.15; focus.push("momentum"); }
  if (/divergence|accumulat|alpha|quiet|stealth|undervalued|radar/.test(c)) { w.div += 0.15; focus.push("divergence"); }
  return { w, focus };
}

function weightedScore(s: ReturnType<typeof subScores>, w: typeof FIXED_W): number {
  const sum = w.liq + w.vol + w.lm + w.mom + w.div;
  return Math.round(100 * (w.liq * s.liqHealth + w.vol * s.volMom + w.lm * s.liqMcap + w.mom * s.momentum + w.div * s.divergence) / sum);
}

// ── FIX 3 — signal type assigned from data ────────────────────────────────────
function signalType(p: Pool, turnover: number): "building" | "spike" | "divergence" {
  const h1 = p.change.h1 ?? 0, h24 = p.change.h24 ?? 0;
  if (Math.abs(h1) >= 8) return "spike";                              // sharp 1h move — risky
  if (turnover >= 0.8 && Math.abs(h24) <= 12) return "divergence";    // vol high, price flat — alpha
  return "building";                                                  // steady vol+liq, price not bursting
}

// ── FIX 4 — automatic caution flags (transparency) ───────────────────────────
function cautionFlags(p: Pool): string[] {
  const out: string[] = [];
  const liq = p.liquidityUsd ?? 0, mcap = p.marketCap;
  const h1 = p.change.h1, h24 = p.change.h24;
  if (liq < 100_000) out.push("low_liquidity");
  if (h1 != null && h24 != null && Math.abs(h1) >= 3 && Math.abs(h1) >= Math.abs(h24) * 0.7) out.push("pump_pattern");
  if (mcap != null && mcap > 0 && liq / mcap < 0.03) out.push("thin_liq_to_mcap");
  if (h24 != null && Math.abs(h24) > 50) out.push("high_volatility");
  return out;
}

type Scored = {
  p: Pool;
  /** Fixed-weight quality score (FIXED_W). */
  quality: number;
  /** The context-weighted score — what the list is ordered by, and what is shown as `score`. */
  score: number;
  signal_type: "building" | "spike" | "divergence";
  caution: string[];
};

/**
 * Score every survivor and order it by the score that will be SHOWN. Pure and
 * exported so scripts/token-pick-facts-test.ts pins the ordering ↔ label
 * agreement without GeckoTerminal.
 */
export function scorePools(pools: Pool[], context: string): { scored: Scored[]; basis: string } {
  const { w, focus } = contextWeights(context);
  const scored: Scored[] = pools.map((p) => {
    const s = subScores(p);
    return { p, quality: qualityScore(s), score: weightedScore(s, w), signal_type: signalType(p, s.turnover), caution: cautionFlags(p) };
  });
  // Shown score first; the fixed-weight quality breaks ties.
  scored.sort((a, b) => b.score - a.score || b.quality - a.quality);
  const basis = focus.length
    ? `an on-chain quality score weighted toward ${focus.join(" + ")} (from your context)`
    : "an on-chain quality score";
  return { scored, basis };
}

/** The pick's one-line summary, in code, naming the weighting that chose it. */
export function pickSummary(top: Scored, qualifying: number, basis: string): string {
  return `Highest score by ${basis} (${top.score}/100) of ${qualifying} qualifying Base pools: liquidity ${fmtUsd(top.p.liquidityUsd)}, 24h volume ${fmtUsd(top.p.volume24h)}, 24h change ${fmtPct(top.p.change.h24)}, ${top.signal_type} signal.`;
}

function scoredLine(s: Scored, i: number): string {
  const p = s.p;
  return `${i + 1}. ${p.baseSymbol} — score ${s.quality}/100, signal ${s.signal_type}, price ${p.priceUsd != null ? "$" + p.priceUsd : "?"}, 24h ${fmtPct(p.change.h24)}, 6h ${fmtPct(p.change.h6)}, 1h ${fmtPct(p.change.h1)}, vol24h ${fmtUsd(p.volume24h)}, liq ${fmtUsd(p.liquidityUsd)}, mcap ${fmtUsd(p.marketCap)} (${capLabel(p.marketCap)})${s.caution.length ? `, caution: ${s.caution.join("/")}` : ""}`;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { min_mcap?: number; context?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const minMcap = body.min_mcap ?? Number(url.searchParams.get("min_mcap") ?? "0");
    const context = (body.context ?? url.searchParams.get("context") ?? "").trim();
    const capTier = parseCapTier(context); // FIX 5 — only when explicitly asked

    const meta = {
      tool: "token-pick-signal",
      timestamp: new Date().toISOString(),
      chain: "base",
      data_source: "GeckoTerminal (live Base pools)",
    };

    const [trending, fresh] = await Promise.all([getBaseTrending(15), getBaseNewPools(10)]);
    // Dedupe by base symbol (trending + new can overlap)
    const seen = new Set<string>();
    const universe: Pool[] = [...trending, ...fresh].filter((p) => {
      if (!p.baseSymbol) return false;
      const k = p.baseSymbol.toUpperCase();
      if (QUOTE_DENYLIST.has(k)) return false; // skip denominator / blue-chip assets
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    if (!universe.length) {
      return Response.json(
        { ...meta, error: "Live Base pool data is unavailable right now. Retry shortly." },
        { status: 503 }
      );
    }

    const candidatesBefore = universe.length;

    // FIX 1 — hard quality filter (always). FIX 5 — cap filter (only if asked).
    // min_mcap kept as an optional numeric floor for API back-compat.
    let pool = universe.filter(passesQuality);
    if (capTier) pool = pool.filter((p) => p.marketCap != null && p.marketCap < capTier.max);
    if (minMcap) pool = pool.filter((p) => (p.marketCap ?? 0) >= minMcap);

    const filters_applied = {
      min_liquidity: MIN_LIQ,
      min_volume: MIN_VOL,
      cap_tier: capTier ? { tier: capTier.tier, max_mcap: capTier.max } : null,
      min_mcap: minMcap || null,
      candidates_before: candidatesBefore,
      candidates_after: pool.length,
    };

    // EDGE CASE — nothing qualifies → no_pick. NEVER fall back to a bigger token.
    if (!pool.length) {
      const why = capTier
        ? `No ${capTier.tier}-cap (marketCap < ${fmtUsd(capTier.max)}) Base token currently passes the liquidity / volume / anti-pump quality filters. Not forcing a larger pick.`
        : `No Base token currently passes the on-chain quality filters (liquidity ≥ ${fmtUsd(MIN_LIQ)}, volume ≥ ${fmtUsd(MIN_VOL)}, no pump pattern). Not forcing a pick.`;
      return Response.json({
        ...meta,
        no_pick: true,
        facts_only: true,
        pick: null,
        near_misses: [],
        note: why,
        filters_applied,
        candidates_scanned: candidatesBefore,
      });
    }

    // FIX 2/3/4 — score + classify every survivor
    const { scored, basis } = scorePools(pool, context);

    const top = scored[0];
    const others = scored.slice(1, 5);

    // Every figure below is from the pool read; the summary is written in code.
    const pick = {
      token: top.p.baseSymbol,
      price: top.p.priceUsd != null ? `$${top.p.priceUsd}` : "unknown",
      change_24h: fmtPct(top.p.change.h24),
      change_1h: fmtPct(top.p.change.h1),
      market_cap: fmtUsd(top.p.marketCap),
      cap_tier: capLabel(top.p.marketCap),
      liquidity: fmtUsd(top.p.liquidityUsd),
      volume_24h: fmtUsd(top.p.volume24h),
      score: top.score,
      quality_score: top.quality,
      score_basis: basis,
      signal_type: top.signal_type,
      caution: top.caution,
      summary: pickSummary(top, pool.length, basis),
      url: top.p.url || null,
    };

    const near_misses = others.map((s) => ({
      token: s.p.baseSymbol,
      score: s.score,
      quality_score: s.quality,
      signal_type: s.signal_type,
      cap_tier: capLabel(s.p.marketCap),
      caution: s.caution,
    }));

    return Response.json({
      ...meta,
      no_pick: false,
      facts_only: true,
      pick,
      near_misses,
      quality_score: top.quality,
      score_basis: basis,
      note: `${capTier ? `Top ${capTier.tier}-cap` : "Top"} Base token by ${basis} — facts from live pools, not a recommendation to buy or sell.`,
      filters_applied,        // FIX 7
      candidates_scanned: candidatesBefore,
    });
  } catch (error) {
    console.error("[TokenPickSignal]", error);
    return Response.json({ error: "Token pick signal failed", message: (error as Error).message }, { status: 500 });
  }
}
