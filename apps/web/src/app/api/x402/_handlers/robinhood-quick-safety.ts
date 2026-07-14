// x402/robinhood-quick-safety — fast contract safety check on Robinhood Chain
// (chainId 4663). GeckoTerminal robinhood liquidity + Blockscout verification
// + LLM read. Price: $0.05
//
// Ported from quick-safety.ts (Base). Substitutions:
//   1. DexScreener → GeckoTerminal `robinhood` network
//   2. Basescan/Etherscan v2 → Blockscout (robinhoodchain.blockscout.com)
//
// Same deterministic verdict mapping (SAFE/CAUTION/DANGER from risk_score).

import { callVeniceLLM, extractJsonObject } from "@/app/api/_lib/llm";
import { getRobinhoodTokenMarket } from "@/lib/market-data";
import { getBlockscoutContractSource, blockscoutUrl } from "@/lib/blockscout";

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contract?: string; token?: string; address?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    // Accept contract | token | address as aliases — same underlying input,
    // different call sites (Hub UI form uses `contract`, chat schema uses
    // `token`, generic callers use `address`). Normalizing here removes a
    // whole class of "field mismatch → 400" failures.
    const contract = (body.contract ?? body.token ?? body.address ?? url.searchParams.get("contract") ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "").trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return Response.json({ error: "Provide a contract address (0x…)" }, { status: 400 });
    }

    const [market, source] = await Promise.all([
      getRobinhoodTokenMarket(contract),
      getBlockscoutContractSource(contract),
    ]);

    const liquidity = market?.liquidityUsd ?? null;
    const symbol = market?.symbol ?? null;
    const verified = !!source?.verified;

    const data = {
      contract,
      chain: "robinhood",
      chainId: 4663,
      symbol,
      liquidity_usd: liquidity,
      source_verified: verified,
      contract_name: source?.contractName ?? null,
      is_proxy: !!source?.isProxy,
      market_pool_found: market !== null,
    };

    const system = `You are a Robinhood Chain (chainId 4663) analyst. Use ONLY the data provided. NEVER invent numbers, addresses, or token names not in the data. Return ONLY raw JSON starting with {. No markdown. If data unavailable, return field as null — never estimate.
Assess a token contract's safety from the real GeckoTerminal (robinhood network) liquidity + Blockscout source verification. Risk rises with: unverified source, liquidity < $10k, no active market. Only state buy/sell tax if evident in the data, else null. RH is a NEW chain — thin liquidity alone is common for legitimate small tokens, so weight the unverified+thin-liquidity COMBINATION, not thin liquidity by itself.
Schema: {"safe":boolean,"buy_tax_pct":number|null,"sell_tax_pct":number|null,"risk_score":<0-100>,"verdict":"SAFE|CAUTION|DANGER","flags":string[],"confidence":<0-100>}`;

    let r: Record<string, unknown> = {};
    try {
      r = extractJsonObject(
        await callVeniceLLM({ system, user: JSON.stringify(data, null, 2), temperature: 0, maxTokens: 500, webSearch: false })
      ) ?? {};
    } catch { /* degrade below */ }

    // Deterministic verdict: hard-mapped from the numeric risk_score. Only
    // fall back to the LLM's verdict word if we have no score at all.
    const rs = typeof r.risk_score === "number" ? r.risk_score : null;
    const verdict = rs == null
      ? (typeof r.verdict === "string" ? r.verdict : "CAUTION")
      : rs >= 66 ? "DANGER" : rs >= 33 ? "CAUTION" : "SAFE";

    return Response.json({
      tool: "robinhood-quick-safety",
      contract,
      chain: "robinhood",
      chainId: 4663,
      symbol,
      safe: typeof r.safe === "boolean" ? r.safe : rs != null ? rs < 33 : null,
      buy_tax_pct: typeof r.buy_tax_pct === "number" ? r.buy_tax_pct : null,
      sell_tax_pct: typeof r.sell_tax_pct === "number" ? r.sell_tax_pct : null,
      risk_score: rs,
      verdict,
      flags: Array.isArray(r.flags) ? r.flags : [],
      liquidity_usd: liquidity,
      verified,
      confidence: typeof r.confidence === "number" ? r.confidence : rs,
      explorer_url: blockscoutUrl(contract),
      data_sources: [
        "Blockscout (contract source)",
        market ? "GeckoTerminal robinhood (liquidity)" : "GeckoTerminal robinhood (no market found)",
      ],
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return Response.json({ error: "robinhood-quick-safety failed", message: (e as Error).message }, { status: 500 });
  }
}
