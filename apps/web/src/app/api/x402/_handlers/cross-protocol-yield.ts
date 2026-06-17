// x402/cross-protocol-yield — best Base yield pools for a given token, ranked by risk
// Price: $0.20 — Real apy/tvl/ilRisk from DefiLlama (getBaseYields); risk scored in CODE

import { getBaseYields, type YieldPool } from "@/lib/market-data";

type RiskLevel = "Low" | "Medium" | "High";
type IlRisk = "none" | "low" | "medium" | "high";

function normalizeIlRisk(raw: string | undefined, stablecoin: boolean): IlRisk {
  const v = (raw ?? "").toLowerCase();
  if (v === "no" || v === "none") return "none";
  if (v === "low") return "low";
  if (v === "high") return "high";
  if (v === "yes") return stablecoin ? "low" : "medium";
  return stablecoin ? "none" : "medium";
}

// Lower TVL + higher APY = riskier. Returns 0 (safe) .. 100 (risky).
function riskScore(p: YieldPool): number {
  const apy = p.apy ?? 0;
  const tvl = p.tvlUsd ?? 0;
  // APY component: 5% → ~5pts, 50% → ~50pts, capped 60.
  const apyPts = Math.min(60, apy);
  // TVL component: deep TVL lowers risk. <$100k → 40, >$50M → ~0.
  let tvlPts = 40;
  if (tvl > 0) tvlPts = Math.max(0, Math.min(40, 40 - 10 * Math.log10(tvl / 100_000)));
  const ilPenalty =
    normalizeIlRisk(p.ilRisk, p.stablecoin) === "high"
      ? 15
      : normalizeIlRisk(p.ilRisk, p.stablecoin) === "medium"
        ? 8
        : 0;
  return Math.round(Math.max(0, Math.min(100, apyPts * 0.6 + tvlPts + ilPenalty)));
}

function riskLevelFromScore(score: number): RiskLevel {
  if (score >= 66) return "High";
  if (score >= 33) return "Medium";
  return "Low";
}

function entrySteps(p: YieldPool, token: string): string[] {
  return [
    `Acquire ${token.toUpperCase()} (or the required pool assets) on Base`,
    `Visit the ${p.project} pool: ${p.url || "(check protocol app)"}`,
    `Deposit into the ${p.symbol} pool on ${p.project}`,
    `Monitor APY and TVL — yields are variable and not guaranteed`,
  ];
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; risk_tolerance?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.token) body.token = url.searchParams.get("token") || undefined;
    if (!body.risk_tolerance) body.risk_tolerance = url.searchParams.get("risk_tolerance") || undefined;

    const token = body.token?.trim();
    if (!token) return Response.json({ error: "Provide a token symbol" }, { status: 400 });
    const riskTolerance = (body.risk_tolerance ?? "medium").toLowerCase();

    console.log(`[CrossProtocolYield] token=${token} risk=${riskTolerance}`);

    let pools: YieldPool[] = [];
    let fetchOk = true;
    try {
      pools = await getBaseYields(50);
    } catch (e) {
      fetchOk = false;
      console.warn("[CrossProtocolYield] DefiLlama fetch failed:", (e as Error).message);
    }

    if (!fetchOk) {
      return Response.json({
        tool: "cross-protocol-yield",
        token,
        opportunities: [],
        recommended: null,
        avoid: [],
        market_context: "Live Base yield data (DefiLlama) was unavailable — please retry. No estimated yields shown.",
        timestamp: new Date().toISOString(),
      });
    }

    const needle = token.toLowerCase();
    const matched = pools.filter((p) => (p.symbol ?? "").toLowerCase().includes(needle));

    if (matched.length === 0) {
      return Response.json({
        tool: "cross-protocol-yield",
        token,
        opportunities: [],
        recommended: null,
        avoid: [],
        market_context: `No live Base yield pools matched "${token}". It may have no yield opportunities on Base yet, or try a different token symbol.`,
        note: "No matching pools",
        timestamp: new Date().toISOString(),
      });
    }

    const opportunities = matched
      .map((p) => {
        const score = riskScore(p);
        const il = normalizeIlRisk(p.ilRisk, p.stablecoin);
        return {
          protocol: p.project,
          pool: p.symbol,
          apy: p.apy,
          tvl_usd: p.tvlUsd,
          risk_score: score,
          risk_level: riskLevelFromScore(score),
          il_risk: il,
          net_apy_estimate: p.apy, // gross APY proxy; pools report gross
          entry_steps: entrySteps(p, token),
        };
      })
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0));

    // Recommend the best APY pool within the user's risk tolerance, else the lowest-risk one.
    const toleranceCap = riskTolerance === "high" ? 100 : riskTolerance === "low" ? 33 : 66;
    const eligible = opportunities.filter((o) => o.risk_score <= toleranceCap);
    const best = (eligible.length ? eligible : opportunities)
      .slice()
      .sort((a, b) => (b.apy ?? 0) - (a.apy ?? 0))[0];
    const recommended = best
      ? {
          protocol: best.protocol,
          pool: best.pool,
          apy: best.apy,
          reason: `Highest APY (${best.apy ?? "n/a"}%) within ${riskTolerance} risk tolerance — risk score ${best.risk_score}/100, IL risk ${best.il_risk}, TVL $${Math.round(best.tvl_usd).toLocaleString()}.`,
        }
      : null;

    const avoid = opportunities
      .filter((o) => o.risk_score >= 75)
      .slice(0, 3)
      .map((o) => ({
        protocol: o.protocol,
        reason: `High risk score (${o.risk_score}/100) — APY ${o.apy ?? "n/a"}% vs only $${Math.round(o.tvl_usd).toLocaleString()} TVL${o.il_risk === "high" || o.il_risk === "medium" ? `, ${o.il_risk} IL risk` : ""}.`,
      }));

    const totalMatchedTvl = matched.reduce((s, p) => s + (p.tvlUsd ?? 0), 0);
    const marketContext = `${matched.length} Base pool(s) reference ${token.toUpperCase()} with $${Math.round(totalMatchedTvl).toLocaleString()} combined TVL. APYs are gross and variable; risk scores weight low TVL + high APY as riskier. Net yields depend on gas, fees, and impermanent loss.`;

    return Response.json({
      tool: "cross-protocol-yield",
      token,
      opportunities,
      recommended,
      avoid,
      market_context: marketContext,
      dataSource: "DefiLlama yields (live)",
      disclaimer: "APYs are variable and gross — not financial advice. DYOR before depositing.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[CrossProtocolYield] Error:", error);
    return Response.json(
      { error: "Cross-protocol yield analysis failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
