import { NextRequest, NextResponse } from "next/server";
import { proxyTool } from "@/app/api/_lib/proxy";
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

const NEW_WALLET = "0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f";

// launch-simulator is a single x402 endpoint (Bankr handlers too large for tiered deploy)
const ENDPOINT = `https://x402.bankr.bot/${NEW_WALLET}/launch-simulator`;

async function fetchDexScreener(contract: string): Promise<Record<string, unknown>> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${contract}`, {
      signal: AbortSignal.timeout(6000),
    });
    const data = await res.json() as { pairs?: Array<Record<string, unknown>> };
    const pairs = ((data.pairs ?? []) as Array<Record<string, unknown>>)
      .filter((p) => p.chainId === "base");
    if (!pairs.length) return { available: false };
    const pair = pairs.sort((a, b) =>
      (((b.liquidity as Record<string,number>)?.usd) ?? 0) -
      (((a.liquidity as Record<string,number>)?.usd) ?? 0)
    )[0] as Record<string, unknown>;
    return {
      available: true,
      priceUsd: pair.priceUsd,
      volume24h: (pair.volume as Record<string,unknown>)?.h24,
      liquidityUsd: (pair.liquidity as Record<string,unknown>)?.usd,
      priceChange24h: (pair.priceChange as Record<string,unknown>)?.h24,
      fdv: pair.fdv,
      marketCap: pair.marketCap,
    };
  } catch { return { available: false }; }
}

async function handleLocally(body: Record<string, unknown>): Promise<NextResponse> {
  const tokenName   = (body.token_name   as string) ?? (body.project as string) ?? "";
  const ticker      = (body.ticker       as string) ?? tokenName;
  const description = (body.description  as string) ?? "";
  const launchPrice = (body.launch_price as string) ?? "";
  const totalSupply = (body.total_supply as string) ?? "";
  const liquidity   = (body.liquidity    as string) ?? "";
  const contract    = (body.contract     as string) ?? "";
  const tier        = (body.tier         as string) ?? "standard";

  if (!tokenName) {
    return NextResponse.json({ error: "token_name is required" }, { status: 400 });
  }

  const context = [
    description,
    launchPrice && `Launch price: $${launchPrice}`,
    totalSupply && `Total supply: ${totalSupply}`,
    liquidity   && `Initial liquidity: $${liquidity}`,
  ].filter(Boolean).join(". ");

  // Step 1: Fetch market data + Aeon signals in parallel
  const [marketData, aeonSignals] = await Promise.all([
    contract ? fetchDexScreener(contract) : Promise.resolve({ available: false }),
    runAeonSkill("token-movers", `${ticker} — ${context || "Base token launch"}`),
  ]);

  const marketSection = (marketData as { available?: boolean }).available
    ? `\nLive market: price=$${(marketData as Record<string,unknown>).priceUsd}, liq=$${(marketData as Record<string,unknown>).liquidityUsd}, 24h=${(marketData as Record<string,unknown>).priceChange24h}%`
    : "";

  // Step 2: MiroShark 4-persona crowd consensus
  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark — 4-persona crypto consensus engine.
Personas: Analyst(1.8x), Influencer(2.8x), Retail(1.0x), Observer(0.5x).
CRITICAL: Return ONLY raw JSON.
Schema: {"personas":{"analyst":{"stance":"bull|bear|neutral","weight":1.8,"rationale":"<1 sentence>"},"influencer":{"stance":"bull|bear|neutral","weight":2.8,"rationale":"<1 sentence>"},"retail":{"stance":"bull|bear|neutral","weight":1.0,"rationale":"<1 sentence>"},"observer":{"stance":"bull|bear|neutral","weight":0.5,"rationale":"<1 sentence>"}},"bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"recommendation":"go|review_needed|skip","sentiment_summary":"<1 sentence>"}`,
    messages: [{ role: "user", content: `Token: ${tokenName} (${ticker})\n${context}${marketSection}\nAeon signals: ${aeonSignals ?? "Base market active"}` }],
    temperature: 0.5,
    maxTokens: 800,
  });
  const miroshark = extractJsonObject(msRaw) ?? {
    bull: 50, bear: 30, neutral: 20,
    recommendation: "review_needed",
    sentiment_summary: "Mixed signals — proceed with caution",
  };

  // Step 3: Blue Agent launch strategy + verdict
  const verdictRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — token launch strategist for Base.
Synthesize Aeon market signals + MiroShark crowd consensus into launch intelligence.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "verdict":"GO|WAIT|ABORT",
  "confidence":<0-100>,
  "launch_score":<0-100>,
  "price_target":"<str>",
  "risk_level":"low|medium|high|critical",
  "tokenomics_score":<0-10>,
  "narrative_fit":<0-10>,
  "timing":"now|wait_1w|wait_1m|abort",
  "key_risks":["<risk>","<risk>"],
  "launch_playbook":["<step>","<step>","<step>"],
  "optimal_launch_size":"<str>",
  "blue_verdict":"<1-2 sentence direct advice>"
}`,
    messages: [{
      role: "user",
      content: `Token: ${tokenName} (${ticker})\n${context}${marketSection}\nAeon: ${aeonSignals ?? "Base signals unavailable"}\nMiroShark: ${JSON.stringify(miroshark)}\nTier: ${tier}`,
    }],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJsonObject(verdictRaw) ?? {
    verdict: "WAIT",
    confidence: 55,
    launch_score: 55,
    risk_level: "medium",
    timing: "wait_1w",
    key_risks: ["Market conditions unclear", "Insufficient data"],
    launch_playbook: ["Gather more market data", "Build community first", "Re-evaluate in 1 week"],
    blue_verdict: "Insufficient data for a high-conviction launch signal. Build more before launching.",
  };

  return NextResponse.json({
    tool: "launch-simulator",
    timestamp: new Date().toISOString(),
    token_name: tokenName,
    ticker,
    tier,
    market_data: marketData,
    aeon_signals: aeonSignals ?? null,
    miroshark,
    ...result,
  });
}

export async function POST(req: NextRequest) {
  return proxyTool(req, ENDPOINT, handleLocally);
}
