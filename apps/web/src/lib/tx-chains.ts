/**
 * Shared server-side chain + ERC-20 metadata reader for the NON-CUSTODIAL
 * tx-preparation routes (Base 8453 and Robinhood Chain 4663).
 *
 * WHY THIS EXISTS
 * ---------------
 * `api/robinhood/router/send-prepare` and `api/robinhood/router/bridge-prepare`
 * each hand-rolled their own `ERC20_ABI` + decimals cache + native-ETH sentinel
 * set. That was two copies. Adding `api/base/send-prepare` would have made it
 * three, and the MCP execution wrappers (`blue_swap_tx` / `blue_send_tx`) a
 * fourth — at which point "how does this repo decide a token's decimals" has no
 * answer, only four answers that can disagree.
 *
 * ⚠️ THE DECIMALS QUESTION IS A CORRECTNESS QUESTION, NOT AN ERGONOMICS ONE.
 * An agent that is handed a raw base-unit integer field has to do the decimal
 * math itself, and an LLM doing `0.5 USDC → 500000` in its head is exactly the
 * class of fabricated number CLAUDE.md forbids — except here a wrong exponent
 * is a wrong TRANSFER AMOUNT, off by 10^n. So every caller-facing amount in the
 * tx-prepare surface is a DECIMAL STRING IN WHOLE UNITS ("25.5"), and the
 * conversion happens here, in code, against decimals read from the token
 * contract on its own chain. Never widen a tool schema to take base units.
 *
 * ⚠️ CHAIN IS NEVER DEFAULTED. Base 8453 and Robinhood Chain 4663 share no
 * state, and NVDA / META / GOOGL exist as tokenized stocks on BOTH — so an
 * address alone does not identify a token. `TxChain` is a closed union and
 * every entry point takes it explicitly; there is deliberately no fallback
 * value, because a silent default is how a Base read answers an RH question.
 */
import { createPublicClient, http, type PublicClient } from "viem";
import { base } from "viem/chains";
import { robinhoodMainnet } from "@/lib/robinhood/chains";

export type TxChain = "base" | "robinhood";

export interface TxChainCfg {
  chainId: number;
  /** Human label for prose and card headers. */
  label: string;
  explorer: string;
  /** Display name for `explorer` — Basescan vs Blockscout are not swappable. */
  explorerName: string;
}

/**
 * `BASE_RPC_URL` first, matching `bridge-prepare` and `dca/create`. viem's
 * bundled default for Base is the public `mainnet.base.org` endpoint, which
 * rate-limits hard enough that a `decimals()` read fails on a busy minute and
 * surfaces as a bogus "token contract read failed" on a perfectly normal ERC-20.
 */
export const TX_CHAINS: Record<TxChain, TxChainCfg & { rpc: string }> = {
  base: {
    chainId:      base.id,
    label:        "Base",
    explorer:     "https://basescan.org",
    explorerName: "Basescan",
    rpc:          process.env.BASE_RPC_URL ?? base.rpcUrls.default.http[0],
  },
  robinhood: {
    chainId:      robinhoodMainnet.id,
    label:        "Robinhood Chain",
    explorer:     "https://robinhoodchain.blockscout.com",
    explorerName: "Blockscout",
    rpc:          "https://rpc.mainnet.chain.robinhood.com",
  },
};

/** Narrow an untrusted string to a chain key. Returns null rather than guessing. */
export function parseTxChain(v: unknown): TxChain | null {
  return v === "base" || v === "robinhood" ? v : null;
}

/** Minimal ERC-20 surface. `symbol()` is optional per the standard. */
export const ERC20_ABI = [
  { name: "decimals",  type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint8" }] },
  { name: "symbol",    type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "string" }] },
  { name: "transfer",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
] as const;

const clients = new Map<TxChain, PublicClient>();

export function clientFor(chain: TxChain): PublicClient {
  const hit = clients.get(chain);
  if (hit) return hit;
  const c = createPublicClient({
    chain:     chain === "base" ? base : robinhoodMainnet,
    transport: http(TX_CHAINS[chain].rpc),
  }) as PublicClient;
  clients.set(chain, c);
  return c;
}

/**
 * Native-ETH sentinels seen on the wire. Both chains use ETH as gas, so the
 * same set serves both. Relay's convention is the zero address; Uniswap's is
 * the all-`e` marker; humans type "ETH".
 */
const NATIVE_HEX = new Set<string>([
  "0x0000000000000000000000000000000000000000",
  "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
]);

export function isNativeToken(t: string): boolean {
  const s = t.trim();
  if (!s) return true;
  const u = s.toUpperCase();
  if (u === "ETH" || u === "NATIVE") return true;
  return NATIVE_HEX.has(s.toLowerCase());
}

export interface TokenMeta { decimals: number; symbol: string }

/**
 * Decimals and symbol never change, so a per-process cache costs nothing and
 * spares the chain RPC on repeat sends of the same token. Keyed by CHAIN AND
 * ADDRESS, never address alone — the same address on two chains is two
 * different contracts, and a shared key would serve Base decimals for an RH
 * token. TTL 5 minutes, matching the routes this replaced.
 */
const TTL_MS = 5 * 60 * 1000;
const metaCache = new Map<string, TokenMeta & { at: number }>();

export async function readTokenMeta(
  chain: TxChain,
  token: `0x${string}`,
): Promise<TokenMeta> {
  const key = `${chain}:${token.toLowerCase()}`;
  const hit = metaCache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return { decimals: hit.decimals, symbol: hit.symbol };

  const client = clientFor(chain);
  const [decimals, symbol] = await Promise.all([
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "decimals" }),
    client.readContract({ address: token, abi: ERC20_ABI, functionName: "symbol" }).catch(() => ""),
  ]);
  const d = Number(decimals);
  if (!Number.isInteger(d) || d < 0 || d > 30) {
    throw new Error(`Invalid decimals returned by token: ${String(decimals)}`);
  }
  const s = typeof symbol === "string" ? symbol : "";
  metaCache.set(key, { decimals: d, symbol: s, at: Date.now() });
  return { decimals: d, symbol: s };
}

/**
 * Validate a caller-supplied amount as a positive decimal in WHOLE units.
 *
 * Rejects scientific notation, negatives, and NaN up front. `parseUnits` would
 * throw on most of these anyway, but a clean typed rejection lets the caller
 * answer "your request shape is wrong" instead of "the chain broke" — the two
 * are different problems and an agent retrying the wrong one loops forever.
 */
export function isPositiveDecimal(s: string): boolean {
  return /^\d+(\.\d+)?$/.test(s) && Number(s) > 0;
}
