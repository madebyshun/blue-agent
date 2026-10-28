"use client";

// The right rail on every Agents page (after TOLLY's): trending sellers, the
// measured x402 volume on Base, and the newest open jobs. One fetch, cached
// five minutes on the server (/api/hub/summary); every figure says "measured".
import { useEffect, useState } from "react";
import Link from "next/link";

interface Summary {
  readable: boolean; window_days: number;
  daily: { day: string; usd: number; calls: number }[];
  usd7: number; usdAll: number; calls7: number;
  trending: { payTo: string; host: string | null; usd7: number }[];
  jobs: { id: string; title: string; budget: number }[];
}

const usd = (n: number) => (n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toFixed(2)}`);
const card = "rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14] p-[14px]";

export default function AgentsRail() {
  const [s, setS] = useState<Summary | null>(null);
  const [range, setRange] = useState<"7d" | "all">("7d");
  useEffect(() => { fetch("/api/hub/summary").then((r) => (r.ok ? r.json() : null)).then(setS).catch(() => setS(null)); }, []);
  const series = (s?.daily ?? []).slice(range === "7d" ? -7 : 0).map((d) => d.usd);
  const peak = Math.max(0.01, ...series);
  const pts = series.map((v, i) => `${(i / Math.max(1, series.length - 1)) * 100},${40 - (v / peak) * 36}`).join(" ");

  return (
    <aside className="hidden 2xl:flex w-[290px] shrink-0 flex-col gap-3 overflow-y-auto border-l border-[#1A1A2E] bg-[#050508] p-3 font-mono">
      <div className={card}>
        <div className="flex items-baseline">
          <p className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">TRENDING SELLERS · 7D</p>
          <Link href="/exchange" className="ml-auto text-[9.5px] text-[#4FC3F7]">all →</Link>
        </div>
        {!s ? <p className="mt-2 text-[10px] text-[#64748B]">Loading…</p> : s.trending.length === 0 ? <p className="mt-2 text-[10px] text-[#64748B]">Indexing.</p> : (
          <ol className="mt-2 grid gap-1.5">
            {s.trending.map((t, i) => (
              <li key={t.payTo}>
                <Link href={`/exchange/${t.payTo}`} className="flex items-center gap-2 text-[10.5px] hover:text-[#4FC3F7]">
                  <span className="w-4 text-[#475569] tabular-nums">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-[#E2E8F0]">{t.host ?? `${t.payTo.slice(0, 8)}…`}</span>
                  <span className="text-[#94A3B8] tabular-nums">{usd(t.usd7)}</span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className={card}>
        <p className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">X402 VOLUME · BASE</p>
        <p className="mt-1.5 text-[20px] font-semibold text-[#E2E8F0] tabular-nums">{s ? usd(range === "7d" ? s.usd7 : s.usdAll) : "—"}</p>
        <p className="text-[9px] text-[#475569]">measured, settled on Base{s ? ` · ${range === "7d" ? "7 days" : `${s.window_days} days`}` : ""}</p>
        {series.length > 1 && (
          <svg viewBox="0 0 100 42" preserveAspectRatio="none" className="mt-2 h-12 w-full">
            <polyline points={pts} fill="none" stroke="#4FC3F7" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
          </svg>
        )}
        <div className="mt-2 flex gap-1">
          {(["7d", "all"] as const).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} className="flex-1 rounded-full border px-2 py-[3px] text-[9px]"
              style={range === r ? { color: "#050508", background: "#4FC3F7", borderColor: "#4FC3F7", fontWeight: 600 } : { color: "#94A3B8", borderColor: "#1A1A2E" }}>
              {r === "7d" ? "7D" : "ALL"}
            </button>
          ))}
        </div>
        {s && <p className="mt-2 text-[9.5px] text-[#64748B]">{s.calls7.toLocaleString("en-US")} paid calls in 7 days</p>}
      </div>

      <div className={card}>
        <div className="flex items-baseline">
          <p className="text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">OPEN JOBS</p>
          <Link href="/jobs" className="ml-auto text-[9.5px] text-[#4FC3F7]">all →</Link>
        </div>
        {!s ? null : s.jobs.length === 0 ? (
          <p className="mt-2 text-[10px] leading-[1.6] text-[#64748B]">No open jobs. <Link className="text-[#4FC3F7]" href="/jobs">Post the first one →</Link></p>
        ) : s.jobs.map((j) => (
          <Link key={j.id} href={`/jobs/${j.id}`} className="mt-2 block text-[10.5px] text-[#E2E8F0] hover:text-[#4FC3F7]">
            {j.title} <span className="text-[#64748B]">· up to ${j.budget.toFixed(2)}</span>
          </Link>
        ))}
      </div>

      <p className="px-1 text-[9.5px] italic leading-relaxed text-[#475569]">
        &ldquo;Receipts, not reviews.&rdquo; Every figure here is read from settled payments on Base.
      </p>
    </aside>
  );
}
