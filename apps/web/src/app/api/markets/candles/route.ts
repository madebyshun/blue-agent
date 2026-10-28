/**
 * GET /api/markets/candles?chain=base|robinhood&pool=<pool>&side=base|quote&tf=15m|1h|4h|1d
 * OHLCV for one DEX pool (lib/markets readCandles, GeckoTerminal built from the
 * pool's swaps). `candles: null` = GeckoTerminal refused the read; never an empty chart.
 */
import { NextResponse } from "next/server";
import { readCandles, TIMEFRAMES, type Timeframe } from "@/lib/markets";

export const runtime = "nodejs";
export const maxDuration = 20;
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const chain = q.get("chain");
  const pool = q.get("pool") ?? "";
  const side = q.get("side") === "quote" ? "quote" : "base";
  const tf = (q.get("tf") ?? "1h") as Timeframe;
  if ((chain !== "base" && chain !== "robinhood") || !/^0x[0-9a-fA-F]{40}([0-9a-fA-F]{24})?$/.test(pool) || !(tf in TIMEFRAMES)) {
    return NextResponse.json({ error: "chain, pool (0x address or v4 pool id) and tf (15m|1h|4h|1d) are required." }, { status: 400 });
  }
  const candles = await readCandles(chain, pool.toLowerCase(), side, tf).catch(() => null);
  return NextResponse.json({ chain, pool, tf, candles }, { headers: { "cache-control": "public, max-age=30" } });
}
