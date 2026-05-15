// x402/deep-analysis/index.ts
// Deep Project Due Diligence - 0.35 USDC per analysis
// Powered by Blue Agent

import { callBankrLLM, extractJsonObject } from "@blue-agent/bankr";

// ── Real data sources ─────────────────────────────────────────────────────────

async function fetchDexScreener(contractAddress: string): Promise<string> {
  try {
    const res  = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${contractAddress}`,
      { signal: AbortSignal.timeout(6000) }
    );
    const data = await res.json() as {
      pairs?: Array<{
        chainId?: string;
        baseToken?: { name?: string; symbol?: string; address?: string };
        quoteToken?: { symbol?: string };
        priceUsd?: string;
        volume?: { h24?: number };
        liquidity?: { usd?: number };
        priceChange?: { h24?: number };
        txns?: { h24?: { buys?: number; sells?: number } };
        fdv?: number;
        marketCap?: number;
        pairCreatedAt?: number;
        dexId?: string;
      }>;
    };

    const pairs = (data.pairs ?? []).filter((p) => p.chainId === "base");
    if (!pairs.length) return "No trading pairs found on Base via DexScreener.";

    // Pick highest liquidity pair
    const pair = pairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))[0];
    const token = pair.baseToken ?? {};
    const txns  = pair.txns?.h24 ?? {};
    const ageDays = pair.pairCreatedAt
      ? Math.round((Date.now() - pair.pairCreatedAt) / 86400000)
      : null;

    return JSON.stringify({
      name:           token.name,
      symbol:         token.symbol,
      priceUsd:       pair.priceUsd,
      volume24h:      pair.volume?.h24,
      liquidityUsd:   pair.liquidity?.usd,
      priceChange24h: pair.priceChange?.h24,
      buys24h:        txns.buys,
      sells24h:       txns.sells,
      fdv:            pair.fdv,
      marketCap:      pair.marketCap,
      pairAgeDays:    ageDays,
      dex:            pair.dexId,
      totalPairsOnBase: pairs.length,
    }, null, 2);
  } catch {
    return "DexScreener data unavailable.";
  }
}

async function fetchGeckoTerminal(contractAddress: string): Promise<string> {
  try {
    const res  = await fetch(
      `https://api.geckoterminal.com/api/v2/networks/base/tokens/${contractAddress}`,
      {
        headers: { Accept: "application/json;version=20230302" },
        signal: AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return "GeckoTerminal data unavailable.";
    const data = await res.json() as {
      data?: {
        attributes?: {
          name?: string; symbol?: string; decimals?: number;
          total_supply?: string; price_usd?: string;
          fdv_usd?: string; market_cap_usd?: string;
          volume_usd?: { h24?: string };
          top_pools?: Array<{ name?: string; reserve_in_usd?: string }>;
        };
      };
    };
    const attr = data.data?.attributes;
    if (!attr) return "GeckoTerminal: no data.";

    return JSON.stringify({
      name:       attr.name,
      symbol:     attr.symbol,
      decimals:   attr.decimals,
      priceUsd:   attr.price_usd,
      fdvUsd:     attr.fdv_usd,
      marketCap:  attr.market_cap_usd,
      volume24h:  attr.volume_usd?.h24,
    }, null, 2);
  } catch {
    return "GeckoTerminal data unavailable.";
  }
}

async function fetchBasescanVerification(contractAddress: string): Promise<string> {
  const apiKey = process.env.BASESCAN_API_KEY;
  if (!apiKey) return "Contract verification: unknown (no BASESCAN_API_KEY configured).";
  try {
    const res  = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(5000) }
    );
    const data = await res.json() as { status: string; result?: Array<{ ContractName?: string; CompilerVersion?: string }> };
    if (data.status === "1" && data.result?.[0]?.ContractName) {
      return `Contract verified: ${data.result[0].ContractName} (compiler: ${data.result[0].CompilerVersion})`;
    }
    return "Contract NOT verified on Basescan.";
  } catch {
    return "Contract verification check failed.";
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contractAddress?: string; projectName?: string; ticker?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}

    const url = new URL(req.url);
    if (!body.contractAddress && !body.projectName) {
      body.contractAddress = url.searchParams.get("contractAddress") ?? undefined;
      body.projectName     = url.searchParams.get("projectName")     ?? undefined;
      body.ticker          = url.searchParams.get("ticker")          ?? undefined;
    }

    const { contractAddress, projectName, ticker } = body;
    if (!contractAddress && !projectName) {
      return Response.json({ error: "Provide contractAddress or projectName" }, { status: 400 });
    }

    const target = contractAddress
      ? contractAddress
      : `${projectName}${ticker ? ` (${ticker})` : ""}`;

    console.log(`[DeepAnalysis] Analyzing: ${target}`);

    // Fetch real data in parallel
    let dexData     = "No contract address — name-based analysis only.";
    let geckoData   = "No contract address.";
    let contractStr = "No contract address.";

    if (contractAddress) {
      [dexData, geckoData, contractStr] = await Promise.all([
        fetchDexScreener(contractAddress),
        fetchGeckoTerminal(contractAddress),
        fetchBasescanVerification(contractAddress),
      ]);
    }

    const systemPrompt = `You are a senior crypto due diligence analyst on Base chain, powered by Blue Agent.

Use the real market data provided. Do NOT speculate or invent information.
If data shows active trading, liquidity, and a real project, reflect that honestly.

CRITICAL: Return ONLY raw JSON. No markdown. No backticks. No code blocks. Start with { and end with }.

{
  "name": "project name",
  "ticker": "TICKER or null",
  "contract": "0x... or null",
  "score": <0-100, overall quality>,
  "risk": <0-100, higher = riskier>,
  "rug": <0-100, rug probability>,
  "verdict": "Strong Buy | Buy | Caution | Avoid | High Risk",
  "risks": ["concise risk 1", "concise risk 2", "concise risk 3"],
  "strengths": ["concise strength 1", "concise strength 2"],
  "summary": "2-3 sentence summary grounded in the actual data"
}`;

    const userPrompt = `Perform deep due diligence on: ${target}
Project name hint: ${projectName ?? "unknown"}
Ticker hint: ${ticker ?? "unknown"}
Contract: ${contractAddress ?? "not provided"}

=== DexScreener (live market data) ===
${dexData}

=== GeckoTerminal ===
${geckoData}

=== Contract Verification ===
${contractStr}`;

    const llmResponse = await callBankrLLM({
      model:       "claude-haiku-4-5",
      system:      systemPrompt,
      messages:    [{ role: "user", content: userPrompt }],
      temperature: 0.3,
      maxTokens:   900,
    });

    const result = extractJsonObject(llmResponse);
    return Response.json(result, { status: 200 });
  } catch (error) {
    console.error("[DeepAnalysis] Error:", error);
    return Response.json(
      { error: "Failed to perform deep analysis", message: (error as Error).message },
      { status: 500 }
    );
  }
}
