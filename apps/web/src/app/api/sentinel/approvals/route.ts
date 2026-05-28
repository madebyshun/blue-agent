/**
 * Blue Sentinel — Approval Tracker API
 *
 * GET /api/sentinel/approvals?wallet=0x...
 *
 * Scans all active ERC-20 approvals for a wallet on Base.
 * For each (token, spender) pair:
 *   1. Gets current allowance via eth_call
 *   2. Fetches token metadata (name, symbol, decimals)
 *   3. Risk-scores the spender via scanDrain
 *
 * Returns: { approvals: Approval[], scannedAt, wallet, totalActive }
 */

import { NextRequest, NextResponse } from "next/server";
import { scanDrain } from "@/lib/sentinel/drain-scanner";

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

// ERC-20 Approval(address indexed owner, address indexed spender, uint256 value)
const APPROVAL_TOPIC = "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925";
const MAX_UINT256    = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");

// Known safe spenders — skip risk scan
const KNOWN_SAFE = new Set([
  "0x2626664c2603336e57b271c5c0b26f421741e481",
  "0x198ef79f1f515f02dfe9e3115ed9fc3cde7c2b3f",
  "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad",
  "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
  "0xcf77a3ba9a5ca399b7c97c74d54e5b1d484d7f71",
  "0x420dd381b31aef6683db6b902084cb0ffece40da",
  "0xd9e1ce17f2641f24ae83637ab66a2cca9c378b9f",
]);

// ─── RPC helper ───────────────────────────────────────────────────────────────

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await fetch(BASE_RPC, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal:  AbortSignal.timeout(12000),
  });
  const data = await res.json() as { result: T; error?: { message: string } };
  if (data.error) throw new Error(`RPC: ${data.error.message}`);
  return data.result;
}

async function getLatestBlock(): Promise<number> {
  const hex = await rpc<string>("eth_blockNumber", []);
  return parseInt(hex, 16);
}

// ─── Token metadata ───────────────────────────────────────────────────────────

function decodeString(hex: string): string {
  try {
    if (!hex || hex === "0x") return "";
    const clean     = hex.slice(2);
    const lengthHex = clean.slice(64, 128);
    const length    = parseInt(lengthHex, 16);
    if (!length || length > 100) return "";
    const strHex    = clean.slice(128, 128 + length * 2);
    return Buffer.from(strHex, "hex").toString("utf8").replace(/\0/g, "").trim();
  } catch { return ""; }
}

function decodeUint(hex: string): number {
  if (!hex || hex === "0x") return 0;
  return parseInt(hex.slice(-64), 16);
}

interface TokenMeta { name: string; symbol: string; decimals: number }

async function getTokenMeta(address: string): Promise<TokenMeta> {
  try {
    const [nameHex, symbolHex, decimalsHex] = await Promise.all([
      rpc<string>("eth_call", [{ to: address, data: "0x06fdde03" }, "latest"]),
      rpc<string>("eth_call", [{ to: address, data: "0x95d89b41" }, "latest"]),
      rpc<string>("eth_call", [{ to: address, data: "0x313ce567" }, "latest"]),
    ]);
    return {
      name:     decodeString(nameHex)     || address.slice(0, 8) + "…",
      symbol:   decodeString(symbolHex)   || "???",
      decimals: decodeUint(decimalsHex)   || 18,
    };
  } catch {
    return { name: address.slice(0, 8) + "…", symbol: "???", decimals: 18 };
  }
}

// ─── Current allowance ────────────────────────────────────────────────────────

async function getAllowance(token: string, owner: string, spender: string): Promise<bigint> {
  try {
    // allowance(address,address) = 0xdd62ed3e
    const data = "0xdd62ed3e"
      + owner.slice(2).padStart(64, "0")
      + spender.slice(2).padStart(64, "0");
    const hex  = await rpc<string>("eth_call", [{ to: token, data }, "latest"]);
    if (!hex || hex === "0x") return 0n;
    return BigInt(hex);
  } catch { return 0n; }
}

// ─── Format allowance for display ─────────────────────────────────────────────

function formatAllowance(amount: bigint, decimals: number): string {
  if (amount === MAX_UINT256 || amount > MAX_UINT256 / 2n) return "Unlimited ∞";
  const divisor = BigInt(10 ** decimals);
  const whole   = amount / divisor;
  if (whole > 1_000_000n) return `${(Number(whole) / 1_000_000).toFixed(1)}M`;
  if (whole > 1_000n)     return `${(Number(whole) / 1_000).toFixed(1)}K`;
  return whole.toString();
}

// ─── Main export ──────────────────────────────────────────────────────────────

export interface ApprovalItem {
  token:          string;
  tokenName:      string;
  tokenSymbol:    string;
  tokenDecimals:  number;
  spender:        string;
  allowance:      string;   // formatted
  isUnlimited:    boolean;
  isKnownSafe:    boolean;
  riskLevel:      "critical" | "high" | "medium" | "low" | "safe";
  riskSummary:    string;
  indicators:     string[];
  txHash:         string;
}

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet")?.toLowerCase();

  if (!wallet || !/^0x[0-9a-f]{40}$/i.test(wallet)) {
    return NextResponse.json({ error: "Invalid wallet address" }, { status: 400 });
  }

  try {
    const latest    = await getLatestBlock();
    // Scan last ~3 months of Base blocks (~15M blocks total, Base ~2/s)
    // Use 5,000,000 blocks ≈ ~1 month to stay within RPC limits
    const fromBlock = Math.max(0, latest - 5_000_000);

    const paddedOwner = "0x000000000000000000000000" + wallet.slice(2);

    const logs = await rpc<Array<{
      address:         string;
      topics:          string[];
      data:            string;
      transactionHash: string;
      blockNumber:     string;
    }>>("eth_getLogs", [{
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock:   `0x${latest.toString(16)}`,
      topics:    [APPROVAL_TOPIC, paddedOwner],
    }]);

    // Dedupe: keep latest log per (token, spender)
    const pairMap = new Map<string, typeof logs[0]>();
    for (const log of logs) {
      const token   = log.address.toLowerCase();
      const spender = "0x" + log.topics[2].slice(26);
      const key     = `${token}:${spender}`;
      const existing = pairMap.get(key);
      if (!existing || parseInt(log.blockNumber, 16) > parseInt(existing.blockNumber, 16)) {
        pairMap.set(key, log);
      }
    }

    // Check current allowances in parallel (batch 10 at a time)
    const pairs   = [...pairMap.entries()];
    const results: ApprovalItem[] = [];

    const BATCH = 10;
    for (let i = 0; i < pairs.length; i += BATCH) {
      const batch = pairs.slice(i, i + BATCH);

      const batchResults = await Promise.all(
        batch.map(async ([key, log]) => {
          const token   = log.address.toLowerCase();
          const spender = ("0x" + log.topics[2].slice(26)).toLowerCase();

          // Check current allowance
          const allowance = await getAllowance(token, wallet, spender);
          if (allowance === 0n) return null; // Already revoked or spent

          const [meta] = await Promise.all([getTokenMeta(token)]);
          const isUnlimited  = allowance >= MAX_UINT256 / 2n;
          const isKnownSafe  = KNOWN_SAFE.has(spender);

          // Risk score the spender
          let riskLevel: ApprovalItem["riskLevel"] = "safe";
          let riskSummary = "Known safe protocol";
          let indicators: string[] = [];

          if (!isKnownSafe) {
            try {
              const scan   = await scanDrain(spender);
              riskLevel    = scan.safe
                ? (isUnlimited ? "medium" : "low")
                : scan.severity as ApprovalItem["riskLevel"];
              riskSummary  = scan.summary;
              indicators   = scan.indicators;
            } catch {
              riskLevel   = isUnlimited ? "medium" : "low";
              riskSummary = "Could not analyze spender";
            }
          }

          return {
            token,
            tokenName:     meta.name,
            tokenSymbol:   meta.symbol,
            tokenDecimals: meta.decimals,
            spender,
            allowance:     formatAllowance(allowance, meta.decimals),
            isUnlimited,
            isKnownSafe,
            riskLevel,
            riskSummary,
            indicators,
            txHash:        log.transactionHash,
          } satisfies ApprovalItem;
        })
      );

      results.push(...batchResults.filter((r): r is ApprovalItem => r !== null));
    }

    // Sort: critical first, then by unlimited
    const sorted = results.sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3, safe: 4 };
      const diff  = (order[a.riskLevel] ?? 5) - (order[b.riskLevel] ?? 5);
      if (diff !== 0) return diff;
      return (b.isUnlimited ? 1 : 0) - (a.isUnlimited ? 1 : 0);
    });

    return NextResponse.json({
      wallet,
      totalActive:   sorted.length,
      critical:      sorted.filter(a => a.riskLevel === "critical").length,
      high:          sorted.filter(a => a.riskLevel === "high").length,
      unlimited:     sorted.filter(a => a.isUnlimited).length,
      approvals:     sorted,
      scannedAt:     new Date().toISOString(),
      blockRange:    { from: fromBlock, to: latest },
    });

  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message },
      { status: 500 }
    );
  }
}
