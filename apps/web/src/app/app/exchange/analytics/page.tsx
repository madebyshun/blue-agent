// /exchange/analytics — the whole x402 market on Base, per day, from the same
// index as the seller list (lib/hub/exchange). Every bar is measured; today is
// marked partial, and the first indexed day began mid-backfill.
import type { Metadata } from "next";
import { readExchange } from "@/lib/hub/exchange";
import ExchangeHeader from "../ExchangeHeader";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Analytics — Agent Exchange" };

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`);
const ymd = (d: string) => `${d.slice(4, 6)}-${d.slice(6)}`;

export default async function AnalyticsPage() {
  const ex = await readExchange(30);
  const days = ex.daily;
  const tot = days.reduce((a, d) => ({ usd: a.usd + d.usd, calls: a.calls + d.calls }), { usd: 0, calls: 0 });
  const peakUsd = Math.max(0.01, ...days.map((d) => d.usd));
  const peakCalls = Math.max(1, ...days.map((d) => d.calls));
  const top = ex.rows.slice(0, 10);
  const share = (u: number) => (tot.usd ? Math.round((u / tot.usd) * 1000) / 10 : 0);
  const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px]";
  const L = ({ t, s }: { t: string; s?: string }) => (
    <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
      <span className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{t}</span>
      {s && <span className="text-[10px] text-[#475569]">{s}</span>}
    </div>
  );
  const Bars = ({ v, peak, fmt }: { v: number[]; peak: number; fmt: (n: number) => string }) => (
    <div className="flex h-[150px] items-end gap-1">
      {v.map((n, i) => (
        <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${ymd(days[i].day)}: ${fmt(n)}${i === v.length - 1 ? " (today, partial)" : i === 0 ? " (backfill began mid-day)" : ""}`}>
          <span className={`block rounded-t-sm ${i === v.length - 1 || i === 0 ? "bg-[#1f6f93]/45" : "bg-[#1f6f93]"}`} style={{ height: `${Math.max(1, (n / peak) * 100)}%` }} />
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <ExchangeHeader active="analytics" chip={`${ex.daysCovered} day${ex.daysCovered === 1 ? "" : "s"} indexed · Base 8453`} />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <div className="grid gap-2.5 grid-cols-2 md:grid-cols-4">
            {[
              ["X402 VOLUME", usd(tot.usd), `${ex.daysCovered} day${ex.daysCovered === 1 ? "" : "s"}, every listed seller`],
              ["PAID CALLS", tot.calls.toLocaleString("en-US"), "EIP-3009 settlements"],
              ["SELLERS PAID", String(ex.rows.length), `of ${ex.providersListed.toLocaleString("en-US")} listed`],
              ["TOP 10 SHARE", `${share(top.reduce((a, r) => a + r.usd, 0))}%`, "of the volume"],
            ].map(([l, v, s]) => (
              <div key={l} className={card}>
                <p className="text-[9.5px] tracking-[0.12em] text-[#64748B]">{l}</p>
                <p className="mt-1.5 text-[18px] font-semibold text-[#E2E8F0] tabular-nums">{ex.readable && days.length ? v : "—"}</p>
                <p className="mt-0.5 text-[9.5px] text-[#475569]">{s}</p>
              </div>
            ))}
          </div>

          {days.length === 0 ? <p className="mt-6 text-[10.5px] text-[#64748B]">{ex.readable ? "Indexing the first day of Base blocks." : "Index unreadable right now."}</p> : (
            <>
              <L t="VOLUME PER DAY" s="USDC settled on Base · lighter bars: today (partial) and the first, mid-backfill day" />
              <div className={card}>
                <Bars v={days.map((d) => d.usd)} peak={peakUsd} fmt={usd} />
                <div className="mt-2 flex justify-between text-[9px] text-[#475569]"><span>{ymd(days[0].day)}</span><span>{ymd(days[days.length - 1].day)}</span></div>
              </div>
              <div className="grid gap-2.5 lg:grid-cols-2">
                <div>
                  <L t="PAID CALLS PER DAY" />
                  <div className={card}><Bars v={days.map((d) => d.calls)} peak={peakCalls} fmt={(n) => `${n} calls`} /></div>
                </div>
                <div>
                  <L t="TOP SELLERS" s="share of the window's volume" />
                  <div className={`${card} grid gap-1.5`}>
                    {top.map((r) => (
                      <div key={r.payTo} className="flex items-center gap-3 text-[10.5px]">
                        <span className="w-[40%] truncate text-[#E2E8F0]">{r.hosts[0] ?? r.payTo.slice(0, 10)}</span>
                        <span className="flex-1 h-1.5 rounded-full bg-[#1A1A2E] overflow-hidden"><span className="block h-full bg-[#1f6f93]" style={{ width: `${share(r.usd)}%` }} /></span>
                        <span className="w-[70px] text-right text-[#94A3B8] tabular-nums">{usd(r.usd)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
          <p className="text-[9.5px] text-[#475569] mt-4 leading-relaxed">
            Same index as the seller list: USDC paid to a Bazaar seller&apos;s payTo in a transaction that used the payer&apos;s EIP-3009 authorization. Gross; plain transfers are not counted.
          </p>
        </div>
      </div>
    </div>
  );
}
