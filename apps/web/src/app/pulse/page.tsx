import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { fetchBaseTopMovers } from "@/app/api/_lib/realdata";

// Regenerate the page at most every 10 minutes (ISR) — free, fast, SEO-friendly
export const revalidate = 600;

export const metadata: Metadata = {
  title: "Base Pulse — live Base ecosystem signals · Blue Agent",
  description:
    "Free live pulse of the Base ecosystem: top tokens by volume and biggest 24h movers. Powered by Blue Agent's 3-agent intelligence on Base.",
  alternates: { canonical: "https://blueagent.dev/pulse" },
  openGraph: {
    type: "website",
    url: "https://blueagent.dev/pulse",
    title: "Base Pulse — live Base ecosystem signals",
    description: "Top Base tokens by volume + biggest 24h movers, updated live. Free.",
    siteName: "Blue Agent",
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Pulse — live Base ecosystem signals",
    description: "Top Base tokens by volume + biggest 24h movers, updated live. Free.",
  },
};

function fmtVol(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}k`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

export default async function PulsePage() {
  let tokens: Awaited<ReturnType<typeof fetchBaseTopMovers>> = [];
  try { tokens = await fetchBaseTopMovers(30); } catch {}

  const byVolume = [...tokens].sort((a, b) => b.volume24h - a.volume24h).slice(0, 10);
  const byGainers = [...tokens]
    .filter(t => t.priceChange24h > 0)
    .sort((a, b) => b.priceChange24h - a.priceChange24h)
    .slice(0, 8);

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono pt-16 text-slate-200">
        <div className="max-w-4xl mx-auto px-6 py-8">

          {/* Hero */}
          <div className="relative overflow-hidden rounded-2xl border border-[#1A1A2E] bg-[#0A0A12] p-7 mb-7">
            <div className="absolute -top-16 -right-8 w-60 h-60 rounded-full bg-[#34D399]/10 blur-3xl pointer-events-none" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
                <span className="font-mono text-[10px] text-[#34D399] tracking-widest uppercase">Live · updates every 10 min</span>
              </div>
              <h1 className="text-2xl xl:text-3xl font-bold tracking-tight leading-tight">
                <span className="bg-gradient-to-r from-[#4FC3F7] via-[#A78BFA] to-[#34D399] bg-clip-text text-transparent">Base Pulse</span>
              </h1>
              <p className="text-sm text-slate-400 mt-2 leading-relaxed max-w-xl">
                Live signals from the Base ecosystem — top tokens by volume and the biggest 24h movers. Free.
                For the full AI digest with narratives and what-to-watch, run the tool below.
              </p>
              <Link href="/hub/ecosystem-digest"
                className="inline-block mt-5 px-5 py-2.5 rounded-xl bg-[#4FC3F7] text-[#050508] font-mono text-sm font-semibold hover:bg-[#29ABE2] transition-colors">
                Get the full AI digest →
              </Link>
            </div>
          </div>

          {tokens.length === 0 ? (
            <p className="font-mono text-xs text-slate-600">Live data temporarily unavailable — try again shortly.</p>
          ) : (
            <div className="grid lg:grid-cols-2 gap-5">
              {/* Top by volume */}
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0A0A12] p-5">
                <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-4">// TOP BY VOLUME (24H)</p>
                <div className="space-y-1">
                  {byVolume.map((t, i) => (
                    <div key={t.symbol + i} className="flex items-center gap-3 py-1.5 border-b border-[#1A1A2E]/40 last:border-0">
                      <span className="font-mono text-[10px] text-slate-700 w-4">{i + 1}</span>
                      <span className="font-mono text-xs font-bold text-white flex-1 truncate">{t.symbol}</span>
                      <span className={`font-mono text-[11px] tabular-nums ${t.priceChange24h >= 0 ? "text-[#34D399]" : "text-red-400"}`}>{fmtPct(t.priceChange24h)}</span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums w-16 text-right">{fmtVol(t.volume24h)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top gainers */}
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0A0A12] p-5">
                <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-4">// TOP GAINERS (24H)</p>
                <div className="space-y-1">
                  {byGainers.map((t, i) => (
                    <div key={t.symbol + i} className="flex items-center gap-3 py-1.5 border-b border-[#1A1A2E]/40 last:border-0">
                      <span className="font-mono text-[10px] text-slate-700 w-4">{i + 1}</span>
                      <span className="font-mono text-xs font-bold text-white flex-1 truncate">{t.symbol}</span>
                      <span className="font-mono text-[11px] text-[#34D399] tabular-nums">{fmtPct(t.priceChange24h)}</span>
                      <span className="font-mono text-[11px] text-slate-500 tabular-nums w-16 text-right">{fmtVol(t.volume24h)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer CTA */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-[#1A1A2E] bg-gradient-to-br from-[#4FC3F7]/[0.06] to-[#A78BFA]/[0.06] p-6 mt-7">
            <div>
              <p className="font-mono text-sm font-semibold text-white">Want the full picture?</p>
              <p className="font-mono text-[11px] text-slate-500 mt-1">34 AI tools on Base — analysis, audits, signals. Pay per call in USDC.</p>
            </div>
            <Link href="/hub"
              className="px-5 py-2.5 rounded-xl border border-[#4FC3F7]/30 bg-[#4FC3F7]/5 text-[#4FC3F7] font-mono text-sm font-semibold hover:bg-[#4FC3F7]/10 transition-colors shrink-0">
              Explore Blue Hub →
            </Link>
          </div>

          <p className="font-mono text-[10px] text-slate-700 mt-5 text-center">Data: DexScreener · Base mainnet · refreshed every 10 min</p>
        </div>
      </div>
    </>
  );
}
