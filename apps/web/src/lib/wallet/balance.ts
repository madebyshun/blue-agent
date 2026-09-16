/**
 * Wallet balance reader — live on-chain ETH + major-token balances on Base.
 * ZERO LLM, ZERO price feed: reports only raw on-chain amounts (no fabricated
 * USD value). One RPC round-trip via Multicall3 (native ETH + ERC-20 balanceOf
 * batched together). Never throws — returns an `error` field instead.
 *
 * Uses only the public Base RPC (mainnet.base.org / sepolia.base.org).
 */

import { createPublicClient, http, formatUnits, isAddress, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";
import { BASE_MAJORS, NATIVE_SENTINEL } from "@/lib/wallet/token-trust";

type Network = "mainnet" | "sepolia";

const NETWORKS: Record<Network, { chain: Chain; rpc: string; explorer: string }> = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org", explorer: "https://basescan.org" },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org" },
};

/** Canonical Multicall3 — same address on every chain incl. Base + Base Sepolia. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/**
 * Curated major tokens per network. decimals/symbol are constants (no extra reads).
 *
 * The mainnet list is DERIVED from `BASE_MAJORS` rather than retyped: this file
 * used to carry its own copy of the same three addresses, which meant the token
 * a fallback balance was read from and the token `token-trust.ts` is willing to
 * vouch for were two independent constants that only happened to agree.
 */
const TOKENS: Record<Network, Array<{ symbol: string; address: `0x${string}`; decimals: number }>> = {
  mainnet: BASE_MAJORS
    .filter(t => !t.native)
    .map(t => ({ symbol: t.sym, address: t.addr, decimals: t.decimals })),
  sepolia: [
    { symbol: "USDC", address: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", decimals: 6  },
    { symbol: "WETH", address: "0x4200000000000000000000000000000000000006", decimals: 18 },
  ],
};

/** One shared ABI with both reads so the multicall `contracts` array stays a
 *  single homogeneous type (mixing two `as const` ABIs breaks viem's tuple
 *  inference). Each entry just picks the function it needs. */
const BALANCE_ABI = [
  {
    type: "function", name: "balanceOf", stateMutability: "view",
    inputs:  [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function", name: "getEthBalance", stateMutability: "view",
    inputs:  [{ name: "addr", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface WalletBalance {
  symbol: string;
  amount: string;   // human-readable, e.g. "1.234"
  raw:    string;   // raw uint256 as string
  /** Token contract this balance was actually read from; native ETH uses the
   *  ERC-20 sentinel. Carried out because the CALLER cannot re-derive it: a
   *  symbol does not identify a token, and `holdings.ts` needs the address to
   *  classify trust rather than guess from the ticker. */
  address:  `0x${string}`;
  decimals: number;
  isNative?: boolean;
}

export interface BalanceLookup {
  address:    string;
  network:    Network;
  explorer:   string;
  addressUrl: string;
  balances:   WalletBalance[];
  /**
   * Reads that did not come back. Their rows are DROPPED, never emitted as `0n`,
   * so any total derived from `balances` is a LOWER BOUND whenever this is > 0.
   *
   * This used to be `: 0n` on both branches below, which is the bug that made
   * 158,707,811 USDC disappear from a portfolio that rendered as complete — see
   * the note on the read itself. A caller cannot distinguish "not held" from
   * "not read" unless the reader tells it, so the reader tells it.
   */
  unread:     number;
  error?:     string;
}

/** Accept base/baseSepolia AND mainnet/sepolia → canonical mainnet/sepolia. */
function normalizeNetwork(n: string): Network {
  const v = n.toLowerCase();
  if (v === "base" || v === "mainnet") return "mainnet";
  return "sepolia";
}

/** Trim trailing zeros from a formatted decimal string ("1.2300" → "1.23", "5.0" → "5"). */
function trimAmount(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "") || "0";
}

export async function checkBalance(address: string, network: string): Promise<BalanceLookup> {
  const net = normalizeNetwork(network);
  const cfg = NETWORKS[net];
  const addressUrl = `${cfg.explorer}/address/${address}`;

  if (!isAddress(address)) {
    // Nothing was ATTEMPTED, so nothing is unread — the input was rejected, and
    // blaming the chain for a bad address is how "unavailable" stops meaning
    // anything. Same distinction `base-token-discovery.ts` draws.
    return { address, network: net, explorer: cfg.explorer, addressUrl, balances: [], unread: 0, error: "Invalid wallet address." };
  }

  const tokens = TOKENS[net];
  const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc) });

  try {
    // One batched call: native ETH (via Multicall3.getEthBalance) + every ERC-20
    // balanceOf. The contracts array mixes two function names on one ABI, which
    // breaks viem's homogeneous-tuple inference — cast it and type the results.
    type MCResult = { status: "success"; result: bigint } | { status: "failure"; error: unknown };
    const results = (await client.multicall({
      allowFailure: true,
      contracts: [
        { address: MULTICALL3, abi: BALANCE_ABI, functionName: "getEthBalance", args: [address as `0x${string}`] },
        ...tokens.map(t => ({
          address: t.address, abi: BALANCE_ABI, functionName: "balanceOf", args: [address as `0x${string}`],
        })),
      ] as never,
    })) as unknown as MCResult[];

    const balances: WalletBalance[] = [];
    let unread = 0;

    /**
     * A read that did not answer is DROPPED and counted, never coerced to `0n`.
     *
     * Both branches below used to end in `: 0n`, and `allowFailure: true` makes
     * that silent — a per-call failure is a `status: "failure"` entry, not a
     * thrown error, so nothing downstream could tell "holds nothing" from
     * "didn't come back". MEASURED 2026-09-12 on the public Base RPC: individual
     * reads answer `{"code":-32016,"message":"over rate limit"}` under load, and
     * a reader that zeroes those emits a complete-LOOKING portfolio missing its
     * entire position. Multicall3 makes it one call so this is now rare — but
     * "rare" is exactly when a silent wrong number does the most damage, because
     * nobody is watching for it.
     *
     * Dropping rather than emitting a null row also keeps the existing contract:
     * `holdings.ts` already discards `raw === "0"`, so an unread major is absent
     * either way. The difference is that `unread` now travels with it.
     */
    const raw = (r: MCResult | undefined): bigint | null =>
      r?.status === "success" ? (r.result as bigint) : null;

    // [0] = native ETH
    const ethRaw = raw(results[0]);
    if (ethRaw === null) unread++;
    else balances.push({
      symbol: "ETH", amount: trimAmount(formatUnits(ethRaw, 18)), raw: ethRaw.toString(),
      address: NATIVE_SENTINEL as `0x${string}`, decimals: 18, isNative: true,
    });

    // [1..] = ERC-20 tokens (same order as `tokens`)
    tokens.forEach((t, i) => {
      const bal = raw(results[i + 1]);
      if (bal === null) { unread++; return; }
      balances.push({
        symbol: t.symbol, amount: trimAmount(formatUnits(bal, t.decimals)), raw: bal.toString(),
        address: t.address, decimals: t.decimals,
      });
    });

    return { address, network: net, explorer: cfg.explorer, addressUrl, balances, unread };
  } catch (e) {
    // The whole batch failed, so NOTHING was read — every token is unread, and
    // saying so keeps `unread: 0` meaning "the list is complete" in every branch.
    return {
      address, network: net, explorer: cfg.explorer, addressUrl, balances: [],
      unread: tokens.length + 1,
      error: (e as Error)?.message ?? "Balance lookup failed.",
    };
  }
}
