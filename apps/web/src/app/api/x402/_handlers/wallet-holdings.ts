// x402/wallet-holdings — ERC-20 + native ETH balances for any Base wallet
// Price: $0.02 — pure on-chain data, no LLM. Never fabricates a price.
//
// 2026-10-07 (plan-build-2026-10-06 task 2.1): rebuilt on lib/wallet/holdings
// `checkWallet` — the reader Blue Chat's check_wallet already uses — instead of
// Moralis alone. It tries Moralis, then on-chain DISCOVERY (Blockscout for the
// candidate list, balanceOf through Multicall3 for every number), then the RPC
// majors. The tool had been HALTED since 2026-09-30 because Moralis answers 401
// (plan paused); it is the one MCP-preloaded wallet read, so a halt there was a
// preloaded tool that only ever said 501.
//
// 🔴 FAIL LOUD, unchanged in spirit. MEASURED 2026-09-26: the Moralis-only
// version reported a wallet holding 4.1157 ETH + 188.73 USDC as $0.00 with
// HTTP 200. Rules:
//  1. Nothing read → 502 (`route.ts` settles only after a 2xx, so the caller
//     is not charged), every field null, never 0 and never [].
//  2. Read, but known incomplete (discovery cannot enumerate every long-tail
//     token; a balance read did not finish) → 200 with `complete: false`, the
//     reader's own reason, and `total_usd_is_floor: true`. Each row present is
//     a real balanceOf; the TOTAL is a lower bound and says so.
//  3. A position with no price is counted in `unpriced_positions` and adds
//     nothing to the total — it is never valued at $0 silently.

import { checkWallet, type WalletLookup } from "@/lib/wallet/holdings";

let readWallet: (address: string, network: string) => Promise<WalletLookup> = checkWallet;
/** Tests inject the reader; production always uses checkWallet. */
export function __setWalletReader(f: typeof readWallet | null) { readWallet = f ?? checkWallet; }

function failLoud(address: string, message: string): Response {
  return Response.json({
    tool: "wallet-holdings",
    address,
    chain: "base",
    status: "error",
    native_eth: null,
    native_eth_usd: null,
    tokens: null,
    token_count: null,
    total_usd: null,
    error: { source: "wallet-reader", code: "UPSTREAM_ERROR", message },
    note: "Balances could not be read. Nothing here is an estimate and nothing is zero-by-default — you were not charged.",
    timestamp: new Date().toISOString(),
  }, { status: 502 });
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { address?: string } = {};
    try {
      const text = await req.text();
      if (text?.trim().startsWith("{")) body = JSON.parse(text);
    } catch {}
    const url = new URL(req.url);
    if (!body.address) body.address = url.searchParams.get("address") || undefined;
    const { address } = body;
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return Response.json({ error: "Provide a valid wallet address (0x...)" }, { status: 400 });
    }

    const w = await readWallet(address, "mainnet");
    if (w.error) return failLoud(address, w.error);
    if (w.holdings.length === 0 && (w.partial || w.degraded)) {
      return failLoud(address, w.partialReason ?? "No balance read completed for this wallet.");
    }

    const nativeRow = w.holdings.find((h) => h.isNative);
    const native_eth = nativeRow ? Number(nativeRow.amount) : null;
    const native_eth_usd = nativeRow?.usdValue != null ? +nativeRow.usdValue.toFixed(2) : null;
    const tokens = w.holdings.filter((h) => !h.isNative).map((h) => ({
      symbol: h.symbol || null,
      balance: Number(h.amount),
      value_usd: h.usdValue != null ? +h.usdValue.toFixed(2) : null,
      contract: h.address,
      // verified / listed / unverified, from lib/wallet/token-trust — a token
      // that calls itself USDC is not ranked as USDC on its symbol alone.
      trust: h.trust,
    }));

    let unpriced_positions = 0;
    for (const h of w.holdings) if (h.usdValue == null && Number(h.amount) > 0) unpriced_positions++;
    const total_usd = +w.holdings.reduce((s, h) => s + (h.usdValue ?? 0), 0).toFixed(2);
    const complete = !w.partial;
    const empty = complete && tokens.length === 0 && (native_eth ?? 0) === 0;

    return Response.json({
      tool: "wallet-holdings",
      address,
      chain: "base",
      status: empty ? "empty" : "ok",
      native_eth,
      native_eth_usd,
      tokens,
      total_usd,
      total_usd_is_floor: !complete || unpriced_positions > 0,
      token_count: tokens.length,
      unpriced_positions,
      complete,
      ...(w.partialReason ? { partial_reason: w.partialReason } : {}),
      data_source: w.source === "moralis" ? "Moralis (token list) + Base RPC" : w.source === "discovery" ? "Blockscout (candidates) + Base RPC balanceOf via Multicall3" : "Base RPC (native + majors only)",
      explorer: w.addressUrl,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    return failLoud("", (e as Error).message);
  }
}
