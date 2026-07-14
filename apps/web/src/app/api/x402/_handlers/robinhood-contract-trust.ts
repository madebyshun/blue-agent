// x402/robinhood-contract-trust
// Contract Trust for Robinhood Chain (chainId 4663) — on-chain identity +
// Blockscout verification + Blue security + MiroShark signal.
// Price: $0.15 — SAFE / CAUTION / RED_FLAG verdict before swapping into a contract.
//
// Ported from contract-trust.ts (Base). Substitutions:
//   1. `getTokenIdentity` (Base RPC) → local RH RPC identity read (viem client
//      against `robinhoodMainnet`).
//   2. `getBasescanSource` → `getBlockscoutContractSource`.
//   3. External community-trust sources (GoPlus etc.) have no Robinhood Chain
//      coverage today — we surface this explicitly as `coverage: "limited"`
//      rather than pretending we have a signal and defaulting to a low score.

import { createPublicClient, http, erc20Abi, getAddress } from "viem";
import { robinhoodMainnet } from "@/lib/robinhood/chains";
import { getRobinhoodTokenMarket } from "@/lib/market-data";
import { getBlockscoutContractSource, getBlockscoutTokenInfo, blockscoutUrl } from "@/lib/blockscout";

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.3, tokens = 800): Promise<string> {
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

async function getRhContractSnapshot(address: `0x${string}`): Promise<{
  isContract: boolean;
  isToken: boolean;
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: string | null;
}> {
  try {
    const code = await rhClient.getCode({ address });
    const isContract = !!code && code !== "0x";
    if (!isContract) return { isContract: false, isToken: false, name: null, symbol: null, decimals: null, totalSupply: null };
    const results = await rhClient.multicall({
      contracts: [
        { address, abi: erc20Abi, functionName: "name" },
        { address, abi: erc20Abi, functionName: "symbol" },
        { address, abi: erc20Abi, functionName: "decimals" },
        { address, abi: erc20Abi, functionName: "totalSupply" },
      ],
      allowFailure: true,
    });
    const name = results[0].status === "success" ? String(results[0].result) : null;
    const symbol = results[1].status === "success" ? String(results[1].result) : null;
    const decimals = results[2].status === "success" ? Number(results[2].result) : null;
    const totalSupply = results[3].status === "success" ? String(results[3].result) : null;
    const isToken = name !== null && symbol !== null && decimals !== null;
    return { isContract, isToken, name, symbol, decimals, totalSupply };
  } catch {
    return { isContract: false, isToken: false, name: null, symbol: null, decimals: null, totalSupply: null };
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string; context?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}
    const url = new URL(req.url);
    const address = (body.address ?? url.searchParams.get("address") ?? "").trim();
    const context = body.context ?? url.searchParams.get("context") ?? "";

    if (!address) return Response.json({ error: "address is required (Robinhood Chain mainnet contract address)" }, { status: 400 });
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return Response.json({ error: "Invalid address format. Must be 0x + 40 hex chars." }, { status: 400 });
    }

    const checksum = getAddress(address);

    // Step 1: parallel — RH RPC identity, Blockscout source, Blockscout token
    // info, RH market snapshot (deepest pool).
    const [identity, source, tokenInfo, market] = await Promise.all([
      getRhContractSnapshot(checksum),
      getBlockscoutContractSource(checksum),
      getBlockscoutTokenInfo(checksum),
      getRobinhoodTokenMarket(checksum),
    ]);

    // EOA short-circuit — same as Base handler: no contract → no trust check.
    if (!identity.isContract) {
      return Response.json({
        tool: "robinhood-contract-trust",
        timestamp: new Date().toISOString(),
        address: checksum,
        chain: "robinhood",
        chainId: 4663,
        blockscout: { verified: false, contractName: null, isProxy: false, url: blockscoutUrl(checksum) },
        security: { score: null, verified: false, proxy_risk: "n/a", red_flags: [], green_flags: [], attack_vectors: [], known_pattern: "EOA", assessment: "This address is an externally-owned account (EOA / wallet) on Robinhood Chain, not a smart contract — there is no contract to trust-check." },
        community: { trust: "n/a", recognition: "wallet", degen_flags: [], verdict: "", coverage: "n/a" },
        verdict: "NOT_A_CONTRACT",
        confidence: 100,
        headline: "Not a contract — this is a wallet address",
        action: "N/A",
        summary: "No contract code exists at this address on Robinhood Chain. If you meant to check a token or protocol, paste its contract address.",
        checklist: [],
        data_sources: ["RH RPC (eth_getCode)"],
      });
    }

    // Consolidate ground-truth prompt from real signals.
    const hasMarket = market !== null;
    const liquidityUsd = market?.liquidityUsd ?? null;
    const volume24h = market?.volume24h ?? null;
    const contractCtx = `
GROUND TRUTH (direct Robinhood Chain RPC + Blockscout reads — authoritative, do NOT contradict). If the section below says the address has bytecode, it IS a contract. An unverified Blockscout source is common for legitimate tokens and is NOT, by itself, grounds for RED_FLAG. Active liquidity + real volume are evidence of legitimacy. RH is a NEW chain so absence of external community signal is expected — treat it as UNKNOWN, not as a negative.

Contract: ${checksum} on Robinhood Chain (chainId 4663).
On-chain identity (via multicall):
- has bytecode: yes (this IS a smart contract, verified by direct RPC read)
- ERC-20 metadata read: ${identity.isToken ? `name="${identity.name}", symbol="${identity.symbol}", decimals=${identity.decimals}, totalSupply=${identity.totalSupply ?? "?"}` : "no ERC-20 surface — this is a non-token contract (likely pool/router/proxy)"}
- Blockscout token info: ${tokenInfo ? `name="${tokenInfo.name ?? "?"}", symbol="${tokenInfo.symbol ?? "?"}", holders=${tokenInfo.holders ?? "?"}, type=${tokenInfo.type ?? "?"}` : "not indexed as a token by Blockscout"}

Blockscout verification: ${source ? `verified=${source.verified}, contractName=${source.contractName ?? "?"}, compilerVersion=${source.compilerVersion ?? "?"}, license=${source.licenseType ?? "?"}${source.isProxy ? `, proxy → ${source.implementationAddress}` : ""}` : "not found in Blockscout smart-contracts index (either not verified or new)"}

GeckoTerminal robinhood market: ${hasMarket ? `pool found — price $${market!.priceUsd ?? "?"}, liquidity $${liquidityUsd ?? "?"}, 24h volume $${volume24h ?? "?"}, 24h change ${market!.change.h24 ?? "?"}%, dex ${market!.dex ?? "?"}` : "no active pools — cannot corroborate tradability. Not itself a red flag on a new chain."}
${context ? `\nAdditional context from user: ${context}` : ""}
`.trim();

    // Step 2 + 3: Blue security analysis + MiroShark community signal in parallel.
    const [blueRaw, msRaw] = await Promise.all([
      llm(
        `You are Blue Agent — security specialist for Robinhood Chain (chainId 4663).
Analyze a contract for trust signals before a user swaps or interacts with it.
Focus on: verification status, proxy risks, known attack patterns (reentrancy, owner backdoors, mint/burn abuse, fee manipulation, honeypot patterns, rugpull vectors). Robinhood Chain is a new Arbitrum Orbit L2 — do NOT invent known-protocol names.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "security_score": <0-100>,
  "verified": <boolean>,
  "proxy_risk": "none|low|medium|high",
  "red_flags": ["<flag>" or empty],
  "green_flags": ["<flag>" or empty],
  "attack_vectors": ["<vector>" or empty],
  "known_pattern": "<ERC-20|ERC-721|LP|lending|bridge|unknown>",
  "blue_assessment": "<2-3 sentences — direct, no fluff>"
}`,
        contractCtx,
        0.2,
        700
      ),
      llm(
        `You are MiroShark — community intelligence persona on Robinhood Chain.
Assess community trust signals for this contract based on name, address, and provided context. Robinhood Chain is newer than Base — community coverage is limited, so if you do not recognize the contract, say community_trust="unknown" and coverage="limited" instead of guessing "low".
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "community_trust": "high|medium|low|unknown",
  "recognition": "known_protocol|known_token|unknown|suspicious",
  "coverage": "full|limited|none",
  "degen_flags": ["<flag>" or empty],
  "community_verdict": "<1-2 sentences>"
}`,
        contractCtx,
        0.3,
        400
      ),
    ]);

    const verified = !!source?.verified;
    const blue = parseJson(blueRaw) ?? {
      security_score: 50,
      verified,
      proxy_risk: source?.isProxy ? "medium" : "unknown",
      red_flags: [],
      green_flags: verified ? ["source verified on Blockscout"] : [],
      attack_vectors: [],
      known_pattern: identity.isToken ? "ERC-20" : "unknown",
      blue_assessment: "Analysis inconclusive. Proceed with caution.",
    };
    const ms = parseJson(msRaw) ?? {
      community_trust: "unknown",
      recognition: "unknown",
      coverage: "limited",
      degen_flags: [],
      community_verdict: "External community-trust coverage on Robinhood Chain is limited today — cannot confirm or deny.",
    };

    // Step 4: verdict synthesis — same structure as Base, but the "coverage:
    // limited" flag is passed in so the LLM does not treat unknown community
    // signal as a red flag.
    const verdictRaw = await llm(
      `You are Blue Agent — final arbiter for contract trust on Robinhood Chain.
Given security analysis + community signal, issue a final verdict.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "verdict": "SAFE|CAUTION|RED_FLAG",
  "confidence": <0-100>,
  "headline": "<one punchy verdict sentence>",
  "action": "PROCEED|PROCEED_WITH_CAUTION|ABORT",
  "summary": "<2-3 sentences — what matters, what to watch>",
  "checklist": ["<item to verify before interacting>"]
}

Rules (weight CONCRETE signals; do NOT punish a contract merely for unverified source, missing community coverage, or thin liquidity on a NEW chain):
- RED_FLAG if: security_score < 40, OR 2+ concrete red_flags, OR proxy_risk=high, OR recognition=suspicious, OR a known rug/honeypot pattern.
- CAUTION if: proxy_risk=medium, OR (unverified source AND no liquidity AND unrecognized).
- SAFE if: security_score >= 70 AND no red_flags AND (verified OR has healthy liquidity + volume).
- If community coverage is "limited" (RH is new), do NOT penalize — treat unknown recognition as neutral, not negative.
- Unverified source on its own, when the token has real liquidity/volume, is at most a minor caution note — never an automatic RED_FLAG.`,
      `Address: ${checksum} (Robinhood Chain)
Blue security: ${JSON.stringify(blue)}
MiroShark community: ${JSON.stringify(ms)}
Blockscout: verified=${verified}, name=${source?.contractName ?? "?"}, proxy=${!!source?.isProxy}
Market: hasMarket=${hasMarket}, liquidity=$${liquidityUsd ?? "?"}, volume24h=$${volume24h ?? "?"}`,
      0.2,
      600
    );

    const verdict = parseJson(verdictRaw) ?? {
      verdict: "CAUTION",
      confidence: 50,
      headline: "Insufficient data — treat as unverified",
      action: "PROCEED_WITH_CAUTION",
      summary: "Could not fully analyze this contract. Verify on Blockscout before interacting.",
      checklist: ["Check Blockscout for source verification", "Confirm contract is not a honeypot"],
    };

    return Response.json({
      tool: "robinhood-contract-trust",
      timestamp: new Date().toISOString(),
      address: checksum,
      chain: "robinhood",
      chainId: 4663,
      blockscout: {
        verified,
        contractName: source?.contractName ?? null,
        compilerVersion: source?.compilerVersion ?? null,
        isProxy: !!source?.isProxy,
        implementationAddress: source?.implementationAddress ?? null,
        licenseType: source?.licenseType ?? null,
        url: blockscoutUrl(checksum),
      },
      security: {
        score: blue.security_score ?? 50,
        verified: blue.verified ?? verified,
        proxy_risk: blue.proxy_risk ?? "unknown",
        red_flags: blue.red_flags ?? [],
        green_flags: blue.green_flags ?? [],
        attack_vectors: blue.attack_vectors ?? [],
        known_pattern: blue.known_pattern ?? "unknown",
        assessment: blue.blue_assessment ?? "",
      },
      community: {
        trust: ms.community_trust ?? "unknown",
        recognition: ms.recognition ?? "unknown",
        coverage: ms.coverage ?? "limited",
        degen_flags: ms.degen_flags ?? [],
        verdict: ms.community_verdict ?? "",
      },
      market: hasMarket ? { liquidityUsd, volume24h, priceUsd: market!.priceUsd, dex: market!.dex } : null,
      verdict: verdict.verdict ?? "CAUTION",
      confidence: verdict.confidence ?? 50,
      headline: verdict.headline ?? "",
      action: verdict.action ?? "PROCEED_WITH_CAUTION",
      summary: verdict.summary ?? "",
      checklist: verdict.checklist ?? [],
      data_sources: [
        "RH RPC (eth_getCode + ERC-20 metadata)",
        "Blockscout (contract source + token metadata)",
        hasMarket ? "GeckoTerminal robinhood (market data)" : "GeckoTerminal robinhood (no market)",
      ],
    });
  } catch (error) {
    console.error("[RobinhoodContractTrust]", error);
    return Response.json(
      { error: "Robinhood contract trust check failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
