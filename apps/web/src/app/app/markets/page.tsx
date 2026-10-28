// /markets — Markets mode home (R3): stock tokens on Base 8453 and Robinhood
// Chain 4663, plus trending crypto on both, in one sortable table (MarketsTable).
// Every row names its chain; a ticker alone never identifies a token (NVDA is
// two contracts). Data: lib/markets.ts (registries + GeckoTerminal).
import type { Metadata } from "next";
import { readStockMarkets, readTrending, type MarketChain } from "@/lib/markets";
import MarketsHeader from "./MarketsHeader";
import MarketsTable, { type MarketRow } from "./MarketsTable";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Markets — Blue Agent", description: "Stock tokens and crypto on Base and Robinhood Chain, priced from their DEX pools." };

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(2)}`;
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";

export default async function MarketsPage() {
  const [stocks, trending] = await Promise.all([
    readStockMarkets().catch(() => ({ rows: [], readAt: null as string | null })),
    readTrending().catch(() => ({ rows: [], readAt: null as string | null, unread: ["base", "robinhood"] as MarketChain[] })),
  ]);
  const rows: MarketRow[] = [
    ...stocks.rows.map((r) => ({
      chain: r.chain, kind: r.kind, token: r.contract, symbol: r.ticker, name: r.name, logo: r.logo,
      price: r.priceUsd, change: r.change24hPct, mcap: r.mcapUsd, mcapIsFdv: r.mcapIsFdv, liq: r.liquidityUsd, vol: r.volume24hUsd,
      createdAt: r.poolCreatedAt, pool: r.pool, side: r.side, read: r.read,
    })),
    ...trending.rows.map((r) => ({
      chain: r.chain, kind: "crypto" as const, token: r.token, symbol: r.symbol, name: r.name, logo: r.logo,
      price: r.priceUsd, change: r.change24hPct, mcap: r.mcapUsd, mcapIsFdv: r.mcapIsFdv, liq: r.liquidityUsd, vol: r.volume24hUsd,
      createdAt: r.poolCreatedAt, pool: r.pool || null, side: "base" as const, read: true,
    })),
  ];
  const count = (c: MarketChain) => stocks.rows.filter((r) => r.chain === c).length;
  const vol = (c: MarketChain) => stocks.rows.filter((r) => r.chain === c).reduce((a, r) => a + (r.volume24hUsd ?? 0), 0);

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono [&_button]:font-mono">
      <MarketsHeader active="markets" chip={`${count("base") + count("robinhood")} stock tokens · ${trending.rows.length} trending · 2 chains`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <div className="mb-3 grid gap-2.5 grid-cols-2 md:grid-cols-4">
            {[
              ["STOCK TOKENS · BASE", String(count("base")), "Coinbase B20, verified on chain"],
              ["STOCK TOKENS · ROBINHOOD", String(count("robinhood")), "Robinhood stock tokens + ETFs"],
              ["24H VOLUME · BASE", stocks.readAt ? usd(vol("base")) : "—", "stock tokens, DEX pools"],
              ["24H VOLUME · ROBINHOOD", stocks.readAt ? usd(vol("robinhood")) : "—", "stock tokens, DEX pools"],
            ].map(([l, v, s]) => (
              <div key={l} className={`${card} p-[14px]`}>
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B]">{l}</p>
                <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
                <p className="mt-0.5 text-[9.5px] text-[#475569]">{s}</p>
              </div>
            ))}
          </div>
          <MarketsTable rows={rows} readAt={stocks.readAt} />
          <p className="text-[9.5px] text-[#475569] mt-4 leading-relaxed">
            Stock tokens come from Blue Agent&apos;s verified registries, matched by contract on each chain. Trending crypto is GeckoTerminal&apos;s list as-is, <span className="text-[#F59E0B]">unchecked</span>: no tax or honeypot test runs here, and tokens using a major&apos;s symbol (BTC, ETH, USDC…) are left out.
            Prices, change, market cap, liquidity, volume and charts are read from each token&apos;s DEX pools (Aerodrome / Uniswap on Base, Uniswap v4 on Robinhood Chain) through GeckoTerminal, every 5 minutes. A stock token tracks a share; it is not the share. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
