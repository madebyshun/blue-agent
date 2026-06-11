// Shared on-chain data layer for Base wallet tools.
// Real numbers only — native ETH balance + nonce via viem RPC, ERC-20 activity
// via Basescan, current token balances via multicall, USD prices via DexScreener
// (lib/market-data getTokenMarket). Everything fails soft (null/[]) so handlers
// can degrade to a labelled advisory instead of 500ing. Used to ground the
// wallet-strategy / portfolio-rebalancer tools instead of letting the LLM guess.

import { createPublicClient, http, formatEther, formatUnits, parseAbi, isAddress, getAddress } from "viem";
import { base } from "viem/chains";
import { getTokenMarket } from "@/lib/market-data";

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const client = createPublicClient({ chain: base, transport: http(RPC) });

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
]);

export function normalizeAddress(addr: string): `0x${string}` | null {
  try { return isAddress(addr) ? getAddress(addr) : null; } catch { return null; }
}

// ─── Basescan: ERC-20 transfer history → activity profile ─────────────────────

type BscanTokenTx = {
  contractAddress?: string; tokenSymbol?: string; tokenDecimal?: string;
  from?: string; to?: string; value?: string; timeStamp?: string;
};

async function basescanTokenTx(addr: string, offset = 200): Promise<BscanTokenTx[]> {
  const key = process.env.BASESCAN_API_KEY ?? "";
  const url = `https://api.basescan.org/api?module=account&action=tokentx&address=${addr}&page=1&offset=${offset}&sort=desc${key ? `&apikey=${key}` : ""}`;
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    const d = (await r.json()) as { status?: string; result?: BscanTokenTx[] | string };
    return Array.isArray(d.result) ? d.result : [];
  } catch { return []; }
}

export interface TokenActivity {
  contractAddress: string;
  symbol: string;
  transfers: number;
  inflows: number;
  outflows: number;
}

export interface WalletSnapshot {
  address: string;
  ethBalance: number | null;        // native ETH (Base)
  txCount: number | null;           // total outbound tx nonce
  transferCount: number;            // ERC-20 transfers seen (capped sample)
  distinctTokens: number;
  lastActivityDays: number | null;  // days since most recent ERC-20 transfer
  topTokens: TokenActivity[];       // most-traded tokens (desc)
}

// Real wallet activity snapshot from live Base RPC + Basescan. null if unreadable.
export async function getWalletSnapshot(rawAddr: string): Promise<WalletSnapshot | null> {
  const address = normalizeAddress(rawAddr);
  if (!address) return null;

  const lower = address.toLowerCase();
  const [balRes, nonceRes, txs] = await Promise.all([
    client.getBalance({ address }).catch(() => null),
    client.getTransactionCount({ address }).catch(() => null),
    basescanTokenTx(address),
  ]);

  // Aggregate ERC-20 activity per token.
  const byToken = new Map<string, TokenActivity>();
  let newest = 0;
  for (const t of txs) {
    const ca = (t.contractAddress ?? "").toLowerCase();
    if (!ca) continue;
    const entry = byToken.get(ca) ?? { contractAddress: ca, symbol: t.tokenSymbol ?? "?", transfers: 0, inflows: 0, outflows: 0 };
    entry.transfers++;
    if ((t.to ?? "").toLowerCase() === lower) entry.inflows++;
    if ((t.from ?? "").toLowerCase() === lower) entry.outflows++;
    byToken.set(ca, entry);
    const ts = Number(t.timeStamp ?? 0);
    if (ts > newest) newest = ts;
  }
  const topTokens = [...byToken.values()].sort((a, b) => b.transfers - a.transfers).slice(0, 12);
  const lastActivityDays = newest ? Math.floor((Date.now() / 1000 - newest) / 86_400) : null;

  return {
    address,
    ethBalance: balRes === null ? null : +(+formatEther(balRes)).toFixed(5),
    txCount: nonceRes ?? null,
    transferCount: txs.length,
    distinctTokens: byToken.size,
    lastActivityDays,
    topTokens,
  };
}

// ─── Current token holdings (exact via multicall) + USD value (DexScreener) ───

export interface Holding {
  contractAddress: string;
  symbol: string;
  balance: number;
  priceUsd: number | null;
  valueUsd: number | null;
  allocationPct: number | null;
}

// Reads current balanceOf for the given token contracts (multicall), prices the
// top ones via DexScreener, returns positions sorted by USD value desc.
export async function getHoldings(rawAddr: string, contracts: string[], priceTop = 8): Promise<Holding[]> {
  const address = normalizeAddress(rawAddr);
  if (!address || !contracts.length) return [];
  const tokens = contracts.map(normalizeAddress).filter((a): a is `0x${string}` => !!a).slice(0, 12);
  if (!tokens.length) return [];

  // Multicall balanceOf + decimals + symbol for each token.
  const calls = tokens.flatMap((t) => [
    { address: t, abi: ERC20, functionName: "balanceOf", args: [address] } as const,
    { address: t, abi: ERC20, functionName: "decimals" } as const,
    { address: t, abi: ERC20, functionName: "symbol" } as const,
  ]);
  let results: { status: "success" | "failure"; result?: unknown }[] = [];
  try {
    results = await client.multicall({ contracts: calls, allowFailure: true });
  } catch { return []; }

  const raw: { contractAddress: string; symbol: string; balance: number }[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const bal = results[i * 3];
    const dec = results[i * 3 + 1];
    const sym = results[i * 3 + 2];
    if (bal?.status !== "success") continue;
    const decimals = dec?.status === "success" ? Number(dec.result as number) : 18;
    const balance = +(+formatUnits(bal.result as bigint, decimals)).toFixed(6);
    if (balance <= 0) continue;
    raw.push({ contractAddress: tokens[i].toLowerCase(), symbol: sym?.status === "success" ? (sym.result as string) : "?", balance });
  }
  if (!raw.length) return [];

  // Price the first `priceTop` (by raw order = transfer-frequency order) via DexScreener.
  const priced = await Promise.all(
    raw.map(async (h, idx) => {
      if (idx >= priceTop) return { ...h, priceUsd: null, valueUsd: null };
      const m = await getTokenMarket(h.contractAddress);
      const priceUsd = m?.priceUsd ?? null;
      return { ...h, priceUsd, valueUsd: priceUsd != null ? +(priceUsd * h.balance).toFixed(2) : null };
    })
  );

  const totalUsd = priced.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
  return priced
    .map((h) => ({ ...h, allocationPct: h.valueUsd != null && totalUsd > 0 ? +((h.valueUsd / totalUsd) * 100).toFixed(1) : null }))
    .sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
}

// ─── Prompt formatters — compact real-number context for the LLM ──────────────

const fmtUsd = (n: number | null) =>
  n == null ? "?" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${n.toFixed(2)}`;

export function snapshotToPrompt(s: WalletSnapshot): string {
  const top = s.topTokens.slice(0, 8).map((t) => `${t.symbol}(${t.transfers}x, ${t.inflows}in/${t.outflows}out)`).join(", ") || "none";
  return [
    `Wallet: ${s.address} (Base, chain 8453)`,
    `Native ETH balance: ${s.ethBalance ?? "?"} | Total tx (nonce): ${s.txCount ?? "?"}`,
    `ERC-20 transfers (recent sample): ${s.transferCount} across ${s.distinctTokens} tokens`,
    `Last on-chain activity: ${s.lastActivityDays === null ? "unknown" : `${s.lastActivityDays}d ago`}`,
    `Most-traded tokens: ${top}`,
  ].join("\n");
}

export function holdingsToPrompt(h: Holding[]): string {
  if (!h.length) return "Current holdings: (none readable — empty wallet or unpriced tokens)";
  const total = h.reduce((s, x) => s + (x.valueUsd ?? 0), 0);
  return [
    `Current holdings (live balanceOf + DexScreener price), total ${fmtUsd(total)}:`,
    ...h.map((x, i) => `${i + 1}. ${x.symbol} — ${x.balance} (${x.valueUsd != null ? fmtUsd(x.valueUsd) : "unpriced"}${x.allocationPct != null ? `, ${x.allocationPct}%` : ""})`),
  ].join("\n");
}
