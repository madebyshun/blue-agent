/**
 * Wallet holdings reader — the FULL live token list a Base wallet holds.
 *
 * PRIMARY source: Moralis `/wallets/{address}/tokens` — returns every token with
 * a non-zero balance (native ETH included), no hardcoded list, no fabrication.
 * FALLBACK (no Moralis key / Moralis down): the curated-token RPC multicall in
 * ./balance.ts — limited to ETH + a few majors, flagged `partial` so the UI can
 * say "connect Moralis for the full portfolio".
 *
 * B20 tokens (Beryl-20, address prefix 0xb200…) are confirmed on-chain via the
 * B20Factory.isB20() read so the card can badge + deep-link them. ZERO LLM.
 */

import { createPublicClient, http, isAddress, type Chain } from "viem";
import { base, baseSepolia } from "viem/chains";
import { B20_FACTORY_ADDRESS, FACTORY_ABI } from "@/lib/b20/inspect-abi";
import { getWalletTokenBalances } from "@/lib/moralis";
import { checkBalance } from "@/lib/wallet/balance";

type Network = "mainnet" | "sepolia";

const NETS: Record<Network, { chain: Chain; rpc: string; explorer: string; moralis: "base" | "base sepolia" }> = {
  mainnet: { chain: base,        rpc: "https://mainnet.base.org", explorer: "https://basescan.org",         moralis: "base"         },
  sepolia: { chain: baseSepolia, rpc: "https://sepolia.base.org", explorer: "https://sepolia.basescan.org", moralis: "base sepolia" },
};

/** Symbols treated as stablecoins for the display sort (native → stable → B20 → rest). */
const STABLES = new Set(["USDC", "USDT", "DAI", "USDBC", "USDC.E", "USDE", "EURC", "PYUSD", "USDM", "CRVUSD"]);

export interface WalletHolding {
  symbol:    string;
  name?:     string;
  address:   string;   // token contract; 0xeee…eee for native ETH
  amount:    string;   // human-readable, trailing-zeros trimmed
  raw:       string;   // raw integer balance as string
  decimals:  number;
  isNative?: boolean;
  isB20?:    boolean;
  usdValue?: number;
  logo?:     string;
}

export interface WalletLookup {
  address:    string;
  network:    Network;
  explorer:   string;
  addressUrl: string;
  source:     "moralis" | "rpc";
  partial:    boolean;            // true when only the RPC fallback ran (limited set)
  holdings:   WalletHolding[];
  error?:     string;
}

/** Accept base/baseSepolia AND mainnet/sepolia → canonical mainnet/sepolia. */
function normalizeNetwork(n: string): Network {
  const v = (n || "").toLowerCase();
  if (v === "base" || v === "mainnet") return "mainnet";
  return "sepolia";
}

/** "1.2300" → "1.23", "5.0" → "5". */
function trimAmount(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "") || "0";
}

/** Display rank: native ETH first → stablecoins → B20 tokens → everything else. */
function rank(h: WalletHolding): number {
  if (h.isNative) return 0;
  if (STABLES.has(h.symbol.toUpperCase())) return 1;
  if (h.isB20) return 2;
  return 3;
}

export async function checkWallet(address: string, network: string): Promise<WalletLookup> {
  const net  = normalizeNetwork(network);
  const cfg  = NETS[net];
  const meta = { address, network: net, explorer: cfg.explorer, addressUrl: `${cfg.explorer}/address/${address}` };

  if (!isAddress(address)) {
    return { ...meta, source: "rpc", partial: false, holdings: [], error: "Invalid wallet address." };
  }

  // ── Primary: Moralis full token list ────────────────────────────────────────
  const tokens = await getWalletTokenBalances(address, cfg.moralis);

  // Moralis unavailable (no key / error) → RPC fallback (curated majors only).
  if (tokens === null) {
    const r = await checkBalance(address, network);
    const holdings: WalletHolding[] = (r.balances ?? [])
      .filter(b => b.raw && b.raw !== "0")
      .map(b => ({
        symbol:   b.symbol,
        address:  b.isNative ? "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" : "",
        amount:   b.amount,
        raw:      b.raw,
        decimals: b.symbol === "USDC" ? 6 : 18,
        isNative: b.isNative,
      }));
    return { ...meta, source: "rpc", partial: true, holdings, error: r.error };
  }

  // Only tokens the wallet actually holds; drop spam.
  let holdings: WalletHolding[] = tokens
    .filter(t => !t.possible_spam && t.balance && t.balance !== "0")
    .map(t => ({
      symbol:   t.symbol || "?",
      name:     t.name || undefined,
      address:  t.token_address,
      amount:   trimAmount(t.balance_formatted ?? t.balance),
      raw:      t.balance,
      decimals: t.decimals ?? 18,
      isNative: !!t.native_token,
      usdValue: typeof t.usd_value === "number" ? t.usd_value : undefined,
      logo:     t.logo ?? undefined,
    }));

  // ── B20 detection — confirm 0xb200…-prefixed tokens via Factory.isB20() ──────
  const candidates = holdings.filter(h => h.address.toLowerCase().startsWith("0xb200"));
  if (candidates.length) {
    try {
      const client = createPublicClient({ chain: cfg.chain, transport: http(cfg.rpc) });
      type MC = { status: "success"; result: boolean } | { status: "failure"; error: unknown };
      const res = (await client.multicall({
        allowFailure: true,
        contracts: candidates.map(c => ({
          address: B20_FACTORY_ADDRESS, abi: FACTORY_ABI, functionName: "isB20", args: [c.address as `0x${string}`],
        })) as never,
      })) as unknown as MC[];
      candidates.forEach((c, i) => {
        const r = res[i];
        if (r && r.status === "success" && r.result === true) c.isB20 = true;
      });
    } catch {
      // Leave isB20 unset — never fabricate; the card just won't badge it.
    }
  }

  // native → stable → B20 → rest; within a tier, highest USD value first.
  holdings = holdings.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    return (b.usdValue ?? 0) - (a.usdValue ?? 0);
  });

  return { ...meta, source: "moralis", partial: false, holdings };
}
