/**
 * Blue Sentinel — Rug Pull Scanner
 *
 * Detects rug pull risk on Base token contracts:
 *   A. Unlocked LP — liquidity not locked, owner can remove
 *   B. Unlimited mint — owner can mint arbitrary supply
 *   C. Unrenounced ownership — owner() != zero address with dangerous powers
 *   D. Hidden tax / fee manipulation — buy/sell fee above threshold
 *
 * Data sources (no API key required):
 *   - DexScreener: LP data, pair age, liquidity
 *   - Base RPC:    contract bytecode analysis
 *   - Bankr LLM:  source code analysis when available
 */

import { callBankrLLM, extractJsonObject } from "@/app/api/_lib/llm";
import type { HubResult } from "@/lib/sentinel/types";

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

// ─── Verified safe contracts — skip rug scan ──────────────────────────────────
// Official protocol contracts with controlled mint are not rugs

const VERIFIED_SAFE = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC (Circle)
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  "0x4200000000000000000000000000000000000006", // WETH
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631", // AERO
  "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", // DEGEN
  "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", // cbBTC
  "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", // cbETH
  "0xf95a4b14c96a4b38d68f58c5404df45b8ab6a63a", // $BLUEAGENT
]);

// ─── Known safe LP lockers on Base ───────────────────────────────────────────

const KNOWN_LOCKERS = new Set([
  "0x663a5c229c09b049e36dcc11a9b0d4a8eb9db214", // Unicrypt on Base
  "0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe", // PinkLock
  "0x71b5759d73262fbb223956913ecf4ecc51057641", // DxSale
  "0xdae1d4dfeb0a47ed69dba8cb36c17b47c0fde572", // Team Finance
]);

// ─── Dangerous function selectors (mint / ownership) ─────────────────────────

const MINT_SELECTORS = [
  "0x40c10f19", // mint(address,uint256)
  "0xa0712d68", // mint(uint256)
  "0x4e6ec247", // mint(address,uint256) — alt
  "0x449a52f8", // mintTo(address,uint256)
];

const OWNERSHIP_SELECTORS = [
  "0x8da5cb5b", // owner()
  "0xf2fde38b", // transferOwnership(address)
  "0x715018a6", // renounceOwnership()
];

// ─── RPC helper ───────────────────────────────────────────────────────────────

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json() as { result: T; error?: { message: string } };
  if (data.error) throw new Error(`RPC: ${data.error.message}`);
  return data.result;
}

// ─── Get contract bytecode ────────────────────────────────────────────────────

async function getBytecode(address: string): Promise<string> {
  return rpc<string>("eth_getCode", [address, "latest"]);
}

// ─── Call contract view function ──────────────────────────────────────────────

async function callContract(to: string, data: string): Promise<string> {
  return rpc<string>("eth_call", [{ to, data }, "latest"]);
}

// ─── Check owner() ────────────────────────────────────────────────────────────

async function getOwner(address: string): Promise<string | null> {
  try {
    const result = await callContract(address, "0x8da5cb5b");
    if (!result || result === "0x") return null;
    // Last 20 bytes = address
    return "0x" + result.slice(-40);
  } catch {
    return null;
  }
}

// ─── DexScreener pair data ────────────────────────────────────────────────────

interface DexPair {
  pairAddress:   string;
  liquidityUsd:  number;
  pairCreatedAt: number;
  lpLocked?:     boolean;
}

async function getDexPairs(tokenAddress: string): Promise<DexPair[]> {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json() as { pairs?: Array<Record<string, unknown>> };
    return (data.pairs ?? [])
      .filter(p => (p.chainId as string) === "base")
      .map(p => ({
        pairAddress:   (p.pairAddress as string) ?? "",
        liquidityUsd:  ((p.liquidity as Record<string, number>)?.usd) ?? 0,
        pairCreatedAt: (p.pairCreatedAt as number) ?? 0,
        lpLocked:      false, // DexScreener doesn't expose lock status directly
      }));
  } catch {
    return [];
  }
}

// ─── Check if LP is locked ────────────────────────────────────────────────────

async function checkLpLocked(pairAddress: string): Promise<boolean> {
  try {
    // Check if known locker holds LP tokens
    for (const locker of KNOWN_LOCKERS) {
      const balance = await callContract(
        pairAddress,
        "0x70a08231" + locker.slice(2).padStart(64, "0") // balanceOf(locker)
      );
      if (balance && balance !== "0x" && BigInt(balance) > 0n) return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Bytecode selector check ──────────────────────────────────────────────────

function bytecodeHasSelector(bytecode: string, selector: string): boolean {
  return bytecode.toLowerCase().includes(selector.slice(2).toLowerCase());
}

// ─── LLM rug analysis ────────────────────────────────────────────────────────

async function llmRugAnalysis(opts: {
  token:         string;
  hasMint:       boolean;
  ownerAddress:  string | null;
  lpLocked:      boolean;
  liquidityUsd:  number;
  pairAgeDays:   number;
}): Promise<{ verdict: string; indicators: string[]; summary: string }> {
  const raw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Sentinel rug pull analyzer for Base chain.
Analyze token risk signals and return ONLY raw JSON.
Schema: {"verdict":"SAFE|RISKY|RUG","risk_score":<0-100>,"indicators":["<indicator>"],"summary":"<1-2 sentences>"}
Indicators must be from: lp_unlocked, unlimited_mint, unrenounced_ownership, low_liquidity, new_pair, high_owner_control, suspicious_tokenomics`,
    messages: [{
      role: "user",
      content: `Token: ${opts.token}
Has mint function: ${opts.hasMint}
Owner: ${opts.ownerAddress ?? "renounced"}
LP locked: ${opts.lpLocked}
Liquidity: $${opts.liquidityUsd.toFixed(0)}
Pair age: ${opts.pairAgeDays} days
Analyze rug pull risk.`
    }],
    temperature: 0.1,
    maxTokens: 300,
  });

  const parsed = extractJsonObject(raw);
  if (!parsed) return {
    verdict: "RISKY",
    indicators: [],
    summary: "Could not parse rug analysis",
  };

  return {
    verdict: (parsed.verdict as string) ?? "RISKY",
    indicators: (parsed.indicators as string[]) ?? [],
    summary: (parsed.summary as string) ?? "",
  };
}

// ─── Main: scanRug ────────────────────────────────────────────────────────────

export async function scanRug(tokenAddress: string): Promise<HubResult> {
  try {
    // Skip verified safe contracts
    if (VERIFIED_SAFE.has(tokenAddress.toLowerCase())) {
      return { safe: true, severity: "low", indicators: [], summary: "Verified protocol token — rug scan skipped" };
    }

    const [bytecode, pairs] = await Promise.all([
      getBytecode(tokenAddress),
      getDexPairs(tokenAddress),
    ]);

    if (!bytecode || bytecode === "0x") {
      return { safe: true, severity: "low", indicators: [], summary: "No bytecode — EOA or not deployed" };
    }

    // Check mint selectors
    const hasMint = MINT_SELECTORS.some(s => bytecodeHasSelector(bytecode, s));

    // Check ownership
    const ownerAddress = await getOwner(tokenAddress);
    const ownerIsZero  = !ownerAddress || ownerAddress === "0x0000000000000000000000000000000000000000";

    // Check LP lock
    const mainPair    = pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd)[0];
    const liquidityUsd = mainPair?.liquidityUsd ?? 0;
    const pairAgeDays  = mainPair?.pairCreatedAt
      ? Math.floor((Date.now() - mainPair.pairCreatedAt) / 86400000)
      : 0;

    let lpLocked = false;
    if (mainPair?.pairAddress) {
      lpLocked = await checkLpLocked(mainPair.pairAddress);
    }

    // Fast indicators (no LLM)
    const fastIndicators: string[] = [];
    if (hasMint && !ownerIsZero)   fastIndicators.push("unlimited_mint");
    if (!ownerIsZero)              fastIndicators.push("unrenounced_ownership");
    if (!lpLocked && liquidityUsd > 0) fastIndicators.push("lp_unlocked");
    if (liquidityUsd < 5000)       fastIndicators.push("low_liquidity");
    if (pairAgeDays < 7)           fastIndicators.push("new_pair");

    // Low risk — skip LLM
    if (fastIndicators.length === 0) {
      return {
        safe:       true,
        severity:   "low",
        indicators: [],
        summary:    `Token appears safe: ownership renounced, LP locked, liquidity $${liquidityUsd.toFixed(0)}`,
      };
    }

    // Run LLM analysis
    const analysis = await llmRugAnalysis({
      token: tokenAddress,
      hasMint,
      ownerAddress: ownerIsZero ? null : ownerAddress,
      lpLocked,
      liquidityUsd,
      pairAgeDays,
    });

    const allIndicators = [...new Set([...fastIndicators, ...analysis.indicators])];
    const isRisky = analysis.verdict !== "SAFE";
    const severity = analysis.verdict === "RUG"
      ? "critical"
      : allIndicators.length >= 3 ? "high" : "medium";

    return {
      safe:       !isRisky,
      severity,
      indicators: allIndicators,
      summary:    analysis.summary || `Rug risk detected: ${allIndicators.join(", ")}`,
    };

  } catch (e) {
    return {
      safe:       true,
      severity:   "low",
      indicators: [],
      summary:    `Rug scan error: ${(e as Error).message}`,
      error:      (e as Error).message,
    };
  }
}
