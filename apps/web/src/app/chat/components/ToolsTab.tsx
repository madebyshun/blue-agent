"use client";
import { useState } from "react";
import { HUB_SKILLS, SKILL_CATEGORIES, CATEGORY_ICONS, type SkillCategory } from "../hub-skills";
import { useChat } from "../ChatContext";

// ── Category colour accents ────────────────────────────────────────────────────
const CAT_COLORS: Record<SkillCategory, string> = {
  "Market Intel":  "#34D399",
  "Due Diligence": "#60A5FA",
  "Builder Tools": "#A78BFA",
  "Fundraise":     "#F59E0B",
  "Launch":        "#FB923C",
  "Agent Network": "#E879F9",
  "Ecosystem":     "#4FC3F7",
  "On-chain":      "#F87171",
  "Base Native":   "#4FC3F7",
};

// How many skill tags to show before "+ N more"
const MAX_VISIBLE = 3;

// ── Sub-components ─────────────────────────────────────────────────────────────

function CategoryCard({
  cat,
  expanded,
  onToggle,
  onUse,
}: {
  cat: SkillCategory;
  expanded: boolean;
  onToggle: () => void;
  onUse: (trigger: string) => void;
}) {
  const skills  = HUB_SKILLS.filter(s => s.category === cat);
  const color   = CAT_COLORS[cat];
  const visible = expanded ? skills : skills.slice(0, MAX_VISIBLE);
  const hidden  = skills.length - MAX_VISIBLE;

  return (
    <div
      className="rounded-2xl border transition-all"
      style={{
        borderColor: expanded ? `${color}30` : "#141420",
        background:  expanded ? `${color}06` : "#0A0A12",
      }}
    >
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
        onClick={onToggle}
      >
        <span className="text-base shrink-0">{CATEGORY_ICONS[cat]}</span>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-sm text-slate-200 font-medium">{cat}</p>
          <p className="font-mono text-[10px] text-slate-600">{skills.length} tools</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="font-mono text-[8px] px-1.5 py-0.5 rounded border uppercase tracking-wider"
            style={{ color, borderColor: `${color}35`, background: `${color}10` }}
          >
            ENABLED
          </span>
          <svg
            className="w-3.5 h-3.5 text-slate-600 transition-transform duration-200"
            style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Tags row — always visible */}
      <div className="px-4 pb-3">
        <div className="flex flex-wrap gap-1.5">
          {visible.map(skill => (
            <button
              key={skill.id}
              onClick={() => onUse(skill.trigger)}
              title={skill.description}
              className="font-mono text-[10px] px-2.5 py-1 rounded-lg border transition-all hover:opacity-100"
              style={{
                color,
                borderColor: `${color}30`,
                background:  `${color}10`,
                opacity:     expanded ? 1 : 0.75,
              }}
            >
              {skill.name}
            </button>
          ))}
          {!expanded && hidden > 0 && (
            <button
              onClick={onToggle}
              className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-600 hover:text-slate-400 transition-colors"
            >
              +{hidden} more
            </button>
          )}
        </div>

        {/* Expanded: full list with descriptions */}
        {expanded && (
          <div className="mt-3 space-y-0.5">
            <div className="h-px bg-[#1A1A2E] mb-3" />
            {skills.map(skill => (
              <button
                key={skill.id}
                onClick={() => onUse(skill.trigger)}
                className="group w-full flex items-start justify-between gap-3 px-3 py-2 rounded-xl hover:bg-[#050508] transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm text-slate-300 group-hover:text-white transition-colors">{skill.name}</p>
                  <p className="font-mono text-[10px] text-slate-600 leading-relaxed">{skill.description}</p>
                </div>
                <span
                  className="font-mono text-[9px] shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-0.5 rounded"
                  style={{ color, background: `${color}15` }}
                >
                  run →
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Search result row ──────────────────────────────────────────────────────────
function SearchRow({
  name, description, trigger, category, onUse,
}: {
  name: string; description: string; trigger: string; category: SkillCategory;
  onUse: (t: string) => void;
}) {
  const color = CAT_COLORS[category];
  return (
    <button
      onClick={() => onUse(trigger)}
      className="w-full text-left flex items-center gap-3 px-4 py-3 rounded-xl border border-[#141420] hover:border-[#1A1A2E] bg-[#0A0A12] hover:bg-[#0D0D16] transition-all group"
    >
      <span className="text-base shrink-0">{CATEGORY_ICONS[category]}</span>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-sm text-slate-200 group-hover:text-white transition-colors">{name}</p>
        <p className="font-mono text-[10px] text-slate-600 truncate">{description}</p>
      </div>
      <span
        className="shrink-0 font-mono text-[9px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color, background: `${color}15` }}
      >
        run →
      </span>
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export default function ToolsTab() {
  const { setInput, setSidebarTab } = useChat();
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState<SkillCategory | null>(null);

  const lc          = search.trim().toLowerCase();
  const isSearching = !!lc;

  const searchResults = isSearching
    ? HUB_SKILLS.filter(s =>
        s.name.toLowerCase().includes(lc) ||
        s.description.toLowerCase().includes(lc) ||
        s.category.toLowerCase().includes(lc)
      )
    : [];

  function use(trigger: string) {
    setInput(trigger);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setSidebarTab("none" as Parameters<typeof setSidebarTab>[0]);
    }
  }

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">

      {/* ── Header ── */}
      <div className="px-6 py-5 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-mono text-xs text-white tracking-widest">// HUB TOOLS</h2>
            <p className="font-mono text-[10px] text-slate-700 mt-0.5">
              {HUB_SKILLS.length} tools · {SKILL_CATEGORIES.length} categories · click to run
            </p>
          </div>
          <span
            className="font-mono text-[9px] px-2 py-1 rounded-lg border"
            style={{ color: "#4FC3F7", borderColor: "#4FC3F730", background: "#4FC3F710" }}
          >
            BLUE HUB
          </span>
        </div>

        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tools…"
            className="w-full bg-[#0A0A12] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-xl pl-9 pr-8 py-2.5 font-mono text-sm text-white placeholder:text-slate-700 outline-none transition-colors"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 space-y-3">

          {isSearching ? (
            /* Search results */
            searchResults.length === 0 ? (
              <div className="text-center py-12">
                <p className="font-mono text-sm text-slate-500">No tools found</p>
                <p className="font-mono text-[10px] text-slate-700 mt-1">Try a different search term</p>
              </div>
            ) : (
              <>
                <p className="font-mono text-[10px] text-slate-600 mb-2">{searchResults.length} results</p>
                {searchResults.map(skill => (
                  <SearchRow
                    key={skill.id}
                    name={skill.name}
                    description={skill.description}
                    trigger={skill.trigger}
                    category={skill.category}
                    onUse={use}
                  />
                ))}
              </>
            )
          ) : (
            /* Category cards */
            SKILL_CATEGORIES.map(cat => (
              <CategoryCard
                key={cat}
                cat={cat}
                expanded={expanded === cat}
                onToggle={() => setExpanded(expanded === cat ? null : cat)}
                onUse={use}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
