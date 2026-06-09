"use client";
import { useChat } from "../ChatContext";
import { getMemory, clearMemory } from "@/lib/memory";
import WalletBar from "@/components/WalletBar";
import PersonaSelector from "./PersonaSelector";

/**
 * Sidebar settings panel — reduced from the original 6-section layout
 * (Persona, 3× Models, Credits, Memory, Wallet) to a 4-section panel.
 * The three Model sections were dropped because the composer model
 * picker already covers selection 1:1 with the preset list; surfacing
 * the same choices twice in the same UI was the largest source of
 * visual noise.
 *
 * New section order, top → bottom:
 *   PERSONA · CREDITS · MEMORY (conditional) · WALLET
 *
 * Shared design tokens used by every section:
 *   - Header:   `px-5 pt-5 pb-3` + SectionLabel
 *   - Body:     `px-5 pb-5`
 *   - Divider:  `border-t border-[#1A1A2E]` (between sections, not inside)
 *   - Card:     `rounded-2xl bg-[#0A0A12] border border-[#1A1A2E]`
 */

function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="font-mono text-[10px] text-slate-500 tracking-widest">{children}</p>
      {right}
    </div>
  );
}

export default function SettingsPanel() {
  const {
    holderTier,
    walletAddr, onWalletChange, walletRefresh,
    credits, countdown, isUnlimited, daily,
    setBuyOpen,
  } = useChat();

  const memory    = getMemory(walletAddr);
  const hasMemory = !!(memory.currentProject || memory.commandHistory.length > 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#050508]">

      {/* ── Persona ──────────────────────────────────────────────────── */}
      <section className="px-5 pt-5 pb-5 border-b border-[#1A1A2E]">
        <SectionLabel>PERSONA</SectionLabel>
        <PersonaSelector />
        <p className="font-mono text-[10px] text-slate-700 mt-3 leading-relaxed">
          Choose model in the chat composer below — Chat · Fast · Web Search · Deep Think · Private.
        </p>
      </section>

      {/* ── Credits ──────────────────────────────────────────────────── */}
      <section className="px-5 pt-5 pb-5 border-b border-[#1A1A2E]">
        <SectionLabel
          right={
            <span
              className="font-mono text-[10px] px-2 py-0.5 rounded border font-semibold"
              style={{ color: holderTier.color, background: `${holderTier.color}12`, borderColor: `${holderTier.color}30` }}
            >
              {walletAddr ? holderTier.tier : "Guest"}
            </span>
          }
        >
          CREDITS
        </SectionLabel>

        {/* Credit card — two looks depending on the credit source.
            Connected wallet → unified ledger balance (continuous accrual,
            no daily reset, no progress bar).
            Guest → localStorage daily quota with reset timer + progress bar. */}
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
          <p className="font-mono text-[10px] text-slate-700 mb-3 leading-relaxed">
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
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-mono text-[13px] font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
          style={{ background: "#F59E0B12", color: "#F59E0B", border: "1px solid #F59E0B30" }}
        >
          💰 Buy $BLUEAGENT
        </button>
      </section>

      {/* ── Memory (conditional) ───────────────────────────────────── */}
      {hasMemory && (
        <section className="px-5 pt-5 pb-5 border-b border-[#1A1A2E]">
          <SectionLabel
            right={
              <button
                onClick={() => clearMemory(walletAddr)}
                className="font-mono text-[10px] text-slate-700 hover:text-red-400 transition-colors"
              >
                clear
              </button>
            }
          >
            MEMORY
          </SectionLabel>
          <div className="rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] p-3 space-y-2">
            {memory.currentProject && (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] shrink-0" />
                <span className="font-mono text-[10px] text-slate-500 w-16 shrink-0">project</span>
                <span className="font-mono text-[10px] text-[#4FC3F7] truncate">{memory.currentProject.name}</span>
              </div>
            )}
            {memory.commandHistory[0] && (
              <div className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-700 shrink-0" />
                <span className="font-mono text-[10px] text-slate-500 w-16 shrink-0">last cmd</span>
                <span className="font-mono text-[10px] text-slate-400">blue {memory.commandHistory[0].command}</span>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Wallet ───────────────────────────────────────────────────── */}
      <section className="px-5 pt-5 pb-5">
        <SectionLabel>WALLET</SectionLabel>
        <WalletBar onWalletChange={onWalletChange} refreshTrigger={walletRefresh} />
        {holderTier.blueBalance > 0 && (
          <div
            className="mt-3 px-3.5 py-2 rounded-xl font-mono text-[13px] font-semibold"
            style={{ background: `${holderTier.color}12`, color: holderTier.color, border: `1px solid ${holderTier.color}25` }}
          >
            {holderTier.tier} ·{" "}
            {holderTier.blueBalance >= 1_000_000
              ? `${(holderTier.blueBalance / 1_000_000).toFixed(1)}M`
              : `${(holderTier.blueBalance / 1_000).toFixed(0)}K`} BLUE
          </div>
        )}
      </section>
    </div>
  );
}
