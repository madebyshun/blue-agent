"use client";

import { useState } from "react";
import { useAccount, useReadContracts, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { formatUnits } from "viem";
import { ConnectButton } from "@/components/ConnectModal";

// ── Known tokens on Base ──────────────────────────────────────────────────────

const TOKENS = [
  { symbol: "USDC",  address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`, decimals: 6  },
  { symbol: "WETH",  address: "0x4200000000000000000000000000000000000006" as `0x${string}`, decimals: 18 },
  { symbol: "BLUE",  address: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as `0x${string}`, decimals: 18 },
  { symbol: "cbBTC", address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf" as `0x${string}`, decimals: 8  },
  { symbol: "AERO",  address: "0x940181a94A35A4569E4529A3CDfB74e38FD98631" as `0x${string}`, decimals: 18 },
];

// ── Known spenders on Base ────────────────────────────────────────────────────

const SPENDERS = [
  { name: "Uniswap v3 Router",   address: "0x2626664c2603336E57B271c5C0b26F421741e481" as `0x${string}` },
  { name: "Uniswap Universal",   address: "0x6Cb442acF35158D5eDa88fe602221b67A400Be3e" as `0x${string}` },
  { name: "Aerodrome Router",    address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43" as `0x${string}` },
  { name: "Aave v3 Pool",        address: "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5" as `0x${string}` },
  { name: "Blue Staking",        address: (process.env.NEXT_PUBLIC_STAKING_CONTRACT ?? "0x69e539684EE48F71eCDAd58618d8e8a2423E279d") as `0x${string}` },
];

const ERC20_ABI = [
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const MAX_UINT256 = 2n ** 256n - 1n;

function fmtAllowance(amount: bigint, decimals: number): string {
  if (amount === 0n) return "0";
  if (amount >= MAX_UINT256 - 1000000n) return "∞ Unlimited";
  const n = Number(formatUnits(amount, decimals));
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(2) + "K";
  return n.toFixed(2);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const { address, isConnected } = useAccount();
  const [revoking, setRevoking] = useState<string | null>(null);
  const [revokedSet, setRevokedSet] = useState<Set<string>>(new Set());

  // Build all allowance read contracts
  const contracts = TOKENS.flatMap(token =>
    SPENDERS.map(spender => ({
      address: token.address,
      abi: ERC20_ABI,
      functionName: "allowance" as const,
      args: address ? [address, spender.address] : undefined,
    }))
  );

  const { data: allowances, refetch } = useReadContracts({
    contracts,
    query: { enabled: !!address },
  });

  const { writeContract, data: txHash, isPending } = useWriteContract();
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  // After revoke succeeds, refresh
  if (isSuccess && revoking) {
    setRevokedSet(prev => new Set([...prev, revoking]));
    setRevoking(null);
    refetch();
  }

  function revoke(tokenAddr: `0x${string}`, spenderAddr: `0x${string}`, key: string) {
    setRevoking(key);
    writeContract({
      address: tokenAddr,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [spenderAddr, 0n],
    });
  }

  // Build display rows — filter to non-zero
  const rows: { token: typeof TOKENS[0]; spender: typeof SPENDERS[0]; amount: bigint; key: string }[] = [];
  TOKENS.forEach((token, ti) => {
    SPENDERS.forEach((spender, si) => {
      const idx = ti * SPENDERS.length + si;
      const raw = allowances?.[idx]?.result;
      const amount = typeof raw === "bigint" ? raw : 0n;
      const key = `${token.symbol}-${spender.name}`;
      rows.push({ token, spender, amount, key });
    });
  });

  const activeRows = rows.filter(r => r.amount > 0n && !revokedSet.has(r.key));
  const isBusy = isPending || isConfirming;

  return (
    <div className="relative h-full overflow-y-auto bg-[#050508] text-white font-mono">

      {/* Page header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-[#1A1A2E] shrink-0">
        <div className="flex items-center gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#F59E0B] animate-pulse" />
          <p className="text-xs text-[#F59E0B] tracking-widest">// APPROVALS</p>
          <p className="text-[10px] text-slate-700 hidden sm:block">Manage ERC-20 token approvals · Base Mainnet</p>
        </div>
        {isConnected && activeRows.length > 0 && (
          <span className="text-[10px] text-[#F59E0B]">{activeRows.length} active approval{activeRows.length !== 1 ? "s" : ""}</span>
        )}
      </div>

      <div className="px-6 py-8 max-w-3xl mx-auto">

        {!isConnected ? (
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-[#F59E0B]/10 border border-[#F59E0B]/20 flex items-center justify-center mx-auto mb-6">
              <svg className="w-7 h-7 text-[#F59E0B]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold mb-2">Connect to scan approvals</h2>
            <p className="text-slate-500 text-sm mb-8 max-w-xs mx-auto">
              See which contracts can spend your tokens. Revoke any you don&apos;t need.
            </p>
            <ConnectButton label="Connect Wallet" />
          </div>
        ) : (
          <>
            {/* Info banner */}
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-5 py-4 mb-6 flex items-start gap-3">
              <svg className="w-4 h-4 text-[#F59E0B] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
              </svg>
              <div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Scanning <span className="text-white">{TOKENS.length} tokens</span> × <span className="text-white">{SPENDERS.length} protocols</span> on Base.
                  Revoking an approval sends <span className="text-[#4FC3F7]">approve(spender, 0)</span> on-chain.
                </p>
              </div>
            </div>

            {/* Approval list */}
            {!allowances ? (
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-8 text-center">
                <div className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse mx-auto mb-3" />
                <p className="text-xs text-slate-600">Scanning approvals…</p>
              </div>
            ) : activeRows.length === 0 ? (
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-8 text-center">
                <div className="text-2xl mb-3">✅</div>
                <p className="text-sm text-white mb-1">No active approvals found</p>
                <p className="text-[10px] text-slate-600">Across {TOKENS.length} tokens and {SPENDERS.length} known protocols</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Table header */}
                <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 px-4 pb-2 text-[10px] text-slate-600 tracking-widest">
                  <span>TOKEN</span>
                  <span>APPROVED TO</span>
                  <span>AMOUNT</span>
                  <span>ACTION</span>
                </div>

                {activeRows.map(row => {
                  const isUnlimited = row.amount >= MAX_UINT256 - 1000000n;
                  const isThisRevoking = revoking === row.key && isBusy;
                  return (
                    <div
                      key={row.key}
                      className="grid grid-cols-[1fr_1fr_1fr_auto] gap-4 items-center rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] px-4 py-4"
                    >
                      {/* Token */}
                      <div>
                        <span className="text-sm font-semibold text-white">{row.token.symbol}</span>
                        <p className="text-[9px] text-slate-700 mt-0.5">{row.token.address.slice(0, 10)}…</p>
                      </div>

                      {/* Spender */}
                      <div>
                        <span className="text-xs text-slate-300">{row.spender.name}</span>
                        <p className="text-[9px] text-slate-700 mt-0.5">{row.spender.address.slice(0, 10)}…</p>
                      </div>

                      {/* Amount */}
                      <div>
                        <span
                          className="text-xs font-semibold"
                          style={{ color: isUnlimited ? "#EF4444" : "#F59E0B" }}
                        >
                          {fmtAllowance(row.amount, row.token.decimals)}
                        </span>
                        {isUnlimited && (
                          <p className="text-[9px] text-red-500/70 mt-0.5">high risk</p>
                        )}
                      </div>

                      {/* Revoke */}
                      <button
                        onClick={() => revoke(row.token.address, row.spender.address, row.key)}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-all disabled:opacity-40"
                        style={{
                          color: "#EF4444",
                          borderColor: "#EF444430",
                          background: "#EF44440a",
                        }}
                      >
                        {isThisRevoking ? "…" : "Revoke"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Token / spender legend */}
            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4">
                <p className="text-[10px] text-slate-600 tracking-widest mb-3">TOKENS SCANNED</p>
                <div className="space-y-1">
                  {TOKENS.map(t => (
                    <div key={t.symbol} className="flex items-center justify-between">
                      <span className="text-xs text-white">{t.symbol}</span>
                      <span className="text-[10px] text-slate-700">{t.address.slice(0, 10)}…</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-4">
                <p className="text-[10px] text-slate-600 tracking-widest mb-3">PROTOCOLS CHECKED</p>
                <div className="space-y-1">
                  {SPENDERS.map(s => (
                    <div key={s.name} className="flex items-center justify-between">
                      <span className="text-xs text-white">{s.name}</span>
                      <span className="text-[10px] text-slate-700">{s.address.slice(0, 10)}…</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
