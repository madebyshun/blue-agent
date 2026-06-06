"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import AppPageHeader from "@/components/app/AppPageHeader";
import AppConnectPrompt from "@/components/app/AppConnectPrompt";
import AppCard, { AppStat, AppSectionLabel } from "@/components/app/AppCard";

// ── Contracts ─────────────────────────────────────────────────────────────────

const STAKING_ADDRESS = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ?? "0x69e539684EE48F71eCDAd58618d8e8a2423E279d"
) as `0x${string}`;
const BLUE_ADDRESS = "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as `0x${string}`;
const USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

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

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// ── Tiers ─────────────────────────────────────────────────────────────────────

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

// ── Chat stats from localStorage ──────────────────────────────────────────────

interface ChatStats {
  totalSessions: number;
  totalMessages: number;
  totalCreditsUsed: number;
  toolsUsed: { name: string; count: number }[];
  firstUsed: number | null;
}

function loadChatStats(addr?: string): ChatStats {
  if (typeof window === "undefined") return { totalSessions: 0, totalMessages: 0, totalCreditsUsed: 0, toolsUsed: [], firstUsed: null };
  try {
    const key = addr ? `blue_tasks_v1_${addr.toLowerCase()}` : "blue_tasks_v1_guest";
    const raw = localStorage.getItem(key);
    if (!raw) return { totalSessions: 0, totalMessages: 0, totalCreditsUsed: 0, toolsUsed: [], firstUsed: null };
    const tasks = JSON.parse(raw) as Array<{
      messages: Array<{ role: string; creditsUsed?: number; toolLogs?: Array<{ tool: string }> }>;
      createdAt: number;
    }>;
    let totalMessages = 0, totalCreditsUsed = 0;
    const toolMap: Record<string, number> = {};
    let firstUsed: number | null = null;
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
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));
    return { totalSessions: tasks.length, totalMessages, totalCreditsUsed, toolsUsed, firstUsed };
  } catch { return { totalSessions: 0, totalMessages: 0, totalCreditsUsed: 0, toolsUsed: [], firstUsed: null }; }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const [chatStats, setChatStats] = useState<ChatStats>({ totalSessions: 0, totalMessages: 0, totalCreditsUsed: 0, toolsUsed: [], firstUsed: null });
  const [copied, setCopied] = useState(false);
  const [builderScore, setBuilderScore] = useState<number | null>(null);
  const [scoreLoading, setScoreLoading] = useState(false);

  useEffect(() => {
    setChatStats(loadChatStats(address));
  }, [address]);

  // Fetch builder score
  useEffect(() => {
    if (!address) return;
    setScoreLoading(true);
    fetch(`https://x402.bankr.bot/0xb058a1e305d9c720aa5b1bf42b6f2f6294b03b5f/builder-score?handle=${address}`)
      .then(r => r.json())
      .then(d => setBuilderScore(d?.score ?? d?.builder_score ?? null))
      .catch(() => null)
      .finally(() => setScoreLoading(false));
  }, [address]);

  const { data: contractData } = useReadContracts({
    contracts: [
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stakeInfo", args: address ? [address] : undefined },
      { address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "totalCreditsAccrued", args: address ? [address] : undefined },
      { address: BLUE_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
      { address: USDC_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf", args: address ? [address] : undefined },
    ],
    query: { enabled: !!address },
  });

  const stakeInfo    = contractData?.[0]?.result as [bigint,bigint,bigint,bigint,bigint] | undefined;
  const totalCredits = contractData?.[1]?.result as bigint | undefined;
  const blueBalance  = contractData?.[2]?.result as bigint | undefined;
  const usdcBalance  = contractData?.[3]?.result as bigint | undefined;

  const stakedWei   = stakeInfo?.[0] ?? 0n;
  const pendingUsdc = stakeInfo?.[4] ?? 0n;
  const dailyCr     = stakeInfo?.[2] ?? 0n;
  const staked      = Number(formatUnits(stakedWei, 18));
  const tier        = getTier(staked);
  const totalCr     = totalCredits ? Number(totalCredits) : 0;

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const memberSince = chatStats.firstUsed
    ? new Date(chatStats.firstUsed).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;

  return (
    <div className="relative h-full overflow-y-auto bg-[#050508] text-white font-mono">

      {/* Ambient glow */}
      <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[300px]">
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, #A78BFA08 0%, transparent 70%)" }} />
      </div>

      <AppPageHeader
        label="PROFILE"
        subtitle="Wallet identity · on-chain footprint · activity"
        accent="#A78BFA"
      />

      <div className="relative px-6 py-6 max-w-2xl mx-auto">

        {!isConnected ? (
          <AppConnectPrompt
            accent="#A78BFA"
            title="Connect to view profile"
            subtitle="Your on-chain identity, staking history, and activity stats"
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.982 18.725A7.488 7.488 0 0 0 12 15.75a7.488 7.488 0 0 0-5.982 2.975m11.963 0a9 9 0 1 0-11.963 0m11.963 0A8.966 8.966 0 0 1 12 21a8.966 8.966 0 0 1-5.982-2.275M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
              </svg>
            }
          />
        ) : (
          <>
            <AppCard className="p-6 mb-4" accent={tier.color}>
              <div className="flex items-start justify-between mb-5">
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl font-bold shrink-0"
                    style={{ background: `${tier.color}18`, border: `1px solid ${tier.color}30`, color: tier.color }}>
                    {address?.slice(2, 4).toUpperCase()}
                  </div>
                  <div>
                    <button onClick={copyAddress} className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                      <span className="text-sm font-bold text-white">{address?.slice(0, 8)}…{address?.slice(-6)}</span>
                      <span className="text-[10px] text-slate-600">{copied ? "✓ copied" : "copy"}</span>
                    </button>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ color: tier.color, background: `${tier.color}18`, border: `1px solid ${tier.color}30` }}>
                        {tier.name === "None" ? "No Tier" : tier.name}
                      </span>
                      {memberSince && (
                        <span className="text-[10px] text-slate-600">member since {memberSince}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Builder score */}
                <div className="text-right shrink-0">
                  <div className="text-[10px] text-slate-600 tracking-widest mb-1">BUILDER SCORE</div>
                  <div className="text-3xl font-bold" style={{ color: builderScore !== null ? (builderScore >= 70 ? "#34D399" : builderScore >= 40 ? "#4FC3F7" : "#F59E0B") : "#1A1A2E" }}>
                    {scoreLoading ? "—" : builderScore !== null ? builderScore : "—"}
                  </div>
                  {builderScore !== null && !scoreLoading && (
                    <div className="text-[9px] text-slate-700 mt-0.5">/100</div>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "STAKED", value: staked > 0 ? fmtBlue(stakedWei) : "0", sub: "BLUE", color: tier.color },
                  { label: "CREDITS / DAY", value: Number(dailyCr).toLocaleString(), sub: "per day", color: "#4FC3F7" },
                  { label: "TOTAL CREDITS", value: totalCr < 1 ? totalCr.toFixed(2) : totalCr.toFixed(0), sub: "earned", color: "#A78BFA" },
                  { label: "USDC YIELD", value: `$${(Number(pendingUsdc) / 1e6).toFixed(4)}`, sub: "pending", color: "#22C55E" },
                ].map(s => (
                  <div key={s.label} className="rounded-xl bg-[#0a0a0f] border border-[#1A1A2E] p-3">
                    <div className="text-[9px] text-slate-600 tracking-widest mb-1">{s.label}</div>
                    <div className="text-lg font-bold" style={{ color: s.color }}>{s.value}</div>
                    <div className="text-[9px] text-slate-700 mt-0.5">{s.sub}</div>
                  </div>
                ))}
              </div>
            </AppCard>

            {/* Balances row */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <AppCard className="p-4">
                <AppStat label="BLUE BALANCE" value={blueBalance !== undefined ? fmtBlue(blueBalance) : "—"} sub="in wallet" color="#4FC3F7" />
              </AppCard>
              <AppCard className="p-4">
                <AppStat label="USDC BALANCE" value={usdcBalance !== undefined ? `$${(Number(usdcBalance) / 1e6).toFixed(2)}` : "—"} sub="on Base" color="#22C55E" />
              </AppCard>
            </div>

            {/* Chat activity */}
            <AppCard className="mb-4">
              <AppSectionLabel>BLUE CHAT ACTIVITY</AppSectionLabel>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: "SESSIONS", value: chatStats.totalSessions },
                  { label: "AI RESPONSES", value: chatStats.totalMessages },
                  { label: "CREDITS USED", value: chatStats.totalCreditsUsed },
                ].map(s => (
                  <div key={s.label}>
                    <div className="text-[9px] text-slate-600 tracking-widest mb-1">{s.label}</div>
                    <div className="text-2xl font-bold text-white">{s.value.toLocaleString()}</div>
                  </div>
                ))}
              </div>

              {chatStats.toolsUsed.length > 0 && (
                <>
                  <p className="text-[10px] text-slate-600 tracking-widest mb-3">TOP TOOLS USED</p>
                  <div className="space-y-2">
                    {chatStats.toolsUsed.map(t => {
                      const maxCount = chatStats.toolsUsed[0].count;
                      return (
                        <div key={t.name} className="flex items-center gap-3">
                          <span className="text-[11px] text-slate-400 w-40 shrink-0 truncate">{t.name.replace(/_/g, " ")}</span>
                          <div className="flex-1 h-1.5 bg-[#1A1A2E] rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-[#4FC3F7]"
                              style={{ width: `${(t.count / maxCount) * 100}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-600 w-6 text-right shrink-0">{t.count}</span>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}

              {chatStats.totalSessions === 0 && (
                <Link href="/app/chat" className="flex items-center justify-center gap-2 py-4 text-xs text-[#4FC3F7] hover:underline">
                  Start your first chat session →
                </Link>
              )}
            </AppCard>

            {/* Links */}
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-700">
              <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
                className="hover:text-slate-500 transition-colors">Basescan ↗</a>
              <Link href="/app/rewards" className="hover:text-slate-500 transition-colors">Manage stake →</Link>
              <Link href="/app/chat" className="hover:text-slate-500 transition-colors">Open chat →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
