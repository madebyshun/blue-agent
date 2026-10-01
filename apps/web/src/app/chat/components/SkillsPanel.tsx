"use client";

import { useState } from "react";
import {
  AGENT_SKILLS, NO_FEE_CHAT_TOOLS, SKILL_ACCENT, type AgentSkill, type SkillGroup, type SkillChain,
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

// The page's sections, in the order of the loop (ShunTr, 2026-10-01).
const GROUPS: { id: SkillGroup; chip: string; title: string; sub: string }[] = [
  { id: "discover", chip: "Discover", title: "DISCOVER",     sub: "find what is moving — facts, never a buy call" },
  { id: "check",    chip: "Check",    title: "CHECK",        sub: "measured on-chain before you touch it" },
  { id: "trade",    chip: "Trade",    title: "TRADE",        sub: "a card with the quote and a pre-trade check — you sign" },
  { id: "wallet",   chip: "Wallet",   title: "WALLET",       sub: "what you hold, across both chains" },
  { id: "stocks",   chip: "Stocks",   title: "STOCK TOKENS", sub: "Robinhood Chain and Coinbase B20 — tokenized stocks, read from their contracts" },
  { id: "build",    chip: "Builder",  title: "BUILDER",      sub: "the founder commands — idea → build → audit → ship → raise" },
];
const CHAIN_LABEL: Record<SkillChain, string> = { base: "Base 8453", robinhood: "Robinhood 4663" };

export default function SkillsPanel({ onPick, onUse, costs }: {
  onPick?: () => void;
  // Standalone surfaces (e.g. /app/skills) have no local composer to seed, so
  // they pass onUse to route the pick elsewhere (→ /chat?prefill=<trigger>).
  onUse?: (trigger?: string) => void;
  /** Catalog id → tool fee in credits, computed on the server from the catalog
   *  price (app/app/skills/page.tsx). Absent (the in-chat tab) ⟹ no fee shown. */
  costs?: Record<string, number>;
}) {
  const { setInput } = useChat();
  const [activeGroup, setActiveGroup] = useState<SkillGroup | "all">("all");
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
  const matches = (sk: AgentSkill) =>
    !lc || sk.name.toLowerCase().includes(lc) || sk.description.toLowerCase().includes(lc)
      || (sk.trigger ?? "").toLowerCase().includes(lc) || (sk.tools ?? []).some((t) => t.includes(lc));
  const live = AGENT_SKILLS.filter((sk) => sk.status === "active" && sk.group && matches(sk)
    && (activeGroup === "all" || sk.group === activeGroup));
  const soon = AGENT_SKILLS.filter((sk) => sk.status === "soon" && matches(sk) && activeGroup === "all");
  const catalogEmpty = live.length === 0 && soon.length === 0;
  const totalActive = AGENT_SKILLS.filter((sk) => sk.status === "active").length;

  function use(trigger?: string) {
    if (onUse) { onUse(trigger); return; }
    if (trigger) setInput(trigger);
    onPick?.();
  }

  /** The tool fee on top of the chat message, from the catalog price (passed
   *  in by the server page). Unknown ⟹ nothing printed, never a 0. */
  function feeLine(sk: AgentSkill): string | null {
    if (sk.signs) return "no tool fee · you sign the tx";
    if (sk.tools?.length && sk.tools.every((t) => NO_FEE_CHAT_TOOLS.has(t))) return "no tool fee";
    if (!costs || !sk.meterIds?.length) return null;
    const known = sk.meterIds.map((id) => costs[id]).filter((c): c is number => typeof c === "number");
    if (known.length !== sk.meterIds.length) return null;
    const total = known.reduce((a, b) => a + b, 0);
    return total === 0 ? "no tool fee" : `+${total} cr tool fee`;
  }

  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden">

      {/* `// SKILLS` header — desktop only. Below lg the global MobileTopBar
          prints the surface title, so rendering this too would duplicate it. */}
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// SKILLS</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">what Chat can do · each runs a real tool or builds a card you sign</span>
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

          {/* Search + group filter */}
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
            {([["all", "All"], ...GROUPS.map((g) => [g.id, g.chip] as const)] as const).map(([id, label]) => {
              const on = activeGroup === id;
              return (
                <button
                  key={id}
                  onClick={() => setActiveGroup(id as SkillGroup | "all")}
                  className="font-mono text-[9.5px] rounded-full px-[11px] py-1 border transition-colors"
                  style={on
                    ? { color: "#050508", background: SKILL_ACCENT, borderColor: SKILL_ACCENT, fontWeight: 600 }
                    : { color: "#94A3B8", borderColor: BORDER, background: "transparent" }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {catalogEmpty && (
            <div className="text-center py-12">
              <p className="font-mono text-[13px] text-[#94A3B8]">No skills found</p>
              <p className="font-mono text-[10px] text-[#475569] mt-1">Try a different search or filter</p>
            </div>
          )}

          {GROUPS.map((g) => {
            const rows = live.filter((sk) => sk.group === g.id);
            if (rows.length === 0) return null;
            return (
              <section key={g.id}>
                <div className="flex items-baseline gap-2.5 mt-[24px] mb-3 flex-wrap">
                  <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">{g.title}</span>
                  <span className="font-mono text-[10px] text-[#475569]">{g.sub}</span>
                </div>
                <div className="grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(230px,1fr))" }}>
                  {rows.map((sk) => {
                    const runs = runsOf(sk);
                    const fee = feeLine(sk);
                    return (
                      <button
                        key={sk.id}
                        type="button"
                        onClick={() => use(sk.trigger)}
                        className="text-left rounded-[14px] p-[14px] border transition-colors hover:border-[#4FC3F7]/45 flex flex-col"
                        style={{ borderColor: sk.signs ? "rgba(79,195,247,.22)" : BORDER, background: sk.signs ? "rgba(79,195,247,.035)" : SURFACE }}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-[12px] font-semibold text-[#E2E8F0]">{sk.name}</span>
                          {sk.signs && (
                            <span className="font-mono text-[8.5px] font-medium text-[#4FC3F7] border border-[#4FC3F7]/30 rounded-full px-[7px] py-[2px] shrink-0">you sign</span>
                          )}
                          {!sk.signs && sk.tools && sk.tools.length > 1 && (
                            <span className="font-mono text-[8.5px] font-medium text-[#A78BFA] border border-[#A78BFA]/30 rounded-full px-[7px] py-[2px] shrink-0">{sk.tools.length} tools</span>
                          )}
                        </div>
                        <p className="font-prose text-[10.5px] leading-[1.6] text-[#94A3B8] mt-2 flex-1">{sk.description}</p>
                        <div className="flex flex-wrap gap-[5px] mt-[10px]">
                          {(sk.chains ?? []).map((c) => (
                            <span key={c} className="font-mono text-[8.5px] text-[#94A3B8] border border-[#1A1A2E] rounded-[5px] px-[6px] py-[2px]">{CHAIN_LABEL[c]}</span>
                          ))}
                        </div>
                        <div className="font-mono text-[9.5px] text-[#64748B] mt-[9px] truncate">“{sk.trigger?.trim()}”</div>
                        <div className="font-mono text-[9px] text-[#475569] mt-1">
                          {[fee, runs !== null && runs > 0 ? `${runs.toLocaleString()} runs` : null].filter(Boolean).join(" · ") || "\u00a0"}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          {/* Scheduled tasks live on their own page — a pointer, not a skill. */}
          {(activeGroup === "all") && !lc && (
            <a href="/cron" className="flex items-center gap-3 mt-[24px] border border-[#1A1A2E] rounded-[14px] px-4 py-[13px] bg-[#0D0D14] hover:border-[#4FC3F7]/45 transition-colors">
              <span className="font-mono text-[9.5px] font-medium tracking-[0.14em] text-[#64748B]">SCHEDULE</span>
              <span className="flex-1 font-mono text-[10.5px] text-[#94A3B8]">Run any of these on a timer — daily or weekly, priced before it runs, paused when credits run out.</span>
              <span className="font-mono text-[10.5px] text-[#4FC3F7]">Scheduled →</span>
            </a>
          )}

          <p className="font-mono text-[9.5px] text-[#475569] mt-4 leading-relaxed">
            Every message also costs the model&apos;s credits (see Models). Chat-only presets cannot run any skill.
            Blue Agent never signs: a “you sign” skill builds a card, and nothing moves until your wallet signs it.
          </p>

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
              placeholder="base/skills"
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
