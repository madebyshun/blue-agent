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
const MAX_VISIBLE_TAGS = 4;

export default function SkillsTab() {
  const { setInput, setSidebarTab } = useChat();
  const [search, setSearch]         = useState("");
  const [expanded, setExpanded]     = useState<SkillCategory | null>(null);

  const lc = search.trim().toLowerCase();
  const isSearching = !!lc;

  // Skills that match the search
  const searchResults = isSearching
    ? HUB_SKILLS.filter(s =>
        s.name.toLowerCase().includes(lc) ||
        s.description.toLowerCase().includes(lc) ||
        s.category.toLowerCase().includes(lc)
      )
    : [];

  function use(trigger: string) {
    setInput(trigger);
    setSidebarTab("tasks");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="px-3 pb-3 flex-shrink-0">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search skills…"
            className="w-full bg-[#050508] border border-[#1A1A2E] rounded-lg pl-7 pr-3 py-1.5 font-mono text-xs text-white placeholder:text-slate-700 outline-none focus:border-[#2A2A4E] transition-colors"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
              ×
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">

        {isSearching ? (
          /* ── Search results — compact list ── */
          searchResults.length === 0 ? (
            <p className="font-mono text-[10px] text-slate-700 text-center py-6">No skills found</p>
          ) : (
            searchResults.map(skill => (
              <SkillTag
                key={skill.id}
                name={skill.name}
                description={skill.description}
                trigger={skill.trigger}
                color={CAT_COLORS[skill.category]}
                catIcon={CATEGORY_ICONS[skill.category]}
                onUse={use}
              />
            ))
          )
        ) : (
          /* ── Toolset cards — one card per category ── */
          SKILL_CATEGORIES.map(cat => {
            const skills  = HUB_SKILLS.filter(s => s.category === cat);
            const color   = CAT_COLORS[cat];
            const isOpen  = expanded === cat;
            const visible = isOpen ? skills : skills.slice(0, MAX_VISIBLE_TAGS);
            const hidden  = skills.length - MAX_VISIBLE_TAGS;

            return (
              <div
                key={cat}
                className="rounded-xl border transition-all"
                style={{ borderColor: isOpen ? `${color}30` : "#1A1A2E", background: isOpen ? `${color}05` : "#050508" }}
              >
                {/* Card header */}
                <button
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left"
                  onClick={() => setExpanded(isOpen ? null : cat)}
                >
                  <span className="text-sm">{CATEGORY_ICONS[cat]}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-xs text-slate-300 truncate">{cat}</p>
                    <p className="font-mono text-[9px] text-slate-600">{skills.length} skills</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span
                      className="font-mono text-[8px] px-1.5 py-0.5 rounded border"
                      style={{ color, borderColor: `${color}40`, background: `${color}12` }}
                    >
                      ENABLED
                    </span>
                    <svg
                      className="w-3 h-3 text-slate-600 transition-transform"
                      style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                      fill="none" viewBox="0 0 24 24" stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>

                {/* Skill tags */}
                <div className="px-3 pb-2.5">
                  <div className="flex flex-wrap gap-1">
                    {visible.map(skill => (
                      <button
                        key={skill.id}
                        onClick={() => use(skill.trigger)}
                        title={skill.description}
                        className="font-mono text-[9px] px-2 py-0.5 rounded border transition-all hover:opacity-100"
                        style={{
                          color,
                          borderColor: `${color}30`,
                          background:  `${color}08`,
                          opacity: isOpen ? 1 : 0.7,
                        }}
                      >
                        {skill.name}
                      </button>
                    ))}
                    {!isOpen && hidden > 0 && (
                      <button
                        onClick={() => setExpanded(cat)}
                        className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-slate-600 hover:text-slate-400 transition-colors"
                      >
                        +{hidden} more
                      </button>
                    )}
                  </div>

                  {/* Expanded: show descriptions */}
                  {isOpen && (
                    <div className="mt-2 space-y-1">
                      {skills.map(skill => (
                        <div
                          key={skill.id}
                          className="flex items-start justify-between gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors group cursor-pointer"
                          onClick={() => use(skill.trigger)}
                        >
                          <div className="min-w-0">
                            <p className="font-mono text-[10px] text-slate-300 group-hover:text-white transition-colors truncate">{skill.name}</p>
                            <p className="font-mono text-[9px] text-slate-600 truncate">{skill.description}</p>
                          </div>
                          <span
                            className="flex-shrink-0 font-mono text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ color, background: `${color}15` }}
                          >
                            use →
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      <div className="px-3 pt-2 pb-1 border-t border-[#1A1A2E] flex-shrink-0">
        <p className="font-mono text-[9px] text-slate-700">
          {HUB_SKILLS.length} skills · {SKILL_CATEGORIES.length} toolsets · click to use
        </p>
      </div>
    </div>
  );
}

// ── Compact skill tag row for search results ───────────────────────────────────
function SkillTag({
  name, description, trigger, color, catIcon, onUse,
}: {
  name: string; description: string; trigger: string;
  color: string; catIcon: string;
  onUse: (t: string) => void;
}) {
  return (
    <button
      onClick={() => onUse(trigger)}
      className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-xl border border-[#1A1A2E] hover:border-[#2A2A4E] bg-[#050508] hover:bg-[#0D0D14] transition-all group"
    >
      <span className="text-sm flex-shrink-0">{catIcon}</span>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[10px] text-slate-300 group-hover:text-white transition-colors truncate">{name}</p>
        <p className="font-mono text-[9px] text-slate-600 truncate">{description}</p>
      </div>
      <span
        className="flex-shrink-0 font-mono text-[8px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color, background: `${color}15` }}
      >
        use
      </span>
    </button>
  );
}
