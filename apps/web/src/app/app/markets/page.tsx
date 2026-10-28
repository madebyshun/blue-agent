// /markets — Markets mode home (R3): stock tokens on Base 8453 and Robinhood
// Chain 4663, then trending crypto on both. Every row names its chain; a ticker
// alone never identifies a token (NVDA is two contracts). Data: lib/markets.ts.
import type { Metadata } from "next";
import Link from "next/link";
import { CHAIN_NAME, readStockMarkets, readTrending, type MarketChain } from "@/lib/markets";
import MarketsHeader from "./MarketsHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Markets — Blue Agent", description: "Stock tokens and crypto on Base and Robinhood Chain, with prices from GeckoTerminal." };

const usd = (n: number | null) => n === null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toPrecision(3)}` : "$0";
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";
const CH = { base: "Base", robinhood: "Robinhood" } as const;
const chip = (on: boolean) => `text-[9.5px] rounded-full px-[11px] py-1 border ${on ? "text-[#050508] bg-[#4FC3F7] border-[#4FC3F7] font-semibold" : "text-[#94A3B8] border-[#1A1A2E] hover:text-[#E2E8F0]"}`;

export default async function MarketsPage({ searchParams }: { searchParams: Promise<{ chain?: string; tab?: string; q?: string }> }) {
  const sp = await searchParams;
  const chain = (sp.chain === "base" || sp.chain === "robinhood" ? sp.chain : "all") as MarketChain | "all";
  const tab = sp.tab === "crypto" ? "crypto" : "stocks";
  const q = (sp.q ?? "").trim().toUpperCase();
  const [stocks, trending] = await Promise.all([
    readStockMarkets().catch(() => ({ rows: [], readAt: null as string | null })),
    readTrending().catch(() => ({ rows: [], readAt: null as string | null, unread: ["base", "robinhood"] as MarketChain[] })),
  ]);
  const href = (o: { chain?: string; tab?: string }) => {
    const p = new URLSearchParams();
    const c = o.chain ?? chain, t = o.tab ?? tab;
    if (c !== "all") p.set("chain", c);
    if (t !== "stocks") p.set("tab", t);
    if (q) p.set("q", q);
    const s = p.toString();
    return `/markets${s ? `?${s}` : ""}`;
  };
  const sRows = stocks.rows
    .filter((r) => chain === "all" || r.chain === chain)
    .filter((r) => !q || r.ticker.includes(q) || r.name.toUpperCase().includes(q))
    .sort((a, b) => (b.volume24hUsd ?? -1) - (a.volume24hUsd ?? -1) || a.ticker.localeCompare(b.ticker));
  const tRows = trending.rows.filter((r) => chain === "all" || r.chain === chain).filter((r) => !q || r.symbol.toUpperCase().includes(q));
  const counts = { base: stocks.rows.filter((r) => r.chain === "base").length, robinhood: stocks.rows.filter((r) => r.chain === "robinhood").length };
  const vol = (c: MarketChain) => stocks.rows.filter((r) => r.chain === c).reduce((a, r) => a + (r.volume24hUsd ?? 0), 0);

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <MarketsHeader active="markets" chip={`${counts.base + counts.robinhood} stock tokens · 2 chains`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4">
            {[
              ["STOCK TOKENS · BASE", String(counts.base), "Coinbase B20, verified on chain"],
              ["STOCK TOKENS · ROBINHOOD", String(counts.robinhood), "Robinhood stock tokens + ETFs"],
              ["24H VOLUME · BASE", usd(vol("base")), "stock tokens, GeckoTerminal"],
              ["24H VOLUME · ROBINHOOD", usd(vol("robinhood")), "stock tokens, GeckoTerminal"],
            ].map(([l, v, s]) => (
              <div key={l} className={`${card} p-[14px]`}>
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B]">{l}</p>
                <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
                <p className="mt-0.5 text-[9.5px] text-[#475569]">{s}</p>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <Link href={href({ tab: "stocks" })} className={chip(tab === "stocks")}>Stock tokens</Link>
            <Link href={href({ tab: "crypto" })} className={chip(tab === "crypto")}>Trending crypto</Link>
            <span className="mx-1 h-4 w-px bg-[#1A1A2E]" />
            {(["all", "base", "robinhood"] as const).map((c) => (
              <Link key={c} href={href({ chain: c })} className={chip(chain === c)}>{c === "all" ? "Both chains" : CHAIN_NAME[c]}</Link>
            ))}
            <form action="/markets" className="ml-auto">
              {chain !== "all" && <input type="hidden" name="chain" value={chain} />}
              {tab !== "stocks" && <input type="hidden" name="tab" value={tab} />}
              <input name="q" defaultValue={sp.q ?? ""} placeholder="Search ticker or name…"
                className="w-[220px] bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-3 py-[7px] text-[11px] text-[#E2E8F0] placeholder:text-[#64748B] outline-none" />
            </form>
          </div>

          {tab === "stocks" ? (
            <div className={`${card} mt-3 overflow-x-auto`}>
              <table className="w-full min-w-[640px] text-[10.5px]">
                <thead>
                  <tr className="text-left text-[9px] tracking-[0.12em] text-[#64748B] border-b border-[#1A1A2E]">
                    <th className="px-4 py-2.5 font-medium">TOKEN</th><th className="px-2 font-medium">CHAIN</th>
                    <th className="px-2 text-right font-medium">PRICE</th><th className="px-2 text-right font-medium">24H VOLUME</th><th className="px-4 text-right font-medium">LIQUIDITY</th>
                  </tr>
                </thead>
                <tbody>
                  {sRows.length === 0 && <tr><td colSpan={5} className="px-4 py-3 text-[#64748B]">{stocks.readAt ? "No match." : "Market data unreadable right now."}</td></tr>}
                  {sRows.map((r) => (
                    <tr key={`${r.chain}:${r.contract}`} className="border-t border-[#1A1A2E] first:border-t-0 hover:bg-[#0F121A]">
                      <td className="px-4 py-2">
                        <Link href={`/markets/${r.chain}/${r.contract}`} className="block">
                          <span className="text-[#E2E8F0] font-semibold">{r.chain === "base" ? `${r.ticker}c` : r.ticker}</span>
                          {r.kind === "etf" && <span className="ml-1.5 text-[8.5px] text-[#A78BFA]">ETF</span>}
                          <span className="ml-2 text-[#64748B] font-prose">{r.name}</span>
                        </Link>
                      </td>
                      <td className="px-2 text-[#94A3B8]">{CH[r.chain]}</td>
                      <td className="px-2 text-right text-[#E2E8F0] tabular-nums">{usd(r.priceUsd)}</td>
                      <td className="px-2 text-right text-[#94A3B8] tabular-nums">{!r.read ? "—" : r.volume24hUsd === null ? "no pool" : usd(r.volume24hUsd)}</td>
                      <td className="px-4 text-right text-[#94A3B8] tabular-nums">{usd(r.liquidityUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <>
              <p className="mt-3 text-[10px] text-[#64748B]">GeckoTerminal&apos;s trending pools as listed, <span className="text-[#F59E0B]">unchecked</span>: no tax or honeypot test runs here. Tokens using a major&apos;s symbol (BTC, ETH, USDC…) are left out. Open one for its on-chain facts.</p>
              <div className={`${card} mt-2 overflow-x-auto`}>
                <table className="w-full min-w-[640px] text-[10.5px]">
                  <thead>
                    <tr className="text-left text-[9px] tracking-[0.12em] text-[#64748B] border-b border-[#1A1A2E]">
                      <th className="px-4 py-2.5 font-medium">TOKEN</th><th className="px-2 font-medium">CHAIN</th><th className="px-2 text-right font-medium">PRICE</th>
                      <th className="px-2 text-right font-medium">24H</th><th className="px-2 text-right font-medium">24H VOLUME</th><th className="px-4 text-right font-medium">LIQUIDITY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tRows.length === 0 && <tr><td colSpan={6} className="px-4 py-3 text-[#64748B]">{trending.unread.length ? "GeckoTerminal is rate-limiting right now; reload in a minute." : "Nothing trending to show."}</td></tr>}
                    {tRows.map((r) => (
                      <tr key={`${r.chain}:${r.token}`} className="border-t border-[#1A1A2E] first:border-t-0 hover:bg-[#0F121A]">
                        <td className="px-4 py-2">
                          <Link href={`/markets/${r.chain}/${r.token}`} className="block">
                            <span className="text-[#E2E8F0] font-semibold">{r.symbol}</span>
                            <span className="ml-2 text-[#64748B]">{r.poolName} · {r.dex}</span>
                          </Link>
                        </td>
                        <td className="px-2 text-[#94A3B8]">{CH[r.chain]}</td>
                        <td className="px-2 text-right text-[#E2E8F0] tabular-nums">{usd(r.priceUsd)}</td>
                        <td className={`px-2 text-right tabular-nums ${r.change24hPct === null ? "text-[#64748B]" : r.change24hPct >= 0 ? "text-[#34D399]" : "text-[#F87171]"}`}>{r.change24hPct === null ? "—" : `${r.change24hPct >= 0 ? "+" : ""}${r.change24hPct.toFixed(1)}%`}</td>
                        <td className="px-2 text-right text-[#94A3B8] tabular-nums">{usd(r.volume24hUsd)}</td>
                        <td className="px-4 text-right text-[#94A3B8] tabular-nums">{usd(r.liquidityUsd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          <p className="text-[9.5px] text-[#475569] mt-4 leading-relaxed">
            Stock tokens come from Blue Agent&apos;s verified registries, matched by contract on each chain. Prices, volume and liquidity: GeckoTerminal, refreshed every 5 minutes. A stock token tracks a share; it is not the share. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
