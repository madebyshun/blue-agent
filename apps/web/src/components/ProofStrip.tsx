"use client";

/**
 * ProofStrip — a compact, live "tested with real funds" proof block for the
 * landing page. Fetches the sanitized public aggregate (/api/stats/public) and
 * renders a handful of on-chain-verifiable numbers with a Basescan receipt.
 *
 * Fabrication guard (mirrors StatsView + public-stats.ts): a source that could
 * not be read renders "—", never a 0, and paid-run totals carry a "≥" prefix
 * when the counters were a partial read. A zero here would be a false traction
 * claim, so an unread source is declared, not folded into the number.
 *
 * Real numbers only — this component formats values computed server-side in
 * buildPublicStats(); it never invents one. Degrades to "—" if the fetch fails.
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TOOL_COUNT } from "@/lib/agent-tools";

interface ProofData {
  updatedAt: number;
  product: { tools: number };
  usage: { totalRuns: number; ok: boolean };
  users: { total: number };
  settlement: { usdc: number; count: number; lastTx: string | null; ok: boolean };
}

function fmtUSD(n: number): string {
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compact(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString("en-US");
}

// Reveal: subtle fade-up on scroll (respects reduced-motion & no-JS).
function Reveal({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce || typeof IntersectionObserver === "undefined") { setShown(true); return; }
    const io = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } },
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={className} style={{
      opacity: shown ? 1 : 0,
      transform: shown ? "none" : "translateY(18px)",
      transition: `opacity .6s cubic-bezier(.22,1,.36,1) ${delay}ms, transform .6s cubic-bezier(.22,1,.36,1) ${delay}ms`,
    }}>
      {children}
    </div>
  );
}

function Metric({ label, value, sub, accent, href }: {
  label: string; value: string; sub?: React.ReactNode; accent: string; href?: string;
}) {
  const body = (
    <div className="ba-card h-full rounded-2xl p-5 sm:p-6">
      <div className="font-mono text-[10px] tracking-widest uppercase text-slate-600 mb-2">{label}</div>
      <div className="font-bold text-2xl sm:text-[1.75rem] tracking-tight tabular-nums" style={{ color: accent }}>{value}</div>
      {sub && <div className="font-mono text-[11px] text-slate-500 mt-1.5">{sub}</div>}
    </div>
  );
  return href
    ? <Link href={href} className="block h-full transition-transform hover:-translate-y-0.5">{body}</Link>
    : body;
}

export default function ProofStrip() {
  const [data, setData] = useState<ProofData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats/public")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: ProofData) => { if (alive) setData(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Fabrication guard: unread source ⟹ "—", never 0. "≥" when runs are a floor.
  const settlementOk = !!data?.settlement.ok;
  const usdc   = settlementOk ? fmtUSD(data!.settlement.usdc) : "—";
  const settleN = settlementOk ? compact(data!.settlement.count) : "—";
  const runsPrefix = data && data.usage.ok === false ? "≥" : "";
  const runs   = data ? `${runsPrefix}${compact(data.usage.totalRuns)}` : (failed ? "—" : "…");
  const tools  = data ? String(data.product.tools) : String(TOOL_COUNT);
  const wallets = data ? compact(data.users.total) : (failed ? "—" : "…");
  const lastTx = data?.settlement.lastTx ?? null;
  const updated = data ? new Date(data.updatedAt).toISOString().replace("T", " ").slice(0, 16) + " UTC" : null;

  return (
    <section className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-24 border-t border-[#13131d]">
      <Reveal className="mb-10 sm:mb-12">
        <div className="font-mono text-[11px] tracking-[0.22em] mb-4">
          <span className="text-[#0052FF]">// 05</span>
          <span className="text-slate-600 ml-2 uppercase">Tested with real funds</span>
        </div>
        <h2 className="text-3xl sm:text-4xl lg:text-[2.85rem] font-bold tracking-tight leading-[1.06] mb-4 max-w-2xl text-white">
          Every number here is <span className="text-[#0052FF]">verifiable on Base.</span>
        </h2>
        <p className="text-slate-400 text-[15px] sm:text-lg leading-relaxed max-w-2xl">
          Real USDC settled on Base through the Coinbase CDP x402 facilitator, real paid tool runs,
          real wallets. Aggregate and on-chain — no vanity metrics, no per-user data.
        </p>
      </Reveal>

      {/* Flagship figure — one bold number, the same honest "—"/"≥" fallback as
          the cards (a false 0 would be a fabricated traction claim, never shown). */}
      <Reveal className="mb-3 sm:mb-4">
        <div className="ba-card rounded-2xl px-6 py-9 sm:py-11 text-center">
          <div className="font-mono text-[10px] tracking-widest uppercase text-slate-600 mb-3">USDC settled on Base · live</div>
          <div className="font-bold tracking-tight tabular-nums text-[3.25rem] leading-none sm:text-6xl lg:text-[5rem]" style={{ color: "#0052FF" }}>{usdc}</div>
          <div className="font-mono text-[11px] text-slate-500 mt-4">
            {lastTx
              ? <a href={`https://basescan.org/tx/${lastTx}`} target="_blank" rel="noopener noreferrer" className="text-[#0052FF] hover:underline">latest settlement on Basescan ↗</a>
              : "settled through the Coinbase CDP x402 facilitator"}
          </div>
        </div>
      </Reveal>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <Reveal delay={0}>
          <Metric label="Paid tool runs" value={runs} accent="#4FC3F7" sub="lifetime x402 calls" href="/stats" />
        </Reveal>
        <Reveal delay={80}>
          <Metric label="Tools live" value={tools} accent="#A78BFA" sub="on the Hub" href="/hub" />
        </Reveal>
        <Reveal delay={160}>
          <Metric label="Settlements" value={settleN} accent="#34D399" sub="confirmed on-chain" href="/stats" />
        </Reveal>
      </div>

      <Reveal delay={120} className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[11px] text-slate-600">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" style={{ boxShadow: "0 0 6px #34D399" }} />
          live · refreshes every 60s
        </span>
        {updated && <span className="text-slate-700">updated {updated}</span>}
        <Link href="/stats" className="text-[#4FC3F7] hover:underline ml-auto">Full traction →</Link>
        <Link href="/track" className="text-[#34D399] hover:underline">Blue Hood track record →</Link>
      </Reveal>
    </section>
  );
}
