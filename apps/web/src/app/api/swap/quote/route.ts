// GET /api/swap/quote?sellToken=…&buyToken=…&sellAmount=…&taker=0x…&slippageBps=…
//
// Server-side proxy for the 0x Swap API (AllowanceHolder flow) on Base mainnet.
// Returns a firm quote with the transaction to sign + any ERC-20 allowance the
// user must grant first. Non-custodial: BlueBank only fetches the route; the
// user signs the swap from their own wallet. Keeps the 0x key off the client.
//
// Setup: get a free key at dashboard.0x.org → set ZEROX_API_KEY. Without it the
// route returns { needsKey: true } and the Convert card shows a setup hint.

import { NextResponse } from "next/server";
import { toNativeSentinel } from "@/lib/tx-chains";
import { parseSlippageBps } from "@/lib/zerox-swap";
import { aerodromeQuote, baseStockByToken } from "@/lib/aerodrome-swap";

const ZEROX_BASE = "https://api.0x.org/swap/allowance-holder/quote";
const BASE_CHAIN = 8453;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sellToken = u.searchParams.get("sellToken") ?? "";
  const buyToken = u.searchParams.get("buyToken") ?? "";
  const sellAmount = u.searchParams.get("sellAmount") ?? "";
  const taker = u.searchParams.get("taker") ?? "";
  const slippageBps = parseSlippageBps(u.searchParams.get("slippageBps"));
  const key = process.env.ZEROX_API_KEY;

  // Base B20 stock tokens: 0x refuses them ("not authorized for trade due to
  // legal restrictions", measured 2026-10-03), so a leg that is a REGISTERED
  // Base stock routes through Aerodrome Slipstream instead (lib/aerodrome-swap).
  // Same response shape, plus `venue: "aerodrome"`; needs no 0x key.
  if (baseStockByToken(sellToken) || baseStockByToken(buyToken)) {
    const q = await aerodromeQuote({ sellToken, buyToken, sellAmount, taker, slippageBps });
    return NextResponse.json(q, { status: 200 });
  }

  if (!key) return NextResponse.json({ needsKey: true }, { status: 200 });
  if (!sellToken || !buyToken || !/^\d+$/.test(sellAmount)) {
    return NextResponse.json({ error: "bad params" }, { status: 200 });
  }

  // P1-4 (measured 2026-09-26): a caller passing the literal "ETH" — which
  // `blue_swap_tx`'s own schema documents as valid — got 0x's "The input is
  // invalid" back, because v2 of the Swap API speaks only the ERC-20 native
  // SENTINEL address. Normalised here, at the boundary, rather than in each
  // caller: this route has two of them (the MCP execution wrapper and the
  // browser's SwapCard) and a translation living in the callers is a
  // translation one of them will be missing. See lib/tx-chains.ts for the
  // measurement and for why `isNativeToken` alone was not enough.
  //
  // ⚠️ `slippageBps` is forwarded here for the same boundary reason. It was
  // MISSING until 2026-09-27, and its absence was worse than a dropped param:
  // `blue_swap_tx` accepted it (mcp-tools.ts documents "Default 100"), sent it,
  // and then echoed it back in `meta.slippageBps` as though it had applied —
  // while 0x quietly used its own 1% default. A caller asking for 50 bps got a
  // `minBuyAmount` computed at 100 and a `meta` claiming 50, so the response
  // contradicted itself and the looser number was the binding one. Forwarding
  // it at the boundary (not in each caller) keeps SwapCard, which sends none,
  // on 0x's default unchanged.
  const qs = new URLSearchParams({
    chainId: String(BASE_CHAIN),
    sellToken: toNativeSentinel(sellToken),
    buyToken: toNativeSentinel(buyToken),
    sellAmount,
    ...(taker ? { taker } : {}),
    ...(slippageBps !== null ? { slippageBps: String(slippageBps) } : {}),
  });

  try {
    const res = await fetch(`${ZEROX_BASE}?${qs}`, {
      headers: { "0x-api-key": key, "0x-version": "v2" },
      cache: "no-store",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return NextResponse.json(
        { error: data?.reason || data?.message || `0x ${res.status}` },
        { status: 200 },
      );
    }
    return NextResponse.json(data, { status: 200 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 200 });
  }
}
