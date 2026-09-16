"use client";

import { useState } from "react";
import {
  AGENT_SKILLS, SKILL_PROVIDERS, SKILL_ACCENT, type SkillProvider,
} from "../agent-skills";
import { useChat } from "../ChatContext";
import { useIntegrations, setSkillEnabled, removeSkill, runSkillCommand } from "../integrations";
import { useSkillUsage } from "../use-skill-usage";

// Skills — restyled to the design handoff's `// SKILLS` screen. The visual
// grouping (five commands · bundles · installed · coming soon) is a presentation
// layer over the SAME real data as before:
//   • counts are DERIVED from AGENT_SKILLS, never hardcoded (the "8 active" in
//     the handoff is a placeholder — we print the live number);
//   • run counts come from `usage:<id>` KV via useSkillUsage and render ONLY on
//     a genuine positive measurement (null/0 print nothing — see the footer);
//   • the Base MCP skills stay `status:"soon"` on purpose (agent-skills.ts:104):
//     the model is told about those tools but no schema is registered, so listing
//     them as callable would sell a capability that does not exist.

const BORDER  = "#1A1A2E";
const SURFACE = "#0D0D14";

export default function SkillsPanel({ onPick, onUse }: {
  onPick?: () => void;
  // Standalone surfaces (e.g. /app/skills) have no local composer to seed, so
  // they pass onUse to route the pick elsewhere (→ /chat?prefill=<trigger>).
  onUse?: (trigger?: string) => void;
}) {
  const { setInput } = useChat();
  const [activeProvider, setActiveProvider] = useState<SkillProvider | "all">("all");
  const [search, setSearch] = useState("");

  // Real run counts (usage:<id> KV). Null for skills we don't meter.
  const { runsOf } = useSkillUsage();

  // User-installed skills (localStorage). Default/bundled skills are always-on
  // and live in the catalog grids below.
  const { skills: installed } = useIntegrations();
  const userInstalled = installed.filter(s => !s.default);

  // Install modal
  const [installOpen, setInstallOpen]   = useState(false);
  const [installInput, setInstallInput] = useState("");
  const [installBusy, setInstallBusy]   = useState(false);
  const [installMsg, setInstallMsg]     = useState("");

  async function doInstall() {
    const v = installInput.trim();
    if (!v || installBusy) return;
    setInstallBusy(true); setInstallMsg("");
    const res = await runSkillCommand(`/skill install ${v}`);
    setInstallMsg(res);
    setInstallBusy(false);
    if (res.startsWith("✓")) { setInstallInput(""); setTimeout(() => { setInstallOpen(false); setInstallMsg(""); }, 1200); }
  }
  function openInstall() { setInstallMsg(""); setInstallOpen(true); }

  const lc = search.trim().toLowerCase();
  const filtered = AGENT_SKILLS.filter(s => {
    const matchProvider = activeProvider === "all" || s.provider === activeProvider;
    const matchSearch   = !lc
      || s.name.toLowerCase().includes(lc)
      || s.description.toLowerCase().includes(lc);
    return matchProvider && matchSearch;
  });

  // Three real buckets. Every active skill is either a Blue Agent command or a
  // Bundled pack (Base MCP is all-soon by design), so these cover the catalog.
  const commands = filtered.filter(s => s.status === "active" && s.provider === "Blue Agent");
  const bundles  = filtered.filter(s => s.status === "active" && s.provider === "Bundled");
  const soon     = filtered.filter(s => s.status === "soon");
  const catalogEmpty = commands.length === 0 && bundles.length === 0 && soon.length === 0;

  const totalActive = AGENT_SKILLS.filter(s => s.status === "active").length;

  function use(trigger?: string) {
    if (onUse) { onUse(trigger); return; }
    if (trigger) setInput(trigger);
    onPick?.();
  }

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">

      {/* `// SKILLS` header — desktop only. Below lg the global MobileTopBar
          prints the surface title, so rendering this too would duplicate it. */}
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// SKILLS</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">agent capabilities · Blue Agent · Base MCP · bundled tool packs</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="font-mono text-[10px] text-[#94A3B8] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">
            {totalActive} active · {userInstalled.length} installed
          </span>
          <button
            onClick={openInstall}
            className="font-mono text-[10.5px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[7px] px-2.5 py-[5px] transition-colors"
          >
            + Install
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] mx-auto w-full max-w-6xl">

          {/* Search + provider filter */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-[440px]">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#64748B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search skills…"
                className="w-full bg-[#0D0D14] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg pl-9 pr-8 py-2 font-mono text-[11.5px] text-[#E2E8F0] placeholder:text-[#64748B] outline-none transition-colors"
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#94A3B8]">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* All + one chip per provider, each carrying its live active count */}
            <button
              onClick={() => setActiveProvider("all")}
              className="font-mono text-[9.5px] rounded-full px-[11px] py-1 border transition-colors"
              style={activeProvider === "all"
                ? { color: "#050508", background: SKILL_ACCENT, borderColor: SKILL_ACCENT, fontWeight: 600 }
                : { color: "#94A3B8", borderColor: BORDER, background: "transparent" }}
            >
              All
            </button>
            {SKILL_PROVIDERS.map(p => {
              const isActive = activeProvider === p;
              const count = AGENT_SKILLS.filter(s => s.provider === p && s.status === "active").length;
              return (
                <button
                  key={p}
                  onClick={() => setActiveProvider(p)}
                  className="font-mono text-[9.5px] rounded-full px-[11px] py-1 border transition-colors"
                  style={isActive
                    ? { color: "#050508", background: SKILL_ACCENT, borderColor: SKILL_ACCENT, fontWeight: 600 }
                    : { color: "#94A3B8", borderColor: BORDER, background: "transparent" }}
                >
                  {p} {count}
                </button>
              );
            })}

            <span className="ml-auto hidden md:block font-mono text-[10px] text-[#64748B]">
              Click an active skill to send its trigger into the composer.
            </span>
          </div>

          {catalogEmpty && (
            <div className="text-center py-12">
              <p className="font-mono text-[13px] text-[#94A3B8]">No skills found</p>
              <p className="font-mono text-[10px] text-[#475569] mt-1">Try a different search or filter</p>
            </div>
          )}

          {/* THE FIVE COMMANDS · ACTIVE — the Blue Agent core commands */}
          {commands.length > 0 && (
            <>
              <div className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B] mt-[22px] mb-3">
                THE FIVE COMMANDS · ACTIVE
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
                {commands.map((skill, i) => {
                  const runs = runsOf(skill);
                  const featured = i === 0; // entry command gets the handoff's blue tint
                  return (
                    <button
                      key={skill.id}
                      type="button"
                      onClick={() => use(skill.trigger)}
                      className="text-left rounded-[14px] p-[14px] border transition-colors hover:border-[#4FC3F7]/45"
                      style={{
                        borderColor: featured ? "rgba(79,195,247,.25)" : BORDER,
                        background:  featured ? "rgba(79,195,247,.04)" : SURFACE,
                      }}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-mono text-[12px] font-semibold text-[#E2E8F0]">{skill.name}</span>
                        {skill.badge === "free" && (
                          <span className="font-mono text-[8.5px] font-medium text-[#34D399] border border-[#34D399]/30 rounded-full px-[7px] py-[2px] shrink-0">
                            free
                          </span>
                        )}
                      </div>
                      <p className="font-prose text-[10px] leading-[1.6] text-[#94A3B8] mt-2">{skill.description}</p>
                      <div className="font-mono text-[9.5px] text-[#475569] mt-[11px]">
                        {skill.trigger?.trim()}
                        {runs !== null && runs > 0 ? ` · ${runs.toLocaleString()} runs` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* BUNDLES — curated tool packs that run together */}
          {bundles.length > 0 && (
            <>
              <div className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B] mt-[26px] mb-3">
                BUNDLES · {bundles.length}
              </div>
              <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
                {bundles.map(skill => (
                  <button
                    key={skill.id}
                    type="button"
                    onClick={() => use(skill.trigger)}
                    className="text-left rounded-[14px] p-[15px] border border-[#1A1A2E] bg-[#0D0D14] transition-colors hover:border-[#4FC3F7]/45"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[12.5px] font-semibold text-[#E2E8F0]">{skill.name}</span>
                      {skill.tools && skill.tools.length > 0 && (
                        <span className="font-mono text-[8.5px] font-medium text-[#A78BFA] border border-[#A78BFA]/30 rounded-full px-[7px] py-[2px] shrink-0">
                          {skill.tools.length} tools
                        </span>
                      )}
                    </div>
                    <p className="font-prose text-[10.5px] leading-[1.6] text-[#94A3B8] mt-2">{skill.description}</p>
                    {skill.tools && skill.tools.length > 0 && (
                      <div className="flex flex-wrap gap-[5px] mt-[11px]">
                        {skill.tools.map(t => (
                          <span key={t} className="font-mono text-[9px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[7px] py-[3px]">
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* INSTALLED — dashed empty row until a custom skill is installed, then
              the real toggle/remove list. */}
          {userInstalled.length === 0 ? (
            <div className="flex items-center gap-3 mt-[26px] border border-dashed border-[#1A1A2E] rounded-[14px] px-4 py-[14px] flex-wrap">
              <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">INSTALLED · 0</span>
              <span className="flex-1 min-w-[200px] font-mono text-[10.5px] text-[#94A3B8]">
                No custom skills yet. Type <span className="text-[#4FC3F7]">/skill install owner/repo</span> in chat, or install from a GitHub repo.
              </span>
              <button
                onClick={openInstall}
                className="font-mono text-[10.5px] font-semibold text-[#050508] bg-[#4FC3F7] hover:bg-[#29ABE2] rounded-[8px] px-[13px] py-2 transition-colors"
              >
                + Install
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mt-[26px] mb-3">
                <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">INSTALLED · {userInstalled.length}</span>
                <button
                  onClick={openInstall}
                  className="font-mono text-[10px] text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/10 rounded-lg px-2.5 py-1 transition-colors"
                >
                  + Install
                </button>
              </div>
              <div className="space-y-1.5">
                {userInstalled.map(s => (
                  <div key={s.name} className="flex items-center gap-3 px-4 py-2.5 rounded-[14px] border border-[#1A1A2E] bg-[#0D0D14]">
                    <div className="flex-1 min-w-0">
                      <span className="font-mono text-[13px] text-[#E2E8F0] truncate block">{s.name}</span>
                      <p className="font-mono text-[10px] text-[#64748B] truncate">{s.description}</p>
                    </div>
                    <button
                      onClick={() => setSkillEnabled(s.name, !s.enabled)}
                      title={s.enabled ? "Disable" : "Enable"}
                      className="relative w-9 h-5 rounded-full transition-colors shrink-0"
                      style={{ background: s.enabled ? `${SKILL_ACCENT}55` : BORDER }}
                    >
                      <span className="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style={{ left: s.enabled ? 18 : 2 }} />
                    </button>
                    <button
                      onClick={() => removeSkill(s.name)}
                      title="Remove"
                      className="font-mono text-[12px] text-[#475569] hover:text-red-400 transition-colors shrink-0"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* COMING SOON — Base MCP capabilities held at "soon" until the server
              is attached for real. Non-interactive: they are not callable yet. */}
          {soon.length > 0 && (
            <>
              <div className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B] mt-[26px] mb-3">
                COMING SOON · {soon.length}
              </div>
              <div className="grid gap-2.5 opacity-50" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
                {soon.map(skill => (
                  <div key={skill.id} className="rounded-[12px] border border-[#1A1A2E] p-3">
                    <div className="font-mono text-[11px] font-semibold text-[#E2E8F0]">{skill.name}</div>
                    <p className="font-prose text-[9.5px] leading-[1.5] text-[#94A3B8] mt-1.5">{skill.description}</p>
                  </div>
                ))}
              </div>
            </>
          )}

        </div>
      </div>

      {/* Install modal */}
      {installOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setInstallOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="font-mono text-[11px] text-[#4FC3F7] tracking-widest">// INSTALL SKILL</p>
              <button onClick={() => setInstallOpen(false)} className="font-mono text-[13px] text-slate-500 hover:text-white">✕</button>
            </div>
            <p className="font-mono text-[10px] text-slate-600 mb-3">
              GitHub repo — <span className="text-slate-400">owner/repo</span> or <span className="text-slate-400">owner/repo/path</span>. Fetches its SKILL.md.
            </p>
            <input
              value={installInput}
              onChange={e => setInstallInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") doInstall(); }}
              placeholder="BankrBot/skills/blueagent"
              autoFocus
              className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-3 py-2 font-mono text-[12px] text-white placeholder:text-slate-700 outline-none mb-3"
            />
            <button
              onClick={doInstall}
              disabled={installBusy || !installInput.trim()}
              className="w-full font-mono text-[12px] font-bold py-2 rounded-lg border border-[#4FC3F7]/40 text-[#4FC3F7] hover:bg-[#4FC3F7]/10 transition-colors disabled:opacity-50"
            >
              {installBusy ? "Installing…" : "Install"}
            </button>
            {installMsg && <p className="font-mono text-[10px] text-slate-400 mt-3 whitespace-pre-wrap leading-relaxed">{installMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
