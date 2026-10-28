// /markets/<chain>/<address> — one token on Base 8453 or Robinhood Chain 4663:
// price chart (7 days, hourly, deepest pool), recent trades, on-chain facts,
// whether it is a verified stock token, and a swap the user's wallet signs.
// Sources: lib/token-overview (on-chain, registry, launchpad) + lib/markets
// (GeckoTerminal pool, candles, trades).
import { Fragment } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAddress, isAddress } from "viem";
import { tokenOverview } from "@/lib/token-overview";
import { CHAIN_NAME, readTokenMarket, type MarketChain } from "@/lib/markets";
import { explorerTokenUrl } from "@/lib/blue-hood/detail-support";
import MarketsHeader from "../../MarketsHeader";
import MarketSwap from "../../MarketSwap";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ chain: string; address: string }> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { chain, address } = await params;
  return { title: `${address.slice(0, 8)}… on ${chain === "base" ? "Base" : "Robinhood Chain"} — Markets` };
}

const usd = (n: number | null) => n === null ? "—" : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}k` : n >= 1 ? `$${n.toFixed(2)}` : n > 0 ? `$${n.toPrecision(3)}` : "$0";
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]";
const txUrl = (c: MarketChain, tx: string) => c === "base" ? `https://basescan.org/tx/${tx}` : `https://robinhoodchain.blockscout.com/tx/${tx}`;

function Chart({ candles }: { candles: [number, number][] }) {
  if (candles.length < 2) return <p className="text-[10.5px] text-[#64748B] py-10 text-center">No hourly candles for this pool yet.</p>;
  const W = 900, H = 220, pad = 6;
  const vs = candles.map((c) => c[1]);
  const lo = Math.min(...vs), hi = Math.max(...vs), span = hi - lo || hi || 1;
  const x = (i: number) => (i / (candles.length - 1)) * W;
  const y = (v: number) => pad + (1 - (v - lo) / span) * (H - 2 * pad);
  const d = candles.map((c, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(c[1]).toFixed(1)}`).join(" ");
  const up = vs[vs.length - 1] >= vs[0];
  const col = up ? "#34D399" : "#F87171";
  const day = (s: number) => new Date(s * 1000).toISOString().slice(5, 10);
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[220px]" preserveAspectRatio="none">
        <path d={`${d} L${W},${H} L0,${H} Z`} fill={col} opacity={0.08} />
        <path d={d} fill="none" stroke={col} strokeWidth={1.6} vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-[9px] text-[#475569]">
        <span>{day(candles[0][0])}</span><span>low {usd(lo)} · high {usd(hi)}</span><span>{day(candles[candles.length - 1][0])}</span>
      </div>
    </div>
  );
}

export default async function TokenPage({ params }: P) {
  const { chain: c, address } = await params;
  if ((c !== "base" && c !== "robinhood") || !isAddress(address)) notFound();
  const chain = c as MarketChain;
  const token = getAddress(address);
  const [ov, mk] = await Promise.all([
    tokenOverview(chain, token, { market: false }).catch(() => null),
    readTokenMarket(chain, token),
  ]);
  const stock = ov?.stockToken ?? null;
  const symbol = ov?.onchain.symbol ?? stock?.ticker ?? short(token);
  const price = mk.pool?.priceUsd ?? null;
  const first = mk.candles[0]?.[1], last = mk.candles[mk.candles.length - 1]?.[1];
  const ch7 = first && last ? ((last - first) / first) * 100 : null;

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono [&_button]:font-mono">
      <MarketsHeader active={null} chip={`${symbol} · ${CHAIN_NAME[chain]}`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] grid gap-4 w-full">
          <div>
            <Link href="/markets" className="text-[10px] tracking-[.14em] text-[#64748B] hover:text-[#4FC3F7]">← MARKETS</Link>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <h1 className="text-[18px] font-semibold text-[#E2E8F0]">{symbol}</h1>
              <span className="text-[11px] text-[#94A3B8] font-prose">{ov?.onchain.name ?? stock?.name ?? ""}</span>
              <span className="text-[9px] rounded-full border border-[#1A1A2E] px-[7px] py-[2px] text-[#94A3B8]">{CHAIN_NAME[chain]}</span>
              {stock
                ? <span className="text-[9px] rounded-full border border-[#34D399]/30 px-[7px] py-[2px] text-[#34D399]">✓ verified stock token · tracks {stock.ticker}</span>
                : <span className="text-[9px] rounded-full border border-[#F59E0B]/30 px-[7px] py-[2px] text-[#F59E0B]">not in a stock registry · unchecked</span>}
            </div>
            <p className="mt-1 text-[10.5px] text-[#64748B]">
              <a className="text-[#4FC3F7]" href={explorerTokenUrl(chain, token)} target="_blank" rel="noreferrer">{token}</a>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-5">
            {[
              ["PRICE", usd(price), mk.pool ? `${mk.pool.name} · ${mk.pool.dex}` : "no pool listed"],
              ["24H", mk.pool?.change24hPct == null ? "—" : `${mk.pool.change24hPct >= 0 ? "+" : ""}${mk.pool.change24hPct.toFixed(2)}%`, "deepest pool"],
              ["7D", ch7 === null ? "—" : `${ch7 >= 0 ? "+" : ""}${ch7.toFixed(2)}%`, "first vs last hourly close"],
              ["24H VOLUME", usd(mk.pool?.volume24hUsd ?? null), "deepest pool"],
              ["LIQUIDITY", usd(mk.pool?.liquidityUsd ?? null), "deepest pool"],
            ].map(([l, v, s]) => (
              <div key={l} className={`${card} p-[14px]`}>
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B]">{l}</p>
                <p className="mt-1.5 text-[17px] font-semibold text-[#E2E8F0] tabular-nums">{v}</p>
                <p className="mt-0.5 truncate text-[9.5px] text-[#475569]">{s}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
            <div className="grid gap-4 content-start">
              <section className={`${card} p-4`}>
                <h2 className="mb-3 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">PRICE · 7 DAYS, HOURLY <span className="tracking-normal text-[#475569]">· GeckoTerminal</span></h2>
                {mk.status === "unread" || !mk.candlesRead ? <p className="text-[10.5px] text-[#64748B] py-10 text-center">GeckoTerminal is rate-limiting right now; reload in a minute.</p> : <Chart candles={mk.candles} />}
              </section>
              <section className={`${card} overflow-hidden`}>
                <h2 className="border-b border-[#1A1A2E] px-4 py-3 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">RECENT TRADES <span className="tracking-normal text-[#475569]">· deepest pool</span></h2>
                {!mk.tradesRead ? <p className="px-4 py-3 text-[10.5px] text-[#64748B]">GeckoTerminal is rate-limiting right now; reload in a minute.</p> : mk.trades.length === 0 ? <p className="px-4 py-3 text-[10.5px] text-[#64748B]">No trades to show.</p> : (
                  <ul>
                    {mk.trades.map((t, i) => (
                      <li key={i} className="flex items-center gap-3 border-t border-[#1A1A2E] px-4 py-2 text-[10.5px] first:border-t-0">
                        <span className={`w-9 ${t.side === "buy" ? "text-[#34D399]" : "text-[#F87171]"}`}>{t.side}</span>
                        <span className="w-20 text-right text-[#E2E8F0] tabular-nums">{usd(t.usd)}</span>
                        <span className="text-[#64748B]">{t.from ? short(t.from) : ""}</span>
                        <span className="ml-auto text-[#64748B]">{t.at.slice(5, 16).replace("T", " ")}Z</span>
                        {t.tx && <a className="text-[#4FC3F7]" href={txUrl(chain, t.tx)} target="_blank" rel="noreferrer">↗</a>}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>

            <div className="grid gap-4 content-start">
              <section className={`${card} p-4`}>
                <h2 className="mb-2 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">TRADE</h2>
                <p className="mb-3 text-[10.5px] leading-[1.6] text-[#94A3B8]">
                  {chain === "base" ? "Swap from your wallet on Base through the 0x router." : "Swap USDG for it on Robinhood Chain through the RH router."} You review the route and sign; Blue Agent never holds funds.
                </p>
                <MarketSwap chain={chain} contract={token} symbol={symbol} />
              </section>
              <section className={`${card} p-4`}>
                <h2 className="mb-2 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">ON CHAIN</h2>
                <dl className="grid grid-cols-[110px_1fr] gap-y-1.5 text-[10.5px]">
                  {[
                    ["Name", ov?.onchain.name ?? "unknown"],
                    ["Symbol", ov?.onchain.symbol ?? "unknown"],
                    ["Decimals", ov?.onchain.decimals ?? "unknown"],
                    ["Total supply", ov?.onchain.totalSupply ?? "unknown"],
                    ["Stock token", stock ? `${stock.ticker} · ${stock.venue}` : "no"],
                    ["Launchpad", ov?.launchpad?.launchpad ? `${ov.launchpad.name ?? ov.launchpad.launchpad} · ${ov.launchpad.stage}` : "none found"],
                  ].map(([k, v]) => (
                    <Fragment key={String(k)}><dt className="text-[#64748B]">{k}</dt><dd className="truncate text-[#E2E8F0]">{String(v)}</dd></Fragment>
                  ))}
                </dl>
                {stock && <Link href="/hood" className="mt-3 inline-block text-[10.5px] text-[#4FC3F7]">Oracle vs DEX for {stock.ticker} → Stock signals</Link>}
              </section>
              {mk.pools.length ? (
                <section className={`${card} p-4`}>
                  <h2 className="mb-2 text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">POOLS</h2>
                  <ul className="grid gap-1.5 text-[10.5px]">
                    {mk.pools.map((p) => (
                      <li key={p.name + p.dex} className="flex gap-2"><span className="truncate text-[#E2E8F0]">{p.name}</span><span className="text-[#64748B]">{p.dex}</span><span className="ml-auto text-[#94A3B8]">{usd(p.liquidityUsd)}</span></li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </div>
          </div>
          <p className="text-[9.5px] text-[#475569] leading-relaxed">
            Market data: GeckoTerminal, deepest pool by liquidity. On-chain facts read from {CHAIN_NAME[chain]}. {stock ? "A stock token tracks a share; it is not the share." : "Nothing on this page tests the token's tax or whether it can be sold."} Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
