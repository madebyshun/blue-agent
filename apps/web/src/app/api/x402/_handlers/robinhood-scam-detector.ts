// x402/robinhood-scam-detector — scam/rug/honeypot risk for a Robinhood Chain
// (chainId 4663) token contract. Price: $0.10 — grounds the LLM in real
// GeckoTerminal liquidity/age + Blockscout verification.
//
// Ported from scam-detector.ts (Base). Substitutions:
//   1. DexScreener → GeckoTerminal `robinhood` network (pool data + age)
//   2. Basescan/Etherscan v2 → Blockscout
//
// Same deterministic verdict mapping.

import { callVeniceLLM } from "@/app/api/_lib/llm";
import { getBlockscoutContractSource, blockscoutUrl } from "@/lib/blockscout";

function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{"), e = raw.lastIndexOf("}");
  if (s >= 0 && e > s) raw = raw.slice(s, e + 1);
  try { return JSON.parse(raw); } catch {}
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  return null;
}

// GeckoTerminal `robinhood` network — the pools that hold this token.
// Shape is different from DexScreener but the fields we need (liquidity,
// pool_created_at, 24h volume) all exist.
type GtPool = {
  attributes?: {
    address?: string;
    name?: string;
    reserve_in_usd?: string;
    pool_created_at?: string;
    volume_usd?: { h24?: string };
    price_change_percentage?: { h24?: string };
    base_token_price_usd?: string;
    market_cap_usd?: string;
  };
  relationships?: { dex?: { data?: { id?: string } } };
};

async function getRobinhoodTokenPools(contract: string): Promise<GtPool[]> {
  const res = await fetch(
    `https://api.geckoterminal.com/api/v2/networks/robinhood/tokens/${contract}/pools?page=1`,
    { signal: AbortSignal.timeout(8000) }
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { data?: GtPool[] };
  return data.data ?? [];
}

const SYSTEM = `You are a Robinhood Chain analyst (chainId 4663). Use ONLY the data provided. NEVER invent numbers, addresses, or token names not in the data. Return ONLY raw JSON starting with {. No markdown. If data unavailable, return field as null — never estimate.

You assess whether a Robinhood Chain token contract is a scam (honeypot / rug pull / pump & dump / fake token) or clean. Base your judgment on the real signals provided: total pool liquidity, the age of the oldest pool, 24h volume, and whether the contract source is verified on Blockscout.

Heuristics: very low liquidity (under $10,000) combined with an UNVERIFIED contract is a strong scam signal. A brand-new pool (hours old) with thin liquidity is high risk. A verified contract with deep, aged liquidity is a clean signal. If the token has no pools at all, treat as unknown/high-risk, not clean. Robinhood Chain is a NEW chain — do NOT penalize thin liquidity or new pools purely for being new; weight the UNVERIFIED + THIN + BRAND-NEW combination.

Return ONLY raw JSON:
{
  "is_scam": boolean,
  "scam_type": "honeypot" | "rug_pull" | "pump_dump" | "fake_token" | "clean" | "unknown",
  "confidence": number (0-100),
  "evidence": ["string"],
  "safe_to_interact": boolean,
  "red_flags": ["string"],
  "green_flags": ["string"],
  "verdict": "SAFE" | "SUSPICIOUS" | "SCAM"
}`;

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { contract?: string; token?: string; address?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    // Accept contract | token | address as aliases (see quick-safety for
    // rationale) — same underlying input, different call sites use
    // different names.
    const contract = (body.contract ?? body.token ?? body.address ?? url.searchParams.get("contract") ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "").trim();
    if (!contract) return Response.json({ error: "Provide a contract address" }, { status: 400 });
    if (!/^0x[a-fA-F0-9]{40}$/.test(contract)) {
      return Response.json({ error: "Provide a valid 0x contract address" }, { status: 400 });
    }

    console.log(`[RobinhoodScamDetector] Scanning contract: ${contract}`);

    let pools: GtPool[] = [];
    try { pools = await getRobinhoodTokenPools(contract); }
    catch (e) { console.warn("[RobinhoodScamDetector] GeckoTerminal fetch failed:", (e as Error).message); }

    let source: Awaited<ReturnType<typeof getBlockscoutContractSource>> = null;
    try { source = await getBlockscoutContractSource(contract); }
    catch (e) { console.warn("[RobinhoodScamDetector] Blockscout fetch failed:", (e as Error).message); }

    const totalLiquidity = pools.reduce((sum, p) => sum + (parseFloat(p.attributes?.reserve_in_usd ?? "0") || 0), 0);
    const oldestCreatedAt = pools.reduce<number | null>((min, p) => {
      const t = p.attributes?.pool_created_at ? Date.parse(p.attributes.pool_created_at) : NaN;
      if (!Number.isFinite(t)) return min;
      return min === null ? t : Math.min(min, t);
    }, null);
    const poolAgeHours = oldestCreatedAt ? (Date.now() - oldestCreatedAt) / (60 * 60 * 1000) : null;
    const total24hVolume = pools.reduce((sum, p) => sum + (parseFloat(p.attributes?.volume_usd?.h24 ?? "0") || 0), 0);
    const verified = !!source?.verified;

    const facts = {
      contract,
      chain: "robinhood",
      chainId: 4663,
      pools_found: pools.length,
      total_liquidity_usd: Math.round(totalLiquidity),
      oldest_pool_age_hours: poolAgeHours === null ? null : Math.round(poolAgeHours),
      volume_24h_usd: Math.round(total24hVolume),
      contract_verified: verified,
      contract_name: source?.contractName ?? null,
      is_proxy: !!source?.isProxy,
    };

    const llmResponse = await callVeniceLLM({
      system: SYSTEM,
      webSearch: false,
      messages: [{
        role: "user",
        content: `Assess scam risk for this Robinhood Chain token contract. Use ONLY these real signals:\n${JSON.stringify(facts, null, 2)}\n\nReminder: liquidity under $10,000 with an unverified contract is a strong scam signal.`,
      }],
      temperature: 0,
      maxTokens: 800,
    });

    let result = extractJsonObject(llmResponse);
    if (!result) result = { degraded: true, note: "Synthesis briefly unavailable - please retry." };

    // Deterministic verdict — hard-map from confidence and evidence, not the
    // LLM's chosen word. If the LLM said scam, believe it; otherwise use the
    // signals directly.
    const isScam = result.is_scam === true;
    const scamType = typeof result.scam_type === "string" ? result.scam_type : "unknown";
    const verdict = isScam
      ? "SCAM"
      : (facts.total_liquidity_usd < 10_000 && !verified && facts.pools_found === 0)
        ? "SUSPICIOUS"
        : (typeof result.verdict === "string" ? result.verdict : "SUSPICIOUS");

    return Response.json({
      tool: "robinhood-scam-detector",
      contract,
      chain: "robinhood",
      chainId: 4663,
      ...result,
      verdict,
      is_scam: isScam,
      scam_type: scamType,
      signals: facts,
      explorer_url: blockscoutUrl(contract),
      data_sources: [
        "GeckoTerminal robinhood (pool liquidity + age)",
        "Blockscout (contract verification)",
      ],
      disclaimer: "Heuristic risk signal only — not financial advice. Always do your own research.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[RobinhoodScamDetector] Error:", error);
    return Response.json(
      { error: "Robinhood scam detection failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
