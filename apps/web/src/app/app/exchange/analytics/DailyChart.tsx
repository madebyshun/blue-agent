"use client";

// Interactive per-day chart for /exchange/analytics: pick the metric (USDC
// volume, paid calls, sellers paid), every bar labelled with its value and day,
// hover shows the whole day. Same numbers the page already measured (readExchange
// daily); the first day began mid-backfill and today is partial, both marked.
import { useState } from "react";

export interface Day { day: string; usd: number; calls: number; sellers: number }
type Metric = "usd" | "calls" | "sellers";
const METRICS: [Metric, string][] = [["usd", "Volume (USDC)"], ["calls", "Paid calls"], ["sellers", "Sellers paid"]];

const ymd = (d: string) => `${d.slice(4, 6)}-${d.slice(6)}`;
const fmt = (m: Metric, n: number) =>
  m === "usd" ? (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(0)}`) : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
const full = (m: Metric, n: number) => m === "usd" ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : n.toLocaleString("en-US");

export default function DailyChart({ days }: { days: Day[] }) {
  const [m, setM] = useState<Metric>("usd");
  const [hover, setHover] = useState<number | null>(null);
  const vals = days.map((d) => d[m]);
  const peak = Math.max(...vals, 1e-9);
  const ticks = [1, 0.75, 0.5, 0.25, 0];
  const whole = days.slice(1, -1).map((d) => d[m]);
  const avg = whole.length ? whole.reduce((a, b) => a + b, 0) / whole.length : null;
  const h = hover !== null ? days[hover] : null;
  const note = (i: number) => (i === days.length - 1 ? "today, partial" : i === 0 ? "backfill began mid-day" : null);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap mb-3">
        {METRICS.map(([id, l]) => (
          <button key={id} type="button" onClick={() => setM(id)}
            className={`text-[10px] rounded-[6px] px-2.5 py-1 border ${m === id ? "border-[#4FC3F7]/60 text-[#4FC3F7] bg-[#4FC3F7]/10" : "border-[#1A1A2E] text-[#94A3B8] hover:text-[#E2E8F0]"}`}>{l}</button>
        ))}
        <span className="ml-auto text-[10px] tabular-nums text-[#64748B]">
          {h ? <>
            <span className="text-[#E2E8F0]">{ymd(h.day)}</span>{note(hover!) && <span className="text-[#F59E0B]"> ({note(hover!)})</span>}
            {" · "}<span className="text-[#E2E8F0]">{full("usd", h.usd)}</span> USDC · <span className="text-[#E2E8F0]">{h.calls.toLocaleString("en-US")}</span> paid calls · <span className="text-[#E2E8F0]">{h.sellers.toLocaleString("en-US")}</span> sellers paid
          </> : avg !== null ? <>whole-day average: <span className="text-[#E2E8F0]">{full(m, Math.round(avg * 100) / 100)}</span> · hover a bar for the day</> : "hover a bar for the day"}
        </span>
      </div>
      <div className="flex gap-2">
        <div className="relative w-[52px] shrink-0 h-[200px] text-[9px] text-[#475569] tabular-nums">
          {ticks.map((t) => <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(1 - t) * 100}%` }}>{fmt(m, peak * t)}</span>)}
        </div>
        <div className="relative flex-1">
          {ticks.map((t) => <div key={t} className="absolute inset-x-0 border-t border-dashed border-[#1A1A2E]" style={{ top: `${(1 - t) * 200}px` }} />)}
          {avg !== null && <div className="absolute inset-x-0 border-t border-[#F59E0B]/40" style={{ top: `${(1 - avg / peak) * 200}px` }} title="whole-day average" />}
          <div className="relative flex h-[200px] items-end gap-1.5" onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => {
              const v = d[m], partial = note(i) !== null;
              return (
                <div key={d.day} className="relative flex h-full flex-1 flex-col justify-end items-center cursor-default" onMouseEnter={() => setHover(i)}>
                  <span className={`mb-1 text-[9.5px] tabular-nums ${hover === i ? "text-[#E2E8F0]" : "text-[#94A3B8]"}`}>{fmt(m, v)}</span>
                  <span className="block w-full rounded-t-[3px] transition-colors"
                    style={{ height: `${Math.max(1, (v / peak) * 85)}%`, background: hover === i ? "#4FC3F7" : partial ? "rgba(31,111,147,.45)" : "#1f6f93" }} />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex gap-1.5">
            {days.map((d, i) => <span key={d.day} className={`flex-1 text-center text-[9px] ${hover === i ? "text-[#E2E8F0]" : "text-[#475569]"}`}>{ymd(d.day)}{note(i) ? "*" : ""}</span>)}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[9px] text-[#475569]">* first indexed day began mid-backfill; the last is today, partial. Orange line: average of whole days only.</p>
    </div>
  );
}
