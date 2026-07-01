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

function relDay(ms: number): string {
  if (!ms) return "";
  const d = Math.floor((Date.now() - ms) / 86_400_000);
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  return `${d}d ago`;
}

export default async function StatsPage() {
  const stats = await buildPublicStats();
  const { launches, staking, product } = stats;

  const heroCards = [
    { value: fmt(launches.total),          label: "Tokens Launched", color: "#4FC3F7" },
    { value: staking.totalStakedBlue,      label: "BLUE Staked",     color: "#34D399" },
    { value: fmt(launches.uniqueCreators), label: "Creators",        color: "#A78BFA" },
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

        {/* ══ GROWTH CHART ══ */}
        {launches.byDay.length > 0 && (
          <section className="max-w-5xl mx-auto px-6 py-10">
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
              <div className="flex items-baseline justify-between mb-6">
                <h2 className="font-mono text-sm text-white">Launches per day</h2>
                <span className="font-mono text-[10px] text-slate-600">
                  peak {launches.peakPerDay}/day
                </span>
              </div>
              <div className="flex items-end gap-1 h-40">
                {launches.byDay.map((d) => {
                  const h = launches.peakPerDay ? Math.round((d.count / launches.peakPerDay) * 100) : 0;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center justify-end group" title={`${d.date}: ${d.count}`}>
                      <span className="font-mono text-[8px] text-slate-500 mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {d.count}
                      </span>
                      <div
                        className="w-full rounded-t"
                        style={{
                          height: `${Math.max(h, 3)}%`,
                          background: "linear-gradient(180deg, #4FC3F7 0%, #4FC3F730 100%)",
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between mt-3 font-mono text-[9px] text-slate-700">
                <span>{launches.byDay[0]?.date}</span>
                <span>{launches.byDay[launches.byDay.length - 1]?.date}</span>
              </div>
            </div>
          </section>
        )}

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
            <p className="font-mono text-[11px] text-slate-500 leading-relaxed mb-4">
              Total $BLUEAGENT staked in the BlueMarketStaking contract, earning
              USDC yield + Blue Chat credits.
            </p>
            <a
              href={staking.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-[10px] text-[#4FC3F7] hover:underline"
            >
              Verify on Basescan ↗
            </a>
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

        {/* ══ LIVE FEED ══ */}
        {launches.recent.length > 0 && (
          <section className="max-w-5xl mx-auto px-6 py-10">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-mono text-sm text-white">Recently launched through Blue Agent</h2>
              <span className="font-mono text-[10px] text-slate-600">newest first</span>
            </div>
            <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden divide-y divide-[#111119]">
              {launches.recent.map((l, i) => (
                <a
                  key={`${l.address}-${i}`}
                  href={`https://basescan.org/token/${l.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 px-5 py-3 bg-[#0a0a0f] hover:bg-[#0d0d18] transition-colors"
                >
                  <div className="w-7 h-7 rounded-full bg-[#4FC3F715] border border-[#4FC3F730] flex items-center justify-center shrink-0">
                    <span className="font-mono text-[10px] text-[#4FC3F7]">
                      {(l.symbol || l.name || "?").slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-white truncate">
                      {l.name || "Unnamed"}
                      {l.symbol ? <span className="text-slate-500"> ${l.symbol}</span> : null}
                    </p>
                    <p className="font-mono text-[9px] text-slate-600 truncate">
                      {l.address.slice(0, 10)}…{l.address.slice(-6)}
                    </p>
                  </div>
                  <span className="font-mono text-[9px] text-slate-700 shrink-0">
                    {relDay(l.launchedAt)}
                  </span>
                </a>
              ))}
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
