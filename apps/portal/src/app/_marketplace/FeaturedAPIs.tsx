import Link from "next/link";
import { APIS } from "../marketplace/_data";
import { ProviderLogo } from "../_components/Logos";

/**
 * Homepage Featured APIs strip — picks top live APIs from the marketplace
 * data and renders a compact grid. Links each card to its detail page.
 */
export default function FeaturedAPIs() {
  // Show only live + featured, top 8 — drop the open-slot card here
  const featured = APIS
    .filter(a => a.status === "live" && a.featured)
    .slice(0, 8);

  // Backfill with high-call live APIs if we don't have 8 featured
  if (featured.length < 8) {
    const fillers = APIS
      .filter(a => a.status === "live" && !featured.includes(a))
      .sort((a, b) => b.calls - a.calls)
      .slice(0, 8 - featured.length);
    featured.push(...fillers);
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">

      <div className="flex items-end justify-between gap-4 mb-8 flex-wrap">
        <div>
          <p className="font-mono text-[10px] text-[#A78BFA] tracking-widest mb-1">★ FEATURED APIs</p>
          <h2 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">Top APIs on the marketplace</h2>
          <p className="font-mono text-xs text-slate-500 mt-1">Most-run tools right now · click to call</p>
        </div>
        <Link href="/marketplace" className="font-mono text-[11px] text-[#4FC3F7] hover:underline">
          Browse all {APIS.filter(a => a.status === "live").length} APIs →
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {featured.map(api => (
          <Link key={api.id} href={`/marketplace/${api.id}`}
            className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] overflow-hidden card-hover group">

            {/* Image area */}
            <div className="aspect-[16/9] relative bg-gradient-to-br from-[#1A1A2E] to-[#0a0a0f] flex items-center justify-center">
              <div className="opacity-90 group-hover:scale-110 transition-transform">
                <ProviderLogo provider={api.provider} size={56} />
              </div>
              <span className="absolute top-2 left-2 font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#34D399]/40 text-[#34D399] bg-[#34D399]/10 tracking-widest">
                ● LIVE
              </span>
              <span className="absolute top-2 right-2 font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#A78BFA]/40 text-[#A78BFA] bg-[#A78BFA]/10 tracking-widest">
                ✦ FEATURED
              </span>
            </div>

            {/* Body */}
            <div className="px-4 py-3">
              <p className="font-mono text-[10px] text-slate-700 mb-0.5 truncate">{api.provider}</p>
              <p className="font-mono text-sm font-bold text-white truncate group-hover:text-[#4FC3F7] transition-colors">
                {api.name}
              </p>
              <div className="flex items-baseline justify-between mt-1">
                <p className="font-mono text-[10px] text-slate-600 truncate">{api.category}</p>
                <p className="font-mono text-[11px] font-bold text-[#34D399]">
                  {api.price}<span className="text-slate-700 font-normal">/call</span>
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
