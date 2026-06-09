"use client";
import { useChat } from "../ChatContext";
import { creditCost } from "@/lib/credits";
import { getMemory, clearMemory } from "@/lib/memory";
import WalletBar from "@/components/WalletBar";
import PersonaSelector from "./PersonaSelector";

// ── Model definitions ──────────────────────────────────────────────────────────

// 5-model list, in sync with ChatInput's preset picker. The previous 14
// entries were trimmed when we switched to use-case presets — kept only
// the model each preset points at.
//
//   pro                  → Chat
//   max                  → Deep Think
//   venice-deepseek      → Fast
//   venice-grok          → Web Search
//   venice-e2ee-gemma    → Private

const BANKR_TIERS = [
  { id: "pro",  label: "Pro", sub: "Claude Sonnet 4.6", color: "#4FC3F7", note: "200K ctx", badge: ""     },
  { id: "max",  label: "Max", sub: "Claude Opus 4.7",   color: "#A78BFA", note: "200K ctx", badge: "best" },
];

const VENICE_TIERS = [
  { id: "venice-deepseek", label: "V4 Flash", sub: "DeepSeek V4 Flash", color: "#34D399", note: "1M ctx · fast", badge: ""       },
  { id: "venice-grok",     label: "Grok 4",   sub: "xAI Grok 4",        color: "#E879F9", note: "X + web",      badge: "search" },
];

const E2EE_TIERS = [
  { id: "venice-e2ee-gemma", label: "Gemma 27B", sub: "Gemma 3 27B", color: "#FCA5A5", note: "E2EE · no logs", badge: "private" },
];

// ── Sub-components ─────────────────────────────────────────────────────────────

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-1 mb-2">
      <p className="font-mono text-[10px] text-slate-500 tracking-widest">{children}</p>
      {right}
    </div>
  );
}

function ModelRow({ id, label, sub, note, badge, color, active, cr, onClick }: {
  id: string; label: string; sub: string; note: string; badge: string;
  color: string; active: boolean; cr: number;
  onClick: () => void;
}) {
  return (
    <button
      key={id}
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left border"
      style={active
        ? { background: `${color}12`, borderColor: `${color}35`, color: "white" }
        : { borderColor: "transparent", color: "#64748b" }}
    >
      {/* Indicator */}
      <span
        className="w-2 h-2 rounded-full shrink-0 transition-all"
        style={{ background: active ? color : "#1E293B", boxShadow: active ? `0 0 6px ${color}70` : "none" }}
      />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-medium">{label}</span>
          {badge && (
            <span
              className="font-mono text-[8px] px-1.5 py-0.5 rounded border uppercase tracking-wider"
              style={{ color, borderColor: `${color}40`, background: `${color}12` }}
            >
              {badge}
            </span>
          )}
        </div>
        <span className="font-mono text-[10px] opacity-40 truncate">{sub}</span>
      </div>

      {/* Right side */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span className="font-mono text-[10px]" style={{ color: active ? color : "#374151" }}>{cr} cr</span>
        <span className="font-mono text-[9px] text-slate-700">{note}</span>
      </div>
    </button>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────

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
    <div className="flex flex-col h-full overflow-y-auto bg-[#050508]">

      {/* ── Persona ── */}
      <div className="px-5 py-5 border-b border-[#1A1A2E]">
        <SectionLabel>PERSONA</SectionLabel>
        <PersonaSelector />
      </div>

      {/* ── Bankr models ── */}
      <div className="px-5 py-5 border-b border-[#1A1A2E]">
        <SectionLabel
          right={<span className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#4FC3F7]/25 text-[#4FC3F7]">BANKR</span>}
        >
          MODEL · CLAUDE
        </SectionLabel>
        <div className="space-y-1">
          {BANKR_TIERS.map(t => (
            <ModelRow
              key={t.id}
              {...t}
              active={chatTier === t.id}
              cr={creditCost(t.id, holderTier)}
              onClick={() => setChatTier(t.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Venice models ── */}
      <div className="px-5 py-5 border-b border-[#1A1A2E]">
        <SectionLabel
          right={<span className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#34D399]/25 text-[#34D399]">VENICE</span>}
        >
          MODEL · FRONTIER
        </SectionLabel>
        <div className="space-y-1">
          {VENICE_TIERS.map(t => (
            <ModelRow
              key={t.id}
              {...t}
              active={chatTier === t.id}
              cr={creditCost(t.id, holderTier)}
              onClick={() => setChatTier(t.id)}
            />
          ))}
        </div>
      </div>

      {/* ── E2EE Privacy models ── */}
      <div className="px-5 py-5 border-b border-[#1A1A2E]">
        <SectionLabel
          right={<span className="font-mono text-[8px] px-1.5 py-0.5 rounded border border-[#FB7185]/25 text-[#FB7185]">E2EE · PRIVATE</span>}
        >
          MODEL · PRIVACY
        </SectionLabel>
        <p className="font-mono text-[9px] text-slate-700 mb-3 px-1">
          End-to-end encrypted. Venice cannot read your messages or keys.
        </p>
        <div className="space-y-1">
          {E2EE_TIERS.map(t => (
            <ModelRow
              key={t.id}
              {...t}
              active={chatTier === t.id}
              cr={creditCost(t.id, holderTier)}
              onClick={() => setChatTier(t.id)}
            />
          ))}
        </div>
      </div>

      {/* ── Credits ── */}
      <div className="px-5 py-5 border-b border-[#1A1A2E]">
        <div className="flex items-center justify-between px-1 mb-4">
          <p className="font-mono text-[10px] text-slate-500 tracking-widest">CREDITS</p>
          <span
            className="font-mono text-[10px] px-2 py-0.5 rounded border font-semibold"
            style={{ color: holderTier.color, background: `${holderTier.color}12`, borderColor: `${holderTier.color}30` }}
          >
            {walletAddr ? holderTier.tier : "Guest"}
          </span>
        </div>

        {/* Credit card — two looks depending on the credit source:
              - Connected wallet → `credits` is the on-chain ledger balance
                (accrued + topup − spent). No daily reset, no progress bar;
                instead we show "+N/day" accrual hint.
              - Guest → `credits` is the localStorage daily quota; legacy
                progress bar + reset timer. */}
        <div className="rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] p-4 mb-4">
          {walletAddr ? (
            <>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <span
                    className="font-mono text-4xl font-bold tabular-nums leading-none"
                    style={{ color: credits <= 20 ? "#EF4444" : "#4FC3F7" }}
                  >
                    {credits.toLocaleString()}
                  </span>
                  <span className="font-mono text-sm text-slate-600 ml-2">spendable</span>
                </div>
                <span className="font-mono text-[10px] text-slate-600 mb-1">
                  {daily > 0 ? `+${daily.toLocaleString()}/day` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-600">
                  Accrued on-chain · cleared via chat use
                </span>
                {holderTier.discount > 0 && (
                  <span className="font-mono text-[10px]" style={{ color: holderTier.color }}>
                    {Math.round(holderTier.discount * 100)}% off
                  </span>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-end justify-between mb-3">
                <div>
                  <span
                    className="font-mono text-4xl font-bold tabular-nums leading-none"
                    style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#4FC3F7" }}
                  >
                    {isUnlimited ? "∞" : credits.toLocaleString()}
                  </span>
                  {!isUnlimited && (
                    <span className="font-mono text-sm text-slate-600 ml-2">/ {daily.toLocaleString()}</span>
                  )}
                </div>
                <span className="font-mono text-[10px] text-slate-600 mb-1">per day</span>
              </div>

              {!isUnlimited && daily > 0 && (
                <div className="h-1 bg-[#1A1A2E] rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${Math.min(100, (credits / daily) * 100)}%`, background: holderTier.color }}
                  />
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-600">resets in {countdown}</span>
                {holderTier.discount > 0 && (
                  <span className="font-mono text-[10px]" style={{ color: holderTier.color }}>
                    {Math.round(holderTier.discount * 100)}% off
                  </span>
                )}
              </div>
            </>
          )}
        </div>

        {/* Next tier hint */}
        {holderTier.nextTier && walletAddr && (
          <p className="font-mono text-[10px] text-slate-700 px-1 mb-3">
            Hold{" "}
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
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-mono text-sm font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "#F59E0B12", color: "#F59E0B", border: "1px solid #F59E0B30" }}
        >
          💰 Buy $BLUEAGENT
        </button>
        <p className="font-mono text-[9px] text-slate-700 text-center mt-1.5">Hold BLUE → more credits/day</p>
      </div>

      {/* ── Memory ── */}
      {hasMemory && (
        <div className="px-5 py-4 border-b border-[#1A1A2E]">
          <div className="flex items-center justify-between px-1 mb-3">
            <p className="font-mono text-[10px] text-slate-500 tracking-widest">MEMORY</p>
            <button
              onClick={() => clearMemory(walletAddr)}
              className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors"
            >
              clear
            </button>
          </div>
          <div className="rounded-xl bg-[#0A0A12] border border-[#1A1A2E] px-3 py-3 space-y-2">
            {memory.currentProject && (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] shrink-0" />
                <span className="font-mono text-[10px] text-slate-500">project</span>
                <span className="font-mono text-[10px] text-[#4FC3F7] truncate">{memory.currentProject.name}</span>
              </div>
            )}
            {memory.commandHistory[0] && (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                <span className="font-mono text-[10px] text-slate-500">last cmd</span>
                <span className="font-mono text-[10px] text-slate-400">blue {memory.commandHistory[0].command}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Wallet ── */}
      <div className="px-5 py-5">
        <SectionLabel>WALLET</SectionLabel>
        <WalletBar onWalletChange={onWalletChange} refreshTrigger={walletRefresh} />
        {holderTier.blueBalance > 0 && (
          <div
            className="mt-3 px-4 py-2.5 rounded-xl font-mono text-sm font-semibold"
            style={{ background: `${holderTier.color}12`, color: holderTier.color, border: `1px solid ${holderTier.color}25` }}
          >
            {holderTier.tier} ·{" "}
            {holderTier.blueBalance >= 1_000_000
              ? `${(holderTier.blueBalance / 1_000_000).toFixed(1)}M`
              : `${(holderTier.blueBalance / 1_000).toFixed(0)}K`} BLUE
          </div>
        )}
      </div>
    </div>
  );
}
