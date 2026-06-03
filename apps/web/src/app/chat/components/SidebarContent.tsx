"use client";
import { useChat } from "../ChatContext";
import { creditCost } from "@/lib/credits";
import { getMemory, clearMemory } from "@/lib/memory";
import WalletBar from "@/components/WalletBar";
import TaskList from "./TaskList";
import SkillsTab from "./SkillsTab";
import CronPanel from "./CronPanel";
import PersonaSelector from "./PersonaSelector";

const BANKR_TIERS = [
  { id: "fast", label: "Fast",   model: "Haiku",  color: "#64748b" },
  { id: "pro",  label: "Pro",    model: "Sonnet", color: "#4FC3F7" },
  { id: "max",  label: "Max",    model: "Opus",   color: "#A78BFA" },
];
const VENICE_TIERS = [
  { id: "venice-deepseek", label: "V4 Flash",   model: "DeepSeek", color: "#34D399", note: "1M ctx" },
  { id: "venice-grok",     label: "Grok 4",     model: "xAI",      color: "#E879F9", note: "X search" },
  { id: "venice-uncut",    label: "Uncensored", model: "Venice",   color: "#FB923C", note: "No filter" },
  { id: "venice-mistral",  label: "Mistral",    model: "Mistral",  color: "#60A5FA", note: "256K ctx" },
];

const SIDEBAR_TABS = [
  { id: "tasks",  label: "Tasks",  icon: "💬" },
  { id: "skills", label: "Skills", icon: "⚡" },
  { id: "cron",   label: "Cron",   icon: "⏱" },
] as const;

export default function SidebarContent() {
  const {
    chatTier, setChatTier, holderTier,
    sidebarTab, setSidebarTab,
    walletAddr, onWalletChange,
    credits, countdown, isUnlimited, daily,
    buyOpen: _, setBuyOpen,
    artifacts, setArtifactsPanelOpen, artifactsPanelOpen,
  } = useChat();

  const memory   = getMemory(walletAddr);
  const hasMemory = !!(memory.currentProject || memory.commandHistory.length > 0);

  return (
    <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-[#1A1A2E] h-full overflow-hidden">

      {/* ── Top header ── */}
      <div className="px-5 pt-5 pb-4 border-b border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center justify-between">
          <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUE CHAT</p>
          {artifacts.length > 0 && (
            <button
              onClick={() => setArtifactsPanelOpen(!artifactsPanelOpen)}
              className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded border transition-all"
              style={artifactsPanelOpen
                ? { color: "#4FC3F7", borderColor: "#4FC3F7/40", background: "#4FC3F710" }
                : { color: "#475569", borderColor: "#1A1A2E" }}
            >
              <span>◈</span>
              <span>{artifacts.length} artifact{artifacts.length !== 1 ? "s" : ""}</span>
            </button>
          )}
        </div>
      </div>

      {/* ── Tab bar ── */}
      <div className="flex border-b border-[#1A1A2E] flex-shrink-0">
        {SIDEBAR_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setSidebarTab(tab.id)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 font-mono text-[10px] transition-all border-b-2"
            style={sidebarTab === tab.id
              ? { color: "#4FC3F7", borderBottomColor: "#4FC3F7" }
              : { color: "#475569", borderBottomColor: "transparent" }}
          >
            <span>{tab.icon}</span>
            <span className="tracking-wider">{tab.label.toUpperCase()}</span>
          </button>
        ))}
      </div>

      {/* ── Tab content ── */}
      <div className="flex-1 overflow-y-auto py-3 min-h-0">
        {sidebarTab === "tasks"  && <TaskList />}
        {sidebarTab === "skills" && <SkillsTab />}
        {sidebarTab === "cron"   && <CronPanel />}
      </div>

      {/* ── Persona ── */}
      <div className="px-2 py-3 border-t border-[#1A1A2E] flex-shrink-0">
        <PersonaSelector />
      </div>

      {/* ── Model picker ── */}
      <div className="px-3 py-4 border-t border-[#1A1A2E] flex-shrink-0">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest px-2 mb-2">MODEL · BANKR</p>
        <div className="flex flex-col gap-0.5 mb-3">
          {BANKR_TIERS.map((t) => {
            const c = creditCost(t.id, holderTier);
            const isActive = chatTier === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setChatTier(t.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left border-l-2 ${
                  isActive ? "bg-[#4FC3F7]/5 text-white border-[#4FC3F7]" : "text-slate-500 hover:text-white hover:bg-[#0D0D1A] border-transparent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? t.color : "#374151" }} />
                  <span className="font-mono text-sm">{t.label}</span>
                  <span className="font-mono text-[10px] text-slate-600">{t.model}</span>
                </div>
                <span className="font-mono text-[10px]" style={{ color: isActive ? t.color : "#374151" }}>{c} cr</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 px-2 mb-2">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest">MODEL · VENICE</p>
          <span className="font-mono text-[8px] text-[#34D399] border border-[#34D399]/30 px-1 py-0.5 rounded">PRIVACY</span>
        </div>
        <div className="flex flex-col gap-0.5">
          {VENICE_TIERS.map((t) => {
            const c = creditCost(t.id, holderTier);
            const isActive = chatTier === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setChatTier(t.id)}
                className={`flex items-center justify-between px-3 py-2 rounded-lg transition-all text-left border-l-2 ${
                  isActive ? "text-white" : "text-slate-500 hover:text-white hover:bg-[#0D0D1A] border-transparent"
                }`}
                style={isActive ? { background: `${t.color}08`, borderLeftColor: t.color } : {}}
              >
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: isActive ? t.color : "#374151" }} />
                  <span className="font-mono text-sm">{t.label}</span>
                  {t.note && <span className="font-mono text-[9px] text-slate-700">{t.note}</span>}
                </div>
                <span className="font-mono text-[10px]" style={{ color: isActive ? t.color : "#374151" }}>{c} cr</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Credits ── */}
      <div className="px-3 py-4 border-t border-[#1A1A2E] flex-shrink-0">
        <div className="flex items-center justify-between px-2 mb-2">
          <p className="font-mono text-[10px] text-slate-600 tracking-widest">CREDITS</p>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
            style={{ color: holderTier.color, background: `${holderTier.color}15`, border: `1px solid ${holderTier.color}25` }}>
            {walletAddr ? holderTier.tier : "Guest"}
          </span>
        </div>

        <div className="mx-1 px-3 py-2.5 rounded-lg bg-[#050508] border border-[#1A1A2E]">
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-mono text-xl font-bold"
              style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#4FC3F7" }}>
              {isUnlimited ? "∞" : credits.toLocaleString()}
            </span>
            {!isUnlimited && (
              <span className="font-mono text-[10px] text-slate-600">/ {daily.toLocaleString()} /day</span>
            )}
          </div>
          {!isUnlimited && daily > 0 && (
            <div className="h-0.5 bg-[#1A1A2E] rounded-full overflow-hidden mb-1.5">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (credits / daily) * 100)}%`, background: holderTier.color }} />
            </div>
          )}
          <div className="font-mono text-[9px] text-slate-600">resets in {countdown}</div>
          {holderTier.discount > 0 && (
            <div className="font-mono text-[9px] mt-1" style={{ color: holderTier.color }}>
              {Math.round(holderTier.discount * 100)}% off all models
            </div>
          )}
        </div>

        {holderTier.nextTier && walletAddr && (
          <p className="font-mono text-[9px] text-slate-700 px-2 mt-1.5">
            {holderTier.nextTier.need >= 1_000_000
              ? `${(holderTier.nextTier.need / 1_000_000).toFixed(1)}M`
              : holderTier.nextTier.need >= 1_000
              ? `${(holderTier.nextTier.need / 1_000).toFixed(0)}K`
              : holderTier.nextTier.need.toLocaleString()} more BLUE →{" "}
            <span style={{ color: holderTier.color }}>
              {holderTier.nextTier.dailyCr === -1 ? "∞" : holderTier.nextTier.dailyCr.toLocaleString()} cr/day
            </span>
          </p>
        )}

        <div className="mx-1 mt-2.5">
          <button
            onClick={() => setBuyOpen(true)}
            className="flex items-center justify-center gap-1.5 w-full py-2 rounded-lg font-mono text-[11px] font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B30" }}
          >
            <span>💰</span>
            Buy $BLUEAGENT
          </button>
          <p className="font-mono text-[9px] text-slate-700 text-center mt-1">Hold BLUE → more credits/day</p>
        </div>
      </div>

      {/* ── Memory ── */}
      {hasMemory && (
        <div className="px-3 py-3 border-t border-[#1A1A2E] flex-shrink-0">
          <div className="flex items-center justify-between px-2 mb-2">
            <p className="font-mono text-[10px] text-slate-600 tracking-widest">MEMORY</p>
            <button
              onClick={() => clearMemory(walletAddr)}
              className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors"
            >
              clear
            </button>
          </div>
          <div className="mx-1 px-3 py-2 rounded-lg bg-[#050508] border border-[#1A1A2E] space-y-1">
            {memory.currentProject && (
              <div>
                <span className="font-mono text-[10px] text-slate-600">project · </span>
                <span className="font-mono text-[10px] text-[#4FC3F7]">{memory.currentProject.name}</span>
                {memory.currentProject.stage && (
                  <span className="font-mono text-[10px] text-slate-600"> · {memory.currentProject.stage}</span>
                )}
              </div>
            )}
            {memory.commandHistory.length > 0 && (
              <div>
                <span className="font-mono text-[10px] text-slate-600">last · </span>
                <span className="font-mono text-[10px] text-slate-400">blue {memory.commandHistory[0].command}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Wallet ── */}
      <div className="px-3 py-4 border-t border-[#1A1A2E] flex-shrink-0 mt-auto">
        <p className="font-mono text-[10px] text-slate-600 tracking-widest px-2 mb-2">WALLET</p>
        <WalletBar onWalletChange={onWalletChange} />
        {holderTier.blueBalance > 0 && (
          <div
            className="mt-2 mx-1 px-3 py-1.5 rounded-lg font-mono text-xs"
            style={{ background: `${holderTier.color}15`, color: holderTier.color, border: `1px solid ${holderTier.color}25` }}
          >
            {holderTier.tier} · {holderTier.blueBalance.toFixed(0)} BLUE
          </div>
        )}
      </div>
    </aside>
  );
}
