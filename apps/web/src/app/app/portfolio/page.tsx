"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import AppPageHeader from "@/components/app/AppPageHeader";
import AppConnectPrompt from "@/components/app/AppConnectPrompt";
import AppCard, { AppSectionLabel } from "@/components/app/AppCard";

// ── Token list ────────────────────────────────────────────────────────────────

const TOKENS = [
  { symbol: "BLUE",  address: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as `0x${string}`, decimals: 18, color: "#4FC3F7" },
  { symbol: "USDC",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`, decimals: 6,  color: "#22C55E" },
  { symbol: "WETH",  address: "0x4200000000000000000000000000000000000006" as `0x${string}`, decimals: 18, color: "#A78BFA" },
  { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as `0x${string}`, decimals: 8,  color: "#F59E0B" },
  { symbol: "AERO",  address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as `0x${string}`, decimals: 18, color: "#F472B6" },
];

const STAKING_ADDRESS = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ?? "0x69e539684EE48F71eCDAd58618d8e8a2423E279d"
) as `0x${string}`;

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
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtAmt(n: number, decimals: number): string {
  if (n === 0) return "0";
  if (decimals <= 6) return n.toFixed(2);
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(3) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(2) + "K";
  if (n >= 1)         return n.toFixed(4);
  return n.toFixed(6);
}

// ── PnL via Hub API ───────────────────────────────────────────────────────────

interface PnlData {
  realized?: string;
  unrealized?: string;
  winRate?: string;
  bestTrade?: string;
  worstTrade?: string;
  raw?: string;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PortfolioPage() {
  const { address, isConnected } = useAccount();
  const [pnlData, setPnlData]       = useState<PnlData | null>(null);
  const [pnlLoading, setPnlLoading] = useState(false);
  const [pnlError, setPnlError]     = useState("");

  // Read all token balances + staking position
  const contracts = [
    ...TOKENS.map(t => ({
      address: t.address,
      abi: ERC20_ABI,
      functionName: "balanceOf" as const,
      args: address ? [address] : undefined,
    })),
    {
      address: STAKING_ADDRESS,
      abi: STAKING_ABI,
      functionName: "stakeInfo" as const,
      args: address ? [address] : undefined,
    },
  ];

  const { data: balances, isLoading: balancesLoading } = useReadContracts({
    contracts,
    query: { enabled: !!address },
  });

  const tokenBalances = TOKENS.map((t, i) => {
    const raw = balances?.[i]?.result as bigint | undefined;
    const amt = raw !== undefined ? Number(formatUnits(raw, t.decimals)) : null;
    return { ...t, amount: amt };
  });

  const stakeInfo    = balances?.[TOKENS.length]?.result as [bigint,bigint,bigint,bigint,bigint] | undefined;
  const stakedWei    = stakeInfo?.[0] ?? 0n;
  const pendingUsdc  = stakeInfo?.[4] ?? 0n;
  const staked       = Number(formatUnits(stakedWei, 18));

  // Check if any nonzero balances
  const hasBalances = tokenBalances.some(t => t.amount && t.amount > 0);

  function loadPnl() {
    if (!address) return;
    setPnlLoading(true);
    setPnlError("");
    fetch(`/api/x402/wallet-pnl`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address }),
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setPnlError(d.error);
        else setPnlData({ raw: typeof d === "string" ? d : JSON.stringify(d, null, 2) });
      })
      .catch(() => setPnlError("Failed to fetch PnL data"))
      .finally(() => setPnlLoading(false));
  }

  return (
    <div className="relative h-full overflow-y-auto bg-[#050508] text-white font-mono">

      {/* Ambient glow */}
      <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[300px]">
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, #22C55E08 0%, transparent 70%)" }} />
      </div>

      <AppPageHeader
        label="PORTFOLIO"
        subtitle="Token balances · staking position · PnL · Base Mainnet"
        accent="#22C55E"
      />

      <div className="relative px-6 py-6 max-w-2xl mx-auto">

        {!isConnected ? (
          <AppConnectPrompt
            accent="#22C55E"
            title="Connect to view portfolio"
            subtitle="Token balances, staking position, and PnL on Base"
            icon={
              <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" />
              </svg>
            }
          />
        ) : (
          <>
            {/* Staking position highlight */}
            {staked > 0 && (
              <div className="rounded-2xl border border-[#4FC3F7]/20 bg-[#4FC3F7]/5 p-5 mb-4 flex items-center justify-between flex-wrap gap-3">
                <div>
                  <p className="text-[10px] text-[#4FC3F7] tracking-widest mb-1">STAKING POSITION</p>
                  <p className="text-2xl font-bold text-[#4FC3F7]">{fmtAmt(staked, 18)} <span className="text-sm text-slate-400">BLUE</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-600 tracking-widest mb-1">PENDING USDC</p>
                  <p className="text-xl font-bold text-[#22C55E]">${(Number(pendingUsdc) / 1e6).toFixed(4)}</p>
                </div>
                <Link href="/app/rewards" className="text-xs text-[#4FC3F7] border border-[#4FC3F7]/30 px-3 py-1.5 rounded-lg hover:bg-[#4FC3F7]/10 transition-all shrink-0">
                  Manage →
                </Link>
              </div>
            )}

            {/* Token balances */}
            <AppCard className="mb-4">
              <div className="flex items-center justify-between mb-4">
                <AppSectionLabel>TOKEN BALANCES</AppSectionLabel>
                <span className="text-[10px] text-slate-700">Base Mainnet</span>
              </div>


              {balancesLoading ? (
                <div className="flex items-center gap-2 py-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                  <span className="text-xs text-slate-600">Loading balances…</span>
                </div>
              ) : !hasBalances ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-slate-600 mb-1">No token balances found</p>
                  <p className="text-[10px] text-slate-700">Scanned: {TOKENS.map(t => t.symbol).join(", ")}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {tokenBalances
                    .filter(t => t.amount && t.amount > 0)
                    .sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0))
                    .map(t => (
                      <div key={t.symbol} className="flex items-center justify-between py-2 border-b border-[#1A1A2E] last:border-0">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0"
                            style={{ background: `${t.color}18`, color: t.color, border: `1px solid ${t.color}30` }}>
                            {t.symbol.slice(0, 2)}
                          </div>
                          <div>
                            <p className="text-sm font-bold">{t.symbol}</p>
                            <p className="text-[9px] text-slate-700">{t.address.slice(0, 10)}…</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-bold" style={{ color: t.color }}>
                            {fmtAmt(t.amount!, t.decimals)}
                          </p>
                        </div>
                      </div>
                    ))}

                  {/* Zero balance tokens collapsed */}
                  {tokenBalances.filter(t => !t.amount || t.amount === 0).length > 0 && (
                    <div className="pt-2">
                      <p className="text-[9px] text-slate-700">
                        Also scanned: {tokenBalances.filter(t => !t.amount || t.amount === 0).map(t => t.symbol).join(", ")} — no balance
                      </p>
                    </div>
                  )}
                </div>
              )}
            </AppCard>

            {/* PnL section */}
            <AppCard className="mb-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] text-slate-600 tracking-widest">WALLET PnL</p>
                  <p className="text-[10px] text-slate-700 mt-0.5">AI analysis — realized + unrealized gains on Base</p>
                </div>
                {!pnlData && !pnlLoading && (
                  <button
                    onClick={loadPnl}
                    className="text-xs px-4 py-2 rounded-xl border border-[#22C55E]/30 text-[#22C55E] bg-[#22C55E]/5 hover:bg-[#22C55E]/10 transition-all"
                  >
                    Analyze PnL
                  </button>
                )}
              </div>

              {pnlLoading && (
                <div className="flex items-center gap-2 py-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" />
                  <span className="text-xs text-slate-600">Analyzing wallet activity…</span>
                </div>
              )}

              {pnlError && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4">
                  <p className="text-xs text-red-400">{pnlError}</p>
                  <button onClick={loadPnl} className="text-[10px] text-red-400/70 mt-1 hover:text-red-400">Retry</button>
                </div>
              )}

              {pnlData?.raw && !pnlLoading && (
                <div className="rounded-xl bg-[#0a0a0f] border border-[#1A1A2E] p-4">
                  <pre className="text-[11px] text-slate-400 whitespace-pre-wrap leading-relaxed overflow-x-auto">
                    {pnlData.raw.length > 2000 ? pnlData.raw.slice(0, 2000) + "\n\n…" : pnlData.raw}
                  </pre>
                  <button onClick={() => setPnlData(null)} className="text-[10px] text-slate-700 mt-3 hover:text-slate-500">Clear</button>
                </div>
              )}

              {!pnlData && !pnlLoading && !pnlError && (
                <div className="py-4 text-center">
                  <p className="text-xs text-slate-600">Click "Analyze PnL" to run AI analysis on your wallet activity.</p>
                  <p className="text-[10px] text-slate-700 mt-1">Uses 1 credit · powered by Blue Hub</p>
                </div>
              )}
            </AppCard>

            {/* Links */}
            <div className="flex flex-wrap gap-3 text-[10px] text-slate-700">
              <a href={`https://basescan.org/address/${address}`} target="_blank" rel="noopener noreferrer"
                className="hover:text-slate-500 transition-colors">View on Basescan ↗</a>
              <Link href="/app/approvals" className="hover:text-slate-500 transition-colors">Check approvals →</Link>
              <Link href="/app/chat" className="hover:text-slate-500 transition-colors">Ask AI about portfolio →</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
