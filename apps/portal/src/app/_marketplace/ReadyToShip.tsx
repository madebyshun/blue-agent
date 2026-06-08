import Link from "next/link";

/**
 * Closing CTA at the bottom of the homepage — mirrors Orbis's "Ready to ship?"
 * pattern. Final conversion section before the footer.
 */
export default function ReadyToShip() {
  return (
    <div className="relative overflow-hidden">
      <div className="absolute inset-0 hero-glow pointer-events-none" />
      <div className="relative max-w-3xl mx-auto px-6 py-20 sm:py-28 text-center">

        <h2 className="font-mono text-3xl sm:text-5xl font-bold tracking-tight mb-4 leading-tight">
          Ready to ship?
        </h2>
        <p className="font-mono text-sm text-slate-400 leading-relaxed max-w-xl mx-auto mb-8">
          List your API in minutes. Agents start paying per call in seconds.
          The API marketplace built for the agent era on Base.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
          <Link href="/submit"
            className="font-mono text-sm font-semibold px-5 py-3 rounded-xl bg-gradient-to-r from-[#4FC3F7] to-[#29ABE2] text-[#050508] hover:scale-[1.02] transition-transform">
            Get started free →
          </Link>
          <Link href="/marketplace"
            className="font-mono text-sm font-semibold px-5 py-3 rounded-xl border border-[#A78BFA]/40 text-[#A78BFA] bg-[#A78BFA]/5 hover:bg-[#A78BFA]/10 transition-all">
            Browse APIs
          </Link>
        </div>

        <p className="font-mono text-[10px] text-slate-700">
          Listed on Smithery · MCP.SO · CDP · 20% Hub fee · Providers keep 80%
        </p>
      </div>
    </div>
  );
}
