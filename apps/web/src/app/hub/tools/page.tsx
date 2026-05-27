"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import type { AgentTool, AgentToolInput } from "@/lib/agent-tools";

// ─── Design tokens ─────────────────────────────────────────────────────────────

const AGENT_COLORS: Record<string, string> = {
  "Aeon":        "#A78BFA",
  "Blue Agent":  "#4FC3F7",
  "MiroShark":   "#34D399",
  "Blue + Aeon": "#F59E0B",
};

// Category tabs → maps to raw category values
const TABS = [
  { key: "all",          label: "All" },
  { key: "intelligence", label: "Intelligence" },
  { key: "builder",      label: "Builder" },
  { key: "trading",      label: "Trading" },
  { key: "security",     label: "Security" },
];

function tabMatch(rawCat: string, tab: string): boolean {
  if (tab === "all") return true;
  if (tab === "intelligence") return rawCat === "market" || rawCat === "research";
  if (tab === "trading")      return rawCat === "defi";
  return rawCat === tab;
}

// Sub-tags
const SUB_TAGS = ["Context", "Agent Economy", "Base Ecosystem", "On-chain"];

// ─── Output renderer ───────────────────────────────────────────────────────────

function OutputPanel({
  tool,
  result,
  running,
  log,
}: {
  tool: AgentTool | null;
  result: string | null;
  running: boolean;
  log: string[];
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!result) return;
    try { navigator.clipboard?.writeText(result).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }).catch(() => {}); } catch { /* noop */ }
  }

  // Agents attribution
  const agentNames = tool?.isComposite
    ? ["Blue", "Aeon", "MiroShark"]
    : tool?.agentName === "Aeon"
    ? ["Aeon"]
    : tool?.agentName === "MiroShark"
    ? ["MiroShark"]
    : ["Blue"];

  const agentColorMap: Record<string, string> = {
    Blue: "#4FC3F7", Aeon: "#A78BFA", MiroShark: "#34D399",
  };

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-[#1A1A2E] shrink-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-700 tracking-widest">
          <Link href="/hub" className="hover:text-slate-500 transition-colors">Hub</Link>
          <span>/</span>
          <span className={tool ? "text-slate-400" : "text-slate-700"}>
            {tool ? tool.name : "Tools"}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {/* Agent attribution pills */}
          <div className="flex items-center gap-1.5">
            {agentNames.map(a => (
              <span
                key={a}
                className="font-mono text-[10px]"
                style={{ color: agentColorMap[a] ?? "#475569" }}
              >
                {a}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Sub-bar — only when tool selected */}
      {tool && (
        <div className="flex items-center gap-3 px-5 py-2 border-b border-[#1A1A2E] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
          <span className="font-mono text-[11px] text-white">{tool.name}</span>
          {result && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 border border-[#34D399]/30 text-[#34D399] rounded">
              cached
            </span>
          )}
          <div className="ml-auto flex items-center gap-3">
            {agentNames.map(a => (
              <span key={a} className="font-mono text-[10px]" style={{ color: agentColorMap[a] ?? "#475569" }}>{a}</span>
            ))}
            {result && (
              <>
                <button
                  onClick={copy}
                  className="font-mono text-[10px] text-slate-600 hover:text-slate-300 transition-colors"
                >
                  {copied ? "✓ copied" : "Share ↑"}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {running ? (
          /* Scan log */
          <div className="p-5">
            <div className="bg-[#050508] border border-[#1A1A2E] rounded-xl overflow-hidden">
              <div className="flex items-center gap-1.5 px-3 py-2 border-b border-[#1A1A2E]">
                <span className="w-2 h-2 rounded-full bg-red-500/60" />
                <span className="w-2 h-2 rounded-full bg-yellow-500/60" />
                <span className="w-2 h-2 rounded-full bg-green-500/60" />
                <span className="font-mono text-[10px] text-slate-700 ml-2">
                  {tool?.isComposite ? "composite-runner" : `${tool?.agentName?.toLowerCase() ?? "agent"}-skill`}
                </span>
              </div>
              <div className="p-4 min-h-[160px] space-y-1">
                {log.map((l, i) => (
                  <p key={i} className="font-mono text-[11px] text-slate-500 animate-fadeIn">{l}</p>
                ))}
                <span className="inline-block w-1.5 h-3.5 bg-[#4FC3F7] animate-pulse" />
              </div>
            </div>
          </div>
        ) : result !== null ? (
          /* Result */
          <StructuredOutput result={result} tool={tool!} />
        ) : tool ? (
          /* Waiting */
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-8">
            <div className="w-10 h-10 rounded-full border border-[#1A1A2E] flex items-center justify-center">
              <span className="w-2 h-2 rounded-full" style={{ background: AGENT_COLORS[tool.agentName] ?? "#475569" }} />
            </div>
            <p className="font-mono text-[10px] text-slate-700 tracking-widest">// WAITING FOR INPUT</p>
            <p className="font-mono text-xs text-slate-700 leading-relaxed max-w-xs">
              Fill in the form and click Run to get your {tool.name} analysis
            </p>
          </div>
        ) : (
          /* No tool selected */
          <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
            <p className="font-mono text-[10px] text-slate-700 tracking-widest">// SELECT A TOOL</p>
            <p className="font-mono text-xs text-slate-700 leading-relaxed max-w-xs">
              Choose a tool from the list to get started. Single-agent and composite multi-agent tools available.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-4 w-full max-w-sm">
              {[
                { label: "Intelligence", color: "#A78BFA", desc: "Market signals & research" },
                { label: "Builder", color: "#4FC3F7", desc: "Architecture & code" },
                { label: "Trading", color: "#34D399", desc: "DeFi & on-chain" },
              ].map(c => (
                <div key={c.label} className="bg-[#0D0D1A] border border-[#1A1A2E] rounded-xl p-3">
                  <span className="font-mono text-[10px]" style={{ color: c.color }}>{c.label}</span>
                  <p className="font-mono text-[9px] text-slate-700 mt-1 leading-relaxed">{c.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Structured output ─────────────────────────────────────────────────────────

function StructuredOutput({ result, tool }: { result: string; tool: AgentTool }) {
  // Try JSON parse first
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(result);
  } catch { /* raw text */ }

  if (parsed) {
    return (
      <div className="p-5 space-y-4">
        {Object.entries(parsed).map(([key, val]) => (
          <div key={key}>
            <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2 uppercase">{key.replace(/_/g, " ")}</p>
            {typeof val === "object" && val !== null ? (
              <div className="space-y-2">
                {Array.isArray(val) ? (
                  val.map((item, i) => (
                    <p key={i} className="font-mono text-xs text-slate-300 leading-relaxed">{String(item)}</p>
                  ))
                ) : (
                  Object.entries(val as Record<string, unknown>).map(([k, v]) => (
                    <div key={k} className="flex items-start gap-3">
                      <span className="font-mono text-[10px] text-slate-600 w-24 shrink-0 mt-0.5 uppercase">{k.replace(/_/g, " ")}</span>
                      <span className="font-mono text-xs text-slate-300 leading-relaxed">{String(v)}</span>
                    </div>
                  ))
                )}
              </div>
            ) : typeof val === "number" ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 h-1 bg-[#1A1A2E] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(100, val)}%`,
                      background: val >= 70 ? "#34D399" : val >= 40 ? "#F59E0B" : "#F87171",
                    }}
                  />
                </div>
                <span className="font-mono text-sm font-bold text-white w-8 text-right">{val}</span>
              </div>
            ) : (
              <p className="font-mono text-xs text-slate-300 leading-relaxed">{String(val)}</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Plain text — render section-by-section
  const lines = result.split("\n");
  const sections: Array<{ header: string | null; lines: string[] }> = [];
  let current: { header: string | null; lines: string[] } = { header: null, lines: [] };

  for (const line of lines) {
    const trimmed = line.trim();
    // Detect ALL-CAPS section headers (e.g. PROJECT, BRIEF, MIROSHARK)
    if (/^[A-Z][A-Z0-9 _]{2,}$/.test(trimmed) && trimmed.length < 40) {
      if (current.lines.some(l => l.trim())) sections.push(current);
      current = { header: trimmed, lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.some(l => l.trim())) sections.push(current);

  if (sections.length > 1) {
    return (
      <div className="p-5 space-y-5">
        {sections.map((sec, i) => (
          <div key={i}>
            {sec.header && (
              <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-2">{sec.header}</p>
            )}
            <div className="space-y-1">
              {sec.lines.filter(l => l.trim()).map((l, j) => {
                const t = l.trim();
                // Score bars for lines like "BULL 72" or "BEAR 18"
                const scoreMatch = t.match(/^(BULL|BEAR|NEUTRAL)\s+(\d+)$/i);
                if (scoreMatch) {
                  const score = parseInt(scoreMatch[2]);
                  const label = scoreMatch[1].toUpperCase();
                  const color = label === "BULL" ? "#34D399" : label === "BEAR" ? "#F87171" : "#F59E0B";
                  return (
                    <div key={j} className="flex items-center gap-3">
                      <span className="font-mono text-[10px] w-16 shrink-0" style={{ color }}>{label}</span>
                      <div className="flex-1 h-1 bg-[#1A1A2E] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
                      </div>
                      <span className="font-mono text-xs font-bold text-white w-8 text-right">{score}</span>
                    </div>
                  );
                }
                // Key: value lines
                const kvMatch = t.match(/^([A-Z][A-Z0-9 _]{1,20}):\s*(.+)$/);
                if (kvMatch) {
                  return (
                    <div key={j} className="flex items-start gap-3">
                      <span className="font-mono text-[10px] text-slate-600 w-28 shrink-0 mt-0.5">{kvMatch[1]}</span>
                      <span className="font-mono text-xs text-slate-300 leading-relaxed">{kvMatch[2]}</span>
                    </div>
                  );
                }
                return (
                  <p key={j} className="font-mono text-xs text-slate-400 leading-relaxed">{t}</p>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Fallback: pre
  return (
    <div className="p-5">
      <pre className="font-mono text-xs text-slate-300 whitespace-pre-wrap leading-relaxed">{result}</pre>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

type ToolsData = { tools: AgentTool[]; total: number; composite: number; agents: string[] };

export default function ToolsPage() {
  const [tools, setTools]           = useState<AgentTool[]>([]);
  const [selected, setSelected]     = useState<AgentTool | null>(null);
  const [values, setValues]         = useState<Record<string, string>>({});
  const [tab, setTab]               = useState("all");
  const [subTag, setSubTag]         = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [loading, setLoading]       = useState(true);
  const [running, setRunning]       = useState(false);
  const [result, setResult]         = useState<string | null>(null);
  const [error, setError]           = useState("");
  const [log, setLog]               = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/tool-runner")
      .then(r => r.json())
      .then((d: ToolsData) => setTools(d.tools ?? []))
      .catch(() => setTools([]))
      .finally(() => setLoading(false));
  }, []);

  function selectTool(t: AgentTool) {
    setSelected(t);
    setValues({});
    setResult(null);
    setError("");
    setLog([]);
  }

  function setValue(key: string, val: string) {
    setValues(prev => ({ ...prev, [key]: val }));
  }

  async function handleRun(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setError(""); setResult(null); setRunning(true); setLog([]);

    // Animated log
    const agentColor = AGENT_COLORS[selected.agentName] ?? "#4FC3F7";
    const logLines = selected.isComposite && selected.compositeSkills
      ? [
          `[sys] initializing composite: ${selected.name}`,
          `[sys] spawning ${selected.compositeSkills.length} agents…`,
          ...selected.compositeSkills.map(cs => `[aeon] skill: ${cs.skillId}`),
          `[blue] synthesizing ${selected.compositeSkills.length} outputs…`,
          `[sys] done`,
        ]
      : [
          `[sys] loading skill: ${selected.skillId ?? selected.id}`,
          `[${selected.agentName.toLowerCase()}] analyzing input…`,
          `[${selected.agentName.toLowerCase()}] generating output…`,
          `[sys] processing…`,
          `[sys] done`,
        ];

    let i = 0;
    const logTimer = setInterval(() => {
      if (i < logLines.length) { setLog(prev => [...prev, logLines[i]]); i++; }
      else clearInterval(logTimer);
    }, 480);

    const inputParts = selected.inputs
      .map((inp: AgentToolInput) => values[inp.key] ? `${inp.label}: ${values[inp.key]}` : "")
      .filter(Boolean);

    try {
      const res = await fetch("/api/tool-runner", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toolId: selected.id, input: inputParts.join("\n") }),
      });
      const data = await res.json() as { result?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Run failed");
      setResult(data.result ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Run failed");
    } finally {
      clearInterval(logTimer);
      setRunning(false);
    }
  }

  // Filtering
  const filtered = tools.filter(t => {
    if (!tabMatch(t.category, tab)) return false;
    if (search && !t.name.toLowerCase().includes(search.toLowerCase()) &&
        !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const agentColor = selected ? (AGENT_COLORS[selected.agentName] ?? "#4FC3F7") : "#4FC3F7";

  return (
    <>
      <Navbar />
      <div className="flex bg-[#050508] font-mono pt-16" style={{ height: "calc(100vh)" }}>

        {/* ── Panel 1: Tool list ── */}
        <aside className="hidden lg:flex flex-col w-48 shrink-0 border-r border-[#1A1A2E] h-[calc(100vh-4rem)] sticky top-16">
          {/* Header */}
          <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E]">
            <p className="font-mono text-[10px] text-[#F59E0B] tracking-widest">// TOOLS</p>
            <p className="font-mono text-[10px] text-slate-700 mt-0.5">
              {filtered.length} of {tools.length} tools
            </p>
          </div>

          {/* Search */}
          <div className="px-3 pt-3 pb-2">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tools…"
              className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-white placeholder-slate-700 focus:outline-none transition-colors"
            />
          </div>

          {/* Category tabs */}
          <div className="px-3 pb-2">
            <div className="flex flex-wrap gap-1">
              {TABS.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`font-mono text-[10px] px-2 py-0.5 rounded transition-colors ${
                    tab === t.key
                      ? "bg-[#4FC3F7]/15 text-[#4FC3F7]"
                      : "text-slate-600 hover:text-slate-300"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Sub-tags */}
          <div className="px-3 pb-3 border-b border-[#1A1A2E]">
            <div className="flex flex-wrap gap-1">
              {SUB_TAGS.map(s => (
                <button
                  key={s}
                  onClick={() => setSubTag(prev => prev === s ? null : s)}
                  className={`font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                    subTag === s
                      ? "border-[#4FC3F7]/30 text-[#4FC3F7]"
                      : "border-[#1A1A2E] text-slate-700 hover:text-slate-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Tool list */}
          <div className="flex-1 overflow-y-auto py-2">
            {loading ? (
              <p className="font-mono text-[10px] text-slate-700 px-4 animate-pulse mt-3">loading…</p>
            ) : filtered.length === 0 ? (
              <p className="font-mono text-[10px] text-slate-700 px-4 mt-3">no tools</p>
            ) : (
              <div className="space-y-px">
                {filtered.map(t => {
                  const ac = AGENT_COLORS[t.agentName] ?? "#475569";
                  const isActive = selected?.id === t.id;
                  return (
                    <button
                      key={t.id}
                      onClick={() => selectTool(t)}
                      className={`w-full text-left flex items-center gap-2 px-3 py-2 transition-colors group ${
                        isActive ? "bg-[#0D0D1A] border-r-2 border-[#4FC3F7]" : "hover:bg-[#0D0D1A]/50"
                      }`}
                    >
                      {/* Dots / indicator */}
                      <span className="font-mono text-[10px] text-slate-700 shrink-0 tracking-tight">
                        {isActive ? "●" : "···"}
                      </span>
                      <span
                        className={`font-mono text-[11px] leading-snug truncate transition-colors ${
                          isActive ? "text-white" : "text-slate-500 group-hover:text-slate-300"
                        }`}
                      >
                        {t.name}
                      </span>
                      {t.isComposite && (
                        <span className="shrink-0 font-mono text-[9px] text-[#F59E0B]">✦</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-3 border-t border-[#1A1A2E]">
            <Link href="/hub/registry" className="font-mono text-[10px] text-slate-700 hover:text-slate-400 transition-colors flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-[#34D399]" />
              Registry
            </Link>
          </div>
        </aside>

        {/* ── Panel 2: Input form ── */}
        <div className="hidden lg:flex flex-col w-72 shrink-0 border-r border-[#1A1A2E] h-[calc(100vh-4rem)] sticky top-16">
          {selected ? (
            <>
              {/* Tool name + description */}
              <div className="px-5 pt-5 pb-4 border-b border-[#1A1A2E]">
                <h2 className="font-mono text-base font-bold text-white mb-1.5 leading-snug">
                  {selected.name}
                </h2>
                <p className="font-mono text-[11px] text-slate-500 leading-relaxed">
                  {selected.description}
                </p>
                {selected.isComposite && selected.compositeSkills && (
                  <div className="mt-3 space-y-1">
                    {selected.compositeSkills.map((cs, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="font-mono text-[9px] text-[#A78BFA]">{i + 1}.</span>
                        <span className="font-mono text-[10px] text-slate-500">{cs.label}</span>
                        <span className="font-mono text-[9px] text-slate-700 ml-auto">{cs.agentType}</span>
                      </div>
                    ))}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-[#4FC3F7]">→</span>
                      <span className="font-mono text-[10px] text-[#4FC3F7]">Blue Agent synthesis</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Form */}
              <form onSubmit={handleRun} className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                  <div>
                    <p className="font-mono text-[10px] text-slate-600 tracking-widest mb-1">// INPUT</p>
                    <p className="font-mono text-[9px] text-slate-700 leading-relaxed">
                      Output quality depends on input accuracy — use real data for best results
                    </p>
                  </div>

                  {selected.inputs.map((inp: AgentToolInput) => (
                    <div key={inp.key}>
                      <label className="block font-mono text-[10px] text-slate-500 mb-1.5">
                        {inp.label}{inp.required ? " *" : ""}
                      </label>
                      {inp.key === "description" || inp.key === "brief" || inp.key === "context" ? (
                        <textarea
                          value={values[inp.key] ?? ""}
                          onChange={e => setValue(inp.key, e.target.value)}
                          placeholder={inp.placeholder}
                          required={inp.required}
                          rows={4}
                          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-[11px] text-white placeholder-slate-700 focus:outline-none transition-colors resize-none"
                        />
                      ) : (
                        <input
                          value={values[inp.key] ?? ""}
                          onChange={e => setValue(inp.key, e.target.value)}
                          placeholder={inp.placeholder}
                          required={inp.required}
                          className="w-full bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/30 rounded-lg px-3 py-2 font-mono text-[11px] text-white placeholder-slate-700 focus:outline-none transition-colors"
                        />
                      )}
                    </div>
                  ))}

                  {error && (
                    <p className="font-mono text-[10px] text-red-400">{error}</p>
                  )}
                </div>

                {/* Run button */}
                <div className="px-5 py-4 border-t border-[#1A1A2E] shrink-0">
                  <button
                    type="submit"
                    disabled={running}
                    className="w-full py-2.5 font-mono text-xs rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    style={{
                      background: `${agentColor}20`,
                      borderWidth: 1,
                      borderStyle: "solid",
                      borderColor: `${agentColor}40`,
                      color: agentColor,
                    }}
                  >
                    {running ? (
                      <>
                        <span className="w-3 h-3 border border-current/30 border-t-current rounded-full animate-spin" />
                        {selected.isComposite
                          ? `running ${selected.compositeSkills?.length} skills…`
                          : "running…"}
                      </>
                    ) : (
                      `Run →`
                    )}
                  </button>
                  <p className="font-mono text-[9px] text-slate-700 text-center mt-2">
                    {selected.isComposite
                      ? `${selected.compositeSkills?.length} skills · Blue synthesis`
                      : `powered by ${selected.agentName}`}
                  </p>
                </div>
              </form>
            </>
          ) : (
            /* Empty middle panel */
            <div className="flex flex-col items-center justify-center h-full px-5 text-center gap-3">
              <p className="font-mono text-[10px] text-slate-700 tracking-widest">// NO TOOL SELECTED</p>
              <p className="font-mono text-[11px] text-slate-700 leading-relaxed">
                Pick a tool from the list to see its inputs here
              </p>
            </div>
          )}
        </div>

        {/* ── Panel 3: Output ── */}
        <main className="flex-1 h-[calc(100vh-4rem)] overflow-hidden flex flex-col">
          <OutputPanel
            tool={selected}
            result={result}
            running={running}
            log={log}
          />
        </main>

      </div>
    </>
  );
}
