// GET /api/yield/rates
//
// Live USDC lending APY across blue-chip venues on Base, from DefiLlama yields
// (real numbers, never fabricated). Curated for SAFETY: lending-only, USDC,
// min-TVL gate to drop illiquid/manipulated outliers (e.g. a 39% APY pool with
// ~$0 TVL), and a sane APY ceiling. Morpho exposes many curated vaults — we
// collapse it to the single highest-TVL vault so "Morpho" is one comparable row.
//
// This powers the Move-to-Yield card's "best rate on Base" comparison. Execution
// today routes through the verified Aave path; other venues are shown so the
// user sees where the best safe rate is. Cached 5 min.

import { NextResponse } from "next/server";

export const revalidate = 300;

const SAFE_PROJECTS: Record<string, string> = {
  "aave-v3":          "Aave v3",
  "moonwell-lending": "Moonwell",
  "compound-v3":      "Compound v3",
  "morpho-blue":      "Morpho",
};

const MIN_TVL = 1_000_000; // drop illiquid outliers
const MAX_APY = 20;        // drop manipulated/teaser APYs

type LlamaPool = {
  chain?: string; project?: string; symbol?: string;
  tvlUsd?: number; apy?: number | null; apyBase?: number | null;
  apyReward?: number | null; ilRisk?: string; stablecoin?: boolean; pool?: string;
};

export interface YieldRate {
  project:   string;   // defillama project slug
  label:     string;   // display name
  symbol:    string;
  apy:       number;
  apyBase:   number;
  apyReward: number;
  tvlUsd:    number;
  executable: boolean; // true = Blue Chat can route a signed supply here today
  llamaUrl:  string;
}

export async function GET() {
  try {
    const res = await fetch("https://yields.llama.fi/pools", {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`defillama ${res.status}`);
    const json = (await res.json()) as { data?: LlamaPool[] };

    const pools = (json.data ?? []).filter(p =>
      p.chain === "Base" &&
      p.stablecoin &&
      /usdc/i.test(p.symbol ?? "") &&
      !!p.project && p.project in SAFE_PROJECTS &&
      (p.tvlUsd ?? 0) >= MIN_TVL &&
      (p.apy ?? 0) > 0 && (p.apy ?? 0) <= MAX_APY,
    );

    // Collapse to one row per project: keep the highest-TVL pool for each
    // (handles Morpho's many vaults → its biggest, safest vault).
    const byProject = new Map<string, LlamaPool>();
    for (const p of pools) {
      const cur = byProject.get(p.project!);
      if (!cur || (p.tvlUsd ?? 0) > (cur.tvlUsd ?? 0)) byProject.set(p.project!, p);
    }

    const rates: YieldRate[] = [...byProject.values()]
      .map(p => ({
        project:   p.project!,
        label:     SAFE_PROJECTS[p.project!],
        symbol:    p.symbol ?? "USDC",
        apy:       Number((p.apy ?? 0).toFixed(2)),
        apyBase:   Number((p.apyBase ?? 0).toFixed(2)),
        apyReward: Number((p.apyReward ?? 0).toFixed(2)),
        tvlUsd:    Math.round(p.tvlUsd ?? 0),
        executable: p.project === "aave-v3", // only Aave is verified + wired today
        llamaUrl:  p.pool ? `https://defillama.com/yields/pool/${p.pool}` : "https://defillama.com/yields?chain=Base",
      }))
      .sort((a, b) => b.apy - a.apy);

    const best = rates[0] ?? null;
    return NextResponse.json({ rates, best, ts: Date.now() });
  } catch (e) {
    return NextResponse.json(
      { rates: [], best: null, error: (e as Error).message, ts: Date.now() },
      { status: 200 }, // never break the card — it degrades to Aave-only
    );
  }
}
