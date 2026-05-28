/**
 * Blue Sentinel — Drain & Malicious Approval Scanner
 *
 * Detects two related threats:
 *   A. Wallet drain contracts — request unlimited approvals then sweep assets
 *   B. Malicious approvals  — infinite ERC-20 approve to unverified contracts
 *
 * Detection methods:
 *   1. Bytecode drainer selector fingerprint (4-byte matching)
 *   2. Recent Approval events with MAX_UINT256 value on Base
 *   3. Bankr LLM analysis of contract behavior
 *
 * Data sources:
 *   - Base RPC: eth_getLogs for Approval events, eth_getCode for bytecode
 *   - Bankr LLM: contract intent analysis
 */

import { callBankrLLM, extractJsonObject } from "@/app/api/_lib/llm";
import { DRAINER_SELECTORS } from "@/lib/sentinel/phishing-dna";
import type { HubResult } from "@/lib/sentinel/types";

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

// ERC-20 Approval(address indexed owner, address indexed spender, uint256 value)
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";

// MAX_UINT256 — infinite approval
const MAX_UINT256 = "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

// Known legitimate spenders (DEX routers, bridges on Base)
const KNOWN_SAFE_SPENDERS = new Set([
  "0x2626664c2603336e57b271c5c0b26f421741e481", // Uniswap v3 SwapRouter02
  "0x198ef79f1f515f02dfe9e3115ed9fc3cde7c2b3f", // Uniswap v2 Router
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", // Uniswap Universal Router
  "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24", // Uniswap v2 Base
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1d484d7f71", // Aerodrome Router
  "0x420dd381b31aef6683db6b902084cb0ffece40da", // Aerodrome V2 Router
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f", // SushiSwap Router
]);

// ─── RPC helper ───────────────────────────────────────────────────────────────

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(BASE_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(12000),
  });
  const data = await res.json() as { result: T; error?: { message: string } };
  if (data.error) throw new Error(`RPC: ${data.error.message}`);
  return data.result;
}

async function getLatestBlock(): Promise<number> {
  const hex = await rpc<string>("eth_blockNumber", []);
  return parseInt(hex, 16);
}

async function getBytecode(address: string): Promise<string> {
  return rpc<string>("eth_getCode", [address, "latest"]);
}

// ─── Drainer bytecode fingerprint ─────────────────────────────────────────────

function checkDrainerSelectors(bytecode: string): string[] {
  const found: string[] = [];
  const code = bytecode.toLowerCase();
  for (const sig of DRAINER_SELECTORS) {
    if (code.includes(sig.selector.slice(2).toLowerCase())) {
      found.push(sig.name.toLowerCase().replace(/\s+/g, "_"));
    }
  }
  return found;
}

// ─── Recent infinite approvals to this contract ───────────────────────────────

interface ApprovalEvent {
  owner:   string;
  spender: string;
  value:   string;
  txHash:  string;
}

async function getRecentInfiniteApprovals(spenderAddress: string, blocks = 2000): Promise<ApprovalEvent[]> {
  try {
    const latest   = await getLatestBlock();
    const fromBlock = Math.max(0, latest - blocks);

    // Filter: spender = our contract (indexed topic[2])
    const paddedSpender = "0x000000000000000000000000" + spenderAddress.slice(2).toLowerCase();
    const logs = await rpc<Array<{
      topics: string[];
      data:   string;
      transactionHash: string;
    }>>("eth_getLogs", [{
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock:   `0x${latest.toString(16)}`,
      topics:    [APPROVAL_TOPIC, null, paddedSpender],
    }]);

    return logs
      .filter(log => log.data.slice(2).toLowerCase() === MAX_UINT256)
      .map(log => ({
        owner:   "0x" + log.topics[1].slice(26),
        spender: "0x" + log.topics[2].slice(26),
        value:   "MAX_UINT256",
        txHash:  log.transactionHash,
      }));
  } catch {
    return [];
  }
}

// ─── LLM drain analysis ───────────────────────────────────────────────────────

async function llmDrainAnalysis(opts: {
  contract:      string;
  drainerFlags:  string[];
  infiniteApprovals: number;
  bytecodeSize:  number;
}): Promise<{ isDrainer: boolean; severity: string; indicators: string[]; summary: string }> {
  const raw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Sentinel drain contract analyzer for Base.
Analyze if contract is a wallet drainer or enables malicious approvals.
Return ONLY raw JSON.
Schema: {"is_drainer":true|false,"severity":"critical|high|medium|low","indicators":["<indicator>"],"summary":"<1-2 sentences>"}
Indicators from: drainer_contract, unlimited_approval_trap, asset_sweep_function, hidden_transfer, fake_claim_function, approval_phishing`,
    messages: [{
      role: "user",
      content: `Contract: ${opts.contract}
Drainer selectors found: ${opts.drainerFlags.join(", ") || "none"}
Recent infinite approvals received: ${opts.infiniteApprovals}
Bytecode size: ${opts.bytecodeSize} bytes
Analyze: is this a drainer or malicious approval contract?`
    }],
    temperature: 0.1,
    maxTokens: 250,
  });

  const parsed = extractJsonObject(raw);
  if (!parsed) return {
    isDrainer:  false,
    severity:   "low",
    indicators: [],
    summary:    "Analysis unavailable",
  };

  return {
    isDrainer:  (parsed.is_drainer as boolean) ?? false,
    severity:   (parsed.severity as string) ?? "low",
    indicators: (parsed.indicators as string[]) ?? [],
    summary:    (parsed.summary as string) ?? "",
  };
}

// ─── Main: scanDrain ─────────────────────────────────────────────────────────

export async function scanDrain(contractAddress: string): Promise<HubResult> {
  try {
    // Skip known safe spenders
    if (KNOWN_SAFE_SPENDERS.has(contractAddress.toLowerCase())) {
      return { safe: true, severity: "low", indicators: [], summary: "Known safe DEX router" };
    }

    const [bytecode, infiniteApprovals] = await Promise.all([
      getBytecode(contractAddress),
      getRecentInfiniteApprovals(contractAddress),
    ]);

    if (!bytecode || bytecode === "0x") {
      return { safe: true, severity: "low", indicators: [], summary: "No contract bytecode" };
    }

    const drainerFlags   = checkDrainerSelectors(bytecode);
    const approvalCount  = infiniteApprovals.length;
    const bytecodeSize   = (bytecode.length - 2) / 2;

    // Fast pass — no signals
    if (drainerFlags.length === 0 && approvalCount === 0) {
      return { safe: true, severity: "low", indicators: [], summary: "No drainer patterns detected" };
    }

    // Fast indicators
    const fastIndicators: string[] = [];
    if (drainerFlags.length > 0)   fastIndicators.push(...drainerFlags);
    if (approvalCount >= 5)        fastIndicators.push("unlimited_approval_trap");
    if (approvalCount >= 20)       fastIndicators.push("mass_approval_phishing");

    // Run LLM
    const analysis = await llmDrainAnalysis({
      contract: contractAddress,
      drainerFlags,
      infiniteApprovals: approvalCount,
      bytecodeSize,
    });

    const allIndicators = [...new Set([...fastIndicators, ...analysis.indicators])];
    const isDrainer     = analysis.isDrainer || drainerFlags.length >= 2 || approvalCount >= 10;

    const severity = isDrainer
      ? "critical"
      : approvalCount >= 5 || drainerFlags.length >= 1
        ? "high"
        : "medium";

    return {
      safe:       !isDrainer && approvalCount < 5,
      severity:   severity as HubResult["severity"],
      indicators: allIndicators,
      summary:    analysis.summary || `Drain risk: ${allIndicators.slice(0, 3).join(", ")}. ${approvalCount} infinite approvals detected.`,
    };

  } catch (e) {
    return {
      safe:       true,
      severity:   "low",
      indicators: [],
      summary:    `Drain scan error: ${(e as Error).message}`,
      error:      (e as Error).message,
    };
  }
}

// ─── Verified token contracts (expected to have high approval volume) ─────────

const VERIFIED_TOKENS = new Set([
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC
  "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", // USDbC
  "0x4200000000000000000000000000000000000006", // WETH
  "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", // DAI
  "0x940181a94a35a4569e4529a3cdfb74e38fd98631", // AERO
  "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", // DEGEN
]);

// ─── scanMaliciousApproval: scan from token perspective ─────────────────────
// Use when scanning a TOKEN address — finds suspicious spenders being approved

export async function scanMaliciousApprovals(tokenAddress: string): Promise<HubResult> {
  // Verified high-volume tokens — approval volume is expected
  if (VERIFIED_TOKENS.has(tokenAddress.toLowerCase())) {
    return { safe: true, severity: "low", indicators: [], summary: "Verified token — approval volume expected" };
  }
  try {
    const latest    = await getLatestBlock();
    const fromBlock = Math.max(0, latest - 5000); // ~2.5h

    const logs = await rpc<Array<{
      topics: string[];
      data:   string;
      transactionHash: string;
    }>>("eth_getLogs", [{
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock:   `0x${latest.toString(16)}`,
      address:   tokenAddress,
      topics:    [APPROVAL_TOPIC],
    }]);

    // Filter: infinite approvals only
    const infinite = logs.filter(l => l.data.slice(2).toLowerCase() === MAX_UINT256);
    if (infinite.length === 0) {
      return { safe: true, severity: "low", indicators: [], summary: "No infinite approvals found" };
    }

    // Find spenders that are NOT known safe
    const suspiciousSpenders = new Set<string>();
    for (const log of infinite) {
      const spender = "0x" + log.topics[2].slice(26);
      if (!KNOWN_SAFE_SPENDERS.has(spender.toLowerCase())) {
        suspiciousSpenders.add(spender);
      }
    }

    if (suspiciousSpenders.size === 0) {
      return { safe: true, severity: "low", indicators: [], summary: "All infinite approvals are to known-safe DEX routers" };
    }

    const severity = suspiciousSpenders.size >= 3 ? "high" : "medium";
    return {
      safe:       false,
      severity,
      indicators: ["infinite_approval_to_unknown_contract", "malicious_approval"],
      summary:    `${infinite.length} infinite approvals detected, ${suspiciousSpenders.size} to unverified contracts: ${[...suspiciousSpenders].slice(0, 2).join(", ")}`,
    };

  } catch (e) {
    return {
      safe:       true,
      severity:   "low",
      indicators: [],
      summary:    `Approval scan error: ${(e as Error).message}`,
      error:      (e as Error).message,
    };
  }
}
