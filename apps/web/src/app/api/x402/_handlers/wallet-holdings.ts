// x402/wallet-holdings — ERC-20 + native ETH balances for any Base wallet
// Price: $0.05 — pure on-chain data, no LLM. Never fabricates a price.
//
// 🔴 FAIL LOUD. This handler used to swallow every upstream failure into
// `[]` / `null` and then publish `total_usd: 0` with HTTP 200. MEASURED
// 2026-09-26: Moralis answers 401 "Your Moralis Free usage is paused" on every
// endpoint, so all three test wallets — one holding 4.1157 ETH + 188.73 USDC —
// were reported as holding $0.00, confidently, for $0.05 a call. The zero was
// indistinguishable from a genuinely empty wallet, which is what made it
// dangerous rather than merely wrong.
//
// Two rules follow, and neither is negotiable:
//  1. An unread value is `null`, never `0` and never `[]`.
//  2. An unread value returns a NON-2xx status. `route.ts` settles the USDC
//     only after a 2xx, so a 200 carrying `status:"error"` would still charge
//     the caller for the outage. 502 = "we could not answer, you were not
//     charged". That is the whole point of the fix.
//
// Native ETH is read from Base RPC (no API key, no indexer, still works) and
// Moralis' own native figure is kept purely as a cross-check.

import {
  getMoralisErc20BalancesResult,
  getMoralisNativeBalanceResult,
  type UpstreamError,
} from "@/lib/moralis";
import { getRpcWalletState } from "@/lib/onchain";

const WETH_BASE = "0x4200000000000000000000000000000000000006";

function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Live WETH price (USD) from DexScreener, or null if unavailable.
async function getWethPriceUsd(): Promise<number | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${WETH_BASE}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { pairs?: { chainId?: string; priceUsd?: string; liquidity?: { usd?: number } }[] };
    const basePairs = (data.pairs ?? [])
      .filter((p) => p.chainId === "base")
      .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    return num(basePairs[0]?.priceUsd);
  } catch {
    return null;
  }
}

/** Every unreadable field is null, and the caller is told why. 502 so the x402
 *  route never settles payment for an answer we do not have. */
function failLoud(address: string, error: UpstreamError, partial: Record<string, unknown> = {}): Response {
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
    ...partial,
    error,
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

    console.log(`[WalletHoldings] Reading balances for: ${address}`);

    const [erc20, moralisNative, rpc, wethPrice] = await Promise.all([
      getMoralisErc20BalancesResult(address),
      getMoralisNativeBalanceResult(address),
      getRpcWalletState(address),
      getWethPriceUsd(),
    ]);

    // ── Native ETH: RPC is authoritative, Moralis is the corroborator ────────
    const nativeWei = rpc ? rpc.wei : moralisNative.ok ? moralisNative.data : null;
    if (nativeWei === null) {
      return failLoud(address, {
        source: "base-rpc",
        code: "UPSTREAM_ERROR",
        message: `Base RPC did not return a balance, and the Moralis fallback also failed${moralisNative.ok ? "" : `: ${moralisNative.error.message}`}.`,
      });
    }

    // Cross-check on the ONE quantity both sources answer. Deliberately only
    // the zero/non-zero disagreement: block lag makes exact equality flaky, but
    // "one source says the wallet is empty and the other says it is not" is
    // never lag — and it is precisely the shape of the bug this file had.
    if (rpc && moralisNative.ok) {
      const rpcZero = BigInt(rpc.wei) === 0n;
      const morZero = BigInt(moralisNative.data) === 0n;
      if (rpcZero !== morZero) {
        return failLoud(address, {
          source: "moralis+base-rpc",
          code: "UPSTREAM_INCONSISTENT",
          message: `Base RPC reports ${rpc.wei} wei and Moralis reports ${moralisNative.data} wei for the same address. One of them is wrong; this tool will not pick.`,
        });
      }
    }

    const native_eth = +(Number(BigInt(nativeWei)) / 1e18).toFixed(6);
    const native_eth_usd = wethPrice != null ? +(native_eth * wethPrice).toFixed(2) : null;

    // ── ERC-20 list: the actual product. Unreadable → the call fails. ────────
    if (!erc20.ok) {
      return failLoud(address, erc20.error, {
        native_eth,
        native_eth_usd,
        note_partial: "Native ETH above was read from Base RPC and is real; the token list is what could not be read.",
      });
    }

    const tokens = erc20.data
      .filter((t) => !t.possible_spam)
      .map((t) => {
        const decimals = num(t.decimals) ?? 18;
        const rawBal = num(t.balance);
        const balance = rawBal != null ? rawBal / Math.pow(10, decimals) : null;
        // Prefer Moralis-provided usd_value; else derive from usd_price; else null.
        let value_usd = num(t.usd_value);
        if (value_usd == null) {
          const price = num(t.usd_price);
          if (price != null && balance != null) value_usd = +(balance * price).toFixed(2);
        }
        return {
          symbol: t.symbol ?? null,
          balance,
          value_usd,
          contract: t.token_address ?? null,
        };
      });

    // `total_usd` is the sum of what we could price, and `unpriced_positions`
    // says how much of the wallet it leaves out. A wallet full of unpriced
    // junk tokens should not report a total that silently pretends they are
    // worth nothing — so the omission is a field, not a rounding decision.
    let unpriced_positions = 0;
    if (native_eth > 0 && native_eth_usd == null) unpriced_positions++;
    for (const t of tokens) {
      if (t.value_usd == null && (t.balance ?? 0) > 0) unpriced_positions++;
    }
    const total_usd =
      +(tokens.reduce((sum, t) => sum + (t.value_usd ?? 0), 0) + (native_eth_usd ?? 0)).toFixed(2);

    const empty = tokens.length === 0 && native_eth === 0;

    return Response.json({
      tool: "wallet-holdings",
      address,
      chain: "base",
      status: empty ? "empty" : "ok",
      native_eth,
      native_eth_usd,
      tokens,
      total_usd,
      token_count: tokens.length,
      unpriced_positions,
      data_source: rpc ? "Base RPC (native) + Moralis (ERC-20) + DexScreener (ETH price)" : "Moralis + DexScreener",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[WalletHoldings] Error:", error);
    return Response.json(
      { error: "Wallet holdings lookup failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
