"use client";
import { useState } from "react";
import Link from "next/link";
import { useChat } from "../ChatContext";
import { getMemory, clearMemory } from "@/lib/memory";
import WalletBar from "@/components/WalletBar";
import PersonaSelector from "./PersonaSelector";

// Tier ladder — mirrors lib/credits.ts TIERS + GUEST_DAILY. Shown in the
// "How credits & tiers work" explainer so users understand why to connect and
// the hold-OR-stake model (both count toward your tier).
const TIER_ROWS: { need: string; tier: string; perk: string; color: string }[] = [
  { need: "No wallet", tier: "Guest",   perk: "100 cr/day",        color: "#64748b" },
  { need: "500K BLUE", tier: "Starter", perk: "500 cr/day",        color: "#4FC3F7" },
  { need: "2M BLUE",   tier: "Pro",     perk: "2,000 cr/day",      color: "#A78BFA" },
  { need: "10M BLUE",  tier: "Max",     perk: "∞ + 40% off",       color: "#F59E0B" },
];

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

  const [showHelp, setShowHelp] = useState(false);

  const memory    = getMemory(walletAddr);
  const hasMemory = !!(memory.currentProject || memory.commandHistory.length > 0);

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-[#050508]">

      {/* ── Persona ──────────────────────────────────────────────────── */}
      <section className="px-5 pt-5 pb-5 border-b border-[#1A1A2E]">
        <SectionLabel>PERSONA</SectionLabel>
        <p className="font-mono text-[10px] text-slate-600 mb-3 leading-relaxed">
          The expert role the agent takes on — it swaps the system prompt, not the
          model. Pick the <span className="text-slate-400">model</span> (Chat · Fast ·
          Web Search · Deep Think · Private) separately in the chat composer below.
        </p>
        <PersonaSelector />
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
                    style={{ color: isUnlimited ? holderTier.color : credits <= 20 ? "#EF4444" : "#4FC3F7" }}
                  >
                    {isUnlimited ? "∞" : credits.toLocaleString()}
                  </span>
                  <span className="font-mono text-sm text-slate-600 ml-2">spendable</span>
                </div>
                <span className="font-mono text-[10px] text-slate-600 mb-1">
                  {isUnlimited ? `${holderTier.tier} · unlimited` : daily > 0 ? `+${daily.toLocaleString()}/day` : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-slate-600">
                  {isUnlimited ? "Max tier · no metering, every model free" : "Accrued on-chain · cleared via chat use"}
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

        {/* Next-tier hint — answers "what do I do to earn more credits/day?".
            Says "Hold or stake" because tier is keyed off EFFECTIVE balance =
            wallet balanceOf + staked amount (lib/credits.ts fetchBlueBalance);
            both paths count. */}
        {holderTier.nextTier && walletAddr && (
          <p className="font-mono text-[10px] text-slate-700 mb-3 leading-relaxed">
            Hold or stake{" "}
            <span className="text-slate-500">
              {holderTier.nextTier.need >= 1_000_000
                ? `${(holderTier.nextTier.need / 1_000_000).toFixed(1)}M`
                : `${(holderTier.nextTier.need / 1_000).toFixed(0)}K`} BLUE
            </span>
            {" "}→ earn{" "}
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

        {/* ── How credits & tiers work — inline explainer ──
            Closes the gap the chat had no answer for: what credits are, why
            connect, and the hold-OR-stake tier model. Collapsed by default. */}
        <button
          onClick={() => setShowHelp(v => !v)}
          className="mt-3 w-full flex items-center justify-between font-mono text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
        >
          <span>How credits &amp; tiers work</span>
          <span>{showHelp ? "▴" : "▾"}</span>
        </button>

        {showHelp && (
          <div className="mt-2 rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] p-4 space-y-3">
            <p className="font-mono text-[10px] text-slate-500 leading-relaxed">
              Every message spends <span className="text-slate-300">credits</span>. With no wallet you
              get <span className="text-[#4FC3F7]">100 free/day</span> (~10 messages). Your tier — and how
              many credits you get — is set by your <span className="text-slate-300">$BLUE</span>, and{" "}
              <span className="text-slate-300">holding or staking both count</span>.
            </p>

            <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
              {TIER_ROWS.map((r, i) => (
                <div
                  key={r.tier}
                  className={`flex items-center justify-between px-3 py-2 ${i > 0 ? "border-t border-[#13131f]" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: r.color }} />
                    <span className="font-mono text-[11px] font-semibold shrink-0" style={{ color: r.color }}>{r.tier}</span>
                    <span className="font-mono text-[10px] text-slate-600 truncate">{r.need}</span>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400 shrink-0">{r.perk}</span>
                </div>
              ))}
            </div>

            <p className="font-mono text-[10px] text-slate-600 leading-relaxed">
              <span className="text-slate-400">Staking</span> is the better path: it counts toward your tier
              AND accrues extra credits + a share of x402 revenue (USDC) over time. Holding only sets your tier.
            </p>

            <Link
              href="/app/dashboard?tab=stake"
              className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#A78BFA] hover:opacity-80 transition-opacity"
            >
              Stake $BLUE on the dashboard →
            </Link>
          </div>
        )}
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
