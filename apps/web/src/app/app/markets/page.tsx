// /markets — Markets mode home (R3): stock tokens on Base 8453 and Robinhood
// Chain 4663, plus trending crypto on both, in one sortable table (MarketsTable).
// Every row names its chain; a ticker alone never identifies a token (NVDA is
// two contracts). Data: lib/markets.ts (registries + GeckoTerminal).
import type { Metadata } from "next";
import { readBlueLaunchMarkets, readStockMarkets, readTrending, type MarketChain } from "@/lib/markets";
import MarketsHeader from "./MarketsHeader";
import MarketsTable, { type MarketRow } from "./MarketsTable";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Markets — Blue Agent", description: "Stock tokens and crypto on Base and Robinhood Chain, priced from their DEX pools." };

const usd = (n: number) => n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : `$${n.toFixed(2)}`;

export default async function MarketsPage() {
  const [stocks, trending, launches] = await Promise.all([
    readStockMarkets().catch(() => ({ rows: [], readAt: null as string | null })),
    readTrending().catch(() => ({ rows: [], readAt: null as string | null, unread: ["base", "robinhood"] as MarketChain[] })),
    readBlueLaunchMarkets().catch(() => ({ rows: [], readAt: null })),
  ]);
  const launched = new Set(launches.rows.map((r) => r.token.toLowerCase()));
  // A stock token can also trend on GeckoTerminal (MSTRc, SNDKc did): list it
  // once, as the verified stock row, never a second time as "crypto".
  const stockSet = new Set(stocks.rows.map((r) => `${r.chain}:${r.contract.toLowerCase()}`));
  const rows: MarketRow[] = [
    ...stocks.rows.map((r) => ({
      chain: r.chain, kind: r.kind, token: r.contract, symbol: r.ticker, name: r.name, logo: r.logo,
      price: r.priceUsd, change: r.change24hPct, mcap: r.mcapUsd, mcapIsFdv: r.mcapIsFdv, liq: r.liquidityUsd, vol: r.volume24hUsd,
      createdAt: r.poolCreatedAt, pool: r.pool, side: r.side, read: r.read,
    })),
    ...launches.rows.map((r) => ({
      chain: "base" as const, kind: "launch" as const, token: r.token, symbol: r.symbol ?? `${r.token.slice(0, 6)}…`, name: r.name ?? r.token, logo: r.logo,
      price: r.priceUsd, change: r.change24hPct, mcap: r.mcapUsd, mcapIsFdv: r.mcapIsFdv, liq: r.liquidityUsd, vol: r.volume24hUsd,
      createdAt: r.poolCreatedAt, pool: r.pool, side: r.side, read: r.read,
    })),
    ...trending.rows.filter((r) => !launched.has(r.token.toLowerCase()) && !stockSet.has(`${r.chain}:${r.token.toLowerCase()}`)).map((r) => ({
      chain: r.chain, kind: "crypto" as const, token: r.token, symbol: r.symbol, name: r.name, logo: r.logo,
      price: r.priceUsd, change: r.change24hPct, mcap: r.mcapUsd, mcapIsFdv: r.mcapIsFdv, liq: r.liquidityUsd, vol: r.volume24hUsd,
      createdAt: r.poolCreatedAt, pool: r.pool || null, side: "base" as const, read: true,
    })),
  ];
  // An image GeckoTerminal hands to many contracts is the ISSUER's mark, not the
  // company's (every Robinhood stock token carries Robinhood's feather). Drop it
  // so the row falls back to its own company mark (StockMark) or a monogram.
  const uses = new Map<string, number>();
  for (const r of rows) if (r.logo) uses.set(r.logo, (uses.get(r.logo) ?? 0) + 1);
  for (const r of rows) if (r.logo && (uses.get(r.logo) ?? 0) >= 3) r.logo = null;
  // Robinhood stock tokens: GeckoTerminal serves each its own URL, but every one
  // is Robinhood's feather (measured 2026-10-29: PLTR, SKHY, NVDA). Use the
  // company mark on file (StockMark) or a monogram instead.
  for (const r of rows) if (r.chain === "robinhood" && (r.kind === "stock" || r.kind === "etf")) r.logo = null;
  const count = (c: MarketChain) => stocks.rows.filter((r) => r.chain === c).length;
  const vol = (c: MarketChain) => stocks.rows.filter((r) => r.chain === c).reduce((a, r) => a + (r.volume24hUsd ?? 0), 0);
  // A chain whose GeckoTerminal read was refused shows "—", never a summed $0.
  // Partial read (GeckoTerminal refused a chunk): the sum of what was read, as a
  // lower bound; nothing read at all: a dash. Never a confident total.
  const volShow = (c: MarketChain) => !stocks.readAt || !stocks.rows.some((r) => r.chain === c && r.read) ? "—" : `${volRead(c) ? "" : "≥"}${usd(vol(c))}`;
  const volRead = (c: MarketChain) => stocks.rows.some((r) => r.chain === c) && stocks.rows.filter((r) => r.chain === c).every((r) => r.read);

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono [&_button]:font-mono">
      <MarketsHeader active="markets" chip={`${count("base") + count("robinhood")} stock tokens · ${trending.rows.length} trending · 2 chains`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <Link href="/markets/weekend" className="mb-3 flex items-center justify-between gap-3 bg-[#0B0F1E] border border-[#1A1A2E] hover:border-[#4FC3F7]/40 rounded-[10px] px-4 py-2.5 text-[13px]">
            <span className="text-[#E2E8F0]">Weekend scorecard <span className="text-[#94A3B8]">· does Base&apos;s Sunday price call Monday&apos;s open? Graded every weekend on Base 8453.</span></span>
            <span className="text-[#4FC3F7]">Open →</span>
          </Link>
          <MarketsTable rows={rows} readAt={stocks.readAt} stats={{
            base: { count: count("base"), vol: volShow("base") === "—" ? null : vol("base"), complete: volRead("base") },
            robinhood: { count: count("robinhood"), vol: volShow("robinhood") === "—" ? null : vol("robinhood"), complete: volRead("robinhood") },
          }} />
          <p className="text-[12px] text-[#64748B] mt-4 leading-relaxed">
            Stock tokens come from Blue Agent&apos;s verified registries, matched by contract on each chain. Trending crypto is GeckoTerminal&apos;s list as-is, <span className="text-[#F59E0B]">unchecked</span>: no tax or honeypot test runs here, and tokens using a major&apos;s symbol (BTC, ETH, USDC…) are left out.
            Prices, change, market cap, liquidity, volume and charts are read from each token&apos;s DEX pools (Aerodrome / Uniswap on Base, Uniswap v4 on Robinhood Chain) through GeckoTerminal, every 5 minutes. A stock token tracks a share; it is not the share. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
