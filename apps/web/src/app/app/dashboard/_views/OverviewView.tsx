"use client";

/**
 * OverviewView — the Dashboard "Overview" screen, restyled to the app design
 * handoff (2026-09): a `// OVERVIEW` header bar + a 4-column bento of flat cards
 * (identity · balances · quick actions · chat activity · agent status).
 *
 * This is a RESTYLE, not a rewrite: every number on the page still comes from a
 * real source and the honesty guards that shipped before survive verbatim —
 *   • CREDITS is ONE ledger figure, never the three-number breakdown /app/usage
 *     owns (the old cell printed BALANCE/TOP-UP/SPENT off the same endpoint and
 *     the subtraction didn't hold — it omitted the day's free allowance).
 *   • The builder score keeps its scoreColor tier bands; it is not recoloured.
 *   • The balances card deliberately OMITS the handoff's 4-segment weight bar —
 *     we have no per-token USD price, so any weight would be fabricated.
 *   • Quick actions carry no invented metas (the handoff's "⌘N / 111 / $28.9k"
 *     were placeholder; a wallet-total meta with no price feed would be a lie).
 *   • AGENT STATUS is derived from the real `useConnectors()` list, not the
 *     handoff's hardcoded "3 connectors live" — an empty list says so.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { useWalletDisconnect } from "@/lib/walletSession";
import { formatUnits } from "viem";
import AppConnectPrompt from "@/components/app/AppConnectPrompt";
import { useBasename } from "@/lib/useBasename";
import { useConnectors } from "@/app/chat/connectors";

// ── Contracts (Base mainnet) ─────────────────────────────────────────────────

const BLUE_ADDRESS  = "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as `0x${string}`;
const USDC_ADDRESS  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
const WETH_ADDRESS  = "0x4200000000000000000000000000000000000006" as `0x${string}`;
const CBBTC_ADDRESS = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as `0x${string}`;
const AERO_ADDRESS  = "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as `0x${string}`;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// Staking reads and the Starter/Pro/Max tier table lived here. Both were
// removed with the stake surface: `lib/credits.ts` stopped honouring token
// tiers (every wallet gets the same flat daily bucket), so rendering a tier
// badge was asserting an entitlement the credit system no longer grants.
//
// The page accent used to be `tier.color`, which meant the whole dashboard
// changed colour with stake size — a visual claim about entitlement. It is a
// constant now, for the same reason the badge went.
const ACCENT = "#4FC3F7";

// Flat card — the handoff dropped the gradient/glass bento flavours for a single
// calm surface. One constant keeps all six cells identical.
const CARD = "rounded-2xl border border-[#1A1A2E] bg-[#0D0D14]";

function fmtAmt(n: number, decimals: number): string {
  if (n === 0) return "0";
  if (decimals <= 6) return n.toFixed(2);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(3) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(2) + "K";
  if (n >= 1)         return n.toFixed(4);
  return n.toFixed(6);
}

// Big ledger/score values can overrun a narrow mini-cell; step the font down
// past 9 chars and always truncate with a tooltip as the final guard.
function valSize(v: string): string {
  return v.length > 12 ? "text-[13px]" : v.length > 9 ? "text-[16px]" : "text-[20px]";
}

// ── localStorage data ─────────────────────────────────────────────────────────

interface ChatStats {
  totalSessions:   number;
  totalMessages:   number;
  totalCreditsUsed:number;
  toolsUsed:       { name: string; count: number }[];
  firstUsed:       number | null;
}

function loadChatStats(addr?: string): ChatStats {
  const empty: ChatStats = { totalSessions: 0, totalMessages: 0, totalCreditsUsed: 0, toolsUsed: [], firstUsed: null };
  if (typeof window === "undefined") return empty;
  try {
    const key = addr ? `blue_tasks_v1_${addr.toLowerCase()}` : "blue_tasks_v1_guest";
    const raw = localStorage.getItem(key);
    if (!raw) return empty;
    const tasks = JSON.parse(raw) as Array<{
      messages: Array<{ role: string; creditsUsed?: number; toolLogs?: Array<{ tool: string }> }>;
      createdAt: number;
    }>;
    let totalMessages = 0, totalCreditsUsed = 0, firstUsed: number | null = null;
    const toolMap: Record<string, number> = {};
    for (const task of tasks) {
      if (!firstUsed || task.createdAt < firstUsed) firstUsed = task.createdAt;
      for (const msg of task.messages) {
        if (msg.role === "assistant") {
          totalMessages++;
          if (msg.creditsUsed) totalCreditsUsed += msg.creditsUsed;
          for (const log of msg.toolLogs ?? []) {
            toolMap[log.tool] = (toolMap[log.tool] ?? 0) + 1;
          }
        }
      }
    }
    const toolsUsed = Object.entries(toolMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, count]) => ({ name, count }));
    const activeSessions = tasks.filter(t => t.messages.some((m: { role: string }) => m.role === "assistant")).length;
    return { totalSessions: activeSessions, totalMessages, totalCreditsUsed, toolsUsed, firstUsed };
  } catch { return empty; }
}

// ── Icons (Heroicons outline, 15px / 1.75) ────────────────────────────────────

function Icon({ d, color }: { d: string; color: string }) {
  return (
    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.75}
         strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}
const IconChat   = "M12 20.25c4.97 0 9-3.694 9-8.25s-4.03-8.25-9-8.25S3 7.444 3 12c0 2.104.859 4.023 2.273 5.48.432.447.74 1.04.586 1.641a4.483 4.483 0 0 1-.923 1.785A5.969 5.969 0 0 0 6 21c1.282 0 2.47-.402 3.445-1.087.81.22 1.668.337 2.555.337Z";
const IconGrid   = "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25a2.25 2.25 0 0 1-2.25-2.25v-2.25Z";
const IconWallet = "M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0-2.25-4.5A2.25 2.25 0 0 0 16.5 3H7.5a2.25 2.25 0 0 0-2.25 1.5L3 9";

// ── View ─────────────────────────────────────────────────────────────────────

export default function OverviewView() {
  const { address, isConnected } = useAccount();
  const disconnect               = useWalletDisconnect();
  const { name: basename }       = useBasename(address);
  const connectors               = useConnectors();
  const [chatStats,    setChatStats]    = useState<ChatStats>({ totalSessions: 0, totalMessages: 0, totalCreditsUsed: 0, toolsUsed: [], firstUsed: null });
  const [copied,       setCopied]       = useState(false);
  const [builderScore, setBuilderScore] = useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);
  // Only the two numbers this view renders. It used to hold accrued / topup /
  // spent / dailyCr too and print three of them — the same figures /app/usage
  // shows, off the same endpoint, relabelled. The breakdown belongs to the page
  // that owns it; a dashboard keeps the headline.
  const [ledger, setLedger] = useState<{
    balance: number; dailyRemaining: number | null;
  } | null>(null);

  useEffect(() => { setChatStats(loadChatStats(address)); }, [address]);

  useEffect(() => {
    if (!address) { setBuilderScore(null); return; }
    setScoreLoading(true);
    fetch(`/api/builder-score?handle=${address}`)
      .then(r => r.json())
      .then(d => setBuilderScore(d?.score ?? d?.builder_score ?? null))
      .catch(() => null)
      .finally(() => setScoreLoading(false));
  }, [address]);

  const { data: contractData } = useReadContracts({
    contracts: [
      { address: BLUE_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: USDC_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: WETH_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: CBBTC_ADDRESS,   abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: AERO_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
    ],
    query: { enabled: !!address },
  });

  const BALANCE_TOKENS = [
    { sym: "BLUEAGENT", decimals: 18, color: "#4FC3F7" },
    { sym: "USDC",  decimals: 6,  color: "#22C55E" },
    { sym: "WETH",  decimals: 18, color: "#A78BFA" },
    { sym: "cbBTC", decimals: 8,  color: "#F59E0B" },
    { sym: "AERO",  decimals: 18, color: "#F472B6" },
  ];
  const balances = BALANCE_TOKENS.map((t, i) => {
    const raw = contractData?.[i]?.result as bigint | undefined;
    const n = raw !== undefined ? Number(formatUnits(raw, t.decimals)) : null;
    return { ...t, amount: n };
  });

  const memberSince = chatStats.firstUsed
    ? new Date(chatStats.firstUsed).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  // Fetch the unified credit ledger from /api/credits/balance/[address].
  // This single source of truth replaces the old localStorage daily-quota:
  // balance = accrued (on-chain stake-time) + topup (USDC purchases) - spent.
  useEffect(() => {
    if (!address) { setLedger(null); return; }
    let cancelled = false;
    fetch(`/api/credits/balance/${address}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        if (d?.balance === undefined) { setLedger(null); return; }
        setLedger({
          balance: Number(d.balance ?? 0),
          // An older server that doesn't send this field leaves it null, and
          // the sub-line drops the clause rather than printing a 0 free-today.
          dailyRemaining: Number.isFinite(Number(d.dailyRemaining)) ? Number(d.dailyRemaining) : null,
        });
      })
      .catch(() => { if (!cancelled) setLedger(null); });
    return () => { cancelled = true; };
  }, [address]);

  const scoreColor = builderScore !== null
    ? builderScore >= 70 ? "#34D399" : builderScore >= 40 ? "#4FC3F7" : "#F59E0B"
    : "#64748B";

  // AGENT STATUS derives from the real attached-connector list. `useConnectors`
  // hydrates from localStorage (empty by default), so the honest headline is
  // the count of *enabled* servers — never the handoff's fixed "3 live".
  const liveConnectors = connectors.filter(c => c.enabled);

  const creditsValue = ledger ? ledger.balance.toLocaleString() : "—";
  const scoreValue   = scoreLoading ? "—" : builderScore !== null ? String(builderScore) : "—";

  return (
    <div className="flex flex-col h-full">

      {/* `// OVERVIEW` header — desktop only. Below lg the global MobileTopBar
          (see AppShell) already prints the surface title ("Overview"), so
          rendering this too would duplicate it. */}
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="font-mono text-[11px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// OVERVIEW</span>
        <span className="font-mono text-[10.5px] text-[#64748B]">wallet · balances · agent activity</span>
        {isConnected && address && (
          <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
             className="ml-auto font-mono text-[10.5px] text-[#4FC3F7] border border-[rgba(79,195,247,0.3)] rounded-[7px] px-2.5 py-[5px] hover:bg-[rgba(79,195,247,0.08)] transition-colors">
            Basescan ↗
          </a>
        )}
      </div>

      {/* Scroll area */}
      <div className="flex-1 min-h-0 overflow-y-auto relative">
        {/* Ambient glow */}
        <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[280px]">
          <div className="absolute inset-0"
            style={{ background: `radial-gradient(ellipse 80% 60% at 50% -10%, ${ACCENT}0f 0%, transparent 70%)` }} />
        </div>

        <div className="relative px-3 sm:px-5 py-5 max-w-6xl mx-auto">
          {!isConnected ? (
            <AppConnectPrompt
              accent={ACCENT}
              title="Connect to see your dashboard"
              subtitle="Wallet · holdings · activity — all in one place."
              icon={
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
                </svg>
              }
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">

              {/* ─── Identity hero (span 2) ───────────────────────────────── */}
              <div className={`${CARD} lg:col-span-2 p-[18px]`}>
                <div className="flex gap-4 items-start">
                  {/* Avatar — address initials, not the score (the score has its
                      own cell + pill; showing initials keeps the null case clean). */}
                  <div className="w-14 h-14 shrink-0 rounded-[14px] flex items-center justify-center font-mono text-[18px] font-bold"
                       style={{ background: "rgba(79,195,247,0.10)", boxShadow: "inset 0 0 0 1px rgba(79,195,247,0.25)", color: ACCENT }}>
                    {address?.slice(2, 4).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2">
                      <button onClick={copyAddress} className="flex items-center gap-2 min-w-0 hover:opacity-80 transition-opacity">
                        <span className="font-mono text-[15px] text-[#E2E8F0] truncate">
                          {basename ?? `${address?.slice(0, 6)}…${address?.slice(-4)}`}
                        </span>
                        <span className="font-mono text-[9.5px] text-[#64748B] shrink-0">{copied ? "✓" : "copy"}</span>
                      </button>
                      <div className="ml-auto flex flex-col items-end gap-1.5 shrink-0">
                        {builderScore !== null && !scoreLoading && (
                          <span className="font-mono text-[9.5px] px-2 py-[3px] rounded-full whitespace-nowrap"
                                style={{ color: scoreColor, border: `1px solid ${scoreColor}40` }}>
                            BUILDER · {builderScore}
                          </span>
                        )}
                        <button onClick={() => disconnect()}
                          className="font-mono text-[9px] text-slate-600 hover:text-red-400 underline-offset-2 hover:underline transition-colors">
                          disconnect
                        </button>
                      </div>
                    </div>

                    {/* Privy prose is always true; the member-since clause only
                        appears once there's a first-chat timestamp to show. */}
                    <div className="font-mono text-[10.5px] text-[#64748B] mt-1.5">
                      {memberSince ? `since ${memberSince} · ` : ""}Privy embedded wallet · non-custodial
                    </div>

                    <div className="flex gap-2 mt-3.5">
                      {/* CREDITS — one ledger figure. See file header. */}
                      <div className="flex-1 rounded-xl border border-[#1A1A2E] px-3 py-2.5 min-w-0">
                        <div className="font-mono text-[9px] tracking-[0.15em] text-[#64748B]">CREDITS</div>
                        <div className={`font-mono font-bold leading-tight mt-1 truncate ${valSize(creditsValue)}`}
                             style={{ color: ACCENT }} title={creditsValue}>{creditsValue}</div>
                        <div className="font-mono text-[9.5px] text-[#64748B] mt-1 truncate">
                          {ledger?.dailyRemaining != null
                            ? `spendable now · ${ledger.dailyRemaining.toLocaleString()} free today`
                            : "spendable now"}
                        </div>
                      </div>
                      {/* BUILDER SCORE — scoreColor tier band; sub is real chat activity. */}
                      <div className="flex-1 rounded-xl border border-[#1A1A2E] px-3 py-2.5 min-w-0">
                        <div className="font-mono text-[9px] tracking-[0.15em] text-[#64748B]">BUILDER SCORE</div>
                        <div className={`font-mono font-bold leading-tight mt-1 truncate ${valSize(scoreValue)}`}
                             style={{ color: builderScore !== null && !scoreLoading ? scoreColor : "#E2E8F0" }} title={scoreValue}>{scoreValue}</div>
                        <div className="font-mono text-[9.5px] text-[#64748B] mt-1 truncate">
                          {chatStats.totalSessions} sessions · {chatStats.totalMessages} responses
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ─── Balances (span 2) ────────────────────────────────────────
                  The handoff draws a 4-segment weight bar under these amounts;
                  we omit it on purpose. Weighting tokens by share needs a USD
                  price per token, which this view has no feed for — any bar
                  would be a fabricated ratio. Amounts are real; a made-up
                  proportion next to them would read as if it weren't. */}
              <div className={`${CARD} lg:col-span-2 p-[18px]`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B]">BALANCES · BASE</span>
                  <span className="font-mono text-[10px] text-[#64748B]">5 tokens</span>
                </div>
                <div className="grid gap-2.5 mt-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>
                  {balances.map(t => {
                    const isZero = !t.amount || t.amount === 0;
                    return (
                      <div key={t.sym} className={isZero ? "opacity-45" : ""}>
                        <div className="font-mono text-[9.5px]" style={{ color: t.color }}>{t.sym}</div>
                        <div className="font-mono text-[15px] font-semibold text-[#E2E8F0] mt-1 truncate">
                          {t.amount === null ? "—" : fmtAmt(t.amount, t.decimals)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ─── Quick actions (span 1) ───────────────────────────────────
                  Icon + label only. The handoff's right-aligned metas
                  ("⌘N / 111 / $28.9k") were placeholder; a $-total here with no
                  price feed would be invented, so the rows carry a plain chevron
                  affordance instead of a fake number. */}
              <div className={`${CARD} lg:col-span-1 p-4`}>
                <div className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B]">QUICK ACTIONS</div>
                <div className="mt-3 space-y-2">
                  {[
                    { label: "CHAT",   href: "/chat",   d: IconChat },
                    { label: "HUB",    href: "/hub",    d: IconGrid },
                    { label: "WALLET", href: "/wallet", d: IconWallet },
                  ].map(a => (
                    <Link key={a.label} href={a.href}
                      className="flex items-center gap-2.5 border border-[#1A1A2E] rounded-[10px] px-3 py-[11px] hover:border-[#2a2a3e] hover:bg-white/[0.02] transition-all group">
                      <Icon d={a.d} color={ACCENT} />
                      <span className="font-mono text-[11px] font-semibold tracking-[0.1em] text-[#E2E8F0]">{a.label}</span>
                      <span className="ml-auto font-mono text-[11px] text-slate-700 group-hover:text-slate-500 transition-colors">→</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* ─── Blue Chat activity (span 3) ──────────────────────────────── */}
              <div className={`${CARD} lg:col-span-3 p-4`}>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B]">BLUE CHAT ACTIVITY</span>
                  {chatStats.totalSessions > 0 && (
                    <Link href="/chat" className="font-mono text-[10px] text-[#4FC3F7] hover:underline">Open chat →</Link>
                  )}
                </div>

                {chatStats.totalSessions > 0 ? (
                  <div className="grid gap-4 mt-3.5" style={{ gridTemplateColumns: "minmax(0,140px) minmax(0,1fr)" }}>
                    {/* 3-stat column */}
                    <div className="flex flex-col gap-2">
                      {[
                        { label: "SESSIONS",      value: chatStats.totalSessions,    color: "#E2E8F0" },
                        { label: "RESPONSES",     value: chatStats.totalMessages,    color: "#E2E8F0" },
                        { label: "CREDITS SPENT", value: chatStats.totalCreditsUsed, color: "#4FC3F7" },
                      ].map(s => (
                        <div key={s.label} className="border border-[#1A1A2E] rounded-[10px] px-3 py-2.5">
                          <div className="font-mono text-[9px] tracking-[0.15em] text-[#64748B]">{s.label}</div>
                          <div className="font-mono text-[18px] font-bold leading-none mt-1" style={{ color: s.color }}>
                            {s.value.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Top tools */}
                    <div className="min-w-0">
                      <div className="font-mono text-[9.5px] text-[#64748B] mb-2.5">TOP TOOLS</div>
                      {chatStats.toolsUsed.length > 0 ? (
                        <div className="space-y-1.5">
                          {chatStats.toolsUsed.map(t => {
                            const maxCount = chatStats.toolsUsed[0].count;
                            return (
                              <div key={t.name} className="flex items-center gap-3">
                                <span className="font-mono text-[10.5px] text-[#E2E8F0] w-28 sm:w-36 shrink-0 truncate">{t.name.replace(/_/g, " ")}</span>
                                <span className="flex-1 h-[5px] bg-[#1A1A2E] rounded-[3px] overflow-hidden">
                                  <span className="block h-full rounded-[3px]"
                                        style={{ width: `${(t.count / maxCount) * 100}%`, background: ACCENT }} />
                                </span>
                                <span className="font-mono text-[10.5px] text-[#94A3B8] w-5 text-right shrink-0">{t.count}</span>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="font-mono text-[10.5px] text-[#475569] pt-1">No tool calls yet</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <p className="font-mono text-sm font-bold text-[#E2E8F0] mb-1">Start your first chat</p>
                    <p className="font-mono text-[11px] text-[#64748B] mb-4">5 commands · pay per call in USDC</p>
                    <Link href="/chat"
                      className="inline-flex items-center justify-center gap-1.5 font-mono text-[11px] font-bold px-4 py-2 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors">
                      Open Blue Chat →
                    </Link>
                  </div>
                )}
              </div>

              {/* ─── Agent status (span 4, full width) ────────────────────────
                  Derived from the real useConnectors() list — an empty list says
                  "no connectors attached" rather than the handoff's fixed "3 live". */}
              <div className={`${CARD} lg:col-span-4 p-4`}>
                <div className="flex flex-col md:flex-row md:items-start gap-4 md:gap-8">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-[9.5px] tracking-[0.14em] text-[#64748B]">AGENT STATUS</div>
                    {liveConnectors.length > 0 ? (
                      <>
                        <div className="flex items-center gap-2 mt-3 font-mono text-[11px] font-medium text-[#34D399]">
                          <span className="w-[7px] h-[7px] rounded-full bg-[#34D399]" />
                          {liveConnectors.length} connector{liveConnectors.length === 1 ? "" : "s"} live
                        </div>
                        <div className="font-mono text-[10.5px] text-[#94A3B8] leading-[1.7] mt-2.5">
                          {liveConnectors.map(c => (
                            <div key={c.id}>{c.name} · {c.tools.length} tool{c.tools.length === 1 ? "" : "s"}</div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-2 mt-3 font-mono text-[11px] font-medium text-[#64748B]">
                          <span className="w-[7px] h-[7px] rounded-full bg-[#475569]" />
                          No connectors attached
                        </div>
                        <div className="font-mono text-[10.5px] text-[#64748B] leading-[1.7] mt-2.5">
                          Attach an MCP server to extend the agent with third-party tools.
                        </div>
                      </>
                    )}
                  </div>

                  <div className="md:max-w-sm">
                    <p className="font-prose text-[9.5px] text-[#64748B] leading-[1.6]">
                      Wallet created with Privy — signing in with email or a social account mints it. Keys stay with you; BlueAgent never holds them.
                    </p>
                    <Link href="/connectors"
                      className="mt-3 block text-center font-mono text-[10.5px] text-[#4FC3F7] border border-[rgba(79,195,247,0.3)] rounded-lg py-2 hover:bg-[rgba(79,195,247,0.08)] transition-colors">
                      Manage connectors
                    </Link>
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
