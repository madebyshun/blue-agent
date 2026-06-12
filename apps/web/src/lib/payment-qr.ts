// Payment-QR helpers for BlueBank scan-to-pay (Base).
//
// Parses what a camera scans into a Send prefill, and builds an EIP-681
// payment-request URI for the Receive QR. Supports:
//   • plain EVM address            0xabc…                → { to }
//   • Basename / ENS               shop.base / shop.eth  → { to } (resolved later)
//   • EIP-681 ETH transfer         ethereum:0xRecip@8453?value=1e18
//   • EIP-681 token (USDC) transfer ethereum:<usdc>@8453/transfer?address=0xRecip&uint256=1000000
//
// All Base-only (chainId 8453 mainnet / 84532 Sepolia). USDC is classified by
// matching the target contract against the verified USDC address per network.

import { formatUnits, parseUnits } from "viem";
import { YIELD_NETWORKS, type YieldNetwork } from "./yield-execution";

export type ParsedPayment = {
  to?: string;                 // 0x address or name.base
  amount?: string;             // human units
  asset?: "USDC" | "ETH";
  network?: YieldNetwork;
};

const CHAIN_TO_NET: Record<number, YieldNetwork> = { 8453: "base", 84532: "baseSepolia" };
const NET_TO_CHAIN: Record<YieldNetwork, number> = { base: 8453, baseSepolia: 84532 };

const isAddr = (s: string) => /^0x[a-fA-F0-9]{40}$/.test(s);
const isName = (s: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.(base|eth)$/i.test(s);

function usdcFor(chainId: number): string | undefined {
  const net = CHAIN_TO_NET[chainId];
  return net ? YIELD_NETWORKS[net].usdc.toLowerCase() : undefined;
}

// EIP-681 number values may be integers ("1000000") or scientific ("1e18").
function toHuman(v: string, decimals: number): string {
  try {
    if (/^\d+$/.test(v)) return formatUnits(BigInt(v), decimals);
    const n = Number(v) / 10 ** decimals;
    return isFinite(n) ? String(n) : "";
  } catch {
    return "";
  }
}

/** Parse a scanned QR string into a Send prefill, or null if unrecognized. */
export function parsePaymentQr(raw: string): ParsedPayment | null {
  const text = (raw || "").trim();
  if (!text) return null;

  if (isAddr(text)) return { to: text };
  if (isName(text)) return { to: text };

  // ethereum:<target>[@chainId][/fn]?[k=v&…]
  const m = text.match(/^ethereum:([^@/?]+)(?:@(\d+))?(?:\/([a-zA-Z]+))?(?:\?(.*))?$/i);
  if (m) {
    const target = m[1];
    const chainId = m[2] ? parseInt(m[2], 10) : 8453;
    const fn = (m[3] || "").toLowerCase();
    const params = new URLSearchParams(m[4] || "");
    const network = CHAIN_TO_NET[chainId];

    if (fn === "transfer") {
      const recip = params.get("address") || params.get("recipient") || undefined;
      const rawAmt = params.get("uint256") || params.get("amount") || undefined;
      const isUsdc = target.toLowerCase() === usdcFor(chainId);
      const decimals = isUsdc && network ? YIELD_NETWORKS[network].usdcDecimals : 6;
      return {
        to: recip && isAddr(recip) ? recip : recip,
        asset: isUsdc ? "USDC" : undefined,
        amount: rawAmt ? toHuman(rawAmt, decimals) : undefined,
        network,
      };
    }

    // plain native transfer → target is the recipient, value in wei
    const val = params.get("value") || params.get("amount") || undefined;
    return {
      to: target,
      asset: "ETH",
      amount: val ? toHuman(val, 18) : undefined,
      network,
    };
  }

  return null;
}

/**
 * Build an EIP-681 payment-request URI for the Receive QR.
 * No amount → returns the bare address (universally scannable).
 */
export function buildPaymentUri(opts: {
  to: string;
  amount?: string;
  asset?: "USDC" | "ETH";
  network: YieldNetwork;
}): string {
  const { to, amount, asset = "USDC", network } = opts;
  const amt = parseFloat(amount ?? "");
  if (!to) return "";
  if (!(amt > 0)) return to; // plain address QR

  const chainId = NET_TO_CHAIN[network];
  if (asset === "ETH") {
    const wei = parseUnits(String(amount), 18).toString();
    return `ethereum:${to}@${chainId}?value=${wei}`;
  }
  const usdc = YIELD_NETWORKS[network].usdc;
  const units = parseUnits(String(amount), YIELD_NETWORKS[network].usdcDecimals).toString();
  return `ethereum:${usdc}@${chainId}/transfer?address=${to}&uint256=${units}`;
}
