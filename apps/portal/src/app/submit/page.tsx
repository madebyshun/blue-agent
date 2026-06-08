import Link from "next/link";
import type { Metadata } from "next";
import SubmitForm from "./SubmitForm";

export const metadata: Metadata = {
  title: "Register your API · Blue Hub",
  description: "Register your API on Blue Hub MCP server. Get listed in the marketplace. Earn 80% USDC on every call, settled on Base.",
};

export default function SubmitPage() {
  return (
    <>
      {/* Hero — matches /x402 + /docs pattern */}
      <section className="relative overflow-hidden border-b border-[#1A1A2E]">
        <div className="absolute inset-0 hero-glow pointer-events-none" />
        <div className="relative max-w-5xl mx-auto px-6 py-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 mb-5 rounded-full border border-[#A78BFA]/30 bg-[#A78BFA]/5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#A78BFA] animate-pulse" />
            <span className="font-mono text-[10px] text-[#A78BFA] tracking-widest">PROVIDER · 80% SHARE · USDC ON BASE</span>
          </div>
          <h1 className="font-mono text-3xl sm:text-4xl font-bold tracking-tight mb-3">
            Register your API — <span className="text-[#A78BFA]">earn USDC</span> on every call
          </h1>
          <p className="font-mono text-sm text-slate-400 max-w-2xl mb-6 leading-relaxed">
            Get listed on Blue Hub&apos;s MCP server. Any AI agent connected to
            <code className="text-[#A78BFA] mx-1">blueagent.dev/api/mcp</code>
            discovers your API instantly. You keep <span className="text-[#34D399]">80%</span> of every
            USDC paid, settled on Base — no subscription, no API key, no contract.
          </p>
          <div className="flex flex-wrap gap-3">
            <a href="#form"
               className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-gradient-to-r from-[#A78BFA] to-[#7C3AED] text-[#050508] hover:scale-[1.02] transition-transform">
              Start submission ↓
            </a>
            <Link href="/docs/builders/submit"
               className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-slate-700 text-slate-300 hover:bg-white/[0.02] transition-all">
              Read submit guide →
            </Link>
          </div>
        </div>
      </section>

      {/* What you get + How it works — 2-col like /x402 sections */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">⚡ WHAT YOU GET</p>
        <h2 className="font-mono text-2xl font-bold mb-8">Listed in 4 steps, paid forever</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { n: "01", title: "Endpoint probe",     desc: "We POST empty body to your URL. Must return 2xx or 402 within 8s.",       color: "#4FC3F7" },
            { n: "02", title: "Manifest signed",    desc: "Sign one message proving wallet ownership. No transaction, no gas.",       color: "#A78BFA" },
            { n: "03", title: "Listed in MCP",      desc: "Within minutes, tools/list on blueagent.dev/api/mcp includes your API.",   color: "#34D399" },
            { n: "04", title: "Calls + USDC earn",  desc: "Agents call your endpoint. You keep 80% USDC, settled on Base per call.", color: "#F59E0B" },
          ].map(s => (
            <div key={s.n} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
              <p className="font-mono text-2xl font-bold mb-3" style={{ color: `${s.color}66` }}>{s.n}</p>
              <p className="font-mono text-sm font-bold mb-2">{s.title}</p>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Revenue split visualization — like /x402 references */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-[#34D399] tracking-widest mb-1">💸 REVENUE SPLIT</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Every paid call · automatic on-chain split</h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-[#34D399]/25 bg-[#34D399]/5 p-5">
            <p className="font-mono text-3xl font-black text-[#34D399] mb-1">80%</p>
            <p className="font-mono text-sm font-bold mb-1">You keep</p>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed">Settled to your registered wallet on Base every call. No minimum payout.</p>
          </div>
          <div className="rounded-2xl border border-[#F59E0B]/25 bg-[#F59E0B]/5 p-5">
            <p className="font-mono text-3xl font-black text-[#F59E0B] mb-1">10%</p>
            <p className="font-mono text-sm font-bold mb-1">$BLUEAGENT stakers</p>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed">Fee-share back to token holders. Aligned incentives for marketplace growth.</p>
          </div>
          <div className="rounded-2xl border border-[#A78BFA]/25 bg-[#A78BFA]/5 p-5">
            <p className="font-mono text-3xl font-black text-[#A78BFA] mb-1">10%</p>
            <p className="font-mono text-sm font-bold mb-1">Blue Hub treasury</p>
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed">Operations, ecosystem grants, insurance fund. Public treasury wallet.</p>
          </div>
        </div>
      </section>

      {/* Pricing reference */}
      <section className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-1">📊 PRICING TIERS</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Reference across the catalog</h2>

        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden">
          {[
            { tier: "Light",   price: "$0.05",      time: "~1s",   ex: "blue-idea · honeypot-check · airdrop-check",   color: "#4FC3F7" },
            { tier: "Medium",  price: "$0.10–$0.20", time: "~3s",   ex: "blue-research · risk-gate · token-pick-signal", color: "#A78BFA" },
            { tier: "Heavy",   price: "$0.30–$0.50", time: "~10s",  ex: "blue-build · launch-simulator · investor-memo", color: "#F59E0B" },
            { tier: "Premium", price: "$1.00+",      time: "~30s",  ex: "blue-audit (500+ security checks)",              color: "#F87171" },
          ].map(t => (
            <div key={t.tier}
                 className="grid grid-cols-[100px_120px_80px_1fr] gap-4 px-5 py-4 border-b border-[#1A1A2E] last:border-0 items-center">
              <span className="font-mono text-sm font-bold" style={{ color: t.color }}>{t.tier}</span>
              <span className="font-mono text-sm text-white">{t.price}</span>
              <span className="font-mono text-[10px] text-slate-600">{t.time}</span>
              <span className="font-mono text-[10px] text-slate-500">{t.ex}</span>
            </div>
          ))}
        </div>
        <p className="font-mono text-[10px] text-slate-700 mt-3">
          Rule of thumb: 1 second of compute ≈ $0.05–$0.10. LLM-heavy calls cost more. Don&apos;t over-price out of the gate.
        </p>
      </section>

      {/* The submission form */}
      <section id="form" className="max-w-5xl mx-auto px-6 py-16 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">▼ SUBMIT</p>
        <h2 className="font-mono text-2xl font-bold mb-6">Manifest form</h2>

        <div className="max-w-3xl">
          <SubmitForm />
        </div>
      </section>

      {/* Help footer */}
      <section className="max-w-5xl mx-auto px-6 py-12 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-slate-700 text-center">
          Questions during submission?{" "}
          <Link href="/docs/builders/submit" className="text-[#4FC3F7] hover:underline">Read the docs</Link>
          {" "}or DM{" "}
          <a href="https://x.com/blueagent_" target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7] hover:underline">@blueagent_</a>
          {" "}on X.
        </p>
      </section>
    </>
  );
}
