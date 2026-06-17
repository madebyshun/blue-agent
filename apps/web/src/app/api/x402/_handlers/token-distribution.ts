// x402/token-distribution — holder concentration & rug-risk for a Base token
// Price: $0.20 — Holder data from Moralis, scoring/verdict computed in CODE (no LLM).

import { getTokenMarket } from "@/lib/market-data";

const MORALIS_BASE = "https://deep-index.moralis.io/api/v2.2";

type Owner = {
  owner_address?: string;
  balance_formatted?: string;
  percentage_relative_to_total_supply?: number | string;
};

async function getTopOwners(contract: string): Promise<Owner[] | null> {
  const key = process.env.MORALIS_API_KEY ?? "";
  if (!key) return null;
  try {
    const res = await fetch(
      `${MORALIS_BASE}/erc20/${contract}/owners?chain=base&limit=20`,
      { headers: { "X-API-Key": key, Accept: "application/json" }, signal: AbortSignal.timeout(8000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: Owner[] };
    return data.result ?? [];
  } catch {
    return null;
  }
}

function pct(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contract?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.contract) body.contract = url.searchParams.get("contract") || url.searchParams.get("address") || undefined;

    const { contract } = body;
    if (!contract) return Response.json({ error: "Provide token contract address" }, { status: 400 });

    console.log(`[TokenDistribution] Analyzing distribution for: ${contract}`);

    const [market, owners] = await Promise.all([
      getTokenMarket(contract).catch(() => null),
      getTopOwners(contract),
    ]);
    const symbol = market?.symbol ?? null;

    // Fail soft — no holder data means we cannot assess concentration.
    if (!owners || owners.length === 0) {
      return Response.json({
        tool: "token-distribution",
        contract,
        symbol,
        total_holders: null,
        top10_holders_pct: null,
        creator_holdings_pct: null,
        distribution_score: null,
        concentration_risk: null,
        rug_risk_flags: [],
        verdict: "CAUTION",
        note: owners
          ? `No holder data returned for "${contract}" on Base.`
          : "Holder data source (Moralis) unavailable or MORALIS_API_KEY not set — cannot assess distribution.",
        dataSource: "Moralis (holders) + DexScreener (symbol)",
        timestamp: new Date().toISOString(),
      });
    }

    // Top-10 holders % from the real per-holder percentages.
    const sorted = [...owners].sort(
      (a, b) => (pct(b.percentage_relative_to_total_supply) ?? 0) - (pct(a.percentage_relative_to_total_supply) ?? 0)
    );
    const top10 = sorted.slice(0, 10);
    const top10_holders_pct = +top10.reduce(
      (sum, o) => sum + (pct(o.percentage_relative_to_total_supply) ?? 0),
      0
    ).toFixed(2);

    // Creator holdings unknown without a verified deployer address.
    const creator_holdings_pct = null as number | null;

    // distribution_score: more concentrated = lower (100 = fully dispersed).
    const distribution_score = Math.max(0, Math.min(100, Math.round(100 - top10_holders_pct)));

    // concentration_risk: top10 >70% HIGH, >40% MEDIUM, else LOW.
    const concentration_risk: "LOW" | "MEDIUM" | "HIGH" =
      top10_holders_pct > 70 ? "HIGH" : top10_holders_pct > 40 ? "MEDIUM" : "LOW";

    const rug_risk_flags: string[] = [];
    const topHolderPct = pct(top10[0]?.percentage_relative_to_total_supply);
    if (topHolderPct != null && topHolderPct > 30) rug_risk_flags.push(`Top holder controls ${topHolderPct.toFixed(1)}% of supply`);
    if (top10_holders_pct > 80) rug_risk_flags.push(`Top 10 holders control ${top10_holders_pct.toFixed(1)}% of supply`);
    else if (top10_holders_pct > 70) rug_risk_flags.push("High top-10 concentration");
    if (creator_holdings_pct != null && creator_holdings_pct > 30) rug_risk_flags.push(`Creator holds ${creator_holdings_pct.toFixed(1)}% of supply`);

    // verdict: DANGER if top10>80% or creator>30%; CAUTION if HIGH risk; else SAFE.
    const verdict: "SAFE" | "CAUTION" | "DANGER" =
      top10_holders_pct > 80 || (creator_holdings_pct != null && creator_holdings_pct > 30)
        ? "DANGER"
        : concentration_risk === "HIGH"
          ? "CAUTION"
          : "SAFE";

    return Response.json({
      tool: "token-distribution",
      contract,
      symbol,
      total_holders: null, // owners endpoint returns a page, not a full count
      top10_holders_pct,
      creator_holdings_pct,
      distribution_score,
      concentration_risk,
      rug_risk_flags,
      verdict,
      dataSource: "Moralis (holders) + DexScreener (symbol)",
      disclaimer: "Holder concentration is a snapshot — not financial advice.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[TokenDistribution] Error:", error);
    return Response.json({ error: "Token distribution analysis failed", message: (error as Error).message }, { status: 500 });
  }
}
