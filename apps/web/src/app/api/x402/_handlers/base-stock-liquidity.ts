// x402/base-stock-liquidity — where one Coinbase Tokenized Stock on Base 8453
// can actually be traded: its pools (up to three deepest), each pool's
// liquidity, the deepest pool's 24h volume and turnover. Facts only: no
// slippage is modelled here (a concentrated-liquidity pool's impact depends on
// its tick range, which this read does not have).
import { readTokenMarket } from "@/lib/markets";
import { readBody, resolveBaseStock, stockRef } from "@/lib/base-stocks/handler-common";

export default async function handler(req: Request): Promise<Response> {
  const body = await readBody(req);
  const r = resolveBaseStock(String(body.ticker ?? body.token ?? ""));
  if ("error" in r) return Response.json(r, { status: 400 });
  const mk = await readTokenMarket("base", r.stock.token);
  if (mk.status === "unread") throw new Error("Market data could not be read right now (GeckoTerminal); nothing was charged.");
  const liq = mk.pool?.liquidityUsd ?? null, vol = mk.pool?.volume24hUsd ?? null;
  return Response.json({
    ...stockRef(r.stock),
    status: mk.pool ? "ok" : "no DEX pool listed",
    deepest_pool: mk.pool ? { address: mk.pool.address, name: mk.pool.name, dex: mk.pool.dex, liquidity_usd: liq, volume_24h_usd: vol,
      turnover_24h: liq && vol !== null ? vol / liq : null } : null,
    pools: mk.pools.map((p) => ({ name: p.name, dex: p.dex, liquidity_usd: p.liquidityUsd })),
    note: "Liquidity is the pool's reported reserve in USD. Price impact for a given size is not estimated here; quote the swap before signing.",
    source: "GeckoTerminal pools for this contract",
    timestamp: new Date().toISOString(),
  });
}
