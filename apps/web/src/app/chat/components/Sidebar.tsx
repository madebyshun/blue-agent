"use client";
/**
 * Blue Chat Sidebar — unified left panel (260px)
 * Pattern: ChatGPT / Claude.ai / OpenClaw
 *
 * Structure (top → bottom):
 *   Header: logo + new task
 *   Task list: sorted by recency, grouped Today/Yesterday/Older
 *   ── separator ──
 *   Skills accordion (collapsed)
 *   Cron accordion (collapsed)
 *   ── separator ──
 *   Model row (compact)
 *   Credits row
 *   Wallet (bottom)
 */

import { useState } from "react";
import { useChat } from "../ChatContext";
import { creditCost } from "@/lib/credits";
import { getMemory, clearMemory } from "@/lib/memory";
import WalletBar from "@/components/WalletBar";
import PersonaSelector from "./PersonaSelector";
import ToolsTab from "./ToolsTab";
import CronPanel from "./CronPanel";

const BANKR = [
  { id: "fast", label: "Fast",   model: "Haiku",  color: "#64748b" },
  { id: "pro",  label: "Pro",    model: "Sonnet", color: "#4FC3F7" },
  { id: "max",  label: "Max",    model: "Opus",   color: "#A78BFA" },
];
const VENICE = [
  { id: "venice-deepseek", label: "V4 Flash",   color: "#34D399" },
  { id: "venice-grok",     label: "Grok 4",     color: "#E879F9" },
  { id: "venice-uncut",    label: "Uncensored", color: "#FB923C" },
  { id: "venice-mistral",  label: "Mistral",    color: "#60A5FA" },
];
const ALL_MODELS = [...BANKR, ...VENICE];

function relativeGroup(ms: number): "today" | "yesterday" | "older" {
  const diff = Date.now() - ms;
  if (diff < 86_400_000)  return "today";
  if (diff < 172_800_000) return "yesterday";
  return "older";
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const m = Math.floor(diff / 60_000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function msgPreview(content: string): string {
  return content.replace(/[#*`>_~[\]]/g, "").trim().slice(0, 60);
}

export default function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const {
    tasks, activeTaskId, createNewTask, selectTask, deleteTask,
    chatTier, setChatTier, holderTier,
    credits, countdown, isUnlimited, daily,
    walletAddr, onWalletChange, walletRefresh,
    setBuyOpen, artifacts, artifactsPanelOpen, setArtifactsPanelOpen,
  } = useChat();

  const [skillsOpen,  setSkillsOpen]  = useState(false);
  const [cronOpen,    setCronOpen]    = useState(false);
  const [modelOpen,   setModelOpen]   = useState(false);
  const [personaOpen, setPersonaOpen] = useState(false);

  const memory    = getMemory(walletAddr);
  const hasMemory = !!(memory.currentProject || memory.commandHistory.length > 0);

  const activeTier = ALL_MODELS.find(m => m.id === chatTier) ?? BANKR[1];
  const cost       = creditCost(chatTier, holderTier);

  const sorted = [...tasks].sort((a, b) => b.updatedAt - a.updatedAt);
  const today     = sorted.filter(t => relativeGroup(t.updatedAt) === "today");
  const yesterday = sorted.filter(t => relativeGroup(t.updatedAt) === "yesterday");
  const older     = sorted.filter(t => relativeGroup(t.updatedAt) === "older");

  if (collapsed) {
    return (
      <aside className="hidden lg:flex flex-col w-14 shrink-0 border-r border-[#1A1A2E] h-full bg-[#050508] items-center py-3 gap-2">
        {/* Expand button */}
        <button onClick={onToggle} className="w-9 h-9 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-400 hover:bg-white/5 transition-all" title="Expand sidebar">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
        {/* Logo */}
        <div className="w-8 h-8 rounded-full bg-[#4FC3F7] flex items-center justify-center mt-1">
          <span className="font-mono text-[10px] font-black text-[#050508]">B</span>
        </div>
        {/* Credits dot */}
        <div className="mt-auto w-8 h-8 rounded-full flex items-center justify-center" style={{ background: `${holderTier.color}20` }}>
          <span className="font-mono text-[9px] font-bold" style={{ color: holderTier.color }}>
            {isUnlimited ? "∞" : credits > 999 ? `${(credits/1000).toFixed(0)}k` : credits}
          </span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="hidden lg:flex flex-col w-64 shrink-0 border-r border-[#1A1A2E] h-full bg-[#050508] overflow-hidden">

      {/* ── Header ── */}
      <div className="flex items-center gap-2 px-3 pt-4 pb-3 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="w-6 h-6 rounded-full bg-[#4FC3F7] flex items-center justify-center flex-shrink-0">
          <span className="font-mono text-[9px] font-black text-[#050508]">B</span>
        </div>
        <span className="font-mono text-xs text-[#4FC3F7] tracking-widest flex-1">BLUE CHAT</span>
        <button onClick={onToggle} className="text-slate-700 hover:text-slate-500 transition-colors p-1" title="Collapse sidebar">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* ── New Task button ── */}
      <div className="px-3 py-2 flex-shrink-0">
        <button
          onClick={createNewTask}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl font-mono text-xs text-slate-400 hover:text-white transition-all border border-dashed border-[#1A1A2E] hover:border-[#2A2A4E] hover:bg-white/[0.02]"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New task
        </button>
      </div>

      {/* ── Task list (scrollable, grouped) ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-2 pb-2">
        {sorted.length === 0 && (
          <p className="font-mono text-[10px] text-slate-700 text-center py-6">No tasks yet</p>
        )}

        {today.length > 0 && <TaskGroup label="Today" tasks={today} activeTaskId={activeTaskId} onSelect={selectTask} onDelete={deleteTask} />}
        {yesterday.length > 0 && <TaskGroup label="Yesterday" tasks={yesterday} activeTaskId={activeTaskId} onSelect={selectTask} onDelete={deleteTask} />}
        {older.length > 0 && <TaskGroup label="Older" tasks={older} activeTaskId={activeTaskId} onSelect={selectTask} onDelete={deleteTask} />}
      </div>

      {/* ── Divider ── */}
      <div className="border-t border-[#1A1A2E] mx-3 flex-shrink-0" />

      {/* ── Persona accordion ── */}
      <AccordionSection
        open={personaOpen}
        onToggle={() => setPersonaOpen(v => !v)}
        label="Persona"
        icon="🎭"
      >
        <div className="px-3 pt-1 pb-3">
          <PersonaSelector />
        </div>
      </AccordionSection>

      {/* ── Skills accordion ── */}
      <AccordionSection
        open={skillsOpen}
        onToggle={() => setSkillsOpen(v => !v)}
        label="Skills"
        icon="⚡"
        badge="50"
      >
        <div className="max-h-80 overflow-hidden">
          <ToolsTab />
        </div>
      </AccordionSection>

      {/* ── Cron accordion ── */}
      <AccordionSection
        open={cronOpen}
        onToggle={() => setCronOpen(v => !v)}
        label="Cron"
        icon="⏱"
      >
        <div className="max-h-80 overflow-hidden">
          <CronPanel />
        </div>
      </AccordionSection>

      {/* ── Artifacts row ── */}
      {artifacts.length > 0 && (
        <button
          onClick={() => setArtifactsPanelOpen(!artifactsPanelOpen)}
          className="flex items-center gap-2 px-4 py-2.5 text-left transition-all border-t border-[#1A1A2E] hover:bg-white/[0.02] flex-shrink-0"
          style={{ color: artifactsPanelOpen ? "#A78BFA" : "#475569" }}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          <span className="font-mono text-xs flex-1">Artifacts</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#A78BFA20", color: "#A78BFA" }}>
            {artifacts.length}
          </span>
        </button>
      )}

      {/* ── Divider ── */}
      <div className="border-t border-[#1A1A2E] mx-3 flex-shrink-0" />

      {/* ── Model row (inline compact) ── */}
      <div className="flex-shrink-0">
        <button
          onClick={() => setModelOpen(v => !v)}
          className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.02] transition-all"
        >
          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: activeTier.color }} />
          <span className="font-mono text-xs text-slate-400 flex-1 text-left">{activeTier.label}</span>
          <span className="font-mono text-[10px]" style={{ color: activeTier.color }}>{cost} cr</span>
          <svg className={`w-3 h-3 text-slate-600 transition-transform flex-shrink-0 ${modelOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {modelOpen && (
          <div className="border-t border-[#1A1A2E] bg-[#0A0A10] px-2 py-2">
            <p className="font-mono text-[9px] text-slate-700 px-2 mb-1 tracking-widest">BANKR · CLAUDE</p>
            {BANKR.map(t => (
              <ModelBtn key={t.id} t={t} active={chatTier === t.id} cost={creditCost(t.id, holderTier)} onClick={() => { setChatTier(t.id); setModelOpen(false); }} />
            ))}
            <p className="font-mono text-[9px] text-slate-700 px-2 mt-2 mb-1 tracking-widest">VENICE · PRIVACY</p>
            {VENICE.map(t => (
              <ModelBtn key={t.id} t={t} active={chatTier === t.id} cost={creditCost(t.id, holderTier)} onClick={() => { setChatTier(t.id); setModelOpen(false); }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Credits row ── */}
      <div className="px-4 py-2.5 border-t border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono text-[9px] text-slate-600 flex-1">Credits</span>
          <span className="font-mono text-xs font-bold" style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#4FC3F7" }}>
            {isUnlimited ? "∞" : credits.toLocaleString()}
          </span>
          <span className="font-mono text-[9px] text-slate-700">/ {daily === -1 ? "∞" : daily} /day</span>
        </div>
        {!isUnlimited && daily > 0 && (
          <div className="h-0.5 bg-[#1A1A2E] rounded-full overflow-hidden mb-1">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, (credits / daily) * 100)}%`, background: holderTier.color }} />
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="font-mono text-[9px] text-slate-700">resets {countdown}</span>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ color: holderTier.color, background: `${holderTier.color}15` }}>
            {walletAddr ? holderTier.tier : "Guest"}
          </span>
        </div>
        <button
          onClick={() => setBuyOpen(true)}
          className="mt-2 w-full flex items-center justify-center gap-1.5 py-1.5 rounded-lg font-mono text-[10px] font-semibold transition-all hover:opacity-90"
          style={{ background: "#F59E0B10", color: "#F59E0B", border: "1px solid #F59E0B25" }}
        >
          💰 Buy $BLUEAGENT
        </button>
      </div>

      {/* ── Memory (if any) ── */}
      {hasMemory && (
        <div className="px-4 py-2 border-t border-[#1A1A2E] flex-shrink-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[9px] text-slate-600">Memory</span>
            <button onClick={() => clearMemory(walletAddr)} className="font-mono text-[9px] text-slate-700 hover:text-red-400 transition-colors">clear</button>
          </div>
          {memory.currentProject && (
            <p className="font-mono text-[9px] text-[#4FC3F7] truncate">📌 {memory.currentProject.name}</p>
          )}
        </div>
      )}

      {/* ── Wallet (bottom, always visible) ── */}
      <div className="px-4 py-3 border-t border-[#1A1A2E] flex-shrink-0">
        <WalletBar onWalletChange={onWalletChange} refreshTrigger={walletRefresh} />
      </div>
    </aside>
  );
}

// ── Task group ─────────────────────────────────────────────────────────────────
import type { ChatTask } from "../types";

function TaskGroup({ label, tasks, activeTaskId, onSelect, onDelete }: {
  label: string;
  tasks: ChatTask[];
  activeTaskId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="mb-1">
      <p className="font-mono text-[9px] text-slate-700 tracking-widest px-2 pt-3 pb-1">{label.toUpperCase()}</p>
      {tasks.map(task => {
        const isActive  = task.id === activeTaskId;
        const lastAsst  = task.messages.filter(m => m.role === "assistant").at(-1);
        const userCount = task.messages.filter(m => m.role === "user").length;
        return (
          <div
            key={task.id}
            onClick={() => onSelect(task.id)}
            className="group relative flex items-start gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all"
            style={isActive ? { background: "#4FC3F710" } : {}}
          >
            {isActive && <span className="absolute left-0 top-2 bottom-2 w-0.5 rounded-r bg-[#4FC3F7]" />}
            <div className="flex-1 min-w-0">
              <p className={`font-mono text-xs truncate ${isActive ? "text-white" : "text-slate-400 group-hover:text-slate-200"} transition-colors`}>
                {task.title || <span className="italic text-slate-700">New conversation</span>}
              </p>
              {lastAsst?.content && (
                <p className="font-mono text-[9px] text-slate-700 truncate mt-0.5">
                  {msgPreview(lastAsst.content)}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              <span className="font-mono text-[8px] text-slate-700">{relativeTime(task.updatedAt)}</span>
              {userCount > 0 && <span className="font-mono text-[8px] text-slate-700">{userCount}m</span>}
            </div>
            <button
              onClick={e => { e.stopPropagation(); onDelete(task.id); }}
              className="opacity-0 group-hover:opacity-100 absolute right-1.5 top-1.5 p-0.5 text-slate-700 hover:text-red-400 transition-all"
            >
              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Accordion section ──────────────────────────────────────────────────────────
function AccordionSection({ open, onToggle, label, icon, badge, children }: {
  open: boolean; onToggle: () => void;
  label: string; icon: string; badge?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-shrink-0 border-t border-[#1A1A2E]">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-white/[0.02] transition-all"
      >
        <span className="text-sm">{icon}</span>
        <span className="font-mono text-xs text-slate-400 flex-1 text-left">{label}</span>
        {badge && (
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-[#1A1A2E] text-slate-600">{badge}</span>
        )}
        <svg className={`w-3 h-3 text-slate-600 transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && children}
    </div>
  );
}

// ── Model button ───────────────────────────────────────────────────────────────
function ModelBtn({ t, active, cost, onClick }: { t: { id: string; label: string; color: string }; active: boolean; cost: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all text-left"
      style={active ? { background: `${t.color}15`, color: "white" } : { color: "#64748b" }}
    >
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: active ? t.color : "#374151" }} />
      <span className="font-mono text-xs flex-1">{t.label}</span>
      <span className="font-mono text-[9px]" style={{ color: active ? t.color : "#374151" }}>{cost} cr</span>
    </button>
  );
}
