// x402/robinhood-honeypot-check
// Honeypot token detection on Robinhood Chain (chainId 4663).
// Price: $0.10 — verdict: SAFE / HONEYPOT / SUSPICIOUS
//
// Ported from honeypot-check.ts (Base). Two substitutions:
//   1. Basescan/Etherscan v2 → Blockscout (robinhoodchain.blockscout.com)
//   2. DexScreener  → GeckoTerminal `robinhood` network (DexScreener does not
//      index RH). Market signal (liquidity/volume) is a green flag.
//
// Rest of the pipeline (Bankr LLM + MiroShark synthesis, hard-mapped verdict)
// is deliberately identical to the Base version so behavior stays consistent
// across chains.

import { createPublicClient, http, erc20Abi, getAddress } from "viem";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { getRobinhoodTokenMarket } from "@/lib/market-data";
import { getBlockscoutContractSource, getBlockscoutTokenInfo, blockscoutUrl } from "@/lib/blockscout";

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.2, tokens = 600): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system,
      messages: [{ role: "user", content: user }] as Msg[],
      temperature: temp,
      max_tokens: tokens,
    }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}

function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch {
    try { return JSON.parse(s.replace(/[\x00-\x1F\x7F]/g, " ")); } catch { return null; }
  }
}

const rhClient = createPublicClient({ chain: robinhoodMainnet, transport: http() });

// Lightweight on-chain identity for a Robinhood Chain address: contract? token?
// Reads name/symbol/decimals via multicall — same shape as onchain.getTokenIdentity
// but scoped to just what honeypot-check needs, and pointed at RH RPC.
async function getRhIdentity(address: `0x${string}`): Promise<{
  isContract: boolean;
  isToken: boolean;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
}> {
  try {
    const code = await rhClient.getCode({ address });
    const isContract = !!code && code !== "0x";
    if (!isContract) return { isContract: false, isToken: false, name: null, symbol: null, decimals: null };
    const results = await rhClient.multicall({
      contracts: [
        { address, abi: erc20Abi, functionName: "name" },
        { address, abi: erc20Abi, functionName: "symbol" },
        { address, abi: erc20Abi, functionName: "decimals" },
      ],
      allowFailure: true,
    });
    const name = results[0].status === "success" ? String(results[0].result) : null;
    const symbol = results[1].status === "success" ? String(results[1].result) : null;
    const decimals = results[2].status === "success" ? Number(results[2].result) : null;
    const isToken = name !== null && symbol !== null && decimals !== null;
    return { isContract, isToken, name, symbol, decimals };
  } catch {
    return { isContract: false, isToken: false, name: null, symbol: null, decimals: null };
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { token?: string; address?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const url = new URL(req.url);
    const address = (body.token ?? body.address ?? url.searchParams.get("token") ?? url.searchParams.get("address") ?? "").trim();

    if (!address) return Response.json({ error: "token address is required" }, { status: 400 });
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return Response.json({ error: "Invalid address format. Must be 0x + 40 hex chars." }, { status: 400 });
    }

    const checksum = getAddress(address);

    // Real signals in parallel: on-chain identity, Blockscout verification,
    // Blockscout ERC-20 metadata (holders/supply), GeckoTerminal RH market.
    const [identity, source, tokenInfo, market] = await Promise.all([
      getRhIdentity(checksum),
      getBlockscoutContractSource(checksum),
      getBlockscoutTokenInfo(checksum),
      getRobinhoodTokenMarket(checksum),
    ]);

    // EOA / non-token short-circuit — an EOA or non-token contract cannot be
    // honeypot-checked. Match the Base handler behaviour.
    if (identity.isContract && !identity.isToken && !tokenInfo) {
      return Response.json({
        tool: "robinhood-honeypot-check",
        timestamp: new Date().toISOString(),
        address: checksum,
        chain: "robinhood",
        chainId: 4663,
        token: { name: null, symbol: null, decimals: null, verified: !!source?.verified, url: blockscoutUrl(checksum) },
        verdict: "NOT_A_TOKEN",
        action: "N/A",
        confidence: 0,
        is_honeypot: false,
        sell_tax_estimate: "n/a",
        buy_tax_estimate: "n/a",
        red_flags: [],
        green_flags: [],
        honeypot_patterns: [],
        community: { alert: "none", known_rug: false, rug_patterns: [], signal: "" },
        assessment: `This is a non-token contract${source?.contractName ? ` (${source.contractName})` : ""} on Robinhood Chain — infrastructure such as a liquidity pool or router, not an ERC-20 token. A honeypot check only applies to tradeable tokens.`,
        data_sources: ["RH RPC (eth_getCode + ERC-20 metadata)", "Blockscout (verification)"],
      });
    }
    if (!identity.isContract) {
      return Response.json({
        tool: "robinhood-honeypot-check",
        timestamp: new Date().toISOString(),
        address: checksum,
        chain: "robinhood",
        chainId: 4663,
        token: { name: null, symbol: null, decimals: null, verified: false, url: blockscoutUrl(checksum) },
        verdict: "NOT_A_TOKEN",
        action: "N/A",
        confidence: 0,
        is_honeypot: false,
        sell_tax_estimate: "n/a",
        buy_tax_estimate: "n/a",
        red_flags: [],
        green_flags: [],
        honeypot_patterns: [],
        community: { alert: "none", known_rug: false, rug_patterns: [], signal: "" },
        assessment: "This address is an externally-owned account (EOA / normal wallet) on Robinhood Chain, not a token contract — there is nothing to honeypot-check.",
        data_sources: ["RH RPC (eth_getCode)"],
      });
    }

    const name = identity.name ?? tokenInfo?.name ?? null;
    const symbol = identity.symbol ?? tokenInfo?.symbol ?? null;
    const decimals = identity.decimals ?? tokenInfo?.decimals ?? null;
    const verified = !!source?.verified;
    const hasMarket = market !== null;
    const liquidityUsd = market?.liquidityUsd ?? null;
    const volume24h = market?.volume24h ?? null;
    const holders = tokenInfo?.holders ?? null;

    const tokenCtx = `
Token: ${name ?? "(unknown)"} (${symbol ?? "?"}) on Robinhood Chain (chainId 4663).
Contract: ${checksum}. Decimals: ${decimals ?? "?"}.
Blockscout: source verified = ${verified}${source?.contractName ? `, contract name = ${source.contractName}` : ""}${source?.isProxy ? " (proxy contract)" : ""}.
Blockscout token info: holders = ${holders ?? "?"}, total supply = ${tokenInfo?.totalSupply ?? "?"}.
GeckoTerminal (robinhood): ${hasMarket ? `market found — price $${market!.priceUsd ?? "?"}, liquidity $${liquidityUsd ?? "?"}, 24h volume $${volume24h ?? "?"}, 24h change ${market!.change.h24 ?? "?"}%` : "no active pools found (no market data — this alone is NOT a honeypot signal, only means we cannot corroborate tradability)"}.

An unverified Blockscout source is common for legitimate tokens and is NOT, by itself, a honeypot signal. Active two-sided liquidity + real 24h volume are strong green flags.
`.trim();

    // Blue Agent honeypot analysis + MiroShark degen signal, in parallel.
    const [blueRaw, msRaw] = await Promise.all([
      llm(
        `You are Blue Agent — token security specialist for Robinhood Chain (chainId 4663).
Analyze whether this token is a honeypot (buy works, sell blocked or taxed to 100%).
Key honeypot patterns: trading disabled post-launch, massive sell tax (>50%), blacklist abuse, ownership not renounced with dangerous functions, transfer() reverts on sell.

EVIDENCE RULES (critical — avoid false positives):
- Only set is_honeypot=true when there is CONCRETE evidence of a sell restriction (sell blocked, sell tax >50%, blacklist, trading disabled, or a known rug). With no such evidence, set is_honeypot=false.
- Missing Blockscout verification, missing metadata, or an unfamiliar token name is NOT evidence of a honeypot. Do NOT flag on absence of information.
- Healthy DEX liquidity and real 24h volume (in the context) are strong evidence the token is tradeable — weight them as green flags, not red.
- Robinhood Chain is a NEW chain — many legitimate tokens have thin market data. Do not penalize a token merely for being new/small on RH.
- Do NOT invent tax numbers. If you cannot determine a tax, use "unknown" — never "extreme".
- Set confidence to reflect EVIDENCE strength, not how scary the unknowns feel.

CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "is_honeypot": <boolean>,
  "confidence": <0-100>,
  "sell_tax_estimate": "<0%|high|extreme|unknown>",
  "buy_tax_estimate": "<0%|low|high|unknown>",
  "red_flags": ["<flag>" or empty],
  "green_flags": ["<flag>" or empty],
  "honeypot_patterns": ["<pattern>" or empty],
  "assessment": "<2 sentences — is this safe to trade?>"
}`,
        tokenCtx,
        0.2,
        500
      ),
      llm(
        `You are MiroShark — degen intelligence on Robinhood Chain.
Give community signal on this token — is it a known rug/honeypot? Any red flags from the community? Known scam patterns?
RH is newer than Base so many tokens have no community history — say so plainly rather than inventing signal.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "community_alert": "none|watch|danger",
  "known_rug": <boolean>,
  "rug_patterns": ["<pattern>" or empty],
  "community_signal": "<1-2 sentences>"
}`,
        tokenCtx,
        0.3,
        300
      ),
    ]);

    const blue = parseJson(blueRaw) ?? {
      is_honeypot: false,
      confidence: 50,
      sell_tax_estimate: "unknown",
      buy_tax_estimate: "unknown",
      red_flags: [],
      green_flags: [
        ...(verified ? ["source verified on Blockscout"] : []),
        ...(hasMarket && (liquidityUsd ?? 0) > 0 ? ["active DEX liquidity on Robinhood Chain"] : []),
      ],
      honeypot_patterns: [],
      assessment: "Automated honeypot analysis was inconclusive (no concrete sell-block evidence found). This is not a honeypot verdict — verify liquidity and try a small test sell before trading.",
    };

    const ms = parseJson(msRaw) ?? {
      community_alert: "watch",
      known_rug: false,
      rug_patterns: [],
      community_signal: "No community data available.",
    };

    // Deterministic verdict — hard-mapped from the numeric fields the LLM
    // filled in, never from the LLM picking a word.
    const isHoneypot = blue.is_honeypot || ms.known_rug;
    const confidence = (blue.confidence ?? 50) as number;
    const verdict = isHoneypot ? "HONEYPOT" : confidence >= 70 ? "SAFE" : "SUSPICIOUS";
    const action = verdict === "HONEYPOT" ? "DO_NOT_BUY" : verdict === "SUSPICIOUS" ? "DYOR" : "SAFE_TO_TRADE";

    return Response.json({
      tool: "robinhood-honeypot-check",
      timestamp: new Date().toISOString(),
      address: checksum,
      chain: "robinhood",
      chainId: 4663,
      token: {
        name,
        symbol,
        decimals,
        verified,
        liquidityUsd,
        volume24h,
        holders,
        url: blockscoutUrl(checksum),
      },
      verdict,
      action,
      confidence,
      is_honeypot: isHoneypot,
      sell_tax_estimate: blue.sell_tax_estimate ?? "unknown",
      buy_tax_estimate: blue.buy_tax_estimate ?? "unknown",
      red_flags: blue.red_flags ?? [],
      green_flags: blue.green_flags ?? [],
      honeypot_patterns: blue.honeypot_patterns ?? [],
      community: {
        alert: ms.community_alert ?? "watch",
        known_rug: ms.known_rug ?? false,
        rug_patterns: ms.rug_patterns ?? [],
        signal: ms.community_signal ?? "",
      },
      assessment: blue.assessment ?? "",
      data_sources: [
        "RH RPC (eth_getCode + ERC-20 metadata)",
        "Blockscout (contract verification + token metadata)",
        ...(hasMarket ? ["GeckoTerminal robinhood (market data)"] : []),
      ],
    });
  } catch (error) {
    console.error("[RobinhoodHoneypotCheck]", error);
    return Response.json(
      { error: "Robinhood honeypot check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
