import type { Metadata } from "next";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { fetchBaseTopMovers } from "@/app/api/_lib/realdata";
import Screener from "./Screener";

// Regenerate at most every 2 minutes (ISR)
export const revalidate = 120;

export const metadata: Metadata = {
  title: "Base Screener — live Base token list + AI audit · Blue Agent",
  description:
    "Live Base token screener: price, 24h change, volume, liquidity, FDV. Sort, search, and run one-click AI audits (honeypot, contract trust) powered by Blue Agent.",
  alternates: { canonical: "https://blueagent.dev/pulse" },
  openGraph: {
    type: "website",
    url: "https://blueagent.dev/pulse",
    title: "Base Screener — live Base token list + AI audit",
    description: "Live Base tokens by volume, liquidity, FDV + one-click AI audits. Free.",
    siteName: "Blue Agent",
  },
  twitter: {
    card: "summary_large_image",
    title: "Base Screener — live Base token list + AI audit",
    description: "Live Base tokens by volume, liquidity, FDV + one-click AI audits. Free.",
  },
};

export default async function PulsePage() {
  let tokens: Awaited<ReturnType<typeof fetchBaseTopMovers>> = [];
  try { tokens = await fetchBaseTopMovers(50); } catch {}

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-[#050508] font-mono pt-16 text-slate-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

          {/* Hero */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
                <span className="font-mono text-[10px] text-[#34D399] tracking-widest uppercase">Live · Base · refreshed ~2 min</span>
              </div>
              <h1 className="text-2xl xl:text-3xl font-bold tracking-tight leading-tight">
                <span className="bg-gradient-to-r from-[#4FC3F7] via-[#A78BFA] to-[#34D399] bg-clip-text text-transparent">Base Screener</span>
              </h1>
              <p className="text-sm text-slate-500 mt-2 leading-relaxed max-w-xl">
                Live Base tokens — sort by volume, liquidity, FDV. One-click <span className="text-[#A78BFA]">AI audit</span> on any token, powered by Blue Agent.
              </p>
            </div>
            <Link href="/hub"
              className="px-4 py-2 rounded-xl border border-[#4FC3F7]/30 bg-[#4FC3F7]/5 text-[#4FC3F7] font-mono text-xs font-semibold hover:bg-[#4FC3F7]/10 transition-colors shrink-0">
              All 34 AI tools →
            </Link>
          </div>

          {tokens.length === 0
            ? <p className="font-mono text-xs text-slate-600">Live data temporarily unavailable — try again shortly.</p>
            : <Screener initial={tokens} />}

          <p className="font-mono text-[10px] text-slate-700 mt-5 text-center">
            Data: DexScreener + CoinGecko · Base mainnet · not financial advice
          </p>
        </div>
      </div>
    </>
  );
}
