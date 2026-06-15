// lib/yield-rates.ts
// Shared: live USDC lending APY on Base from DefiLlama (real numbers, never fabricated).
// Used by /api/yield/rates (UI) and x402 agent-yield-finder (paid tool).

const SAFE_PROJECTS: Record<string, string> = {
  "aave-v3":          "Aave v3",
  "moonwell-lending": "Moonwell",
  "compound-v3":      "Compound v3",
  "morpho-blue":      "Morpho",
};
const MIN_TVL = 1_000_000;
const MAX_APY = 20;

type LlamaPool = {
  chain?: string; project?: string; symbol?: string;
  tvlUsd?: number; apy?: number | null; apyBase?: number | null;
  apyReward?: number | null; ilRisk?: string; stablecoin?: boolean; pool?: string;
};

export interface YieldRate {
  project: string; label: string; symbol: string;
  apy: number; apyBase: number; apyReward: number;
  tvlUsd: number; executable: boolean; llamaUrl: string;
}

let MEM: { rates: YieldRate[]; best: YieldRate | null; ts: number } | null = null;

export async function getYieldRates(): Promise<{ rates: YieldRate[]; best: YieldRate | null; ts: number }> {
  if (MEM && Date.now() - MEM.ts < 300_000) return MEM;
  const res = await fetch("https://yields.llama.fi/pools", { cache: "no-store" });
  if (!res.ok) throw new Error(`defillama ${res.status}`);
  const json = (await res.json()) as { data?: LlamaPool[] };
  const pools = (json.data ?? []).filter(p =>
    p.chain === "Base" && p.stablecoin && /usdc/i.test(p.symbol ?? "") &&
    !!p.project && p.project in SAFE_PROJECTS &&
    (p.tvlUsd ?? 0) >= MIN_TVL && (p.apy ?? 0) > 0 && (p.apy ?? 0) <= MAX_APY,
  );
  const byProject = new Map<string, LlamaPool>();
  for (const p of pools) {
    const cur = byProject.get(p.project!);
    if (!cur || (p.tvlUsd ?? 0) > (cur.tvlUsd ?? 0)) byProject.set(p.project!, p);
  }
  const rates: YieldRate[] = [...byProject.values()].map(p => ({
    project: p.project!, label: SAFE_PROJECTS[p.project!], symbol: p.symbol ?? "USDC",
    apy: Number((p.apy ?? 0).toFixed(2)), apyBase: Number((p.apyBase ?? 0).toFixed(2)),
    apyReward: Number((p.apyReward ?? 0).toFixed(2)), tvlUsd: Math.round(p.tvlUsd ?? 0),
    executable: p.project === "aave-v3" || p.project === "morpho-blue",
    llamaUrl: p.pool ? `https://defillama.com/yields/pool/${p.pool}` : "https://defillama.com/yields?chain=Base",
  })).sort((a, b) => b.apy - a.apy);
  const best = rates[0] ?? null;
  MEM = { rates, best, ts: Date.now() };
  return MEM;
}
