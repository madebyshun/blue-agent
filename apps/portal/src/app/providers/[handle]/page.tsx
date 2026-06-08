import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { APIS, type MarketplaceAPI } from "../../marketplace/_data";
import { providerSlug } from "../../marketplace/_helpers";

// ─── Provider directory (extensible — add new providers here) ────────────────

interface ProviderProfile {
  handle:    string;
  name:      string;
  tagline:   string;
  bio:       string;
  joinedAt:  string;
  verified:  boolean;
  color:     string;
  socials?:  { x?: string; github?: string; web?: string };
}

const PROFILES: ProviderProfile[] = [
  {
    handle:   "blue-agent",
    name:     "Blue Agent",
    tagline:  "Multi-agent orchestrator for Base builders",
    bio:      "Console commands (idea/build/audit/ship/raise), Base-grounded skills, and composite tools that fuse Aeon + MiroShark + Blue into multi-agent consensus. 50 APIs live, all USDC-priced on Base.",
    joinedAt: "2024-06-01",
    verified: true,
    color:    "#4FC3F7",
    socials:  { x: "https://x.com/blueagent_", github: "https://github.com/madebyshun/blue-agent", web: "https://blueagent.dev" },
  },
  {
    handle:   "aeon",
    name:     "Aeon",
    tagline:  "Ecosystem signals and narrative tracking",
    bio:      "Token picks, narrative position, ecosystem digest — real-time Base intelligence. Currently onboarding to Blue Agent MCP.",
    joinedAt: "2026-06-10",
    verified: false,
    color:    "#A78BFA",
  },
  {
    handle:   "miroshark",
    name:     "MiroShark",
    tagline:  "Sentiment consensus + crowd intelligence",
    bio:      "Multi-persona sentiment aggregation for trade decisions. Currently onboarding to Blue Agent MCP.",
    joinedAt: "2026-06-10",
    verified: false,
    color:    "#34D399",
  },
];

export async function generateStaticParams() {
  return PROFILES.map(p => ({ handle: p.handle }));
}

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }): Promise<Metadata> {
  const { handle } = await params;
  const p = PROFILES.find(p => p.handle === handle);
  if (!p) return { title: "Provider not found · Blue Hub" };
  return {
    title:       `${p.name} · Blue Agent`,
    description: p.tagline,
  };
}

export default async function ProviderPage({ params }: { params: Promise<{ handle: string }> }) {
  const { handle } = await params;
  const profile = PROFILES.find(p => p.handle === handle);
  if (!profile) notFound();

  // Match by canonical slug — covers "Blue Agent" → "blue-agent"
  const ownedAPIs: MarketplaceAPI[] = APIS.filter(
    a => a.status === "live" && providerSlug(a.provider) === profile.handle,
  );

  const stats = {
    apis:    ownedAPIs.length,
    calls:   ownedAPIs.reduce((s, a) => s + a.calls, 0),
    revenue: ownedAPIs.reduce((s, a) => s + a.priceNum * a.calls * 0.8, 0),
  };

  return (
    <div className="px-5 sm:px-8 py-6 max-w-5xl mx-auto">

      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-6 text-[11px]">
        <Link href="/marketplace" className="font-mono text-slate-500 hover:text-white transition-colors">
          ← Marketplace
        </Link>
        <span className="text-slate-700">/</span>
        <span className="font-mono text-slate-300">Providers</span>
        <span className="text-slate-700">/</span>
        <span className="font-mono text-slate-300">{profile.name}</span>
      </div>

      {/* Hero */}
      <div className="rounded-2xl border p-6 sm:p-8 mb-6 relative overflow-hidden"
           style={{ borderColor: `${profile.color}25`, background: `${profile.color}06` }}>
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl pointer-events-none"
             style={{ background: `${profile.color}10` }} />

        <div className="relative flex flex-col sm:flex-row items-start gap-5">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center font-bold text-2xl shrink-0"
               style={{ background: `${profile.color}18`, color: profile.color, border: `1px solid ${profile.color}40` }}>
            {profile.name.slice(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <h1 className="font-mono text-2xl sm:text-3xl font-bold tracking-tight">{profile.name}</h1>
              {profile.verified ? (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">✓ Verified</span>
              ) : (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-amber-500/30 text-amber-400 bg-amber-500/5">⏳ Onboarding</span>
              )}
            </div>
            <p className="font-mono text-sm font-semibold mb-3" style={{ color: profile.color }}>{profile.tagline}</p>
            <p className="font-mono text-[12px] text-slate-400 leading-relaxed max-w-2xl mb-4">{profile.bio}</p>

            {profile.socials && (
              <div className="flex items-center gap-3 text-[11px]">
                {profile.socials.x && (
                  <a href={profile.socials.x} target="_blank" rel="noopener noreferrer"
                     className="font-mono text-slate-500 hover:text-white transition-colors">X ↗</a>
                )}
                {profile.socials.github && (
                  <a href={profile.socials.github} target="_blank" rel="noopener noreferrer"
                     className="font-mono text-slate-500 hover:text-white transition-colors">GitHub ↗</a>
                )}
                {profile.socials.web && (
                  <a href={profile.socials.web} target="_blank" rel="noopener noreferrer"
                     className="font-mono text-slate-500 hover:text-white transition-colors">Website ↗</a>
                )}
                <span className="text-slate-700">·</span>
                <span className="font-mono text-slate-700">
                  Joined {new Date(profile.joinedAt).toLocaleDateString("en-US", { year: "numeric", month: "short" })}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-4">
          <p className="font-mono text-[10px] tracking-widest mb-1" style={{ color: profile.color }}>APIs LISTED</p>
          <p className="font-mono text-2xl font-bold leading-none" style={{ color: profile.color }}>{stats.apis}</p>
        </div>
        <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-4">
          <p className="font-mono text-[10px] tracking-widest mb-1 text-[#A78BFA]">LIFETIME CALLS</p>
          <p className="font-mono text-2xl font-bold leading-none text-[#A78BFA]">{stats.calls.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-4">
          <p className="font-mono text-[10px] tracking-widest mb-1 text-[#34D399]">USDC EARNED</p>
          <p className="font-mono text-2xl font-bold leading-none text-[#34D399]">${stats.revenue.toFixed(2)}</p>
          <p className="font-mono text-[10px] text-slate-700 mt-1">80% provider share</p>
        </div>
      </div>

      {/* APIs */}
      <div>
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">APIs BY {profile.name.toUpperCase()}</p>
        {ownedAPIs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#1A1A2E] bg-[#0a0a0f] px-6 py-10 text-center">
            <p className="text-3xl mb-3">⏳</p>
            <p className="font-mono text-sm font-bold mb-2">No APIs registered yet</p>
            <p className="font-mono text-[11px] text-slate-500 max-w-md mx-auto">
              {profile.name} is onboarding. Reserved slots show on the marketplace.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {ownedAPIs.map(a => (
              <Link key={a.id} href={`/marketplace/${a.id}`}
                className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group">
                <div className="flex items-start gap-3 mb-2">
                  <div className="w-9 h-9 rounded-lg border border-[#1A1A2E] bg-[#0a0a0f] flex items-center justify-center text-lg shrink-0">
                    {a.icon ?? "⚡"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-bold text-white truncate group-hover:text-[#4FC3F7] transition-colors">{a.name}</p>
                    <p className="font-mono text-[10px] text-slate-700 truncate">{a.category}</p>
                  </div>
                </div>
                <p className="font-mono text-[11px] text-slate-500 line-clamp-2 leading-relaxed mb-3">{a.desc}</p>
                <div className="flex items-center justify-between pt-2 border-t border-[#1A1A2E]">
                  <p className="font-mono text-[10px] text-slate-600">{a.calls.toLocaleString()} calls</p>
                  <p className="font-mono text-[11px] font-bold text-[#34D399]">{a.price}<span className="text-slate-700 font-normal">/call</span></p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
