// GET /api/swap/quote?sellToken=…&buyToken=…&sellAmount=…&taker=0x…
//
// Server-side proxy for the 0x Swap API (AllowanceHolder flow) on Base mainnet.
// Returns a firm quote with the transaction to sign + any ERC-20 allowance the
// user must grant first. Non-custodial: BlueBank only fetches the route; the
// user signs the swap from their own wallet. Keeps the 0x key off the client.
//
// Setup: get a free key at dashboard.0x.org → set ZEROX_API_KEY. Without it the
// route returns { needsKey: true } and the Convert card shows a setup hint.

import { NextResponse } from "next/server";

const ZEROX_BASE = "https://api.0x.org/swap/allowance-holder/quote";
const BASE_CHAIN = 8453;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const sellToken = u.searchParams.get("sellToken") ?? "";
  const buyToken = u.searchParams.get("buyToken") ?? "";
  const sellAmount = u.searchParams.get("sellAmount") ?? "";
  const taker = u.searchParams.get("taker") ?? "";
  const key = process.env.ZEROX_API_KEY;

  if (!key) return NextResponse.json({ needsKey: true }, { status: 200 });
  if (!sellToken || !buyToken || !/^\d+$/.test(sellAmount)) {
    return NextResponse.json({ error: "bad params" }, { status: 200 });
  }

  const qs = new URLSearchParams({
    chainId: String(BASE_CHAIN),
    sellToken,
    buyToken,
    sellAmount,
    ...(taker ? { taker } : {}),
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
