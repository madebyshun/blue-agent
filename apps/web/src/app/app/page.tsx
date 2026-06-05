"use client";

import Link from "next/link";
import { useAccount, useReadContract } from "wagmi";
import { formatUnits } from "viem";
import { ConnectButton } from "@/components/ConnectModal";

// ── Contracts ─────────────────────────────────────────────────────────────────

const STAKING_ADDRESS = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ?? "0x69e539684EE48F71eCDAd58618d8e8a2423E279d"
) as `0x${string}`;

const BLUE_ADDRESS = "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as const;

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
  { name: "totalStaked", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { name: "totalCreditsAccrued", type: "function", stateMutability: "view",
    inputs: [{ name: "user", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBlue(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

const TIERS = [
  { name: "None",    min: 0,          color: "#475569", credits: 0    },
  { name: "Starter", min: 500_000,    color: "#4FC3F7", credits: 500  },
  { name: "Pro",     min: 2_000_000,  color: "#A78BFA", credits: 2000 },
  { name: "Max",     min: 10_000_000, color: "#F59E0B", credits: 9999 },
];

function getTier(blue: number) {
  if (blue >= 10_000_000) return TIERS[3];
  if (blue >= 2_000_000)  return TIERS[2];
  if (blue >= 500_000)    return TIERS[1];
  return TIERS[0];
}

// ── Quick action cards ────────────────────────────────────────────────────────

const ACTIONS = [
  { href: "/app/chat",      label: "Blue Chat",   sub: "AI agent · tools · x402", color: "#4FC3F7",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 9.75a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H8.25m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0H12m4.125 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 0 1 .778-.332 48.294 48.294 0 0 0 5.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" /></svg> },
  { href: "/app/rewards",   label: "Stake",       sub: "Stake BLUE → credits + USDC", color: "#4FC3F7",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z" /></svg> },
  { href: "/app/market",    label: "Market",      sub: "AI signals · Build/Risk alerts", color: "#A78BFA",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18 9 11.25l4.306 4.306a11.95 11.95 0 0 1 5.814-5.518l2.74-1.22m0 0-5.94-2.281m5.94 2.28-2.28 5.941" /></svg> },
  { href: "/app/sentinel",  label: "Sentinel",    sub: "Onchain security monitor", color: "#34D399",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg> },
  { href: "/app/approvals", label: "Approvals",   sub: "Manage wallet approvals", color: "#F59E0B",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg> },
  { href: "/app/score",     label: "Score",       sub: "Builder & Agent reputation", color: "#F472B6",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z" /></svg> },
  { href: "/app/terminal",  label: "Terminal",    sub: "CLI power interface", color: "#94A3B8",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z" /></svg> },
  { href: "/app/hub",       label: "Hub",         sub: "34 collab tools · pay-per-use", color: "#60A5FA",
    icon: <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" /></svg> },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AppDashboard() {
  const { address, isConnected } = useAccount();

  const { data: stakeInfo } = useReadContract({
    address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stakeInfo",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: totalCredits } = useReadContract({
    address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "totalCreditsAccrued",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });
  const { data: globalStaked } = useReadContract({
    address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "totalStaked",
  });
  const { data: blueBalance } = useReadContract({
    address: BLUE_ADDRESS, abi: ERC20_ABI, functionName: "balanceOf",
    args: address ? [address] : undefined, query: { enabled: !!address },
  });

  const stakedWei    = stakeInfo?.[0] ?? 0n;
  const dailyCr      = stakeInfo?.[2] ?? 0n;
  const pendingUSDC  = stakeInfo?.[4] ?? 0n;
  const staked       = Number(formatUnits(stakedWei, 18));
  const tier         = getTier(staked);
  const walletBal    = blueBalance ? Number(formatUnits(blueBalance, 18)) : 0;
  const totalCr      = totalCredits ? Number(totalCredits) : 0;
  const lowCredits   = isConnected && totalCr < 20 && staked === 0;

  return (
    <div className="relative h-full overflow-y-auto bg-[#050508] text-white font-mono">

      {/* Ambient glow */}
      <div className="pointer-events-none overflow-hidden absolute inset-x-0 top-0 h-[300px]">
        <div className="absolute inset-0"
          style={{ background: "radial-gradient(ellipse 80% 50% at 50% -10%, #4FC3F714 0%, transparent 70%)" }} />
      </div>

      {/* Page header */}
      <div className="relative flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E] shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
          <p className="text-xs text-[#4FC3F7] tracking-widest">// DASHBOARD</p>
          <p className="text-[10px] text-slate-700 hidden sm:block">Blue Agent · Base Mainnet</p>
        </div>
        {globalStaked && (
          <span className="text-[10px] text-slate-600">
            {fmtBlue(globalStaked)} BLUE staked globally
          </span>
        )}
      </div>

      <div className="relative px-6 py-8 max-w-4xl mx-auto">

        {/* ── NOT CONNECTED ── */}
        {!isConnected && (
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-12 text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-[#4FC3F710] border border-[#4FC3F720] flex items-center justify-center mx-auto mb-6">
              <svg className="w-7 h-7 text-[#4FC3F7]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 0 0-2.25-2.25H15a3 3 0 1 1-6 0H5.25A2.25 2.25 0 0 0 3 12m18 0v6a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 9m18 0V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v3" />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-2">Connect your wallet</h2>
            <p className="text-slate-500 text-sm mb-8 max-w-xs mx-auto">
              Connect to see your credits, staking tier, and USDC yield
            </p>
            <ConnectButton label="Connect Wallet" />
            <p className="text-[10px] text-slate-700 mt-4">Base Mainnet · Smart Wallet supported</p>
          </div>
        )}

        {/* ── CONNECTED: Stats ── */}
        {isConnected && (
          <>
            {/* Low credits banner */}
            {lowCredits && (
              <div className="mb-6 flex items-center justify-between rounded-xl border border-[#F59E0B]/30 bg-[#F59E0B]/5 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="text-[#F59E0B]">⚠</span>
                  <span className="text-sm text-[#F59E0B]">Low credits — stake $BLUEAGENT to unlock unlimited access</span>
                </div>
                <Link href="/app/rewards"
                  className="text-xs font-semibold text-[#F59E0B] border border-[#F59E0B]/30 px-3 py-1.5 rounded-lg hover:bg-[#F59E0B]/10 transition-all shrink-0">
                  Stake Now →
                </Link>
              </div>
            )}

            {/* Stats row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              {[
                { label: "STAKED", value: fmtBlue(stakedWei), sub: "BLUE", color: tier.color },
                { label: "TIER", value: tier.name === "None" ? "—" : tier.name, sub: tier.name === "None" ? "stake to unlock" : "active", color: tier.color },
                { label: "CREDITS / DAY", value: Number(dailyCr).toLocaleString(), sub: "per day", color: "#4FC3F7" },
                { label: "USDC YIELD", value: `$${(Number(pendingUSDC) / 1e6).toFixed(4)}`, sub: "pending", color: "#22C55E" },
              ].map(s => (
                <div key={s.label} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5">
                  <div className="text-[10px] text-slate-600 tracking-widest mb-2">{s.label}</div>
                  <div className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-[10px] text-slate-600 mt-1">{s.sub}</div>
                </div>
              ))}
            </div>

            {/* Tier progress */}
            {staked > 0 && (
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-6 py-4 mb-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[10px] text-slate-600 tracking-widest">STAKING TIER</span>
                  <span className="text-[10px] font-bold" style={{ color: tier.color }}>{tier.name}</span>
                </div>
                <div className="flex gap-2">
                  {TIERS.slice(1).map(t => (
                    <div key={t.name} className="flex-1 text-center">
                      <div
                        className="h-1.5 rounded-full mb-1"
                        style={{ background: staked >= t.min ? t.color : "#1A1A2E" }}
                      />
                      <span className="text-[9px]" style={{ color: staked >= t.min ? t.color : "#334155" }}>
                        {t.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wallet info */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-6 py-4 mb-6 flex flex-wrap items-center gap-4">
              <div>
                <div className="text-[10px] text-slate-600 tracking-widest mb-1">WALLET</div>
                <div className="text-sm text-white">{address?.slice(0, 8)}…{address?.slice(-6)}</div>
              </div>
              <div className="w-px h-8 bg-[#1A1A2E] hidden sm:block" />
              <div>
                <div className="text-[10px] text-slate-600 tracking-widest mb-1">BLUE BALANCE</div>
                <div className="text-sm text-[#4FC3F7]">{walletBal >= 1000 ? fmtBlue(blueBalance ?? 0n) : walletBal.toFixed(0)} BLUE</div>
              </div>
              <div className="w-px h-8 bg-[#1A1A2E] hidden sm:block" />
              <div>
                <div className="text-[10px] text-slate-600 tracking-widest mb-1">TOTAL CREDITS EARNED</div>
                <div className="text-sm text-white">{totalCr < 1 ? totalCr.toFixed(4) : totalCr.toFixed(2)}</div>
              </div>
              <Link href="/app/rewards" className="ml-auto text-xs text-[#4FC3F7] hover:underline shrink-0">
                Manage stake →
              </Link>
            </div>
          </>
        )}

        {/* ── Action grid — always visible ── */}
        <div>
          <p className="text-[10px] text-slate-600 tracking-widest mb-4">QUICK ACCESS</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {ACTIONS.map(a => (
              <Link
                key={a.href}
                href={a.href}
                className="group rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 hover:border-[#4FC3F7]/20 transition-all"
              >
                <div className="flex items-center gap-2 mb-3" style={{ color: a.color }}>
                  {a.icon}
                  <span className="text-sm font-semibold">{a.label}</span>
                </div>
                <p className="text-[10px] text-slate-600 leading-relaxed">{a.sub}</p>
                <div className="mt-3 text-[10px] group-hover:text-white transition-colors" style={{ color: a.color }}>
                  Open →
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Footer links */}
        <div className="mt-8 pt-6 border-t border-[#1A1A2E] flex flex-wrap items-center gap-4 text-[10px] text-slate-700">
          <a href="https://basescan.org/address/0x69e539684EE48F71eCDAd58618d8e8a2423E279d"
            target="_blank" rel="noopener noreferrer" className="hover:text-slate-500 transition-colors">
            Staking Contract ↗
          </a>
          <a href="https://basescan.org/token/0xf895783b2931c919955e18b5e3343e7c7c456ba3"
            target="_blank" rel="noopener noreferrer" className="hover:text-slate-500 transition-colors">
            $BLUEAGENT Token ↗
          </a>
          <Link href="/docs" className="hover:text-slate-500 transition-colors">Docs</Link>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="w-1 h-1 rounded-full bg-[#22C55E]" />
            <span>Base Mainnet</span>
          </span>
        </div>

      </div>
    </div>
  );
}
