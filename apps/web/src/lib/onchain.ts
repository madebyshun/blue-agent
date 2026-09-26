// Shared on-chain data layer for Base wallet tools.
// Real numbers only — native ETH balance + nonce via viem RPC, ERC-20 activity
// via Basescan, token identity via multicall, USD prices via DexScreener
// (lib/market-data getTokenMarket). Used to ground the wallet-strategy /
// portfolio-rebalancer tools instead of letting the LLM guess.
//
// Failure is reported as `null`, NEVER as a number or an empty list (#259).
// This header used to read "everything fails soft (null/[])", and the `[]` half
// of that is the bug family, not a safety property: an empty list and a failed
// read render identically, so a rate-limited RPC call becomes "this wallet holds
// nothing" — a confident, complete-looking, WRONG answer. `null` is worse-looking
// and better: the caller is forced to decide what to say about a value it does
// not have. An unread chain value is not a number and not an empty set.
//
// Deleted 2026-09-17 for exactly that reason: `getHoldings` (+ its `Holding`
// type and `holdingsToPrompt` formatter). It returned `[]` on a multicall
// throw, and `holdingsToPrompt` then told the LLM, as fact, "none readable —
// empty wallet or unpriced tokens" about a wallet it had simply failed to read.
// MEASURED before deleting: 11 files import this module, ZERO imported any of
// the three; the live holdings path is `_handlers/wallet-holdings.ts`. Its
// recent #259 decimals fix came from a repo-wide sweep, not from maintenance —
// per CLAUDE.md, "last commit date is NOT evidence a surface is alive".

import { createPublicClient, http, formatEther, formatUnits, parseAbi, isAddress, getAddress } from "viem";
import { base } from "viem/chains";
import { getTokenMarket, type TokenMarket } from "@/lib/market-data";

const RPC = process.env.BASE_RPC_URL || "https://mainnet.base.org";
const client = createPublicClient({ chain: base, transport: http(RPC) });

const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function totalSupply() view returns (uint256)",
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
  const url = `https://api.etherscan.io/v2/api?chainid=8453&module=account&action=tokentx&address=${addr}&page=1&offset=${offset}&sort=desc${key ? `&apikey=${key}` : ""}`;
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

// ─── Base RPC ground truth (no indexer, no API key) ──────────────────────────

export interface RpcWalletState {
  address: string;
  wei:     string;   // native balance, raw
  eth:     number;
  /** `eth_getTransactionCount` — transactions SENT BY this address. This is the
   *  outbound nonce and is NOT a total transaction count: a wallet that has
   *  only ever received funds reads 0 here while an explorer shows dozens of
   *  transfers. Never surface it under a name like `tx_count`. */
  nonce:   number;
}

/** Native balance + outbound nonce straight from Base RPC — the one wallet
 *  source that needs no indexer and no API key. `null` means the RPC call
 *  itself failed; an empty wallet is `{ eth: 0, nonce: 0 }`, never `null`. */
export async function getRpcWalletState(rawAddr: string): Promise<RpcWalletState | null> {
  const address = normalizeAddress(rawAddr);
  if (!address) return null;
  try {
    const [wei, nonce] = await Promise.all([
      client.getBalance({ address }),
      client.getTransactionCount({ address }),
    ]);
    return { address, wei: wei.toString(), eth: +(+formatEther(wei)).toFixed(6), nonce };
  } catch {
    return null;
  }
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

// ─── Authoritative token/contract identity (the grounding layer) ──────────────
// Decides "is this a contract? a token?" from the CHAIN, not from Basescan
// verification status. eth_getCode is authoritative — if there's bytecode, it's
// a contract, full stop. ERC-20 metadata (name/symbol/decimals/supply) is read
// directly via multicall, so an unverified or Uniswap-v4 token is still
// correctly identified. Market data (DexScreener) is folded in when it's a
// token. Every audit/security tool MUST ground on this instead of letting the
// LLM guess "EOA / not a contract" from missing Basescan metadata.

/**
 * EIP-7702 delegation designator. A `SetCode` authorization writes exactly 23
 * bytes to an EOA: `0xef0100` followed by the 20-byte delegate address.
 *
 * 🔴 `eth_getCode` returns bytecode for such an address, so the plain
 * "code ⟹ contract" test calls it a contract — and every downstream consumer
 * then reports a MetaMask or Alchemy smart-account user as an *unverified
 * contract*, which reads as a warning about the user's own wallet. MEASURED:
 * `0xD5C1…3FAB` (EOA delegated to the MetaMask delegator) came back from
 * risk-gate as `isContract: true, verified: false`.
 *
 * A delegated EOA is still an EOA: it has a private key, it pays for its own
 * transactions, and it is not "a contract someone deployed". So the designator
 * is detected BEFORE the isContract decision, not folded in after it.
 */
const EIP7702_DESIGNATOR = "0xef0100";
const DESIGNATOR_CODE_LEN = 2 + 6 + 40; // "0x" + ef0100 + 20-byte address

/**
 * Decode `eth_getCode` output into a delegate address, or null if it is not a
 * designator. Pure and exported so scripts/eip7702-designator-test.ts can pin
 * it without an RPC — the length check is the part that silently over-matches
 * if someone "simplifies" it to a bare `startsWith`.
 */
export function parseDelegationDesignator(code: string | undefined): string | null {
  if (!code || code.length !== DESIGNATOR_CODE_LEN) return null;
  if (!code.toLowerCase().startsWith(EIP7702_DESIGNATOR)) return null;
  return `0x${code.slice(8).toLowerCase()}`;
}

export interface Delegation {
  /** The contract this EOA currently delegates to. */
  address: string;
  /**
   * The delegate's VERIFIED contract name, read from the explorer — never a
   * hardcoded address→vendor table. A table is a guess that ages silently:
   * vendors redeploy delegators, and a stale row would confidently mislabel
   * the wallet it is supposed to explain. Null when the delegate is unverified.
   */
  label: string | null;
  /** Whether the delegate's source is verified on the explorer. */
  verified: boolean;
}

export interface TokenIdentity {
  address: string;
  isContract: boolean;          // eth_getCode returned bytecode (7702 EOAs excluded — see below)
  isToken: boolean;             // standard ERC-20 metadata readable
  name: string | null;
  symbol: string | null;
  decimals: number | null;
  totalSupply: number | null;   // human-readable (divided by 10^decimals)
  market: TokenMarket | null;   // DexScreener Base pair, null if unlisted
  /** Non-null only for an EIP-7702 delegated EOA. `isContract` is false here. */
  delegation: Delegation | null;
}

export async function getTokenIdentity(rawAddr: string): Promise<TokenIdentity | null> {
  const address = normalizeAddress(rawAddr);
  if (!address) return null;

  const code = await client.getCode({ address }).catch(() => undefined);
  const hasCode = !!code && code !== "0x";

  // Read the designator first: a delegated EOA has code, but is not a contract.
  let delegation: Delegation | null = null;
  const delegate = parseDelegationDesignator(code);
  if (delegate) {
    const src = await getSourceSignals(delegate).catch(() => null);
    delegation = { address: delegate, label: src?.contractName ?? null, verified: src?.verified ?? false };
  }
  const isContract = hasCode && delegation === null;

  let name: string | null = null, symbol: string | null = null,
      decimals: number | null = null, totalSupply: number | null = null;

  if (isContract) {
    try {
      const res = await client.multicall({
        allowFailure: true,
        contracts: [
          { address, abi: ERC20, functionName: "name" } as const,
          { address, abi: ERC20, functionName: "symbol" } as const,
          { address, abi: ERC20, functionName: "decimals" } as const,
          { address, abi: ERC20, functionName: "totalSupply" } as const,
        ],
      });
      if (res[0]?.status === "success") name = res[0].result as string;
      if (res[1]?.status === "success") symbol = res[1].result as string;
      if (res[2]?.status === "success") decimals = Number(res[2].result as number);
      if (res[3]?.status === "success" && decimals != null) {
        totalSupply = +(+formatUnits(res[3].result as bigint, decimals)).toFixed(2);
      }
    } catch { /* leave metadata null */ }
  }

  const isToken = isContract && symbol != null && decimals != null;
  const market = isToken ? await getTokenMarket(address) : null;

  return { address, isContract, isToken, name, symbol, decimals, totalSupply, market, delegation };
}

// Scan VERIFIED Solidity source for privileged / risk-bearing functions and
// report each category as PRESENT or ABSENT — these are facts from the actual
// code, so a consumer must trust them over pattern speculation. Reporting ABSENT
// explicitly is what stops the LLM from guessing "blacklist likely present
// (standard Ownable pattern)" when the source clearly has no such function.
export function scanSourceSignals(src: string): string[] {
  const s = src;
  const out: string[] = [];

  // mint — the headline supply/dilution vector.
  if (/function\s+mint\s*\(/i.test(s)) {
    const ownerMint = /function\s+mint\s*\([^)]*\)[^{;]*\b(onlyOwner|onlyMinter|onlyRole|owner|admin|MINTER)/i.test(s);
    out.push(ownerMint
      ? "mint(): PRESENT, owner/minter-controlled — total supply is NOT fixed; a privileged key can inflate supply (dilution / soft-rug). HIGH, or CRITICAL if uncapped and ownership not renounced."
      : "mint(): PRESENT — confirm access control + cap (supply-inflation risk).");
  } else {
    out.push("mint(): ABSENT — no inflation path; supply set at deploy.");
  }

  // blacklist / pause / fee — report present OR absent. For a token, ABSENCE of
  // these admin levers is a POSITIVE (decentralization; no owner censorship/rug
  // switch), NOT a risk — label it so the consumer does not flip it into a risk.
  out.push(/black[_]?list|deny[_]?list|isBlacklisted|_blacklist|blocklist/i.test(s)
    ? "blacklist/denylist: PRESENT — addresses can be blocked from transferring (censorship / honeypot-style risk)."
    : "blacklist/denylist: ABSENT — no address can be censored/frozen (POSITIVE: no freeze lever; this is NOT a risk for a token).");
  out.push(/function\s+pause\s*\(|whenNotPaused|_pause\s*\(|Pausable/i.test(s)
    ? "pausable: PRESENT — transfers/trading can be halted by a privileged role."
    : "pausable: ABSENT — trading cannot be halted by an admin (POSITIVE: no owner kill-switch; this is NOT a risk for a plain ERC-20).");
  out.push(/setFee|setTax|_taxFee|setMaxTx|setMaxWallet|maxWallet|maxTransaction|excludeFromFee/i.test(s)
    ? "fee/limit controls: PRESENT — tax, maxWallet, or maxTx can throttle or tax trades."
    : "fee/limit controls: ABSENT — no transfer tax or wallet/tx caps (POSITIVE: clean, unrestricted transfer mechanics).");

  // owner privileges (Ownable OR solmate's Owned).
  out.push(/\bonlyOwner\b|Ownable|\bOwned\b/i.test(s)
    ? "owner privileges: PRESENT (onlyOwner/Ownable/Owned). 'Non-proxy / immutable bytecode' does NOT remove owner power — check whether ownership is renounced."
    : "owner privileges: none detected.");

  if (/function\s+burn(From)?\s*\(/i.test(s)) out.push("burn(): PRESENT (supply can be reduced).");
  return out;
}

// Fetch verified source from Etherscan V2 (Base) and return privileged-function
// signals. Returns [] if unverified / unreadable. Used by audit-style tools.
export async function getSourceSignals(address: string): Promise<{ verified: boolean; contractName: string | null; signals: string[] }> {
  const addr = normalizeAddress(address);
  if (!addr) return { verified: false, contractName: null, signals: [] };
  const key = process.env.BASESCAN_API_KEY ?? "";
  try {
    const r = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getsourcecode&address=${addr}&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json() as { status: string; result?: { ContractName?: string; SourceCode?: string }[] };
    if (d.status === "1" && d.result?.length) {
      const src = d.result[0].SourceCode ?? "";
      const verified = src.length > 0;
      return { verified, contractName: d.result[0].ContractName ?? null, signals: verified ? scanSourceSignals(src) : [] };
    }
  } catch { /* fall through */ }
  return { verified: false, contractName: null, signals: [] };
}

export function tokenIdentityToPrompt(t: TokenIdentity): string {
  if (t.delegation) {
    const d = t.delegation;
    return [
      `Address ${t.address} (Base, chain 8453): eth_getCode returned an EIP-7702 delegation designator (0xef0100 + address) — this is an externally-owned account (EOA / normal wallet) that has delegated its code to ${d.address}.`,
      `It is NOT a deployed contract and NOT a token. Delegating is a normal, user-initiated wallet upgrade (MetaMask, Alchemy, Bitget and others ship 7702 accounts).`,
      d.label
        ? `The delegate's source IS verified on the explorer, under the name "${d.label}".`
        : `The delegate's source is NOT verified on the explorer. Report that as an unknown, NOT as evidence of wrongdoing — most delegates are unverified.`,
      `Do NOT describe this address as an "unverified contract" and do NOT raise a risk score because it has code. The only thing worth flagging is the DELEGATE, and only on its own evidence.`,
    ].join("\n");
  }
  if (!t.isContract) {
    return `Address ${t.address} (Base, chain 8453): eth_getCode returned NO bytecode — this is an externally-owned account (EOA / normal wallet). It is NOT a contract or token. There is no code to audit.`;
  }
  const lines = [
    `Address ${t.address} (Base, chain 8453): eth_getCode returned bytecode — this IS a deployed smart contract (verified by direct RPC read, authoritative).`,
  ];
  if (t.isToken) {
    lines.push(`On-chain ERC-20 metadata (authoritative, read via multicall): name="${t.name ?? "?"}", symbol="${t.symbol ?? "?"}", decimals=${t.decimals ?? "?"}, totalSupply=${t.totalSupply ?? "?"}.`);
  } else {
    lines.push(`Standard ERC-20 metadata is NOT readable — this is a non-token contract (router, pool, multisig, proxy, etc.), not an ERC-20 token.`);
  }
  if (t.market) {
    // Authoritative FDV = live price × on-chain total supply. An external feed's
    // FDV often implies a stale/different supply (e.g. VVV: DexScreener FDV uses
    // ~80M while on-chain total is 114M) — prefer the on-chain-derived figure.
    const fdvOnChain = (t.market.priceUsd != null && t.totalSupply != null) ? t.market.priceUsd * t.totalSupply : t.market.fdv;
    lines.push(`Live market (DexScreener, ${t.market.dex ?? "?"} — DEEPEST single Base pool only; total cross-DEX liquidity may be higher):`);
    lines.push(`- price ~$${t.market.priceUsd ?? "?"} (VOLATILE live snapshot — varies by source/pool and by the second; do NOT present as a fixed price)`);
    lines.push(`- 24h change ${t.market.change.h24 ?? "?"}% | 24h volume ${fmtUsd(t.market.volume24h)} | liquidity ${fmtUsd(t.market.liquidityUsd)} (this pool)`);
    lines.push(`- circulating market cap ${fmtUsd(t.market.marketCap)} (external estimate) | FDV ${fmtUsd(fdvOnChain)} (= price × on-chain total supply ${t.totalSupply ?? "?"} — AUTHORITATIVE; ignore any external FDV that implies a different supply)`);
    lines.push(`- The market-cap-vs-FDV gap is ALREADY-MINTED but non-circulating supply (treasury/locked/vesting) — a SEPARATE dilution source from an uncapped mint() (which creates NEW tokens beyond total supply). Do NOT merge the two into one "dilution" claim.`);
    lines.push(`Active two-sided DEX liquidity and real volume are strong evidence the token is tradeable (NOT a honeypot).`);
  } else if (t.isToken) {
    lines.push(`No DexScreener Base pair found — little or no DEX liquidity, or not indexed. Absence of a listing is NOT by itself evidence of a scam.`);
  }
  return lines.join("\n");
}
