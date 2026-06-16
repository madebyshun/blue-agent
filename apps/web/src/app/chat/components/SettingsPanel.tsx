"use client";
import { useState } from "react";
import Link from "next/link";
import { useChat } from "../ChatContext";
import { getMemory, clearMemory } from "@/lib/memory";
import WalletBar from "@/components/WalletBar";
import PersonaSelector from "./PersonaSelector";

// The settings categories — Claude-style two-pane modal. The modal owns the
// left nav + active section; this panel renders the matching content.
export type SettingsSection = "account" | "credits" | "persona" | "memory" | "about";

// $BLUEAGENT — Base, Uniswap v4 (CLAUDE.md). Shown in About with copy.
const BLUE_CONTRACT = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";
const LINKS: { label: string; sub: string; href: string }[] = [
  { label: "X / Twitter", sub: "@blueagent_",              href: "https://x.com/blueagent_" },
  { label: "Telegram",    sub: "t.me/blueagent_hub",       href: "https://t.me/blueagent_hub" },
  { label: "Bankr",       sub: "bankr.bot/agents/blue-agent", href: "https://bankr.bot/agents/blue-agent" },
];

// Tier ladder — mirrors lib/credits.ts TIERS + GUEST_DAILY. Shown in the
// "How credits & tiers work" explainer so users understand why to connect and
// the hold-OR-stake model (both count toward your tier).
const TIER_ROWS: { need: string; tier: string; perk: string; color: string }[] = [
  { need: "No wallet", tier: "Guest",   perk: "100 cr/day",   color: "#64748b" },
  { need: "500K BLUE", tier: "Starter", perk: "500 cr/day",   color: "#4FC3F7" },
  { need: "2M BLUE",   tier: "Pro",     perk: "2,000 cr/day", color: "#A78BFA" },
  { need: "10M BLUE",  tier: "Max",     perk: "∞ + 40% off",  color: "#F59E0B" },
];

// Section content header — mirrors Claude's right-pane title + subtitle.
function PaneHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 mb-5">
      <div>
        <h3 className="font-mono text-sm text-white font-semibold tracking-wide">{title}</h3>
        {subtitle && <p className="font-mono text-[10px] text-slate-600 mt-1 leading-relaxed">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export default function SettingsPanel({ section }: { section: SettingsSection }) {
  const {
    holderTier,
    walletAddr, onWalletChange, walletRefresh,
    credits, countdown, isUnlimited, daily,
    setBuyOpen,
  } = useChat();

  const [showHelp, setShowHelp] = useState(false);
  const [copied, setCopied]     = useState(false);

  const memory    = getMemory(walletAddr);
  const hasMemory = !!(memory.currentProject || memory.commandHistory.length > 0);

  function copyContract() {
    navigator.clipboard?.writeText(BLUE_CONTRACT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }

  return (
    <div className="px-5 sm:px-7 py-6">

      {/* ── Account ─────────────────────────────────────────────────────── */}
      {section === "account" && (
        <>
          <PaneHeader
            title="Account"
            subtitle="Your Base wallet sets your tier, credits and discounts."
          />
          <WalletBar onWalletChange={onWalletChange} refreshTrigger={walletRefresh} />
          {holderTier.blueBalance > 0 && (
            <div
              className="mt-4 px-3.5 py-2.5 rounded-xl font-mono text-[13px] font-semibold flex items-center justify-between"
              style={{ background: `${holderTier.color}12`, color: holderTier.color, border: `1px solid ${holderTier.color}25` }}
            >
              <span>{holderTier.tier} tier</span>
              <span>
                {holderTier.blueBalance >= 1_000_000
                  ? `${(holderTier.blueBalance / 1_000_000).toFixed(1)}M`
                  : `${(holderTier.blueBalance / 1_000).toFixed(0)}K`} BLUE
              </span>
            </div>
          )}

          {/* Network + explorer — only meaningful once connected. */}
          {walletAddr && (
            <div className="mt-4 rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] divide-y divide-[#13131f]">
              <div className="flex items-center justify-between px-3.5 py-2.5">
                <span className="font-mono text-[11px] text-slate-500">Network</span>
                <span className="font-mono text-[11px] text-slate-300 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7]" />Base · 8453
                </span>
              </div>
              <a
                href={`https://basescan.org/address/${walletAddr}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#ffffff05] transition-colors"
              >
                <span className="font-mono text-[11px] text-slate-500">Explorer</span>
                <span className="font-mono text-[11px] text-[#4FC3F7]">View on Basescan ↗</span>
              </a>
            </div>
          )}
        </>
      )}

      {/* ── Credits ─────────────────────────────────────────────────────── */}
      {section === "credits" && (
        <>
          <PaneHeader
            title="Credits"
            subtitle="Every message spends credits. Hold or stake $BLUEAGENT to level up."
            right={
              <span
                className="font-mono text-[10px] px-2 py-0.5 rounded border font-semibold shrink-0"
                style={{ color: holderTier.color, background: `${holderTier.color}12`, borderColor: `${holderTier.color}30` }}
              >
                {walletAddr ? holderTier.tier : "Guest"}
              </span>
            }
          />

          {/* Credit card — wallet → ledger balance; guest → daily quota. */}
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
                    {isUnlimited ? "Max tier · no metering, every model free" : "Daily tier allowance + staked accrual"}
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

          {/* Next-tier hint — "Hold or stake" because tier = effective balance
              (wallet balanceOf + staked); both paths count. */}
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

          {/* How credits & tiers work — inline explainer */}
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
                With no wallet you get <span className="text-[#4FC3F7]">100 free credits/day</span> (~10 messages). Hold $BLUEAGENT to step up a tier and unlock tools.
                Your tier — and how many credits you get — is set by your <span className="text-slate-300">$BLUEAGENT</span>,
                and <span className="text-slate-300">holding or staking both count</span>.
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
                Stake $BLUEAGENT on the dashboard →
              </Link>
            </div>
          )}
        </>
      )}

      {/* ── Persona ─────────────────────────────────────────────────────── */}
      {section === "persona" && (
        <>
          <PaneHeader
            title="Persona"
            subtitle="The expert role the agent takes on — it swaps the system prompt, not the model. Pick the model (Chat · Fast · Web Search · Deep Think · Private) in the chat composer."
          />
          <PersonaSelector />
        </>
      )}

      {/* ── Memory ──────────────────────────────────────────────────────── */}
      {section === "memory" && (
        <>
          <PaneHeader
            title="Memory"
            subtitle="What the agent remembers across chats — your current project and recent commands."
            right={
              hasMemory ? (
                <button
                  onClick={() => clearMemory(walletAddr)}
                  className="font-mono text-[10px] text-slate-600 hover:text-red-400 transition-colors shrink-0"
                >
                  clear
                </button>
              ) : undefined
            }
          />
          {hasMemory ? (
            <div className="rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] p-4 space-y-2.5">
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
          ) : (
            <div className="rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] p-6 text-center">
              <p className="font-mono text-[11px] text-slate-600">Nothing remembered yet</p>
              <p className="font-mono text-[10px] text-slate-700 mt-1">Start a project or run a command and it’ll show here.</p>
            </div>
          )}
        </>
      )}

      {/* ── About ───────────────────────────────────────────────────────── */}
      {section === "about" && (
        <>
          <PaneHeader
            title="About"
            subtitle="Blue Agent — the AI agent layer on Base."
          />

          {/* $BLUEAGENT token */}
          <div className="rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] p-4 mb-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="font-mono text-[11px] text-slate-300 font-semibold">$BLUEAGENT</span>
              <button
                onClick={copyContract}
                className="font-mono text-[10px] text-slate-600 hover:text-[#4FC3F7] transition-colors"
              >
                {copied ? "copied ✓" : "copy"}
              </button>
            </div>
            <p className="font-mono text-[10px] text-slate-500 break-all leading-relaxed">{BLUE_CONTRACT}</p>
            <p className="font-mono text-[10px] text-slate-700 mt-1">Base · Uniswap v4</p>
          </div>

          {/* Links */}
          <div className="rounded-2xl bg-[#0A0A12] border border-[#1A1A2E] divide-y divide-[#13131f]">
            {LINKS.map(l => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3.5 py-2.5 hover:bg-[#ffffff05] transition-colors"
              >
                <span className="font-mono text-[11px] text-slate-300">{l.label}</span>
                <span className="font-mono text-[10px] text-slate-600">{l.sub} ↗</span>
              </a>
            ))}
          </div>

          <p className="font-mono text-[9px] text-slate-700 mt-4 text-center">Blue Chat · built on Base (8453)</p>
        </>
      )}
    </div>
  );
}
