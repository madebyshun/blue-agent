// /markets/weekend — Base's weekend price vs the Monday open, graded, plus
// Blue's paper book. Same views as the free x402 ids weekend-scorecard and
// weekend-diary (lib/weekend/view.ts), so the page and the API cannot disagree.
// Built to be screenshotted: every card carries its own chain + source line.
import type { Metadata } from "next";
import Link from "next/link";
import MarketsHeader from "../MarketsHeader";
import StockMark from "@/components/blue-hood/StockMark";
import { diaryView, scorecardView, weekendReplay } from "@/lib/weekend/view";
import { CallScatter, PairBars, ReplayChart } from "./charts";
import { readSessionVolume } from "@/lib/weekend/sessions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Weekend scorecard — Blue Agent",
  description: "Stocks trade on Base all weekend. Does the Sunday price call Monday's open? Graded every weekend on Base 8453.",
};

const usd = (n: number) => `$${n >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toFixed(2)}`;
const sp = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;
const tone = (n: number) => (n > 0 ? "text-[#4ADE80]" : n < 0 ? "text-[#F87171]" : "text-[#94A3B8]");
const day = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const CARD = "bg-[#0B0F1E] border border-[#1A1A2E] rounded-[16px]";
const EYEBROW = "text-[11px] tracking-[0.16em] text-[#64748B]";

function Big({ n, l, sub, accent }: { n: string; l: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`${CARD} flex-1 min-w-[160px] px-5 py-4`}>
      <div className={`text-[30px] leading-none font-semibold ${accent ? "text-[#4FC3F7]" : "text-[#F8FAFC]"}`}>{n}</div>
      <div className="text-[12px] text-[#94A3B8] mt-2">{l}</div>
      {sub && <div className="text-[11px] text-[#64748B] mt-1">{sub}</div>}
    </div>
  );
}

function Stamp() {
  return <div className="flex items-center justify-between text-[11px] text-[#475569] mt-4"><span>Base 8453 · Chainlink + Base DEX</span><span>blueagent.dev/markets/weekend</span></div>;
}

export default async function WeekendPage({ searchParams }: { searchParams: Promise<{ ticker?: string; w?: string }> }) {
  const q = await searchParams;
  const [card, diary, sessions] = await Promise.all([scorecardView({ limit: 52 }), diaryView({ limit: 52 }), readSessionVolume().catch(() => null)]);
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
  const dots = card.weekends.flatMap((w) => w.rows.map((r) => ({ x: r.weekend_move_pct, y: r.open_gap_pct, hit: r.hit, label: `${r.ticker}c · ${day(w.friday)} · Base ${sp(r.weekend_move_pct)} · open ${sp(r.open_gap_pct)}` })));

  // Replay: the requested weekend/ticker, else the latest weekend's biggest Base move.
  const rw = card.weekends.find((w) => w.friday === q.w) ?? card.weekends[0];
  const rr = rw ? (rw.rows.find((r) => r.ticker === (q.ticker ?? "").toUpperCase()) ?? [...rw.rows].sort((a, b) => Math.abs(b.weekend_move_pct) - Math.abs(a.weekend_move_pct))[0]) : undefined;
  const replay = rw && rr ? await weekendReplay(rw.friday, rr.ticker).catch(() => []) : [];

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_a]:font-mono">
      <MarketsHeader active={null} chip="Weekend · Base 8453" />
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-6 w-full max-w-[1120px] mx-auto flex flex-col gap-6">
          <section>
            <Link href="/markets" className="text-[12px] text-[#64748B] hover:text-[#94A3B8]">← Markets</Link>
            <div className={`${EYEBROW} mt-4`}>BASE 8453 · WEEKEND SCORECARD</div>
            <h1 className="mt-2 text-[30px] md:text-[38px] font-semibold text-[#F8FAFC] leading-[1.1] tracking-[-0.02em]">
              Stocks trade on Base all weekend.<br /><span className="text-[#4FC3F7]">Does Sunday&apos;s price call Monday?</span>
            </h1>
            <p className="mt-3 text-[13px] text-[#94A3B8] leading-relaxed max-w-[760px]">
              Each Coinbase stock token&apos;s Chainlink feed freezes at Friday&apos;s last print while its Base pool keeps trading. At Sunday 22:00 UTC the gap between them is Base&apos;s call. After Monday&apos;s open we grade it. Moves under 0.5%, the feed&apos;s own step, count as flat.
            </p>
          </section>

          <section className="flex gap-3 flex-wrap">
            <Big accent n={s.ready && s.hit_rate != null ? `${Math.round(s.hit_rate * 100)}%` : `${s.calls}/${s.needed}`}
              l={s.ready ? `direction right · ${s.hits} of ${s.calls} calls` : "graded calls before a rate is shown"}
              sub={s.ready && s.ci95 ? `95% CI ${Math.round(s.ci95.lo * 100)}–${Math.round(s.ci95.hi * 100)}% · p ${s.p_value_two_sided?.toFixed(2)}` : undefined} />
            <Big n={`${bigHits}/${bigCalls}`} l="right when Base moved ≥1%" sub="small sample" />
            <Big n={`${s.dex_nearer} : ${s.flat_nearer}`} l="Base price vs Friday close, nearer the open"
              sub={s.mean_dex_error_pct != null && s.mean_flat_error_pct != null ? `avg miss ${s.mean_dex_error_pct.toFixed(2)}% vs ${s.mean_flat_error_pct.toFixed(2)}%` : undefined} />
            <Big n={String(s.weekends)} l="weekends graded" sub={`${s.rows_graded} stock-weekends since Aug 28`} />
          </section>

          {sessions && (
            <section className={`${CARD} p-5`}>
              <div className={EYEBROW}>WHEN IT TRADES · {sessions.tickers.length} STOCK TOKENS · {new Date(sessions.window.from).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase()} – {new Date(Date.parse(sessions.window.to) - 86_400_000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase()}</div>
              <div className="mt-1 text-[22px] text-[#F8FAFC] font-semibold">{Math.round(100 - sessions.share.open)}% of the volume trades while NYSE is closed.</div>
              <div className="text-[12px] text-[#64748B] mt-1">${(sessions.total_usd / 1e9).toFixed(2)}B of DEX volume on Base 8453 over {sessions.window.weeks} weeks</div>
              <div className="mt-4 flex h-[44px] rounded-[10px] overflow-hidden text-[15px] font-semibold">
                {([["open", "#334155", "#F8FAFC"], ["nights", "#2B7FB0", "#F8FAFC"], ["weekend", "#4FC3F7", "#04121C"]] as const).map(([k, bg, fg]) => (
                  <div key={k} style={{ width: `${sessions.share[k]}%`, background: bg, color: fg }} className="flex items-center justify-center">{Math.round(sessions.share[k])}%</div>
                ))}
              </div>
              <div className="mt-2 flex gap-5 text-[11px] text-[#94A3B8]">
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#334155] mr-1.5" />NYSE open</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#2B7FB0] mr-1.5" />nights, pre/post</span>
                <span><span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#4FC3F7] mr-1.5" />weekend</span>
              </div>
              <div className="mt-4 grid md:grid-cols-2 gap-x-8 gap-y-2">
                {sessions.tickers.map((t) => (
                  <div key={t.ticker} className="grid grid-cols-[28px_64px_1fr_44px] items-center gap-2 text-[12px]">
                    <StockMark ticker={t.ticker} chain="base" size={22} />
                    <span className="text-[#E2E8F0]">{t.ticker}c</span>
                    <div className="flex h-[10px] rounded-sm overflow-hidden">
                      <div style={{ width: `${t.share.open}%` }} className="bg-[#334155]" /><div style={{ width: `${t.share.nights}%` }} className="bg-[#2B7FB0]" /><div style={{ width: `${t.share.weekend}%` }} className="bg-[#4FC3F7]" />
                    </div>
                    <span className="text-right text-[#94A3B8]">{Math.round(t.share.open)}%</span>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-[#475569]">{sessions.source}. {sessions.caveat}{sessions.left_out.length ? ` Left out: ${sessions.left_out.map((x) => `${x.ticker} (${x.reason})`).join(", ")}.` : ""} Right-hand figure: share traded while NYSE is open.</p>
              <Stamp />
            </section>
          )}

          {dots.length > 0 && (
            <section className="grid lg:grid-cols-2 gap-4">
              <div className={`${CARD} p-5`}>
                <div className={EYEBROW}>EVERY CALL SINCE AUG 28</div>
                <div className="mt-1 text-[16px] text-[#F8FAFC]">Green: Base called the open&apos;s direction. Red: it did not.</div>
                <div className="mt-3"><CallScatter dots={dots} /></div>
                <div className="flex gap-4 text-[11px] text-[#94A3B8] mt-1">
                  <span><span className="inline-block w-2 h-2 rounded-full bg-[#4ADE80] mr-1.5" />right</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-[#F87171] mr-1.5" />wrong</span>
                  <span><span className="inline-block w-2 h-2 rounded-full bg-[#64748B] mr-1.5" />flat, under 0.5%</span>
                </div>
                <Stamp />
              </div>
              {rw && rr && replay.length > 3 && (
                <div className={`${CARD} p-5`}>
                  <div className="flex items-center gap-3">
                    <StockMark ticker={rr.ticker} chain="base" size={30} />
                    <div>
                      <div className={EYEBROW}>WEEKEND REPLAY · {day(rw.friday).toUpperCase()}–{day(addDays(rw.friday, 3)).toUpperCase()}</div>
                      <div className="text-[16px] text-[#F8FAFC]">{rr.ticker}c on Base</div>
                    </div>
                  </div>
                  <div className="mt-3"><ReplayChart pts={replay} callAt={rw.call_at} openAt={new Date(rr.open_round_at * 1000).toISOString()} openUsd={rr.open_usd} /></div>
                  <div className="flex gap-4 text-[11px] text-[#94A3B8] mt-1">
                    <span><span className="inline-block w-3 h-[2px] bg-[#94A3B8] mr-1.5 align-middle" />Chainlink</span>
                    <span><span className="inline-block w-3 h-[2px] bg-[#4FC3F7] mr-1.5 align-middle" />Base DEX</span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-[12px]">
                    <div><div className="text-[#64748B]">Base, Sunday</div><div className={`text-[18px] ${tone(rr.weekend_move_pct)}`}>{sp(rr.weekend_move_pct)}</div></div>
                    <div><div className="text-[#64748B]">Open vs Friday</div><div className={`text-[18px] ${tone(rr.open_gap_pct)}`}>{sp(rr.open_gap_pct)}</div></div>
                    <div><div className="text-[#64748B]">ETH, same window</div><div className={`text-[18px] ${tone(rw.crypto?.eth_pct ?? 0)}`}>{rw.crypto?.eth_pct != null ? sp(rw.crypto.eth_pct) : "—"}</div></div>
                  </div>
                  <Stamp />
                </div>
              )}
            </section>
          )}

          {now && (
            <section className={`${CARD} p-5`}>
              <div className={EYEBROW}>{card.live ? "THIS WEEKEND · LIVE READING" : `WEEKEND OF ${day(now.friday).toUpperCase()} · CALL TAKEN, WAITING FOR THE OPEN`}</div>
              {card.live && <p className="text-[12px] text-[#64748B] mt-1">{card.live.note}</p>}
              <div className="mt-3 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {now.rows.map((r) => (
                  <a key={r.ticker} href={r.explorer} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-[10px] border border-[#1A1A2E] px-3 py-2.5 hover:border-[#4FC3F7]/40">
                    <StockMark ticker={r.ticker} chain="base" size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-[#E2E8F0]">{r.ticker}c</div>
                      <div className="text-[11px] text-[#64748B]">Fri {usd(r.close_usd)} → Base {usd(r.dex_usd)}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-[15px] ${tone(r.weekend_move_pct)}`}>{sp(r.weekend_move_pct)}</div>
                      <div className="text-[11px] text-[#94A3B8]">{r.call}</div>
                    </div>
                  </a>
                ))}
              </div>
              <Stamp />
            </section>
          )}

          <section>
            <div className={EYEBROW}>GRADED WEEKENDS</div>
            <div className="mt-1 text-[12px] text-[#64748B]"><span className="inline-block w-3 h-[7px] rounded-sm bg-[#4FC3F7] mr-1.5" />Base weekend move <span className="inline-block w-3 h-[7px] rounded-sm bg-[#4ADE80] ml-3 mr-1.5" />open vs Friday close</div>
            <div className="mt-3 grid md:grid-cols-2 gap-3">
              {card.weekends.map((w) => (
                <div key={w.friday} className={`${CARD} p-4`}>
                  <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <Link href={`/markets/weekend?w=${w.friday}`} className="text-[14px] text-[#F8FAFC] hover:text-[#4FC3F7]">Weekend of {day(w.friday)}</Link>
                    <span className="text-[12px] text-[#94A3B8]">{w.rows.filter((r) => r.hit).length} of {w.rows.filter((r) => r.hit !== null).length} right
                      {w.crypto?.btc_pct != null && <span className="text-[#64748B]"> · BTC {sp(w.crypto.btc_pct)} · ETH {w.crypto.eth_pct != null ? sp(w.crypto.eth_pct) : "—"}</span>}
                    </span>
                  </div>
                  <div className="mt-3"><PairBars rows={w.rows.map((r) => ({ ticker: r.ticker, move: r.weekend_move_pct, gap: r.open_gap_pct, hit: r.hit }))} /></div>
                  {(w.excluded.length > 0 || w.ungraded.length > 0) && (
                    <p className="mt-2 text-[11px] text-[#475569]">Left out: {[...w.excluded, ...w.ungraded].map((x) => `${x.ticker} (${x.reason})`).join(", ")}</p>
                  )}
                </div>
              ))}
              {card.weekends.length === 0 && <p className="text-[13px] text-[#64748B]">No weekend graded yet.</p>}
            </div>
          </section>

          <section className={`${CARD} p-5`}>
            <div className={EYEBROW}>BLUE&apos;S WEEKEND BOOK · PAPER · BASE 8453</div>
            <p className="mt-2 text-[13px] text-[#94A3B8] leading-relaxed max-w-[860px]">{diary.rule}</p>
            <div className="mt-4 flex gap-3 flex-wrap">
              <Big n={`${diary.backtest.wins}/${diary.backtest.trades}`} l="backtest trades that made money" sub={`avg ${sp(diary.backtest.avg_return_pct)} · ${diary.backtest.weekends} archived weekends, before the rule went live`} />
              <Big accent n={diary.forward.trades ? `${diary.forward.wins}/${diary.forward.trades}` : "Sun 22:00"} l={diary.forward.trades ? "forward trades that made money" : "first live entry, UTC"}
                sub={diary.forward.trades ? `paper P&L ${diary.forward.pnl_usd >= 0 ? "+" : "−"}$${Math.abs(diary.forward.pnl_usd).toFixed(2)}` : `rule fixed ${diary.rule_fixed_at}`} />
            </div>
            <div className="mt-4 flex flex-col gap-3">
              {diary.entries.map((e) => (
                <div key={e.friday} className="rounded-[12px] border border-[#1A1A2E] px-4 py-3 text-[13px]">
                  <div className="text-[#E2E8F0]">Weekend of {day(e.friday)} · {e.positions.length ? e.positions.map((p) => `${p.side} ${p.ticker}c`).join(", ") : "no positions"}</div>
                  {e.note_open && <p className="mt-1.5 text-[#94A3B8]">{e.note_open}</p>}
                  {e.results && (
                    <p className="mt-1.5 text-[#94A3B8]">
                      Closed at the open: {e.results.map((r) => <span key={r.ticker} className={tone(r.pnl_usd)}>{r.ticker}c {sp(r.return_pct)} </span>)}
                      · total <span className={tone(e.pnl_usd ?? 0)}>{(e.pnl_usd ?? 0) >= 0 ? "+" : "−"}${Math.abs(e.pnl_usd ?? 0).toFixed(2)}</span>
                    </p>
                  )}
                  {e.note_close && <p className="mt-1.5 text-[#94A3B8]">{e.note_close}</p>}
                  {(e.note_open || e.note_close) && <p className="mt-1 text-[11px] text-[#475569]">Notes are model-generated from the numbers above.</p>}
                </div>
              ))}
            </div>
          </section>

          <p className="text-[12px] text-[#64748B] leading-relaxed">
            Sources: the Blue Hood Base desk archive (hourly since Aug 28), Chainlink feeds and B20 multiplier() read on Base 8453 where the archive has a hole, Coinbase Exchange candles for BTC and ETH. Free for agents: POST /api/x402/weekend-scorecard, no payment. A stock token tracks a share; it is not the share. Not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}
