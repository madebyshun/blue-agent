"use client";

/**
 * Blue Hub — Home + Browse view.
 *
 * Two display modes:
 *   1. HOME (default): 5 clean opinionated sections — search hero, intent
 *      cards, editor's picks, providers showcase, category tiles. Drill-down
 *      pattern (no flat dump of 60+ tools).
 *   2. BROWSE (search ≠ "" OR category ≠ "all"): filtered tool grid with
 *      sort controls + clear filter affordance.
 */

import Link from "next/link";
import { useState } from "react";

// ─── Types (shape mirrors the local Tool/Category from /hub/page.tsx) ─────────
// Kept loose on purpose — HubHome doesn't import from page.tsx to avoid a
// circular dep. The parent passes already-typed data.

export type Agent = "blue" | "aeon" | "miroshark";

export interface HubTool {
  id:       string;
  name:     string;
  desc:     string;
  cat:      string;
  agents:   Agent[];
  price:    string;
  verified?:boolean;
  aiReady?: boolean;
  releasedAt?: number;
  // v2 marketplace provenance + stats
  source?:        "native" | "external" | "hosted";
  creatorHandle?: string;
  callCount?:     number;
}

// Source badge — provenance of a tool in the unified grid.
const SOURCE_META: Record<NonNullable<HubTool["source"]>, { icon: string; label: string; color: string }> = {
  native:   { icon: "🔵", label: "Native",   color: "#4FC3F7" },
  external: { icon: "🌐", label: "External", color: "#34D399" },
  hosted:   { icon: "✨", label: "Hosted",   color: "#A78BFA" },
};

function SourceBadge({ source }: { source?: HubTool["source"] }) {
  const m = SOURCE_META[source ?? "native"];
  return (
    <span className="font-mono text-[8px] px-1 py-0.5 rounded border inline-flex items-center gap-1"
      style={{ color: m.color, borderColor: `${m.color}40`, background: `${m.color}0d` }}>
      <span>{m.icon}</span>{m.label}
    </span>
  );
}

// A tool's real run count = max(usage counter, denormalized callCount).
// Native tools track usage:<id>; community tools also carry callCount from KV.
function toolRuns(t: HubTool, usage: Record<string, number>): number {
  return Math.max(usage[t.id] ?? 0, t.callCount ?? 0);
}

export interface HubGroup {
  id:    string;
  label: string;
  desc:  string;
  color: string;
  ids:   string[];
}

const AGENT_COLORS: Record<Agent, string> = {
  blue:      "#4FC3F7",
  aeon:      "#A78BFA",
  miroshark: "#34D399",
};
const AGENT_LABELS: Record<Agent, string> = {
  blue: "Blue", aeon: "Aeon", miroshark: "MiroShark",
};

// ─── Intent cards — 4 entry points for newcomers ──────────────────────────────

interface Intent { label: string; sub: string; emoji: string; color: string; categoryId: string; }
const INTENTS: Intent[] = [
  { label: "Build",    sub: "Idea → architecture → ship",  emoji: "🚀", color: "#A78BFA", categoryId: "founders" },
  { label: "Trade",    sub: "Signals, momentum, copytrade", emoji: "📈", color: "#4FC3F7", categoryId: "traders"  },
  { label: "Research", sub: "DD, narratives, ecosystem",    emoji: "🔍", color: "#34D399", categoryId: "investors"},
  { label: "Secure",   sub: "Audit, honeypot, risk-gate",   emoji: "🛡️", color: "#F87171", categoryId: "security" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

export interface HubHomeProps {
  tools:       HubTool[];                  // ALL tools (unfiltered, for home view)
  filtered:    HubTool[];                  // PRE-FILTERED (for browse view, from parent)
  groups:      HubGroup[];
  usage:       Record<string, number>;
  featuredIds: Set<string>;
  recentIds:   string[];                   // tool ids of cached results
  search:      string;
  cat:         string;                     // "all" | group.id | category
  onSearch:    (s: string) => void;
  onPickCat:   (id: string) => void;
  onSelect:    (t: HubTool) => void;
}

export default function HubHome(props: HubHomeProps) {
  const isBrowse = props.search.trim() !== "" || (props.cat !== "all" && props.cat !== "");
  return isBrowse ? <BrowseView {...props} /> : <HomeView {...props} />;
}

// ─── HOME view — clean, opinionated ───────────────────────────────────────────

function HomeView(props: HubHomeProps) {
  const { tools, groups, usage, featuredIds, recentIds, onSearch, onPickCat, onSelect } = props;
  const byId = new Map(tools.map(t => [t.id, t] as const));
  const runsOf = (id: string) => { const t = byId.get(id); return t ? toolRuns(t, usage) : (usage[id] ?? 0); };

  // Trending — top 6 tools by real run count (source-agnostic). Only shown once
  // there's real usage, so an empty marketplace doesn't render a dead row.
  const trending: HubTool[] = [...tools]
    .filter(t => runsOf(t.id) > 0)
    .sort((a, b) => runsOf(b.id) - runsOf(a.id))
    .slice(0, 6);

  // How many community (external + hosted) tools are live — surfaced as a badge.
  const communityCount = tools.filter(t => t.source === "external" || t.source === "hosted").length;

  // Editor's Picks — usage-ranked then padded with curated featuredIds (max 4)
  const picks: HubTool[] = (() => {
    const byUsage = [...tools]
      .filter(t => runsOf(t.id) > 0)
      .sort((a, b) => runsOf(b.id) - runsOf(a.id))
      .slice(0, 4);
    if (byUsage.length >= 4) return byUsage;
    const seen = new Set(byUsage.map(t => t.id));
    const padded = [...featuredIds]
      .filter(id => !seen.has(id))
      .map(id => tools.find(t => t.id === id))
      .filter((t): t is HubTool => !!t);
    return [...byUsage, ...padded].slice(0, 4);
  })();

  const recentTools = recentIds
    .map(id => tools.find(t => t.id === id))
    .filter((t): t is HubTool => !!t)
    .reverse()
    .slice(0, 6);

  // Providers — Blue is the only REAL first-party provider. Its tools carry
  // agents:["blue"] and track real usage via usage:<id>. (Aeon / MiroShark were
  // display-only placeholders with fabricated tool/call numbers — removed to keep
  // provider stats honest. Real partners get a "coming soon" card, no fake data.)
  const blueProvider = {
    agent: "blue" as Agent,
    toolCount:  tools.filter(t => t.agents.includes("blue")).length,
    totalCalls: tools.filter(t => t.agents.includes("blue")).reduce((s, t) => s + runsOf(t.id), 0),
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">

        {/* ── HERO with big search ── */}
        <section className="mb-8">
          <h1 className="font-mono text-2xl sm:text-3xl font-bold text-white tracking-tight mb-1">
            Blue Hub — Onchain AI Tools <span className="text-[#4FC3F7]">for Base</span>
          </h1>
          <p className="font-mono text-xs sm:text-sm text-slate-500 mb-5 max-w-xl">
            Pay-per-call AI tools from Blue Agent, partner agents, and community builders. No signup, no API key — USDC on Base.
          </p>
          <SearchHero value={props.search} onChange={onSearch} totalTools={tools.length} />
        </section>

        {/* ── Recent (only if user has any) ── */}
        {recentTools.length > 0 && (
          <section className="mb-7">
            <SectionHeader emoji="↺" label="Pick up where you left off" accent="#34D399" />
            <div className="flex flex-wrap gap-2">
              {recentTools.map(t => (
                <button key={t.id} onClick={() => onSelect(t)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#34D399]/20 bg-[#34D399]/5 hover:bg-[#34D399]/10 hover:border-[#34D399]/40 transition-all">
                  <span className="w-1 h-1 rounded-full bg-[#34D399]" />
                  <span className="font-mono text-[11px] text-slate-200">{t.name}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ── INTENT CARDS — 4 entry points ── */}
        <section className="mb-9">
          <SectionHeader emoji="🎯" label="What do you want to do?" accent="#4FC3F7" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {INTENTS.map(intent => (
              <button key={intent.label} onClick={() => onPickCat(intent.categoryId)}
                className="text-left rounded-2xl border p-4 transition-all hover:scale-[1.02] group"
                style={{ borderColor: `${intent.color}25`, background: `${intent.color}06` }}>
                <div className="text-2xl mb-2">{intent.emoji}</div>
                <p className="font-mono text-sm font-bold mb-0.5" style={{ color: intent.color }}>{intent.label}</p>
                <p className="font-mono text-[10px] text-slate-600 leading-relaxed">{intent.sub}</p>
                <p className="mt-2 font-mono text-[10px] opacity-70 group-hover:opacity-100 transition-opacity" style={{ color: intent.color }}>
                  Explore →
                </p>
              </button>
            ))}
          </div>
        </section>

        {/* ── EDITOR'S PICKS — 4 hero tools ── */}
        {picks.length > 0 && (
          <section className="mb-9">
            <SectionHeader emoji="⭐" label="Editor's Picks" accent="#A78BFA"
              sub="Curated tools to try first" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {picks.map(t => (
                <PickCard key={t.id} tool={t} runs={runsOf(t.id)} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {/* ── TRENDING — top 6 by real runs (native + community mixed) ── */}
        {trending.length > 0 && (
          <section className="mb-9">
            <SectionHeader emoji="🔥" label="Trending" accent="#FB923C"
              sub="Most-run tools right now" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {trending.map(t => (
                <PickCard key={t.id} tool={t} runs={runsOf(t.id)} onSelect={onSelect} />
              ))}
            </div>
          </section>
        )}

        {/* ── PROVIDERS + Submit CTA ── */}
        <section className="mb-9">
          <SectionHeader emoji="🤖" label="Providers" accent="#FFFFFF"
            sub={communityCount > 0 ? `${communityCount} community tool${communityCount !== 1 ? "s" : ""} live` : "Blue Agent + partners integrating"} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <ProviderCard p={blueProvider} />
            <PartnerComingSoonCard />
          </div>
          <Link href="/hub/submit"
            className="block rounded-2xl border border-[#A78BFA]/25 bg-gradient-to-r from-[#A78BFA]/[0.06] to-[#4FC3F7]/[0.04] px-5 py-4 hover:border-[#A78BFA]/50 transition-all group">
            <div className="flex items-center gap-3">
              <span className="text-2xl">➕</span>
              <div className="flex-1">
                <p className="font-mono text-sm font-bold text-white mb-0.5">Earn USDC — list your tool on Blue Hub</p>
                <p className="font-mono text-[10px] text-slate-600">95% builder · 5% Hub · USDC on Base · no signup</p>
              </div>
              <span className="font-mono text-xs font-semibold text-[#A78BFA] opacity-70 group-hover:opacity-100 transition-opacity">
                Submit →
              </span>
            </div>
          </Link>
          {/* Dashboard entry — the desktop sidebar has this link but it's hidden on
              mobile (lg:flex), so surface it here too for builders on small screens. */}
          <Link href="/hub/dashboard"
            className="mt-2 flex items-center justify-center gap-1.5 font-mono text-[11px] text-slate-600 hover:text-[#34D399] transition-colors">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
            Already listed a tool? Builder dashboard →
          </Link>
        </section>

        {/* ── CATEGORIES grid — drill-down (small tiles) ── */}
        <section className="mb-9">
          <SectionHeader emoji="📂" label="Browse categories" accent="#FFFFFF"
            sub={`${groups.length} use-case bundles`} />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {groups.map(g => {
              const count = g.ids.length;
              return (
                <button key={g.id} onClick={() => onPickCat(g.id)}
                  className="text-left rounded-xl border p-3 transition-all hover:scale-[1.02] group"
                  style={{ borderColor: `${g.color}25`, background: `${g.color}05` }}>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: g.color }} />
                    <p className="font-mono text-xs font-bold" style={{ color: g.color }}>{g.label}</p>
                  </div>
                  <p className="font-mono text-[9px] text-slate-600 line-clamp-2 leading-relaxed">{g.desc}</p>
                  <p className="font-mono text-[9px] text-slate-700 mt-2 group-hover:opacity-100 opacity-70 transition-opacity">
                    {count} tool{count !== 1 ? "s" : ""} →
                  </p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Footer — minimal */}
        <p className="font-mono text-[10px] text-slate-700 text-center pb-6">
          x402 · EIP-3009 · Base · {tools.length} live tools
        </p>
      </div>
    </div>
  );
}

// ─── BROWSE view — filtered grid ──────────────────────────────────────────────

type SortMode = "popular" | "newest" | "price-asc" | "price-desc";
type SourceFilter = "all" | NonNullable<HubTool["source"]>;

function BrowseView(props: HubHomeProps) {
  const { filtered, search, cat, groups, usage, onSelect, onSearch, onPickCat } = props;
  const [sortMode, setSortMode] = useState<SortMode>("popular");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const byId = new Map(filtered.map(t => [t.id, t] as const));
  const runsOf = (id: string) => { const t = byId.get(id); return t ? toolRuns(t, usage) : (usage[id] ?? 0); };

  // How many tools sit behind each source chip (drives labels + hides empty chips).
  const sourceCounts: Record<SourceFilter, number> = {
    all:      filtered.length,
    native:   filtered.filter(t => (t.source ?? "native") === "native").length,
    external: filtered.filter(t => t.source === "external").length,
    hosted:   filtered.filter(t => t.source === "hosted").length,
  };

  const sorted = (() => {
    let tools = verifiedOnly ? filtered.filter(t => t.verified) : filtered;
    if (sourceFilter !== "all") tools = tools.filter(t => (t.source ?? "native") === sourceFilter);
    const price = (t: HubTool) => parseFloat(t.price.replace("$", "")) || 0;
    if (sortMode === "price-asc")  return [...tools].sort((a, b) => price(a) - price(b));
    if (sortMode === "price-desc") return [...tools].sort((a, b) => price(b) - price(a));
    if (sortMode === "newest")     return [...tools].sort((a, b) => (b.releasedAt ?? 0) - (a.releasedAt ?? 0));
    return [...tools].sort((a, b) => runsOf(b.id) - runsOf(a.id));
  })();

  const activeGroup = groups.find(g => g.id === cat);
  const title = search.trim()
    ? `Results for “${search}”`
    : activeGroup ? activeGroup.label : "Filtered tools";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">

        {/* Breadcrumb + title */}
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <button onClick={() => { onSearch(""); onPickCat("all"); }}
            className="font-mono text-[11px] text-slate-500 hover:text-white transition-colors">
            ← Hub home
          </button>
          <span className="font-mono text-[11px] text-slate-700">/</span>
          <h2 className="font-mono text-lg sm:text-xl font-bold text-white">{title}</h2>
          <span className="font-mono text-[10px] text-slate-700 ml-auto">
            {sorted.length} of {filtered.length}
          </span>
        </div>

        {/* Sort + filter row */}
        <div className="flex items-center gap-2 mb-5 flex-wrap">
          <span className="font-mono text-[10px] text-slate-700">Sort:</span>
          {([
            { mode: "popular",    label: "Popular"   },
            { mode: "newest",     label: "Newest"    },
            { mode: "price-asc",  label: "Price ↑"   },
            { mode: "price-desc", label: "Price ↓"   },
          ] as { mode: SortMode; label: string }[]).map(s => (
            <button key={s.mode} onClick={() => setSortMode(s.mode)}
              className={`font-mono text-[10px] inline-flex items-center px-3 py-2 min-h-[44px] sm:px-2 sm:py-0.5 sm:min-h-0 rounded border transition-colors ${
                sortMode === s.mode
                  ? "text-[#4FC3F7] border-[#4FC3F7]/30 bg-[#4FC3F7]/5"
                  : "text-slate-600 border-transparent hover:text-slate-300"
              }`}>
              {s.label}
            </button>
          ))}
          <span className="w-px h-3 bg-[#1A1A2E] mx-1" />
          <button onClick={() => setVerifiedOnly(v => !v)}
            className={`font-mono text-[10px] px-2 py-0.5 rounded border transition-colors ${
              verifiedOnly
                ? "text-[#34D399] border-[#34D399]/30 bg-[#34D399]/5"
                : "text-slate-600 border-transparent hover:text-slate-300"
            }`}>
            ✓ Verified
          </button>
        </div>

        {/* Source filter chips — only shown once community tools exist alongside native */}
        {(sourceCounts.external > 0 || sourceCounts.hosted > 0) && (
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            <span className="font-mono text-[10px] text-slate-700">Source:</span>
            {([
              { key: "all",      label: "All",         color: "#94A3B8" },
              { key: "native",   label: "🔵 Native",   color: "#4FC3F7" },
              { key: "external", label: "🌐 External", color: "#34D399" },
              { key: "hosted",   label: "✨ Hosted",    color: "#A78BFA" },
            ] as { key: SourceFilter; label: string; color: string }[])
              .filter(s => sourceCounts[s.key] > 0)
              .map(s => {
                const active = sourceFilter === s.key;
                return (
                  <button key={s.key} onClick={() => setSourceFilter(s.key)}
                    className="font-mono text-[10px] px-2.5 py-0.5 rounded border transition-colors"
                    style={active
                      ? { color: s.color, borderColor: `${s.color}55`, background: `${s.color}12` }
                      : { color: "#64748b", borderColor: "transparent" }}>
                    {s.label} <span className="opacity-60">{sourceCounts[s.key]}</span>
                  </button>
                );
              })}
          </div>
        )}

        {/* Empty state */}
        {sorted.length === 0 ? (
          <div className="text-center py-12">
            <p className="font-mono text-sm text-slate-500 mb-2">No tools match your filter.</p>
            <button onClick={() => { onSearch(""); onPickCat("all"); }}
              className="font-mono text-[11px] text-[#4FC3F7] hover:underline">
              Clear and browse all →
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sorted.map(t => <PickCard key={t.id} tool={t} runs={runsOf(t.id)} onSelect={onSelect} />)}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Building blocks ──────────────────────────────────────────────────────────

function SectionHeader({ emoji, label, accent, sub }: { emoji: string; label: string; accent: string; sub?: string }) {
  return (
    <div className="flex items-baseline gap-3 mb-3">
      <span className="text-base leading-none">{emoji}</span>
      <h2 className="font-mono text-sm font-bold tracking-tight" style={{ color: accent }}>{label}</h2>
      {sub && <p className="font-mono text-[10px] text-slate-700">{sub}</p>}
    </div>
  );
}

function SearchHero({ value, onChange, totalTools }: { value: string; onChange: (s: string) => void; totalTools: number }) {
  return (
    <div className="relative">
      <input
        autoFocus
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={`Search ${totalTools} tools by name or use case…`}
        className="w-full bg-[#0D0D1A] border border-[#1A1A2E] rounded-2xl px-5 py-3 pr-24 font-mono text-sm sm:text-base text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/40 transition-colors"
      />
      <kbd className="absolute right-4 top-1/2 -translate-y-1/2 font-mono text-[10px] text-slate-700 border border-[#1A1A2E] rounded px-1.5 py-0.5">⌘ K</kbd>
    </div>
  );
}

function VerifiedAiBadges({ tool }: { tool: HubTool }) {
  return (
    <div className="flex items-center gap-1">
      {tool.verified && (
        <span className="font-mono text-[8px] px-1 py-0.5 rounded border border-[#34D399]/30 text-[#34D399]/90 bg-[#34D399]/5">✓ Verified</span>
      )}
      {tool.aiReady && (
        <span className="font-mono text-[8px] px-1 py-0.5 rounded border border-[#A78BFA]/30 text-[#A78BFA]/90 bg-[#A78BFA]/5">🤖 AI Ready</span>
      )}
    </div>
  );
}

function PickCard({ tool, runs, onSelect }: { tool: HubTool; runs: number; onSelect: (t: HubTool) => void }) {
  const isCommunity = tool.source === "external" || tool.source === "hosted";
  return (
    <button onClick={() => onSelect(tool)}
      className="text-left rounded-2xl border border-[#1A1A2E] hover:border-[#A78BFA]/40 bg-[#0d0d12] p-4 transition-all flex flex-col group">
      <div className="flex items-center gap-1.5 mb-2.5">
        {tool.agents.map(a => (
          <span key={a} className="w-1.5 h-1.5 rounded-full" style={{ background: AGENT_COLORS[a] }} />
        ))}
        <SourceBadge source={tool.source} />
        <span className="font-mono text-[9px] text-slate-700 ml-auto">{tool.price}</span>
      </div>
      <p className="font-mono text-sm font-bold text-white mb-1 leading-snug group-hover:text-[#A78BFA] transition-colors">{tool.name}</p>
      {isCommunity && tool.creatorHandle && (
        <p className="font-mono text-[9px] text-slate-600 mb-1">by {tool.creatorHandle}</p>
      )}
      <p className="font-mono text-[10px] text-slate-500 leading-relaxed line-clamp-2 flex-1 mb-3">{tool.desc}</p>
      <VerifiedAiBadges tool={tool} />
      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-[#1A1A2E]">
        <span className="font-mono text-[10px] text-slate-600">{runs > 0 ? <><span className="text-white font-semibold">{runs}</span> runs</> : "new"}</span>
        <span className="font-mono text-[10px] font-semibold text-[#A78BFA] opacity-70 group-hover:opacity-100 transition-opacity">Try →</span>
      </div>
    </button>
  );
}

function ProviderCard({ p }: { p: { agent: Agent; toolCount: number; totalCalls: number } }) {
  const color = AGENT_COLORS[p.agent];
  const label = AGENT_LABELS[p.agent];
  const blurb = "Live onchain AI tools · console commands · idea → ship on Base";
  return (
    <div className="rounded-2xl p-4 border flex flex-col" style={{ borderColor: `${color}25`, background: `${color}06` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
          style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
          {label.slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold" style={{ color }}>{label}</p>
          <p className="font-mono text-[10px] text-slate-700">Provider · ✓ Verified</p>
        </div>
      </div>
      <p className="font-mono text-[10px] text-slate-500 leading-relaxed mb-3 flex-1">{blurb}</p>
      <div className="grid grid-cols-2 gap-2 pt-2 border-t" style={{ borderColor: `${color}15` }}>
        <div>
          <p className="font-mono text-[9px] text-slate-700">TOOLS</p>
          <p className="font-mono text-sm font-bold text-white tabular-nums">{p.toolCount}</p>
        </div>
        <div>
          <p className="font-mono text-[9px] text-slate-700">CALLS</p>
          <p className="font-mono text-sm font-bold tabular-nums" style={{ color }}>{p.totalCalls > 0 ? p.totalCalls.toLocaleString() : "—"}</p>
        </div>
      </div>
    </div>
  );
}

// A real partner that's mid-integration — shown WITHOUT tool/call numbers because
// none are live yet (zero-fabricated-data rule). Only PMFI qualifies today.
function PartnerComingSoonCard() {
  const color = "#64748B";
  return (
    <div className="rounded-2xl p-4 border border-dashed flex flex-col" style={{ borderColor: `${color}40`, background: `${color}08` }}>
      <div className="flex items-center gap-2 mb-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0"
          style={{ background: `${color}18`, color, border: `1px solid ${color}40` }}>
          PM
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-mono text-sm font-bold text-slate-300">PMFI</p>
          <a href="https://x.com/pmfi_cc" target="_blank" rel="noopener noreferrer"
            className="font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors">@pmfi_cc ↗</a>
        </div>
        <span className="font-mono text-[8px] px-1.5 py-0.5 rounded border self-start"
          style={{ color, borderColor: `${color}55`, background: `${color}0d` }}>integrating</span>
      </div>
      <p className="font-mono text-[10px] text-slate-500 leading-relaxed mb-3 flex-1">Prediction market arbitrage signals · coming soon to Blue Hub</p>
      <div className="pt-2 border-t" style={{ borderColor: `${color}20` }}>
        <p className="font-mono text-[10px] text-slate-700">Partner — tools not live yet</p>
      </div>
    </div>
  );
}
