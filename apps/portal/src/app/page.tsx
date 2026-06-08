/**
 * Blue Hub — API Marketplace landing (api.blueagent.dev).
 *
 * Positioning: open API marketplace where any agent / developer registers
 * their API on Blue Hub MCP server. AI agents call the MCP and discover
 * every registered API instantly.
 *
 * Brand: Blue Hub. Parent: Blue Agent. Decoupled from Blue Chat (blueagent.dev).
 */

import Link from "next/link";
import FeaturedAPIs     from "./_marketplace/FeaturedAPIs";
import Partners         from "./_marketplace/Partners";
import ListedOn         from "./_marketplace/ListedOn";
import HowItWorks       from "./_marketplace/HowItWorks";
import InstallMcp       from "./_marketplace/InstallMcp";
import WhyBlueHub       from "./_marketplace/WhyBlueHub";
import ReadyToShip      from "./_marketplace/ReadyToShip";
import NewsletterStrip  from "./_components/NewsletterStrip";

export default function PortalHome() {
  return (
    <>
      {/* ───── HERO ───── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 hero-glow pointer-events-none" />
        <div className="absolute inset-0 grid-bg opacity-50 pointer-events-none" />
        <div className="relative max-w-6xl mx-auto px-6 py-20 sm:py-32">
          <div className="max-w-3xl">

            <h1 className="font-mono text-7xl sm:text-8xl md:text-9xl font-black tracking-tight mb-3 leading-none">
              BLUE<span className="bg-clip-text text-transparent bg-gradient-to-r from-[#4FC3F7] to-[#A78BFA]">HUB</span>
            </h1>
            <p className="font-mono text-xs text-slate-600 tracking-widest mb-6">
              DEVELOPER PORTAL · BY BLUE AGENT
            </p>

            <p className="font-mono text-base sm:text-lg text-slate-300 mb-8 leading-relaxed max-w-xl">
              31 production APIs.
              USDC micropayments on Base.
              Built for the agent era.
            </p>

            <div className="flex flex-col sm:flex-row items-start gap-3 mb-10">
              <Link href="/marketplace"
                 className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-gradient-to-r from-[#4FC3F7] to-[#29ABE2] text-[#050508] hover:scale-[1.02] transition-transform">
                Browse APIs →
              </Link>
              <Link href="/agents"
                 className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-[#1A1A2E] text-white hover:bg-white/[0.04] transition-all">
                For AI Agents
              </Link>
            </div>

            {/* Hero stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 mb-6">
              {[
                { value: "31",   label: "Live APIs" },
                { value: "12K+", label: "API Calls" },
                { value: "80%",  label: "Provider cut" },
                { value: "20%",  label: "Platform fee" },
              ].map(s => (
                <div key={s.label}>
                  <p className="font-mono text-2xl sm:text-3xl font-black text-white tabular-nums leading-none">{s.value}</p>
                  <p className="font-mono text-[10px] text-slate-600 tracking-widest mt-1.5">{s.label}</p>
                </div>
              ))}
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#4FC3F7]/30 bg-[#4FC3F7]/5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
              <span className="font-mono text-[10px] text-[#4FC3F7] tracking-widest">API MARKETPLACE · AGENT-NATIVE · X402</span>
            </div>
          </div>
        </div>
      </section>

      {/* ───── FEATURED APIs ───── */}
      <section id="featured" className="border-t border-[#1A1A2E]">
        <FeaturedAPIs />
      </section>

      {/* ───── PARTNERS ───── */}
      <section id="partners" className="border-t border-[#1A1A2E] relative">
        <div className="absolute inset-0 purple-glow pointer-events-none" />
        <Partners />
      </section>

      {/* ───── LISTED & INDEXED ON ───── */}
      <section className="border-t border-[#1A1A2E]">
        <ListedOn />
      </section>

      {/* ───── HOW IT WORKS ───── */}
      <section className="border-t border-[#1A1A2E]">
        <HowItWorks />
      </section>

      {/* ───── INSTALL MCP ───── */}
      <section id="install" className="border-t border-[#1A1A2E]">
        <InstallMcp />
      </section>

      {/* ───── WHY BLUE AGENT ───── */}
      <section className="border-t border-[#1A1A2E]">
        <WhyBlueHub />
      </section>

      {/* ───── READY TO SHIP — closing CTA ───── */}
      <section className="border-t border-[#1A1A2E]">
        <ReadyToShip />
      </section>

      <NewsletterStrip />
    </>
  );
}
