"use client";

import { useState } from "react";
import {
  AGENT_SKILLS, SKILL_PROVIDERS, PROVIDER_COLORS, PROVIDER_ICONS,
  type SkillProvider,
} from "../agent-skills";
import { useChat } from "../ChatContext";

export default function SkillsPanel() {
  const { setInput } = useChat();
  const [activeProvider, setActiveProvider] = useState<SkillProvider | "all">("all");

  const filtered = activeProvider === "all"
    ? AGENT_SKILLS
    : AGENT_SKILLS.filter(s => s.provider === activeProvider);

  const active    = filtered.filter(s => s.status === "active");
  const soon      = filtered.filter(s => s.status === "soon");

  function use(trigger?: string) {
    if (trigger) setInput(trigger);
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Provider filter bar ── */}
      <div className="flex-shrink-0 border-b border-[#1A1A2E]">
        <div className="max-w-3xl mx-auto px-6 py-3 flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setActiveProvider("all")}
            className={`font-mono text-[10px] px-2.5 py-1 rounded transition-colors ${
              activeProvider === "all"
                ? "bg-white/10 text-white"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            All
          </button>
          {SKILL_PROVIDERS.map(p => {
            const color   = PROVIDER_COLORS[p];
            const isActive = activeProvider === p;
            return (
              <button
                key={p}
                onClick={() => setActiveProvider(p)}
                className="font-mono text-[10px] px-2.5 py-1 rounded border transition-all"
                style={isActive
                  ? { color, borderColor: `${color}50`, background: `${color}15` }
                  : { color: "#475569", borderColor: "transparent" }}
              >
                {PROVIDER_ICONS[p]} {p}
              </button>
            );
          })}

          <span className="ml-auto font-mono text-[9px] text-slate-700">
            {active.length} active · {soon.length} soon
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-4 space-y-6">

          {/* Active skills */}
          {active.length > 0 && (
            <section>
              <p className="font-mono text-[10px] text-[#4FC3F7] tracking-widest mb-3">// ACTIVE SKILLS</p>
              <div className="space-y-px">
                {active.map(skill => {
                  const color = PROVIDER_COLORS[skill.provider];
                  return (
                    <div
                      key={skill.id}
                      onClick={() => use(skill.trigger)}
                      className="group flex items-center gap-4 px-4 py-3 border-l-2 border-transparent hover:border-current hover:bg-[#1A1A2E]/50 cursor-pointer transition-all rounded-r-lg"
                      style={{ ["--hover-color" as string]: color } as React.CSSProperties}
                    >
                      {/* Provider dot */}
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: color }}
                      />

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="font-mono text-sm text-slate-300 group-hover:text-white transition-colors">
                            {skill.name}
                          </span>
                          {skill.badge && (
                            <span
                              className="font-mono text-[8px] px-1.5 py-0.5 rounded border"
                              style={{ color, borderColor: `${color}40`, background: `${color}10` }}
                            >
                              {skill.badge}
                            </span>
                          )}
                        </div>
                        <p className="font-mono text-[10px] text-slate-600 leading-relaxed truncate">
                          {skill.description}
                        </p>
                      </div>

                      {/* Trigger example */}
                      {skill.trigger && (
                        <span
                          className="font-mono text-[9px] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity px-2 py-1 rounded"
                          style={{ color, background: `${color}10` }}
                        >
                          use →
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Coming soon */}
          {soon.length > 0 && (
            <section>
              <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-3">// COMING SOON</p>
              <div className="space-y-px opacity-50">
                {soon.map(skill => (
                  <div
                    key={skill.id}
                    className="flex items-center gap-4 px-4 py-3"
                  >
                    <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-700" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-mono text-sm text-slate-500">{skill.name}</span>
                        <span className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-slate-700 text-slate-600">
                          soon
                        </span>
                      </div>
                      <p className="font-mono text-[10px] text-slate-700 truncate">{skill.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Provider legend */}
          <section className="border-t border-[#1A1A2E] pt-4">
            <p className="font-mono text-[10px] text-slate-700 tracking-widest mb-3">// POWERED BY</p>
            <div className="grid grid-cols-3 gap-3">
              {SKILL_PROVIDERS.map(p => {
                const color = PROVIDER_COLORS[p];
                const count = AGENT_SKILLS.filter(s => s.provider === p && s.status === "active").length;
                return (
                  <div
                    key={p}
                    className="px-3 py-3 rounded-xl border"
                    style={{ borderColor: `${color}20`, background: `${color}05` }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-base">{PROVIDER_ICONS[p]}</span>
                      <span className="font-mono text-xs font-semibold" style={{ color }}>{p}</span>
                    </div>
                    <p className="font-mono text-[9px] text-slate-600">
                      {count} skills active
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
