// x402/robinhood-yield — real yield opportunities on Robinhood Chain (chainId 4663).
// Price: $0.10.
//
// Three real data sources, each fail-soft (a bad source degrades to null, never
// fabricates numbers):
//   A. Featured — Steakhouse USDG Vault on Morpho (0xBeEf…09dd). APY + TVL fetched
//      from Morpho's public GraphQL (blue-api.morpho.org). Vault totalAssets is
//      also read directly from RH RPC via viem as a truth-in-depth check.
//   B. DefiLlama /pools filtered where chain === "Robinhood" — top-N by TVL.
//   C. (implicit) Uniswap V4 pools are included if DefiLlama classifies them
//      under project="uniswap-v4" (or similar) — no separate fetcher; they
//      already show up in (B).
//
// Numbers come ONLY from A/B. The LLM writes a 1-paragraph summary at temp=0
// and any verdict word is hard-mapped from a numeric score in code.

import { erc20Abi, createPublicClient, http, getAddress } from "viem";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { getRobinhoodYields, type YieldPool } from "@/lib/market-data";
import { callBankrLLM } from "@/app/api/_lib/llm";

// ─── Constants ───────────────────────────────────────────────────────────────

const STEAKHOUSE_USDG_VAULT = "0xBeEff033F34C046626B8D0A041844C5d1A5409dd" as const;
const RH_CHAIN_ID = 4663;
const MORPHO_GRAPHQL = "https://blue-api.morpho.org/graphql";
const FETCH_TIMEOUT = 8000;

// Minimal ERC-4626 view slice — Morpho vaults implement ERC-4626, so
// totalAssets() and asset() give us the on-chain truth even if the API is down.
const erc4626Slice = [
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "asset",       stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "name",        stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
  { type: "function", name: "symbol",      stateMutability: "view", inputs: [], outputs: [{ type: "string"  }] },
] as const;

const rhClient = createPublicClient({ chain: robinhoodMainnet, transport: http() });

// ─── Morpho GraphQL — vault APY + net TVL ────────────────────────────────────

type MorphoVaultState = {
  totalAssetsUsd?: number | null;
  totalAssets?: string | null;
  netApy?: number | null;   // fraction, e.g. 0.043 = 4.3%
  apy?: number | null;      // fallback
  fee?: number | null;
} | null;

type MorphoVault = {
  name?: string | null;
  symbol?: string | null;
  address?: string | null;
  asset?: { symbol?: string | null; address?: string | null } | null;
  state?: MorphoVaultState;
} | null;

async function fetchMorphoVault(): Promise<MorphoVault> {
  const query = `query VaultOnRobinhood($address: String!, $chainId: Int!) {
  vaultByAddress(address: $address, chainId: $chainId) {
    name
    symbol
    address
    asset { symbol address }
    state {
      totalAssetsUsd
      totalAssets
      netApy
      apy
      fee
    }
  }
}`;
  try {
    const res = await fetch(MORPHO_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { address: STEAKHOUSE_USDG_VAULT.toLowerCase(), chainId: RH_CHAIN_ID },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { data?: { vaultByAddress?: MorphoVault } };
    return j.data?.vaultByAddress ?? null;
  } catch {
    return null;
  }
}

// ─── On-chain vault snapshot via viem multicall (RH RPC) ─────────────────────

type OnchainVault = {
  address: string;
  name: string | null;
  symbol: string | null;
  assetAddress: string | null;
  assetSymbol: string | null;
  assetDecimals: number | null;
  totalAssetsRaw: string | null;   // raw uint256 as string
  totalAssetsHuman: number | null; // decimal-adjusted, if we could decode
};

async function fetchOnchainVault(): Promise<OnchainVault | null> {
  // NOTE: viem's multicall() aggregator (Multicall3) is NOT deployed on
  // Robinhood Chain — verified via a failed rhClient.multicall() attempt:
  // "Chain 'Robinhood Chain' does not support contract 'multicall3'". So we
  // fan out individual `readContract` calls in parallel via Promise.all
  // instead. Same latency, same fail-soft semantics.
  try {
    const [totalAssetsR, assetR, nameR, symbolR] = await Promise.allSettled([
      rhClient.readContract({ address: STEAKHOUSE_USDG_VAULT, abi: erc4626Slice, functionName: "totalAssets" }),
      rhClient.readContract({ address: STEAKHOUSE_USDG_VAULT, abi: erc4626Slice, functionName: "asset" }),
      rhClient.readContract({ address: STEAKHOUSE_USDG_VAULT, abi: erc4626Slice, functionName: "name" }),
      rhClient.readContract({ address: STEAKHOUSE_USDG_VAULT, abi: erc4626Slice, functionName: "symbol" }),
    ]);

    const assetAddress = assetR.status === "fulfilled" ? (assetR.value as `0x${string}`) : null;

    let assetDecimals: number | null = null;
    let assetSymbol: string | null = null;
    if (assetAddress) {
      const [decR, symR] = await Promise.allSettled([
        rhClient.readContract({ address: assetAddress, abi: erc20Abi, functionName: "decimals" }),
        rhClient.readContract({ address: assetAddress, abi: erc20Abi, functionName: "symbol" }),
      ]);
      if (decR.status === "fulfilled") assetDecimals = Number(decR.value);
      if (symR.status === "fulfilled") assetSymbol = symR.value as string;
    }

    const totalAssetsRaw = totalAssetsR.status === "fulfilled" ? (totalAssetsR.value as bigint).toString() : null;
    let totalAssetsHuman: number | null = null;
    if (totalAssetsRaw && assetDecimals != null) {
      // Cast to Number for display — vaults will be well below Number.MAX_SAFE_INTEGER for USDG-scale.
      totalAssetsHuman = Number(totalAssetsRaw) / 10 ** assetDecimals;
    }

    // Nothing readable at all → treat as "no on-chain snapshot".
    if (totalAssetsRaw == null && !assetAddress && nameR.status !== "fulfilled" && symbolR.status !== "fulfilled") {
      return null;
    }

    return {
      address: getAddress(STEAKHOUSE_USDG_VAULT),
      name: nameR.status === "fulfilled" ? (nameR.value as string) : null,
      symbol: symbolR.status === "fulfilled" ? (symbolR.value as string) : null,
      assetAddress,
      assetSymbol,
      assetDecimals,
      totalAssetsRaw,
      totalAssetsHuman,
    };
  } catch {
    return null;
  }
}

// ─── Composed "featured" line ────────────────────────────────────────────────

type FeaturedLine = {
  protocol: "morpho";
  label: string;
  vaultAddress: string;
  vaultName: string | null;
  vaultSymbol: string | null;
  asset: { symbol: string | null; address: string | null };
  apy: number | null;       // percent (e.g. 4.3)
  tvlUsd: number | null;
  totalAssetsHuman: number | null;
  note: string;
  dataSources: string[];
} | null;

function toPercent(fraction: number | null | undefined): number | null {
  if (typeof fraction !== "number" || !Number.isFinite(fraction)) return null;
  return +(fraction * 100).toFixed(2);
}

function buildFeatured(morpho: MorphoVault, onchain: OnchainVault | null): FeaturedLine {
  // Nothing at all → drop the featured line entirely (fail-soft).
  if (!morpho && !onchain) return null;

  const apiApy =
    toPercent(morpho?.state?.netApy) ??
    toPercent(morpho?.state?.apy);
  const apiTvl = morpho?.state?.totalAssetsUsd ?? null;
  const sources: string[] = [];
  if (morpho) sources.push("Morpho GraphQL (blue-api.morpho.org)");
  if (onchain) sources.push("RH RPC (viem readContract — ERC-4626 totalAssets)");

  return {
    protocol: "morpho",
    label: "Featured — Robinhood Earn (Steakhouse USDG Vault)",
    vaultAddress: onchain?.address ?? getAddress(STEAKHOUSE_USDG_VAULT),
    vaultName: onchain?.name ?? morpho?.name ?? "Steakhouse USDG Vault",
    vaultSymbol: onchain?.symbol ?? morpho?.symbol ?? null,
    asset: {
      symbol: onchain?.assetSymbol ?? morpho?.asset?.symbol ?? "USDG",
      address: onchain?.assetAddress ?? morpho?.asset?.address ?? null,
    },
    apy: apiApy, // percent, may be null if Morpho API failed
    tvlUsd: apiTvl,
    totalAssetsHuman: onchain?.totalAssetsHuman ?? null,
    note: "This is the on-chain primitive behind Robinhood Earn USDG.",
    dataSources: sources,
  };
}

// ─── LLM: 1-paragraph summary; numbers reproduced verbatim from A/B only ─────

const LLM_SYSTEM = `You are Blue Agent — a Robinhood Chain (chainId 4663) DeFi yield analyst. You are given a real featured Morpho vault line and a real list of DefiLlama yield pools on Robinhood Chain. Every APY and TVL number in your reply MUST be copied verbatim from the provided data — do NOT invent, project, average, or round differently. If a number is missing, write "unknown" — never make one up. Robinhood Chain is a NEW chain (thin liquidity is normal). Return ONLY raw JSON.
Schema: { "summary": "<1 paragraph, 3-4 sentences, plain English, cites only real numbers from the data>" }`;

function summariseForLLM(featured: FeaturedLine, pools: YieldPool[]): string {
  const parts: string[] = [];
  if (featured) {
    parts.push(
      `Featured (Morpho Steakhouse USDG Vault, ${featured.vaultAddress}): APY ${featured.apy != null ? featured.apy + "%" : "unknown"}, TVL ${featured.tvlUsd != null ? "$" + Math.round(featured.tvlUsd).toLocaleString() : "unknown"}, on-chain totalAssets ${featured.totalAssetsHuman != null ? featured.totalAssetsHuman.toLocaleString() + " " + (featured.asset.symbol ?? "USDG") : "unknown"}.`
    );
  } else {
    parts.push("Featured: (Morpho vault data unavailable this call.)");
  }
  if (pools.length) {
    parts.push("Top DefiLlama Robinhood Chain pools:");
    pools.forEach((p, i) => {
      const apy = p.apy != null ? p.apy.toFixed(2) + "%" : "unknown";
      const tvl = p.tvlUsd ? "$" + Math.round(p.tvlUsd).toLocaleString() : "unknown";
      parts.push(`${i + 1}. ${p.project} ${p.symbol} — APY ${apy}, TVL ${tvl}`);
    });
  } else {
    parts.push("DefiLlama pools: (none matched chain=Robinhood.)");
  }
  return parts.join("\n");
}

// ─── Verdict — hard-mapped from a numeric coverage score, temperature 0 ──────

type Verdict = "STRONG" | "MODERATE" | "THIN" | "INSUFFICIENT";
function computeVerdict(featured: FeaturedLine, pools: YieldPool[]): { verdict: Verdict; verdict_score: number } {
  // Coverage score: 0 (nothing real) .. 100 (featured live + many pools + real TVL).
  // Featured line alone (on-chain totalAssets known) is worth THIN by itself so
  // the UI doesn't call a working on-chain read "INSUFFICIENT".
  let score = 0;
  if (featured) score += 15;                                 // exists at all
  if (featured?.apy != null) score += 20;
  if (featured?.tvlUsd != null) score += 15;
  if (featured?.totalAssetsHuman != null) score += 10;
  score += Math.min(30, pools.length * 4);
  const totalPoolTvl = pools.reduce((s, p) => s + (p.tvlUsd ?? 0), 0);
  if (totalPoolTvl >= 10_000_000) score += 20;
  else if (totalPoolTvl >= 1_000_000) score += 12;
  else if (totalPoolTvl >= 100_000) score += 6;
  score = Math.min(100, score);
  const verdict: Verdict =
    score >= 66 ? "STRONG" : score >= 40 ? "MODERATE" : score >= 15 ? "THIN" : "INSUFFICIENT";
  return { verdict, verdict_score: score };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

type Body = { minTvlUsd?: number; limit?: number; asset?: string };

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: Body = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch { /* ignore */ }
    const url = new URL(req.url);
    if (body.minTvlUsd == null) {
      const q = url.searchParams.get("minTvlUsd");
      if (q) body.minTvlUsd = Number(q);
    }
    if (body.limit == null) {
      const q = url.searchParams.get("limit");
      if (q) body.limit = Number(q);
    }
    if (!body.asset) body.asset = url.searchParams.get("asset") ?? undefined;

    const minTvl = Number.isFinite(body.minTvlUsd) && (body.minTvlUsd as number) > 0
      ? (body.minTvlUsd as number)
      : 0;
    const limit = Number.isFinite(body.limit) && (body.limit as number) > 0
      ? Math.min(10, Math.floor(body.limit as number))
      : 8;
    const asset = body.asset?.trim() || undefined;

    console.log(`[RobinhoodYield] minTvl=${minTvl} limit=${limit} asset=${asset ?? "-"}`);

    // Fire all three fetches in parallel — each is independently degradable.
    const [morphoR, onchainR, poolsR] = await Promise.allSettled([
      fetchMorphoVault(),
      fetchOnchainVault(),
      getRobinhoodYields(limit, { minTvl, assetSymbol: asset }),
    ]);

    const morpho = morphoR.status === "fulfilled" ? morphoR.value : null;
    const onchain = onchainR.status === "fulfilled" ? onchainR.value : null;
    const pools = poolsR.status === "fulfilled" ? poolsR.value : [];

    const featured = buildFeatured(morpho, onchain);
    const { verdict, verdict_score } = computeVerdict(featured, pools);

    // If we truly have nothing, return "insufficient data" — no fake numbers.
    if (!featured && pools.length === 0) {
      return Response.json({
        tool: "robinhood-yield",
        chain: "robinhood",
        chainId: RH_CHAIN_ID,
        verdict: "INSUFFICIENT" as Verdict,
        verdict_score: 0,
        featured: null,
        top_pools: [],
        summary: "Insufficient data — Morpho GraphQL, RH RPC, and DefiLlama pools all failed to return usable results on this call. Please retry.",
        data_sources: [],
        filters: { minTvlUsd: minTvl, limit, asset: asset ?? null },
        timestamp: new Date().toISOString(),
      });
    }

    // LLM 1-paragraph summary. Temperature 0 → deterministic. If LLM 401s or
    // fails, we still return a clean, factual response with no fabrication.
    const llmContext = summariseForLLM(featured, pools);
    let summary: string | null = null;
    try {
      const raw = await callBankrLLM({
        system: LLM_SYSTEM,
        messages: [{ role: "user", content: llmContext }],
        temperature: 0,
        maxTokens: 300,
      });
      // Lenient JSON parse per CLAUDE.md: strip fences, slice { ... }, try/catch.
      let s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
      const i = s.indexOf("{"), j = s.lastIndexOf("}");
      if (i >= 0 && j > i) s = s.slice(i, j + 1);
      try {
        const parsed = JSON.parse(s) as { summary?: string };
        if (typeof parsed.summary === "string" && parsed.summary.trim()) summary = parsed.summary.trim();
      } catch { /* fall through to code-generated fallback */ }
    } catch (e) {
      console.warn("[RobinhoodYield] LLM failed:", (e as Error).message);
    }

    // Deterministic fallback summary — uses only the real numbers we already have.
    if (!summary) {
      const bits: string[] = [];
      if (featured) {
        bits.push(
          `Featured on Robinhood Chain: Morpho ${featured.vaultName ?? "Steakhouse USDG Vault"} — APY ${featured.apy != null ? featured.apy + "%" : "unknown"}, TVL ${featured.tvlUsd != null ? "$" + Math.round(featured.tvlUsd).toLocaleString() : "unknown"}.`
        );
      }
      if (pools.length) {
        const top = pools[0];
        bits.push(
          `${pools.length} DefiLlama pool${pools.length === 1 ? "" : "s"} tracked on Robinhood Chain; deepest by TVL is ${top.project} ${top.symbol} (APY ${top.apy != null ? top.apy.toFixed(2) + "%" : "unknown"}, TVL ${top.tvlUsd ? "$" + Math.round(top.tvlUsd).toLocaleString() : "unknown"}).`
        );
      }
      bits.push("APYs are variable and gross — not financial advice.");
      summary = bits.join(" ");
    }

    const topPools = pools.map((p) => ({
      protocol: p.project,
      symbol: p.symbol,
      apy: p.apy != null ? +p.apy.toFixed(2) : null,
      apyBase: p.apyBase != null ? +p.apyBase.toFixed(2) : null,
      apyReward: p.apyReward != null ? +p.apyReward.toFixed(2) : null,
      tvlUsd: Math.round(p.tvlUsd),
      ilRisk: p.ilRisk,
      stablecoin: p.stablecoin,
      url: p.url,
    }));

    const dataSources: string[] = [];
    if (featured) dataSources.push(...featured.dataSources);
    if (pools.length) dataSources.push("DefiLlama /pools (chain=Robinhood)");
    if (!dataSources.length) dataSources.push("(all sources failed on this call)");

    return Response.json({
      tool: "robinhood-yield",
      chain: "robinhood",
      chainId: RH_CHAIN_ID,
      verdict,
      verdict_score,
      featured,
      top_pools: topPools,
      pools_scanned: pools.length,
      summary,
      filters: { minTvlUsd: minTvl, limit, asset: asset ?? null },
      data_sources: dataSources,
      disclaimer: "APYs are variable and gross. Robinhood Chain is a new chain — thin liquidity is common. Not financial advice; DYOR before depositing.",
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[RobinhoodYield] Error:", e);
    return Response.json(
      { error: "robinhood-yield failed", message: (e as Error).message },
      { status: 500 }
    );
  }
}
