// x402/base-stock-ohlc — OHLCV candles for one Coinbase Tokenized Stock on Base
// 8453 from its deepest DEX pool (GeckoTerminal, built from the pool's swaps).
// Timeframes 15m / 1h / 4h / 1d. A refused read throws: the caller is not charged.
import { readCandles, readTokenMarket, TIMEFRAMES, type Timeframe } from "@/lib/markets";
import { readBody, resolveBaseStock, stockRef } from "@/lib/base-stocks/handler-common";

export default async function handler(req: Request): Promise<Response> {
  const body = await readBody(req);
  const r = resolveBaseStock(String(body.ticker ?? body.token ?? ""));
  if ("error" in r) return Response.json(r, { status: 400 });
  const tf = String(body.timeframe ?? "1h") as Timeframe;
  if (!(tf in TIMEFRAMES)) return Response.json({ error: "timeframe must be 15m, 1h, 4h or 1d" }, { status: 400 });
  const limit = Math.max(1, Math.min(TIMEFRAMES[tf].limit, Number(body.limit ?? 48) || 48));
  const mk = await readTokenMarket("base", r.stock.token);
  if (mk.status === "none_listed" || (mk.status === "ok" && !mk.pool)) {
    return Response.json({ ...stockRef(r.stock), timeframe: tf, candles: [], status: "no DEX pool listed for this stock token" });
  }
  if (!mk.pool) throw new Error("Market data could not be read right now (GeckoTerminal); nothing was charged.");
  const candles = await readCandles("base", mk.pool.address, mk.side, tf);
  if (!candles) throw new Error("Candles could not be read right now (GeckoTerminal); nothing was charged.");
  const rows = candles.slice(-limit);
  const first = rows[0], last = rows[rows.length - 1];
  return Response.json({
    ...stockRef(r.stock), timeframe: tf, pool: mk.pool.address, dex: mk.pool.dex,
    candles: rows.map(([t, o, h, l, c, v]) => ({ t: new Date(t * 1000).toISOString(), o, h, l, c, volume_usd: v })),
    summary: rows.length ? {
      high: Math.max(...rows.map((c) => c[2])), low: Math.min(...rows.map((c) => c[3])),
      change_pct: first && last ? ((last[4] - first[1]) / first[1]) * 100 : null,
      volume_usd: rows.reduce((a, c) => a + c[5], 0),
    } : null,
    source: "GeckoTerminal OHLCV of the deepest pool by liquidity",
    timestamp: new Date().toISOString(),
  });
}
