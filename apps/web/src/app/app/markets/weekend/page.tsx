// /markets/weekend — Base's weekend price vs the Monday open, graded, plus
// Blue's paper book. Same views as the free x402 ids weekend-scorecard and
// weekend-diary (lib/weekend/view.ts), so the page and the API cannot disagree.
import type { Metadata } from "next";
import Link from "next/link";
import MarketsHeader from "../MarketsHeader";
import { diaryView, scorecardView } from "@/lib/weekend/view";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Weekend scorecard — Blue Agent",
  description: "Stocks trade on Base all weekend. Does the Sunday price call Monday's open? Graded every weekend on Base 8453.",
};

const usd = (n: number) => `$${n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(2)}`;
const sp = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number) => (n > 0 ? "text-[#4ADE80]" : n < 0 ? "text-[#F87171]" : "text-[#94A3B8]");
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function Stat({ n, l, sub }: { n: string; l: string; sub?: string }) {
  return (
    <div className="flex-1 min-w-[150px] bg-[#0B0F1E] border border-[#1A1A2E] rounded-[12px] px-4 py-3">
      <div className="text-[22px] font-semibold text-[#F8FAFC]">{n}</div>
      <div className="text-[12px] text-[#94A3B8] mt-0.5">{l}</div>
      {sub && <div className="text-[11px] text-[#64748B] mt-1">{sub}</div>}
    </div>
  );
}

export default async function WeekendPage() {
  const [card, diary] = await Promise.all([scorecardView({ limit: 52 }), diaryView({ limit: 52 })]);
  if (card === "error" || diary === "error") {
    return (
      <div className="flex flex-col h-full bg-[#050508] font-mono">
        <MarketsHeader active={null} chip="Weekend · Base 8453" />
        <p className="p-6 text-[13px] text-[#F59E0B]">The weekend record could not be read right now. Nothing is shown rather than an empty card; try again shortly.</p>
      </div>
    );
  }
  const s = card.summary;
  const big = s.by_size.filter((b) => b.bucket !== "0.5–1%");
  const bigCalls = big.reduce((a, b) => a + b.calls, 0), bigHits = big.reduce((a, b) => a + b.hits, 0);
  const now = card.live ?? card.pending;

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <MarketsHeader active={null} chip="Weekend · Base 8453" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full max-w-[1100px] flex flex-col gap-6">
          <section>
            <Link href="/markets" className="text-[12px] text-[#64748B] hover:text-[#94A3B8]">← Markets</Link>
            <h1 className="mt-2 text-[22px] font-semibold text-[#F8FAFC] leading-snug">Stocks trade on Base all weekend. Does Sunday&apos;s price call Monday?</h1>
            <p className="mt-2 text-[13px] text-[#94A3B8] leading-relaxed max-w-[820px]">
              The Chainlink feed for each Coinbase stock token freezes at Friday&apos;s last print. The Base pool keeps trading. At Sunday 22:00 UTC we take the gap between them as Base&apos;s call, then grade it against the oracle after Monday&apos;s open. Moves under 0.5% (the feed&apos;s own step) are flat and not graded.
            </p>
          </section>

          <section className="flex gap-3 flex-wrap">
            <Stat
              n={s.ready && s.hit_rate != null ? `${Math.round(s.hit_rate * 100)}%` : `${s.calls} of ${s.needed}`}
              l={s.ready ? `direction right, ${s.hits} of ${s.calls} calls` : "graded calls before a rate is shown"}
              sub={s.ready && s.ci95 ? `95% CI ${Math.round(s.ci95.lo * 100)}–${Math.round(s.ci95.hi * 100)}% · p ${s.p_value_two_sided}` : undefined}
            />
            <Stat n={`${bigHits} of ${bigCalls}`} l="right when Base moved 1% or more" sub="small sample, read with care" />
            <Stat n={`${s.dex_nearer} vs ${s.flat_nearer}`} l="Base price vs Friday close: nearer the open" sub={s.mean_dex_error_pct != null && s.mean_flat_error_pct != null ? `mean miss ${s.mean_dex_error_pct.toFixed(2)}% vs ${s.mean_flat_error_pct.toFixed(2)}%` : undefined} />
            <Stat n={String(s.weekends)} l="weekends graded" sub={`${s.rows_graded} stock-weekends since Aug 28`} />
          </section>

          {now && (
            <section>
              <h2 className="text-[14px] text-[#E2E8F0] tracking-[0.08em]">
                {card.live ? "THIS WEEKEND · LIVE READING" : `WEEKEND OF ${day(now.friday).toUpperCase()} · CALL TAKEN, WAITING FOR THE OPEN`}
              </h2>
              {card.live && <p className="text-[12px] text-[#64748B] mt-1">{card.live.note}</p>}
              <table className="mt-2 w-full text-[13px]">
                <thead><tr className="text-[#64748B] text-left"><th className="py-1.5">Stock</th><th className="text-right">Friday close</th><th className="text-right">{card.live ? "Base now" : "Base Sunday"}</th><th className="text-right">Weekend move</th><th className="text-right">Call</th></tr></thead>
                <tbody>
                  {now.rows.map((r) => (
                    <tr key={r.ticker} className="border-t border-[#1A1A2E]">
                      <td className="py-1.5"><a href={r.explorer} target="_blank" rel="noreferrer" className="text-[#E2E8F0] hover:text-[#4FC3F7]">{r.ticker}c</a></td>
                      <td className="text-right text-[#94A3B8]">{usd(r.close_usd)}</td>
                      <td className="text-right text-[#E2E8F0]">{usd(r.dex_usd)}</td>
                      <td className={`text-right ${tone(r.weekend_move_pct)}`}>{sp(r.weekend_move_pct)}</td>
                      <td className="text-right text-[#94A3B8]">{r.call}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section>
            <h2 className="text-[14px] text-[#E2E8F0] tracking-[0.08em]">GRADED WEEKENDS</h2>
            <div className="mt-2 flex flex-col gap-3">
              {card.weekends.map((w) => (
                <details key={w.friday} className="bg-[#0B0F1E] border border-[#1A1A2E] rounded-[10px] px-4 py-2.5">
                  <summary className="cursor-pointer text-[13px] text-[#E2E8F0] flex gap-4 flex-wrap">
                    <span>Weekend of {day(w.friday)}</span>
                    <span className="text-[#94A3B8]">{w.rows.filter((r) => r.hit).length} of {w.rows.filter((r) => r.hit !== null).length} calls right</span>
                    {w.crypto?.btc_pct != null && <span className="text-[#64748B]">BTC {sp(w.crypto.btc_pct)} · ETH {w.crypto.eth_pct != null ? sp(w.crypto.eth_pct) : "—"}</span>}
                  </summary>
                  <table className="mt-2 w-full text-[12px]">
                    <thead><tr className="text-[#64748B] text-left"><th className="py-1">Stock</th><th className="text-right">Base Sunday</th><th className="text-right">Open vs Friday</th><th className="text-right">Call</th><th className="text-right">Result</th></tr></thead>
                    <tbody>
                      {w.rows.map((r) => (
                        <tr key={r.ticker} className="border-t border-[#1A1A2E]">
                          <td className="py-1"><a href={r.explorer} target="_blank" rel="noreferrer" className="text-[#E2E8F0] hover:text-[#4FC3F7]">{r.ticker}c</a></td>
                          <td className={`text-right ${tone(r.weekend_move_pct)}`}>{sp(r.weekend_move_pct)}</td>
                          <td className={`text-right ${tone(r.open_gap_pct)}`}>{sp(r.open_gap_pct)}</td>
                          <td className="text-right text-[#94A3B8]">{r.call}</td>
                          <td className="text-right">{r.hit === null ? <span className="text-[#64748B]">flat</span> : r.hit ? <span className="text-[#4ADE80]">right</span> : <span className="text-[#F87171]">wrong</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(w.excluded.length > 0 || w.ungraded.length > 0) && (
                    <p className="mt-1.5 text-[11px] text-[#64748B]">Left out: {[...w.excluded, ...w.ungraded].map((x) => `${x.ticker} (${x.reason})`).join(", ")}</p>
                  )}
                </details>
              ))}
              {card.weekends.length === 0 && <p className="text-[13px] text-[#64748B]">No weekend graded yet.</p>}
            </div>
          </section>

          <section>
            <h2 className="text-[14px] text-[#E2E8F0] tracking-[0.08em]">BLUE&apos;S WEEKEND BOOK · PAPER</h2>
            <p className="mt-1.5 text-[13px] text-[#94A3B8] leading-relaxed max-w-[820px]">{diary.rule}</p>
            <div className="mt-3 flex gap-3 flex-wrap">
              <Stat n={`${diary.backtest.wins} of ${diary.backtest.trades}`} l="backtest trades that made money" sub={`avg ${sp(diary.backtest.avg_return_pct)} · ${diary.backtest.weekends} archived weekends, before the rule went live`} />
              <Stat n={diary.forward.trades ? `${diary.forward.wins} of ${diary.forward.trades}` : "starts Sunday"} l="forward trades that made money" sub={diary.forward.trades ? `paper P&L ${diary.forward.pnl_usd >= 0 ? "+" : "−"}$${Math.abs(diary.forward.pnl_usd).toFixed(2)}` : `rule fixed ${diary.rule_fixed_at}`} />
            </div>
            <div className="mt-3 flex flex-col gap-3">
              {diary.entries.map((e) => (
                <div key={e.friday} className="bg-[#0B0F1E] border border-[#1A1A2E] rounded-[10px] px-4 py-3 text-[13px]">
                  <div className="text-[#E2E8F0]">Weekend of {day(e.friday)} · {e.positions.length ? e.positions.map((p) => `${p.side} ${p.ticker}c`).join(", ") : "no positions"}</div>
                  {e.note_open && <p className="mt-1.5 text-[#94A3B8]">{e.note_open}</p>}
                  {e.results && (
                    <p className="mt-1.5 text-[#94A3B8]">
                      Closed at the open: {e.results.map((r) => <span key={r.ticker} className={tone(r.pnl_usd)}>{r.ticker}c {sp(r.return_pct)} </span>)}
                      · total <span className={tone(e.pnl_usd ?? 0)}>{(e.pnl_usd ?? 0) >= 0 ? "+" : "−"}${Math.abs(e.pnl_usd ?? 0).toFixed(2)}</span>
                    </p>
                  )}
                  {e.note_close && <p className="mt-1.5 text-[#94A3B8]">{e.note_close}</p>}
                  {(e.note_open || e.note_close) && <p className="mt-1 text-[11px] text-[#64748B]">Notes are model-generated from the numbers above.</p>}
                </div>
              ))}
              {diary.entries.length === 0 && <p className="text-[13px] text-[#64748B]">The first entry is written at Sunday 22:00 UTC.</p>}
            </div>
          </section>

          <p className="text-[12px] text-[#64748B] leading-relaxed">
            Sources: the Blue Hood Base desk archive (hourly since Aug 28), Chainlink feeds and B20 multiplier() read on Base 8453 where the archive has a hole, Coinbase Exchange candles for BTC and ETH. Free for agents: POST /api/x402/weekend-scorecard and /api/x402/weekend-diary, no payment. A stock token tracks a share; it is not the share. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
