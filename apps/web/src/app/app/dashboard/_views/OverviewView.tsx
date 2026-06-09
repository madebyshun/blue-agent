"use client";

/**
 * OverviewView — wallet identity, balances, stake summary, active alerts,
 * quick actions, chat activity. Renders inside the Dashboard "Overview" tab.
 *
 * The deep-link mini-cards (stake + alerts) now call back to the dashboard
 * to switch tabs instead of navigating, so the whole experience stays on
 * one URL.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import AppConnectPrompt from "@/components/app/AppConnectPrompt";
import AppCard, { AppSectionLabel } from "@/components/app/AppCard";

// ── Contracts (Base mainnet) ─────────────────────────────────────────────────

const STAKING_ADDRESS = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ??
  "0x69e539684EE48F71eCDAd58618d8e8a2423E279d"
) as `0x${string}`;
const BLUE_ADDRESS  = "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as `0x${string}`;
const USDC_ADDRESS  = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
const WETH_ADDRESS  = "0x4200000000000000000000000000000000000006" as `0x${string}`;
const CBBTC_ADDRESS = "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as `0x${string}`;
const AERO_ADDRESS  = "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as `0x${string}`;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const STAKING_ABI = [
  { name: "stakeInfo", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [
      { name: "amount",       type: "uint256" },
      { name: "stakedAt",     type: "uint256" },
      { name: "dailyCredits", type: "uint256" },
      { name: "cooldown",     type: "uint256" },
      { name: "pendingUsdc",  type: "uint256" },
    ] },
  { name: "totalCreditsAccrued", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// ── Tier table (mirrors /app/dashboard/_views/StakeView.tsx) ─────────────────

const TIERS = [
  { name: "None",    min: 0,          color: "#475569" },
  { name: "Starter", min: 500_000,    color: "#4FC3F7" },
  { name: "Pro",     min: 2_000_000,  color: "#A78BFA" },
  { name: "Max",     min: 10_000_000, color: "#F59E0B" },
];
function getTier(n: number) {
  if (n >= 10_000_000) return TIERS[3];
  if (n >= 2_000_000)  return TIERS[2];
  if (n >= 500_000)    return TIERS[1];
  return TIERS[0];
}

function fmtBlue(wei: bigint) {
  const n = Number(formatUnits(wei, 18));
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

function fmtAmt(n: number, decimals: number): string {
  if (n === 0) return "0";
  if (decimals <= 6) return n.toFixed(2);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(3) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(2) + "K";
  if (n >= 1)         return n.toFixed(4);
  return n.toFixed(6);
}

// ── localStorage data (chat + alerts) ────────────────────────────────────────

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
    return { totalSessions: tasks.length, totalMessages, totalCreditsUsed, toolsUsed, firstUsed };
  } catch { return empty; }
}

interface AlertItem {
  id: string;
  type: "price_above" | "price_below" | "whale_move";
  label: string;
  status: "active" | "triggered" | "dismissed";
  createdAt: number;
}

function loadActiveAlerts(): AlertItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("blue_alerts_v1");
    const all = (raw ? JSON.parse(raw) : []) as AlertItem[];
    return all.filter(a => a.status === "active").slice(0, 3);
  } catch { return []; }
}

// ── View ─────────────────────────────────────────────────────────────────────

const BALANCE_TOKENS = [
  { sym: "BLUE",  addr: BLUE_ADDRESS,  decimals: 18, color: "#4FC3F7" },
  { sym: "USDC",  addr: USDC_ADDRESS,  decimals: 6,  color: "#22C55E" },
  { sym: "WETH",  addr: WETH_ADDRESS,  decimals: 18, color: "#A78BFA" },
  { sym: "cbBTC", addr: CBBTC_ADDRESS, decimals: 8,  color: "#F59E0B" },
  { sym: "AERO",  addr: AERO_ADDRESS,  decimals: 18, color: "#F472B6" },
];

interface Props {
  /** Switch the Dashboard tab. Allows the mini-cards to deep-link in-page. */
  onSwitchTab?: (tab: "stake" | "alerts") => void;
}

export default function OverviewView({ onSwitchTab }: Props) {
  const { address, isConnected } = useAccount();
  const [chatStats,    setChatStats]    = useState<ChatStats>({ totalSessions: 0, totalMessages: 0, totalCreditsUsed: 0, toolsUsed: [], firstUsed: null });
  const [activeAlerts, setActiveAlerts] = useState<AlertItem[]>([]);
  const [copied,       setCopied]       = useState(false);
  const [builderScore, setBuilderScore] = useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  useEffect(() => { setChatStats(loadChatStats(address)); }, [address]);
  useEffect(() => { setActiveAlerts(loadActiveAlerts()); }, []);

  useEffect(() => {
    if (!address) { setBuilderScore(null); return; }
    setScoreLoading(true);
    fetch(`https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/builder-score?handle=${address}`)
      .then(r => r.json())
      .then(d => setBuilderScore(d?.score ?? d?.builder_score ?? null))
      .catch(() => null)
      .finally(() => setScoreLoading(false));
  }, [address]);

  const { data: contractData } = useReadContracts({
    contracts: [
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stakeInfo",           args: address ? [address] : undefined },
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "totalCreditsAccrued", args: address ? [address] : undefined },
      { address: BLUE_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: USDC_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: WETH_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: CBBTC_ADDRESS,   abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
      { address: AERO_ADDRESS,    abi: ERC20_ABI,   functionName: "balanceOf",           args: address ? [address] : undefined },
    ],
    query: { enabled: !!address },
  });

  const stakeInfo    = contractData?.[0]?.result as [bigint, bigint, bigint, bigint, bigint] | undefined;
  const totalCredits = contractData?.[1]?.result as bigint | undefined;
  const balances     = BALANCE_TOKENS.map((t, i) => {
    const raw = contractData?.[2 + i]?.result as bigint | undefined;
    const n = raw !== undefined ? Number(formatUnits(raw, t.decimals)) : null;
    return { ...t, raw, amount: n };
  });

  const stakedWei   = stakeInfo?.[0] ?? 0n;
  const dailyCr     = stakeInfo?.[2] ?? 0n;
  const pendingUsdc = stakeInfo?.[4] ?? 0n;
  const staked      = Number(formatUnits(stakedWei, 18));
  const tier        = getTier(staked);
  const totalCr     = totalCredits ? Number(totalCredits) : 0;
  const hasStake    = staked > 0;
  const memberSince = chatStats.firstUsed
    ? new Date(chatStats.firstUsed).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      {/* Ambient glow */}
      <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[260px]">
        <div className="absolute inset-0"
          style={{ background: `radial-gradient(ellipse 80% 50% at 50% -10%, ${tier.color}10 0%, transparent 70%)` }} />
      </div>

      <div className="relative px-4 sm:px-6 py-6 max-w-2xl mx-auto">

        {!isConnected ? (
          <AppConnectPrompt
            accent={tier.color}
            title="Connect to see your dashboard"
            subtitle="Wallet · holdings · stake · alerts — all in one place."
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
              </svg>
            }
          />
        ) : (
          <>
            {/* ── 1. Identity strip ─────────────────────────────────────── */}
            <AppCard className="p-5 mb-4" accent={tier.color}>
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0"
                    style={{ background: `${tier.color}18`, border: `1px solid ${tier.color}30`, color: tier.color }}>
                    {address?.slice(2, 4).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <button onClick={copyAddress} className="flex items-center gap-2 hover:opacity-80 transition-opacity max-w-full">
                      <span className="text-sm font-bold text-white truncate">{address?.slice(0, 6)}…{address?.slice(-4)}</span>
                      <span className="text-[9px] text-slate-600 shrink-0">{copied ? "✓" : "copy"}</span>
                    </button>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                        style={{ color: tier.color, background: `${tier.color}18`, border: `1px solid ${tier.color}30` }}>
                        {tier.name === "None" ? "No Tier" : tier.name}
                      </span>
                      {memberSince && <span className="text-[9px] text-slate-600">since {memberSince}</span>}
                    </div>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[9px] text-slate-600 tracking-widest mb-0.5">BUILDER</div>
                  <div className="text-2xl font-bold"
                    style={{ color: builderScore !== null ? (builderScore >= 70 ? "#34D399" : builderScore >= 40 ? "#4FC3F7" : "#F59E0B") : "#1A1A2E" }}>
                    {scoreLoading ? "—" : builderScore !== null ? builderScore : "—"}
                  </div>
                  {builderScore !== null && !scoreLoading && (
                    <div className="text-[8px] text-slate-700">/100</div>
                  )}
                </div>
              </div>

              {/* Earning summary */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { label: "STAKED",        value: hasStake ? fmtBlue(stakedWei) : "0",                              sub: "BLUE",        color: tier.color },
                  { label: "CREDITS / DAY", value: Number(dailyCr).toLocaleString(),                                  sub: "per day",     color: "#4FC3F7" },
                  { label: "TOTAL CREDITS", value: totalCr < 1 ? totalCr.toFixed(2) : totalCr.toFixed(0),             sub: "earned",      color: "#A78BFA" },
                  { label: "USDC YIELD",    value: `$${(Number(pendingUsdc) / 1e6).toFixed(4)}`,                      sub: "pending",     color: "#22C55E" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-[#0a0a0f] border border-[#1A1A2E] p-2.5">
                    <div className="text-[9px] text-slate-600 tracking-widest mb-1">{s.label}</div>
                    <div className="text-base font-bold leading-none" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] text-slate-700 mt-1">{s.sub}</div>
                  </div>
                ))}
              </div>
            </AppCard>

            {/* ── 2. Balances ───────────────────────────────────────────── */}
            <AppCard className="mb-4">
              <AppSectionLabel>BALANCES · BASE</AppSectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {balances.map(t => {
                  const isZero = !t.amount || t.amount === 0;
                  return (
                    <div key={t.sym}
                      className={`rounded-xl border p-3 ${isZero ? "border-[#1A1A2E]/50 bg-[#0a0a0f] opacity-60" : "border-[#1A1A2E] bg-[#0a0a0f]"}`}>
                      <div className="text-[9px] tracking-widest mb-1" style={{ color: t.color }}>{t.sym}</div>
                      <div className="text-sm font-bold text-white leading-none">
                        {t.amount === null ? "—" : fmtAmt(t.amount, t.decimals)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </AppCard>

            {/* ── 3. Stake + Alerts mini-cards (switch tab in-page) ────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
              <AppCard className="p-4 flex flex-col">
                <AppSectionLabel>STAKE</AppSectionLabel>
                {hasStake ? (
                  <>
                    <div className="text-2xl font-bold text-white mb-0.5">{fmtBlue(stakedWei)} <span className="text-xs text-slate-600">BLUE</span></div>
                    <div className="text-[11px] text-slate-500 mb-3">+${(Number(pendingUsdc) / 1e6).toFixed(4)} pending USDC</div>
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold text-slate-500 mb-0.5">No stake</div>
                    <div className="text-[11px] text-slate-600 mb-3">Stake $BLUEAGENT to earn USDC yield + credits</div>
                  </>
                )}
                <button
                  onClick={() => onSwitchTab?.("stake")}
                  className="mt-auto inline-flex items-center justify-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/15 transition-colors">
                  {hasStake ? "Manage stake" : "Stake now"} →
                </button>
              </AppCard>

              <AppCard className="p-4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <AppSectionLabel>ALERTS</AppSectionLabel>
                  {activeAlerts.length > 0 && (
                    <span className="text-[10px] text-[#A78BFA]">{activeAlerts.length} active</span>
                  )}
                </div>
                {activeAlerts.length > 0 ? (
                  <div className="space-y-1.5 mb-3">
                    {activeAlerts.map(a => (
                      <div key={a.id} className="flex items-center gap-2 text-[11px]">
                        <span className="w-1 h-1 rounded-full bg-[#A78BFA] shrink-0" />
                        <span className="text-slate-300 truncate">{a.label}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-600 mb-3">No active alerts yet</div>
                )}
                <button
                  onClick={() => onSwitchTab?.("alerts")}
                  className="mt-auto inline-flex items-center justify-center gap-1.5 text-[11px] font-bold px-3 py-2 rounded-lg bg-[#A78BFA]/10 text-[#A78BFA] border border-[#A78BFA]/30 hover:bg-[#A78BFA]/15 transition-colors">
                  {activeAlerts.length > 0 ? "Manage alerts" : "Create alert"} →
                </button>
              </AppCard>
            </div>

            {/* ── 4. Quick actions ──────────────────────────────────────── */}
            <AppCard className="mb-4">
              <AppSectionLabel>QUICK ACTIONS</AppSectionLabel>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { label: "Chat",     icon: "💬", href: "/app/chat",      color: "#4FC3F7" },
                  { label: "Console",  icon: "⌘",  href: "/app/console",   color: "#A78BFA" },
                  { label: "Simulate", icon: "🚀", href: "/app/simulator", color: "#F59E0B" },
                  { label: "Hub",      icon: "🧰", href: "/app/hub",       color: "#22C55E" },
                ].map(a => (
                  <Link key={a.label} href={a.href}
                    className="flex flex-col items-center justify-center gap-1 py-3 px-2 rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] hover:border-slate-700 hover:bg-white/[0.02] transition-all">
                    <span className="text-xl">{a.icon}</span>
                    <span className="text-[10px] font-bold tracking-widest" style={{ color: a.color }}>{a.label}</span>
                  </Link>
                ))}
              </div>
            </AppCard>

            {/* ── 5. Chat activity ──────────────────────────────────────── */}
            {chatStats.totalSessions > 0 ? (
              <AppCard className="mb-4">
                <AppSectionLabel>BLUE CHAT ACTIVITY</AppSectionLabel>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                    { label: "SESSIONS",     value: chatStats.totalSessions },
                    { label: "AI RESPONSES", value: chatStats.totalMessages },
                    { label: "CREDITS USED", value: chatStats.totalCreditsUsed },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="text-[9px] text-slate-600 tracking-widest mb-1">{s.label}</div>
                      <div className="text-xl font-bold text-white">{s.value.toLocaleString()}</div>
                    </div>
                  ))}
                </div>
                {chatStats.toolsUsed.length > 0 && (
                  <>
                    <p className="text-[9px] text-slate-700 tracking-widest mb-2">TOP TOOLS</p>
                    <div className="space-y-1.5">
                      {chatStats.toolsUsed.map(t => {
                        const maxCount = chatStats.toolsUsed[0].count;
                        return (
                          <div key={t.name} className="flex items-center gap-2.5">
                            <span className="text-[10px] text-slate-400 w-28 sm:w-36 shrink-0 truncate">{t.name.replace(/_/g, " ")}</span>
                            <div className="flex-1 h-1 bg-[#1A1A2E] rounded-full overflow-hidden">
                              <div className="h-full rounded-full bg-[#4FC3F7]"
                                style={{ width: `${(t.count / maxCount) * 100}%` }} />
                            </div>
                            <span className="text-[9px] text-slate-600 w-5 text-right shrink-0">{t.count}</span>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </AppCard>
            ) : (
              <AppCard className="mb-4 text-center py-6">
                <div className="text-2xl mb-2">💬</div>
                <p className="text-sm font-bold text-white mb-1">Start your first chat</p>
                <p className="text-[11px] text-slate-600 mb-4">5 commands · 50+ tools · 3-agent consensus</p>
                <Link href="/app/chat"
                  className="inline-flex items-center justify-center gap-1.5 text-[11px] font-bold px-4 py-2 rounded-lg bg-[#4FC3F7] text-[#050508] hover:bg-[#29ABE2] transition-colors">
                  Open Blue Chat →
                </Link>
              </AppCard>
            )}

            {/* ── Footer links ──────────────────────────────────────────── */}
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-700 justify-center">
              <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
                className="hover:text-slate-500 transition-colors">Basescan ↗</a>
              <Link href="/app/profile" className="hover:text-slate-500 transition-colors">Profile →</Link>
              <Link href="/score" className="hover:text-slate-500 transition-colors">Score →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
