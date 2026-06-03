"use client";
import { useChat } from "../ChatContext";
import { creditCost } from "@/lib/credits";
import { getMemory, clearMemory } from "@/lib/memory";
import WalletBar from "@/components/WalletBar";
import PersonaSelector from "./PersonaSelector";

const BANKR_TIERS = [
  { id: "fast", label: "Fast",   model: "Haiku",  color: "#64748b", note: "1K ctx" },
  { id: "pro",  label: "Pro",    model: "Sonnet", color: "#4FC3F7", note: "200K ctx" },
  { id: "max",  label: "Max",    model: "Opus",   color: "#A78BFA", note: "200K ctx" },
];
const VENICE_TIERS = [
  { id: "venice-deepseek", label: "V4 Flash",   model: "DeepSeek", color: "#34D399", note: "1M ctx" },
  { id: "venice-grok",     label: "Grok 4",     model: "xAI",      color: "#E879F9", note: "X search" },
  { id: "venice-uncut",    label: "Uncensored", model: "Venice",   color: "#FB923C", note: "No filter" },
  { id: "venice-mistral",  label: "Mistral",    model: "Mistral",  color: "#60A5FA", note: "256K ctx" },
];

export default function SettingsPanel() {
  const {
    chatTier, setChatTier, holderTier,
    walletAddr, onWalletChange, walletRefresh,
    credits, countdown, isUnlimited, daily,
    setBuyOpen,
  } = useChat();

  const memory    = getMemory(walletAddr);
  const hasMemory = !!(memory.currentProject || memory.commandHistory.length > 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E] flex-shrink-0">
        <h2 className="font-mono text-xs font-bold text-white tracking-widest">SETTINGS</h2>
        <p className="font-mono text-[9px] text-slate-600 mt-0.5">Models · Credits · Wallet</p>
      </div>

      {/* Persona */}
      <div className="px-4 py-4 border-b border-[#1A1A2E]">
        <p className="font-mono text-[9px] text-slate-500 tracking-widest mb-2">PERSONA</p>
        <PersonaSelector />
      </div>

      {/* Bankr models */}
      <div className="px-4 py-4 border-b border-[#1A1A2E]">
        <div className="flex items-center gap-2 mb-3">
          <p className="font-mono text-[9px] text-slate-500 tracking-widest">MODEL · BANKR</p>
          <span className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#4FC3F7]/20 text-[#4FC3F7]">CLAUDE</span>
        </div>
        <div className="space-y-1">
          {BANKR_TIERS.map(t => {
            const cr = creditCost(t.id, holderTier);
            const isActive = chatTier === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setChatTier(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border"
                style={isActive
                  ? { background: `${t.color}10`, borderColor: `${t.color}30`, color: "white" }
                  : { borderColor: "transparent", color: "#64748b" }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isActive ? t.color : "#374151" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{t.label}</span>
                    <span className="font-mono text-[9px] opacity-50">{t.model}</span>
                  </div>
                  <span className="font-mono text-[9px] opacity-40">{t.note}</span>
                </div>
                <span className="font-mono text-[10px] flex-shrink-0" style={{ color: isActive ? t.color : "#374151" }}>
                  {cr} cr
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Venice models */}
      <div className="px-4 py-4 border-b border-[#1A1A2E]">
        <div className="flex items-center gap-2 mb-3">
          <p className="font-mono text-[9px] text-slate-500 tracking-widest">MODEL · VENICE</p>
          <span className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#34D399]/20 text-[#34D399]">PRIVACY</span>
        </div>
        <div className="space-y-1">
          {VENICE_TIERS.map(t => {
            const cr = creditCost(t.id, holderTier);
            const isActive = chatTier === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setChatTier(t.id)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border"
                style={isActive
                  ? { background: `${t.color}10`, borderColor: `${t.color}30`, color: "white" }
                  : { borderColor: "transparent", color: "#64748b" }}
              >
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: isActive ? t.color : "#374151" }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm">{t.label}</span>
                    <span className="font-mono text-[9px] opacity-50">{t.model}</span>
                  </div>
                  <span className="font-mono text-[9px] opacity-40">{t.note}</span>
                </div>
                <span className="font-mono text-[10px] flex-shrink-0" style={{ color: isActive ? t.color : "#374151" }}>
                  {cr} cr
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Credits */}
      <div className="px-4 py-4 border-b border-[#1A1A2E]">
        <div className="flex items-center justify-between mb-3">
          <p className="font-mono text-[9px] text-slate-500 tracking-widest">CREDITS</p>
          <span className="font-mono text-[9px] px-2 py-0.5 rounded"
            style={{ color: holderTier.color, background: `${holderTier.color}15`, border: `1px solid ${holderTier.color}25` }}>
            {walletAddr ? holderTier.tier : "Guest"}
          </span>
        </div>

        <div className="rounded-xl bg-[#0D0D14] border border-[#1A1A2E] p-4 mb-3">
          <div className="flex items-baseline justify-between mb-2">
            <span className="font-mono text-3xl font-bold"
              style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#4FC3F7" }}>
              {isUnlimited ? "∞" : credits.toLocaleString()}
            </span>
            {!isUnlimited && (
              <span className="font-mono text-[10px] text-slate-600">/ {daily.toLocaleString()} /day</span>
            )}
          </div>
          {!isUnlimited && daily > 0 && (
            <div className="h-1 bg-[#1A1A2E] rounded-full overflow-hidden mb-2">
              <div className="h-full rounded-full transition-all"
                style={{ width: `${Math.min(100, (credits / daily) * 100)}%`, background: holderTier.color }} />
            </div>
          )}
          <p className="font-mono text-[9px] text-slate-600">resets in {countdown}</p>
          {holderTier.discount > 0 && (
            <p className="font-mono text-[9px] mt-1.5" style={{ color: holderTier.color }}>
              {Math.round(holderTier.discount * 100)}% off all models
            </p>
          )}
        </div>

        {holderTier.nextTier && walletAddr && (
          <p className="font-mono text-[9px] text-slate-700 mb-3">
            Need{" "}
            <span className="text-slate-500">
              {holderTier.nextTier.need >= 1_000_000
                ? `${(holderTier.nextTier.need / 1_000_000).toFixed(1)}M`
                : `${(holderTier.nextTier.need / 1_000).toFixed(0)}K`} BLUE
            </span>
            {" "}→{" "}
            <span style={{ color: holderTier.color }}>
              {holderTier.nextTier.dailyCr === -1 ? "∞" : holderTier.nextTier.dailyCr.toLocaleString()} cr/day
            </span>
          </p>
        )}

        <button
          onClick={() => setBuyOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-sm font-semibold transition-all hover:opacity-90 active:scale-95"
          style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B30" }}
        >
          💰 Buy $BLUEAGENT
        </button>
        <p className="font-mono text-[9px] text-slate-700 text-center mt-1.5">Hold BLUE → more credits/day</p>
      </div>

      {/* Memory */}
      {hasMemory && (
        <div className="px-4 py-4 border-b border-[#1A1A2E]">
          <div className="flex items-center justify-between mb-2">
            <p className="font-mono text-[9px] text-slate-500 tracking-widest">MEMORY</p>
            <button
              onClick={() => clearMemory(walletAddr)}
              className="font-mono text-[9px] text-slate-700 hover:text-red-400 transition-colors"
            >
              clear
            </button>
          </div>
          <div className="rounded-xl bg-[#0D0D14] border border-[#1A1A2E] px-3 py-2.5 space-y-1.5">
            {memory.currentProject && (
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-[#4FC3F7]" />
                <span className="font-mono text-[9px] text-slate-600">project</span>
                <span className="font-mono text-[9px] text-[#4FC3F7]">{memory.currentProject.name}</span>
              </div>
            )}
            {memory.commandHistory[0] && (
              <div className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                <span className="font-mono text-[9px] text-slate-600">last</span>
                <span className="font-mono text-[9px] text-slate-400">/{memory.commandHistory[0].command}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Wallet */}
      <div className="px-4 py-4">
        <p className="font-mono text-[9px] text-slate-500 tracking-widest mb-3">WALLET</p>
        <WalletBar onWalletChange={onWalletChange} refreshTrigger={walletRefresh} />
        {holderTier.blueBalance > 0 && (
          <div className="mt-2 px-3 py-2 rounded-xl font-mono text-xs"
            style={{ background: `${holderTier.color}10`, color: holderTier.color, border: `1px solid ${holderTier.color}20` }}>
            {holderTier.tier} · {holderTier.blueBalance >= 1_000_000
              ? `${(holderTier.blueBalance / 1_000_000).toFixed(1)}M`
              : `${(holderTier.blueBalance / 1_000).toFixed(0)}K`} BLUE
          </div>
        )}
      </div>
    </div>
  );
}
