/**
 * /stats — public traction page.
 *
 * Server component: reads the sanitized aggregate from buildPublicStats() (no
 * per-user data) and renders on-chain-verifiable numbers. ISR: revalidate 60s.
 */

import Link from "next/link";
import Navbar from "@/components/Navbar";
import { buildPublicStats } from "@/lib/public-stats";

export const revalidate = 60;

export const metadata = {
  title: "Traction — Blue Agent",
  description:
    "Live, on-chain-verifiable traction for Blue Agent on Base: tokens launched, BLUE staked, and product surface.",
};

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

export default async function StatsPage() {
  const stats = await buildPublicStats();
  const { launches, staking, product, usage, users } = stats;

  const heroCards = [
    { value: fmt(usage.totalRuns),    label: "Tool Runs",       color: "#4FC3F7" },
    { value: staking.totalStakedBlue, label: "BLUE Staked",     color: "#34D399" },
    { value: fmt(launches.total),     label: "Tokens Launched", color: "#A78BFA" },
  ];

  // Usage & user aggregates — every value has a real KV/on-chain source.
  const usageCells = [
    { value: fmt(usage.totalRuns),          label: "Total Tool Runs", sub: "lifetime paid x402 calls", color: "#4FC3F7" },
    { value: usage.revenueEst,              label: "Est. Revenue",    sub: "Σ runs × price (USDC)",     color: "#34D399" },
    { value: fmt(users.claims),             label: "Wallets Onboarded", sub: `free-credit claims · cap ${users.claimCap}`, color: "#A78BFA" },
    { value: fmt(launches.uniqueCreators),  label: "Creators",        sub: "unique token launchers",   color: "#FBBF24" },
  ];

  return (
    <div className="min-h-screen bg-[#050508] text-white">
      <Navbar />

      {/* Ambient glow */}
      <div className="fixed inset-x-0 top-0 h-[600px] pointer-events-none overflow-hidden">
        <div
          style={{ background: "radial-gradient(ellipse 70% 40% at 50% -5%, #4FC3F714 0%, transparent 70%)" }}
          className="absolute inset-0"
        />
      </div>

      <div className="relative">
        {/* ══ HERO ══ */}
        <section className="max-w-5xl mx-auto px-6 pt-32 pb-16 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#4FC3F730] bg-[#4FC3F708] mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
            <span className="font-mono text-[11px] text-[#4FC3F7] tracking-widest">
              LIVE · ON-CHAIN VERIFIABLE · BASE
            </span>
          </div>

          <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Built on Base.<br />
            <span className="text-[#4FC3F7]">Proven on-chain.</span>
          </h1>

          <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed mb-12">
            Every number here is aggregate and verifiable on Basescan. No vanity metrics,
            no per-user data — just what Blue Agent has shipped on Base.
          </p>

          <div className="inline-grid grid-cols-3 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E]">
            {heroCards.map((s) => (
              <div key={s.label} className="bg-[#0d0d12] px-6 sm:px-10 py-6 text-center">
                <div className="font-mono text-2xl sm:text-3xl font-bold mb-1" style={{ color: s.color }}>
                  {s.value}
                </div>
                <div className="font-mono text-[10px] text-slate-600 tracking-widest">
                  {s.label.toUpperCase()}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ══ USAGE & CREDITS ══ */}
        <section className="max-w-5xl mx-auto px-6 py-6">
          <div className="flex items-baseline justify-between mb-4">
            <h2 className="font-mono text-sm text-white">Usage &amp; credits</h2>
            <span className="font-mono text-[10px] text-slate-600">aggregate · real sources</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E]">
            {usageCells.map((c) => (
              <div key={c.label} className="bg-[#0a0a0f] p-5">
                <div className="font-mono text-2xl sm:text-3xl font-bold mb-1" style={{ color: c.color }}>
                  {c.value}
                </div>
                <div className="font-mono text-[10px] text-slate-400 tracking-wide uppercase">{c.label}</div>
                <div className="font-mono text-[10px] text-slate-600 mt-1">{c.sub}</div>
              </div>
            ))}
          </div>
          <p className="font-mono text-[10px] text-slate-600 mt-3 leading-relaxed">
            Credits are earned by staking $BLUEAGENT or claimed free at signup, then spent per Blue Chat message.
            Balances are per-wallet and private — only these aggregate counts are shown.
          </p>
        </section>

        {/* ══ STAKING + PRODUCT ══ */}
        <section className="max-w-5xl mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Staking */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">
              Staking
            </p>
            <div className="flex items-baseline gap-2 mb-2">
              <span className="font-mono text-3xl font-bold text-[#34D399]">
                {staking.totalStakedBlue}
              </span>
              <span className="font-mono text-sm text-slate-500">BLUE</span>
            </div>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed">
              Total $BLUEAGENT staked in the BlueMarketStaking contract, earning
              USDC yield + Blue Chat credits. Verifiable on-chain on Base (8453).
            </p>
          </div>

          {/* Product breadth */}
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">
              Product surface
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="font-mono text-3xl font-bold text-[#4FC3F7]">{product.tools}</div>
                <div className="font-mono text-[10px] text-slate-600 mt-1">x402 TOOLS</div>
              </div>
              <div>
                <div className="font-mono text-3xl font-bold text-[#A78BFA]">{product.commands}</div>
                <div className="font-mono text-[10px] text-slate-600 mt-1">CORE COMMANDS</div>
              </div>
            </div>
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed mt-4">
              Pay-per-use AI tools + the idea → build → audit → ship → raise workflow,
              MCP-native for Claude, Cursor & Claude Code.
            </p>
            <Link href="/hub" className="font-mono text-[10px] text-[#4FC3F7] hover:underline">
              Explore the Hub ↗
            </Link>
          </div>
        </section>

        {/* ══ TOP TOOLS BY RUNS ══ */}
        {usage.topTools.length > 0 && (
          <section className="max-w-5xl mx-auto px-6 py-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-mono text-sm text-white">Most-used tools</h2>
              <span className="font-mono text-[10px] text-slate-600">by lifetime runs</span>
            </div>
            <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden divide-y divide-[#111119]">
              {usage.topTools.map((tl, i) => {
                const max = usage.topTools[0]?.runs || 1;
                const pct = Math.max(4, Math.round((tl.runs / max) * 100));
                return (
                  <div key={`${tl.name}-${i}`} className="relative flex items-center gap-3 px-5 py-3 bg-[#0a0a0f]">
                    <div className="absolute inset-y-0 left-0 bg-[#4FC3F70d]" style={{ width: `${pct}%` }} aria-hidden />
                    <span className="relative font-mono text-[10px] text-slate-600 w-5 shrink-0">{i + 1}</span>
                    <span className="relative font-mono text-xs text-white flex-1 truncate">{tl.name}</span>
                    <span className="relative font-mono text-xs text-[#4FC3F7] shrink-0">{fmt(tl.runs)}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ══ TRUST STRIP ══ */}
        <section className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] text-slate-600">
            <span>◆ on-chain verifiable</span>
            <span>◆ non-custodial</span>
            <span>◆ Base native (8453)</span>
            <span>◆ aggregate only — no per-user data</span>
          </div>
          <p className="text-center font-mono text-[9px] text-slate-700 mt-4">
            Updated {new Date(stats.updatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC · refreshes every 60s
          </p>
        </section>
      </div>
    </div>
  );
}
