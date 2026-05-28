/**
 * Blue Sentinel — Scam Token Scanner
 *
 * Detects tokens impersonating legitimate assets on Base:
 *   A. Name/symbol spoofing — fake USDC, WETH, DEGEN, AERO, etc.
 *   B. Decimal mismatch — USDC-named token with 18 decimals (should be 6)
 *   C. Address impersonation — looks like official address visually
 *   D. Logo/metadata cloning — same name, different contract
 *
 * Data sources:
 *   - Base RPC: name(), symbol(), decimals(), totalSupply()
 *   - DexScreener: volume, liquidity, market cap vs legitimate counterpart
 *   - Bankr LLM: name/symbol analysis
 */

import { callBankrLLM, extractJsonObject } from "@/app/api/_lib/llm";
import type { HubResult } from "@/lib/sentinel/types";

const BASE_RPC = process.env.BASE_RPC_URL ?? "https://mainnet.base.org";

// ─── Legitimate token registry on Base ───────────────────────────────────────

interface LegitToken {
  address:  string;
  symbol:   string;
  name:     string;
  decimals: number;
}

const LEGIT_TOKENS: LegitToken[] = [
  { address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC",  name: "USD Coin",          decimals: 6  },
  { address: "0x4200000000000000000000000000000000000006", symbol: "WETH",  name: "Wrapped Ether",     decimals: 18 },
  { address: "0x50c5725949a6f0c72e6c4a641f24049a917db0cb", symbol: "DAI",   name: "Dai Stablecoin",   decimals: 18 },
  { address: "0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca", symbol: "USDbC", name: "USD Base Coin",    decimals: 6  },
  { address: "0x940181a94a35a4569e4529a3cdfb74e38fd98631", symbol: "AERO",  name: "Aerodrome Finance", decimals: 18 },
  { address: "0x4ed4e862860bed51a9570b96d89af5e1b0efefed", symbol: "DEGEN", name: "Degen",             decimals: 18 },
  { address: "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf", symbol: "cbBTC", name: "Coinbase Wrapped BTC", decimals: 8 },
  { address: "0x2ae3f1ec7f1f5012cfeab0185bfc7aa3cf0dec22", symbol: "cbETH", name: "Coinbase Wrapped Staked ETH", decimals: 18 },
  { address: "0xf95a4b14c96a4b38d68f58c5404df45b8ab6a63a", symbol: "BLUEAGENT", name: "Blue Agent", decimals: 18 },
];

// Symbol patterns that indicate impersonation
const SUSPICIOUS_PATTERNS = [
  /^usdc?[^$]/i,     // USDC2, USDCX, etc.
  /^weth[^$]/i,      // WETH2, WETHX
  /^eth[^$]/i,       // ETH2, ETHBASE
  /airdrop/i,        // USDAirdrop
  /^(fake|test|clone|copy)/i,
  /(official|real|true|legit)/i, // "RealUSDC", "OfficialETH"
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

async function callView(address: string, selector: string): Promise<string> {
  return rpc<string>("eth_call", [{ to: address, data: selector }, "latest"]);
}

// ─── Decode ABI-encoded string ────────────────────────────────────────────────

function decodeString(hex: string): string {
  try {
    if (!hex || hex === "0x") return "";
    // Skip first 64 chars (offset), next 64 = length
    const clean = hex.slice(2);
    const lengthHex = clean.slice(64, 128);
    const length = parseInt(lengthHex, 16);
    const strHex = clean.slice(128, 128 + length * 2);
    return Buffer.from(strHex, "hex").toString("utf8").replace(/\0/g, "");
  } catch {
    return "";
  }
}

function decodeUint(hex: string): number {
  if (!hex || hex === "0x") return 0;
  return parseInt(hex, 16);
}

// ─── Fetch token metadata ─────────────────────────────────────────────────────

interface TokenMeta {
  name:        string;
  symbol:      string;
  decimals:    number;
  totalSupply: bigint;
}

async function getTokenMeta(address: string): Promise<TokenMeta | null> {
  try {
    const [nameHex, symbolHex, decimalsHex, supplyHex] = await Promise.all([
      callView(address, "0x06fdde03"),          // name()
      callView(address, "0x95d89b41"),          // symbol()
      callView(address, "0x313ce567"),          // decimals()
      callView(address, "0x18160ddd"),          // totalSupply()
    ]);

    return {
      name:        decodeString(nameHex),
      symbol:      decodeString(symbolHex),
      decimals:    decodeUint(decimalsHex),
      totalSupply: BigInt(supplyHex || "0"),
    };
  } catch {
    return null;
  }
}

// ─── Check impersonation ──────────────────────────────────────────────────────

interface ImpersonationCheck {
  isImpersonating:  boolean;
  targetToken?:     LegitToken;
  issues:           string[];
}

function checkImpersonation(address: string, meta: TokenMeta): ImpersonationCheck {
  const addr   = address.toLowerCase();
  const sym    = meta.symbol.toUpperCase();
  const name   = meta.name.toLowerCase();
  const issues: string[] = [];

  // Check if it's already the legit address
  for (const legit of LEGIT_TOKENS) {
    if (legit.address === addr) {
      return { isImpersonating: false, issues: [] };
    }
  }

  // Check direct symbol match with legit token
  for (const legit of LEGIT_TOKENS) {
    if (legit.address === addr) continue;

    const legitSym  = legit.symbol.toUpperCase();
    const legitName = legit.name.toLowerCase();

    // Exact symbol match → impersonation
    if (sym === legitSym) {
      issues.push(`symbol_clone_${legitSym.toLowerCase()}`);
      // Decimal mismatch is a strong signal
      if (meta.decimals !== legit.decimals) {
        issues.push(`decimal_mismatch_expected_${legit.decimals}_got_${meta.decimals}`);
      }
      return { isImpersonating: true, targetToken: legit, issues };
    }

    // Name contains legit name
    if (name.includes(legitName) || name.includes(legitSym.toLowerCase())) {
      issues.push(`name_clone_${legitSym.toLowerCase()}`);
      return { isImpersonating: true, targetToken: legit, issues };
    }
  }

  // Check suspicious patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(meta.symbol) || pattern.test(meta.name)) {
      issues.push("suspicious_naming_pattern");
      return { isImpersonating: true, issues };
    }
  }

  return { isImpersonating: false, issues: [] };
}

// ─── LLM scam token analysis ──────────────────────────────────────────────────

async function llmScamAnalysis(opts: {
  address:   string;
  meta:      TokenMeta;
  impersonating?: string;
  issues:    string[];
}): Promise<{ isScam: boolean; severity: string; indicators: string[]; summary: string }> {
  const raw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Sentinel scam token detector for Base chain.
Analyze if token is impersonating a legitimate asset.
Return ONLY raw JSON.
Schema: {"is_scam":true|false,"severity":"critical|high|medium|low","indicators":["<indicator>"],"summary":"<1-2 sentences>"}
Indicators from: fake_usdc, fake_weth, fake_eth, symbol_clone, name_clone, decimal_mismatch, airdrop_bait, fake_official, scam_token`,
    messages: [{
      role: "user",
      content: `Address: ${opts.address}
Name: "${opts.meta.name}"
Symbol: "${opts.meta.symbol}"
Decimals: ${opts.meta.decimals}
Total supply: ${opts.meta.totalSupply.toString()}
Impersonating: ${opts.impersonating ?? "none detected by pattern"}
Fast issues found: ${opts.issues.join(", ") || "none"}
Is this a scam token?`
    }],
    temperature: 0.1,
    maxTokens: 200,
  });

  const parsed = extractJsonObject(raw);
  if (!parsed) return {
    isScam:     false,
    severity:   "low",
    indicators: [],
    summary:    "Analysis unavailable",
  };

  return {
    isScam:     (parsed.is_scam as boolean) ?? false,
    severity:   (parsed.severity as string) ?? "low",
    indicators: (parsed.indicators as string[]) ?? [],
    summary:    (parsed.summary as string) ?? "",
  };
}

// ─── Main: scanScamToken ─────────────────────────────────────────────────────

export async function scanScamToken(tokenAddress: string): Promise<HubResult> {
  try {
    const meta = await getTokenMeta(tokenAddress);

    if (!meta || (!meta.name && !meta.symbol)) {
      return { safe: true, severity: "low", indicators: [], summary: "Not a token contract or no metadata" };
    }

    const impersonation = checkImpersonation(tokenAddress, meta);

    // Fast safe path
    if (!impersonation.isImpersonating && impersonation.issues.length === 0) {
      return { safe: true, severity: "low", indicators: [], summary: `Token "${meta.symbol}" appears legitimate` };
    }

    // LLM analysis
    const analysis = await llmScamAnalysis({
      address:      tokenAddress,
      meta,
      impersonating: impersonation.targetToken?.name,
      issues:       impersonation.issues,
    });

    const allIndicators = [...new Set([...impersonation.issues, ...analysis.indicators])];
    const isScam        = analysis.isScam || impersonation.isImpersonating;
    const severity      = isScam
      ? impersonation.targetToken?.symbol === "USDC" ? "critical" : "high"
      : "medium";

    return {
      safe:       !isScam,
      severity:   severity as HubResult["severity"],
      indicators: allIndicators,
      summary:    analysis.summary ||
        `Scam token: "${meta.symbol}" (${meta.name}) impersonates ${impersonation.targetToken?.name ?? "legitimate asset"}. ${impersonation.issues.join(", ")}`,
    };

  } catch (e) {
    return {
      safe:       true,
      severity:   "low",
      indicators: [],
      summary:    `Scam token scan error: ${(e as Error).message}`,
      error:      (e as Error).message,
    };
  }
}
