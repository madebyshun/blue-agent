"use client";

/**
 * Marketplace — Discover APIs registered on Blue Agent MCP.
 *
 * Catalog is OPEN: any agent / dev can list via /submit. Featured cards show
 * live registrations + reserved provider slots; the "All APIs" grid is empty
 * until more agents complete onboarding.
 */

import Link from "next/link";
import { useMemo, useState } from "react";
import { APIS, CATEGORIES, type MarketplaceAPI } from "./_data";
import { ProviderLogo } from "../_components/Logos";

type Sort = "popular" | "newest" | "price";

const PAGE_SIZE = 9;

export default function Marketplace() {
  const [search, setSearch]   = useState("");
  const [sort, setSort]       = useState<Sort>("popular");
  const [cat, setCat]         = useState("All");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const live = APIS.filter(a => a.status === "live");

  const list = useMemo(() => {
    let xs = APIS;
    if (cat !== "All") xs = xs.filter(a => a.category === cat);
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter(a =>
        a.name.toLowerCase().includes(q) ||
        a.desc.toLowerCase().includes(q) ||
        a.provider.toLowerCase().includes(q)
      );
    }
    if (sort === "popular") xs = [...xs].sort((a, b) => b.calls - a.calls);
    if (sort === "newest")  xs = [...xs].sort((a, b) => b.releasedAt.localeCompare(a.releasedAt));
    if (sort === "price")   xs = [...xs].sort((a, b) => a.priceNum - b.priceNum);
    return xs;
  }, [search, sort, cat]);

  const featured   = list.filter(a => a.featured);
  const others     = list.filter(a => !a.featured);
  const othersView = others.slice(0, visible);
  const remaining  = Math.max(0, others.length - visible);

  return (
    <div className="px-5 sm:px-8 py-6">

      {/* Header row */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-mono text-xl sm:text-2xl font-bold tracking-tight">Discover APIs</h1>
          <p className="font-mono text-[11px] text-slate-600 mt-1">
            {live.length} live · {APIS.length - live.length} reserved · Register your API to add yours
          </p>
        </div>

        {/* Search + Sort */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-[11px] text-slate-700">🔍</span>
            <input
              value={search}
              onChange={e => { setSearch(e.target.value); setVisible(PAGE_SIZE); }}
              placeholder="Search by name, provider, or use case…"
              className="w-full sm:w-72 bg-[#0d0d12] border border-[#1A1A2E] rounded-lg pl-9 pr-3 py-2 font-mono text-[12px] text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
            />
          </div>
          <div className="flex items-center gap-0.5 border border-[#1A1A2E] bg-[#0d0d12] rounded-lg p-0.5">
            {([
              { id: "popular", label: "Popular" },
              { id: "newest",  label: "Newest"  },
              { id: "price",   label: "Price"   },
            ] as { id: Sort; label: string }[]).map(s => (
              <button key={s.id}
                onClick={() => setSort(s.id)}
                className={`font-mono text-[11px] px-2.5 py-1 rounded-md transition-colors ${
                  sort === s.id
                    ? "bg-[#4FC3F7]/15 text-[#4FC3F7]"
                    : "text-slate-500 hover:text-slate-300"
                }`}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Category chips */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2 -mx-1 px-1">
        {CATEGORIES.map(c => (
          <button key={c}
            onClick={() => { setCat(c); setVisible(PAGE_SIZE); }}
            className={`shrink-0 font-mono text-[11px] px-3 py-1.5 rounded-lg border transition-colors ${
              cat === c
                ? "border-[#4FC3F7]/40 text-[#4FC3F7] bg-[#4FC3F7]/5"
                : "border-[#1A1A2E] text-slate-500 hover:text-slate-300"
            }`}>
            {c}
          </button>
        ))}
      </div>

      {/* FEATURED */}
      {featured.length > 0 && (
        <div className="mb-8">
          <div className="flex items-baseline justify-between mb-3">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest">FEATURED APIs</p>
            <p className="font-mono text-[10px] text-slate-700">{featured.filter(a => a.status === "live").length} live · {featured.filter(a => a.status === "reserved").length} reserved</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {featured.map(a => <FeaturedCard key={a.id} api={a} />)}
          </div>
        </div>
      )}

      {/* ALL APIs */}
      <div>
        <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">ALL APIs</p>
        {others.length > 0 ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {othersView.map(a => <APIRow key={a.id} api={a} />)}
            </div>
            {remaining > 0 && (
              <div className="text-center mt-6">
                <button onClick={() => setVisible(v => v + PAGE_SIZE)}
                  className="font-mono text-[12px] font-semibold px-5 py-2.5 rounded-lg border border-[#1A1A2E] text-slate-300 hover:text-white hover:border-slate-700 transition-all">
                  Load More ({remaining} remaining)
                </button>
              </div>
            )}
          </>
        ) : (
          <EmptyAllAPIs />
        )}
      </div>

      {list.length === 0 && (
        <div className="text-center py-16">
          <p className="font-mono text-sm text-slate-500 mb-2">No APIs match your filter.</p>
          <button onClick={() => { setSearch(""); setCat("All"); }}
            className="font-mono text-[11px] text-[#4FC3F7] hover:underline">
            Clear filters →
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Cards ────────────────────────────────────────────────────────────────────

function FeaturedCard({ api }: { api: MarketplaceAPI }) {
  const reserved = api.status === "reserved";
  const pending  = api.status === "pending";
  const muted    = reserved || pending;

  const inner = (
    <>
      {/* Image area */}
      <div className="aspect-[16/9] relative bg-gradient-to-br from-[#1A1A2E] to-[#0a0a0f] flex items-center justify-center">
        <div className={`transition-transform ${muted ? "opacity-30" : "opacity-90 group-hover:scale-110"}`}>
          {muted && api.status !== "live"
            ? <span className="text-5xl">{api.icon ?? "⚡"}</span>
            : <ProviderLogo provider={api.provider} size={56} />}
        </div>
        <span className="absolute top-2 left-2 font-mono text-[8px] px-1.5 py-0.5 rounded border tracking-widest"
              style={
                api.status === "live"
                  ? { borderColor: "#34D39940", color: "#34D399", background: "#34D39910" }
                  : api.status === "reserved"
                  ? { borderColor: "#A78BFA40", color: "#A78BFA", background: "#A78BFA10" }
                  : { borderColor: "#F59E0B40", color: "#F59E0B", background: "#F59E0B10" }
              }>
          {api.status === "live" ? "● LIVE" : api.status === "reserved" ? "○ RESERVED" : "+ OPEN SLOT"}
        </span>
        <span className="absolute top-2 right-2 font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#A78BFA]/40 text-[#A78BFA] bg-[#A78BFA]/10 tracking-widest">
          ✦ FEATURED
        </span>
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <p className={`font-mono text-[10px] text-slate-700 mb-0.5`}>
          {muted ? "—" : `${api.provider}${api.toolsCount ? ` · ${api.toolsCount} tools` : ""}`}
        </p>
        <p className={`font-mono text-sm font-bold truncate transition-colors ${muted ? "text-slate-400" : "text-white group-hover:text-[#4FC3F7]"}`}>
          {api.name}
        </p>
        <div className="flex items-baseline justify-between mt-1">
          <p className="font-mono text-[10px] text-slate-600 truncate">{api.category}</p>
          {api.price !== "—" ? (
            <p className="font-mono text-[11px] font-bold text-[#34D399]">
              from {api.price}<span className="text-slate-700 font-normal">/call</span>
            </p>
          ) : (
            <p className="font-mono text-[10px] text-slate-700 italic">awaiting pricing</p>
          )}
        </div>
      </div>
    </>
  );

  const cls = `block rounded-xl border bg-[#0d0d12] overflow-hidden group relative ${
    muted
      ? "border-[#1A1A2E]/50"
      : "border-[#1A1A2E] card-hover"
  }`;

  if (api.status === "pending") {
    return <Link href="/submit" className={cls}>{inner}</Link>;
  }
  if (api.status === "live") {
    return <Link href={`/marketplace/${api.id}`} className={cls}>{inner}</Link>;
  }
  return <div className={cls}>{inner}</div>;
}

function APIRow({ api }: { api: MarketplaceAPI }) {
  return (
    <Link href={`/marketplace/${api.id}`}
      className="block rounded-xl border border-[#1A1A2E] bg-[#0d0d12] p-4 card-hover group">
      <div className="flex items-start gap-3 mb-2">
        <div className="shrink-0">
          <ProviderLogo provider={api.provider} size={36} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold text-white truncate group-hover:text-[#4FC3F7] transition-colors">{api.name}</p>
          <p className="font-mono text-[10px] text-slate-700">{api.provider} · API</p>
        </div>
        {api.verified && (
          <span className="shrink-0 text-[#34D399]" title="Verified">
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.707-9.293a1 1 0 0 0-1.414-1.414L9 10.586 7.707 9.293a1 1 0 0 0-1.414 1.414l2 2a1 1 0 0 0 1.414 0l4-4z" clipRule="evenodd" /></svg>
          </span>
        )}
      </div>
      <p className="font-mono text-[11px] text-slate-500 leading-relaxed line-clamp-2 mb-3 min-h-[28px]">{api.desc}</p>
      <div className="flex items-center gap-1.5 mb-3">
        {api.verified && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">✓ Verified</span>
        )}
        {api.aiReady && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA]/90 bg-[#A78BFA]/5">🤖 AI Ready</span>
        )}
      </div>
      <div className="flex items-center justify-between pt-2 border-t border-[#1A1A2E]">
        <p className="font-mono text-[10px] text-slate-600">{api.calls > 0 ? `${api.calls.toLocaleString()} calls` : "new"}</p>
        <p className="font-mono text-[11px] font-bold text-[#34D399]">
          {api.price}{api.price !== "—" && <span className="text-slate-700 font-normal">/call</span>}
        </p>
      </div>
    </Link>
  );
}

function EmptyAllAPIs() {
  return (
    <div className="rounded-2xl border border-dashed border-[#1A1A2E] bg-[#0a0a0f] px-6 py-10 text-center">
      <p className="text-3xl mb-3">📭</p>
      <p className="font-mono text-sm font-bold text-white mb-2">The marketplace is just getting started</p>
      <p className="font-mono text-[11px] text-slate-500 leading-relaxed max-w-md mx-auto mb-5">
        Featured slots are filled with seed providers above. The first non-featured
        registrations will appear here as more agents complete onboarding.
      </p>
      <Link href="/submit"
        className="inline-block font-mono text-sm font-semibold px-5 py-2.5 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors">
        Register your API →
      </Link>
    </div>
  );
}
