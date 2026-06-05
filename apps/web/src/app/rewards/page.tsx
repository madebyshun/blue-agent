"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { ConnectButton } from "@/components/ConnectModal";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { parseUnits, formatUnits } from "viem";

// ── Contract addresses ────────────────────────────────────────────────────────

const STAKING_ADDRESS = (
  process.env.NEXT_PUBLIC_STAKING_CONTRACT ??
  "0x69e539684EE48F71eCDAd58618d8e8a2423E279d"
) as `0x${string}`;

const BLUE_ADDRESS = "0xf895783b2931c919955e18b5e3343e7c7c456ba3" as const;

// ── ABIs ──────────────────────────────────────────────────────────────────────

const ERC20_ABI = [
  { name: "balanceOf", type: "function", stateMutability: "view",
    inputs: [{ name: "account", type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "allowance", type: "function", stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ type: "uint256" }] },
  { name: "approve", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }] },
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
  { name: "totalStaked", type: "function", stateMutability: "view",
    inputs: [], outputs: [{ type: "uint256" }] },
  { name: "stakes", type: "function", stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "amount",             type: "uint256" },
      { name: "stakedAt",           type: "uint256" },
      { name: "lastAccruedAt",      type: "uint256" },
      { name: "accruedCredits",     type: "uint256" },
      { name: "unstakeRequestedAt", type: "uint256" },
      { name: "yieldDebt",          type: "uint256" },
    ] },
  { name: "stake",          type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }], outputs: [] },
  { name: "requestUnstake", type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "cancelUnstake",  type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "unstake",        type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
  { name: "claimYield",     type: "function", stateMutability: "nonpayable",
    inputs: [], outputs: [] },
] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBlue(wei: bigint): string {
  const n = Number(formatUnits(wei, 18));
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(0) + "K";
  return n.toFixed(0);
}

function formatCooldown(secs: bigint): string {
  const s = Number(secs);
  if (s <= 0) return "Ready";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

// ── Tiers ─────────────────────────────────────────────────────────────────────

const TIERS = [
  { name: "Starter", blue: 500_000,    credits: 500,  color: "#4FC3F7" },
  { name: "Pro",     blue: 2_000_000,  credits: 2000, color: "#A78BFA" },
  { name: "Max",     blue: 10_000_000, credits: 9999, color: "#F59E0B" },
];

function getTier(blueWei: bigint) {
  const blue = Number(formatUnits(blueWei, 18));
  if (blue >= 10_000_000) return TIERS[2];
  if (blue >= 2_000_000)  return TIERS[1];
  if (blue >= 500_000)    return TIERS[0];
  return null;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RewardsPage() {
  const { address, isConnected } = useAccount();
  const [stakeInput, setStakeInput] = useState("");
  const [txStatus, setTxStatus] = useState<string | null>(null);

  // ── Reads ───────────────────────────────────────────────────────────────────

  const { data: blueBalance, refetch: refetchBalance } = useReadContract({
    address: BLUE_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: BLUE_ADDRESS,
    abi: ERC20_ABI,
    functionName: "allowance",
    args: address ? [address, STAKING_ADDRESS] : undefined,
    query: { enabled: !!address },
  });

  const { data: stakeInfo, refetch: refetchStakeInfo } = useReadContract({
    address: STAKING_ADDRESS,
    abi: STAKING_ABI,
    functionName: "stakeInfo",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: totalCredits, refetch: refetchCredits } = useReadContract({
    address: STAKING_ADDRESS,
    abi: STAKING_ABI,
    functionName: "totalCreditsAccrued",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: stakeRaw, refetch: refetchStakeRaw } = useReadContract({
    address: STAKING_ADDRESS,
    abi: STAKING_ABI,
    functionName: "stakes",
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  });

  const { data: globalStaked } = useReadContract({
    address: STAKING_ADDRESS,
    abi: STAKING_ABI,
    functionName: "totalStaked",
  });

  // ── Writes ──────────────────────────────────────────────────────────────────

  const { writeContract, data: txHash, isPending: isWriting } = useWriteContract();
  const { isLoading: isConfirming, isSuccess: txSuccess } =
    useWaitForTransactionReceipt({ hash: txHash });

  const refetchAll = useCallback(() => {
    refetchBalance();
    refetchAllowance();
    refetchStakeInfo();
    refetchCredits();
    refetchStakeRaw();
  }, [refetchBalance, refetchAllowance, refetchStakeInfo, refetchCredits, refetchStakeRaw]);

  useEffect(() => {
    if (txSuccess) {
      setTxStatus("✅ Transaction confirmed");
      refetchAll();
      setStakeInput("");
      setTimeout(() => setTxStatus(null), 4000);
    }
  }, [txSuccess, refetchAll]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const stakedAmount      = stakeInfo?.[0] ?? 0n;
  const dailyCredits      = stakeInfo?.[2] ?? 0n;
  const cooldownSecs      = stakeInfo?.[3] ?? 0n;
  const pendingUsdc       = stakeInfo?.[4] ?? 0n;
  const unstakeReqAt      = stakeRaw?.[4] ?? 0n;
  const hasPendingUnstake = unstakeReqAt > 0n;
  const canUnstake        = hasPendingUnstake && cooldownSecs === 0n;

  const stakeAmountWei = stakeInput
    ? (() => { try { return parseUnits(stakeInput, 18); } catch { return 0n; } })()
    : 0n;
  const needsApproval = (allowance ?? 0n) < stakeAmountWei && stakeAmountWei > 0n;
  const tier = getTier(stakedAmount);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function handleApprove() {
    setTxStatus("Approving BLUE...");
    writeContract({ address: BLUE_ADDRESS, abi: ERC20_ABI, functionName: "approve",
      args: [STAKING_ADDRESS, stakeAmountWei] });
  }

  function handleStake() {
    setTxStatus("Staking BLUE...");
    writeContract({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "stake",
      args: [stakeAmountWei] });
  }

  function handleRequestUnstake() {
    setTxStatus("Requesting unstake...");
    writeContract({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "requestUnstake" });
  }

  function handleCancelUnstake() {
    setTxStatus("Cancelling unstake...");
    writeContract({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "cancelUnstake" });
  }

  function handleUnstake() {
    setTxStatus("Unstaking...");
    writeContract({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "unstake" });
  }

  function handleClaimYield() {
    setTxStatus("Claiming USDC yield...");
    writeContract({ address: STAKING_ADDRESS, abi: STAKING_ABI, functionName: "claimYield" });
  }

  const isBusy = isWriting || isConfirming;

  // ── UI ───────────────────────────────────────────────────────────────────────

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8", fontFamily: "system-ui, sans-serif" }}>
      <Navbar />

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 80px" }}>

        {/* Header */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 28 }}>⚡</span>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#fff" }}>
              Blue Chat Rewards
            </h1>
          </div>
          <p style={{ margin: 0, color: "#888", fontSize: 15 }}>
            Stake $BLUEAGENT → earn Blue Chat credits + USDC yield from x402 revenue
          </p>
        </div>

        {/* Tier table */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 32 }}>
          {TIERS.map(t => (
            <div key={t.name} style={{
              background: "#141414",
              border: `1px solid ${tier?.name === t.name ? t.color : "#222"}`,
              borderRadius: 10, padding: "16px 14px",
              boxShadow: tier?.name === t.name ? `0 0 12px ${t.color}22` : "none",
            }}>
              <div style={{ fontSize: 11, color: t.color, fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
                {t.name.toUpperCase()}
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
                {t.credits === 9999 ? "∞ credits" : `${t.credits.toLocaleString()} cr/day`}
              </div>
              <div style={{ fontSize: 12, color: "#666" }}>
                {t.blue >= 1_000_000
                  ? `${(t.blue / 1_000_000).toFixed(0)}M`
                  : `${(t.blue / 1_000).toFixed(0)}K`} BLUE staked
              </div>
            </div>
          ))}
        </div>

        {/* Connect or Dashboard */}
        {!isConnected ? (
          <div style={{
            background: "#141414", border: "1px solid #222",
            borderRadius: 12, padding: 32, textAlign: "center",
          }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>🔗</div>
            <p style={{ color: "#888", marginBottom: 20 }}>
              Connect your wallet to stake BLUE and earn credits
            </p>
            <ConnectButton label="Connect Wallet" />
          </div>
        ) : (
          <>
            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 20 }}>

              {/* Staked */}
              <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>STAKED</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>
                  {formatBlue(stakedAmount)} <span style={{ fontSize: 13, color: "#555" }}>BLUE</span>
                </div>
                {tier ? (
                  <div style={{ fontSize: 12, color: tier.color, marginTop: 4 }}>{tier.name} tier</div>
                ) : stakedAmount > 0n ? (
                  <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>Below Starter</div>
                ) : null}
              </div>

              {/* Credits/day */}
              <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>CREDITS / DAY</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#4FC3F7" }}>
                  {Number(dailyCredits).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  {totalCredits !== undefined
                    ? `${Number(totalCredits).toLocaleString()} total earned`
                    : "—"}
                </div>
              </div>

              {/* USDC Yield */}
              <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>PENDING USDC</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#22C55E" }}>
                  ${(Number(pendingUsdc) / 1e6).toFixed(4)}
                </div>
                {pendingUsdc > 0n && (
                  <button
                    onClick={handleClaimYield}
                    disabled={isBusy}
                    style={{
                      marginTop: 8, padding: "4px 12px", fontSize: 12,
                      background: "#22C55E22", color: "#22C55E",
                      border: "1px solid #22C55E44", borderRadius: 6,
                      cursor: isBusy ? "not-allowed" : "pointer",
                      opacity: isBusy ? 0.5 : 1,
                    }}
                  >
                    Claim USDC
                  </button>
                )}
              </div>

              {/* Wallet balance */}
              <div style={{ background: "#141414", border: "1px solid #222", borderRadius: 10, padding: "18px 20px" }}>
                <div style={{ fontSize: 11, color: "#666", letterSpacing: 1, marginBottom: 6 }}>WALLET BALANCE</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#fff" }}>
                  {blueBalance !== undefined ? formatBlue(blueBalance) : "—"}{" "}
                  <span style={{ fontSize: 13, color: "#555" }}>BLUE</span>
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                  {globalStaked !== undefined ? `${formatBlue(globalStaked)} total staked globally` : ""}
                </div>
              </div>
            </div>

            {/* Stake form */}
            {!hasPendingUnstake && (
              <div style={{
                background: "#141414", border: "1px solid #222",
                borderRadius: 12, padding: 24, marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 14 }}>
                  Stake BLUE
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      type="number"
                      placeholder="Amount (e.g. 500000)"
                      value={stakeInput}
                      onChange={e => setStakeInput(e.target.value)}
                      style={{
                        width: "100%", padding: "10px 80px 10px 14px", fontSize: 14,
                        background: "#0d0d0d", border: "1px solid #2a2a2a",
                        borderRadius: 8, color: "#fff", outline: "none",
                        boxSizing: "border-box",
                      }}
                    />
                    {blueBalance !== undefined && blueBalance > 0n && (
                      <button
                        onClick={() => setStakeInput(formatUnits(blueBalance, 18))}
                        style={{
                          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                          padding: "2px 8px", fontSize: 11, background: "#1e1e1e",
                          border: "1px solid #333", borderRadius: 4, color: "#888", cursor: "pointer",
                        }}
                      >
                        MAX
                      </button>
                    )}
                  </div>
                  <button
                    onClick={needsApproval ? handleApprove : handleStake}
                    disabled={isBusy || !stakeInput || stakeAmountWei === 0n}
                    style={{
                      padding: "10px 20px", fontSize: 14, fontWeight: 600,
                      background: needsApproval ? "#F59E0B" : "#4FC3F7",
                      color: "#000", border: "none", borderRadius: 8,
                      cursor: isBusy || !stakeInput ? "not-allowed" : "pointer",
                      opacity: isBusy || !stakeInput ? 0.5 : 1,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {isBusy ? "..." : needsApproval ? "Approve BLUE" : "Stake"}
                  </button>
                </div>

                {/* Quick presets */}
                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  {[{ label: "500K", val: "500000" }, { label: "2M", val: "2000000" }, { label: "10M", val: "10000000" }].map(p => (
                    <button
                      key={p.label}
                      onClick={() => setStakeInput(p.val)}
                      style={{
                        padding: "4px 10px", fontSize: 11,
                        background: stakeInput === p.val ? "#4FC3F722" : "#1a1a1a",
                        border: `1px solid ${stakeInput === p.val ? "#4FC3F744" : "#2a2a2a"}`,
                        borderRadius: 6, color: stakeInput === p.val ? "#4FC3F7" : "#888",
                        cursor: "pointer",
                      }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Unstake flow */}
            {stakedAmount > 0n && (
              <div style={{
                background: "#141414", border: "1px solid #222",
                borderRadius: 12, padding: 24, marginBottom: 16,
              }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 14 }}>
                  Unstake
                </div>

                {!hasPendingUnstake ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button
                      onClick={handleRequestUnstake}
                      disabled={isBusy}
                      style={{
                        padding: "10px 18px", fontSize: 13, fontWeight: 600,
                        background: "transparent", color: "#ef4444",
                        border: "1px solid #ef444444", borderRadius: 8,
                        cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.5 : 1,
                      }}
                    >
                      Request Unstake
                    </button>
                    <span style={{ fontSize: 12, color: "#555" }}>1-day cooldown — credits stop accruing</span>
                  </div>
                ) : canUnstake ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <button
                      onClick={handleUnstake}
                      disabled={isBusy}
                      style={{
                        padding: "10px 18px", fontSize: 13, fontWeight: 600,
                        background: "#ef444422", color: "#ef4444",
                        border: "1px solid #ef444444", borderRadius: 8,
                        cursor: isBusy ? "not-allowed" : "pointer", opacity: isBusy ? 0.5 : 1,
                      }}
                    >
                      Unstake {formatBlue(stakedAmount)} BLUE
                    </button>
                    <button
                      onClick={handleCancelUnstake}
                      disabled={isBusy}
                      style={{
                        padding: "10px 18px", fontSize: 13,
                        background: "transparent", color: "#888",
                        border: "1px solid #333", borderRadius: 8,
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{
                      padding: "10px 18px", fontSize: 13, color: "#F59E0B",
                      background: "#F59E0B11", border: "1px solid #F59E0B33", borderRadius: 8,
                    }}>
                      ⏳ Cooldown: {formatCooldown(cooldownSecs)}
                    </div>
                    <button
                      onClick={handleCancelUnstake}
                      disabled={isBusy}
                      style={{
                        padding: "10px 18px", fontSize: 13,
                        background: "transparent", color: "#888",
                        border: "1px solid #333", borderRadius: 8,
                        cursor: isBusy ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel Unstake
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Tx status */}
            {(txStatus || isBusy) && (
              <div style={{
                padding: "12px 16px", borderRadius: 8, fontSize: 13,
                background: "#4FC3F711", border: "1px solid #4FC3F733", color: "#4FC3F7",
                marginBottom: 16,
              }}>
                {isConfirming ? "⏳ Confirming transaction on Base..." : txStatus}
              </div>
            )}
          </>
        )}

        {/* How it works */}
        <div style={{
          marginTop: 40, padding: "20px 24px",
          background: "#0f0f0f", borderRadius: 10, border: "1px solid #1a1a1a",
        }}>
          <div style={{ fontSize: 12, color: "#555", lineHeight: 1.9 }}>
            <div style={{ color: "#666", fontWeight: 600, marginBottom: 8, fontSize: 13 }}>How it works</div>
            <div>📌 Stake $BLUEAGENT → credits accrue continuously on-chain (no claiming needed)</div>
            <div>💬 Credits unlock Blue Chat — AI tools, multi-agent consensus, deep research</div>
            <div>💵 20% of x402 API revenue distributed pro-rata to stakers in USDC</div>
            <div>⏳ 1-day cooldown to unstake — credits stop accruing on request</div>
            <div style={{ marginTop: 12 }}>
              <a
                href={`https://basescan.org/address/${STAKING_ADDRESS}`}
                target="_blank" rel="noopener noreferrer"
                style={{ color: "#4FC3F755", textDecoration: "none", fontSize: 11 }}
              >
                Contract: {STAKING_ADDRESS} ↗
              </a>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <div style={{ marginTop: 24, display: "flex", gap: 20, justifyContent: "center" }}>
          <Link href="/chat" style={{ color: "#4FC3F7", fontSize: 13, textDecoration: "none" }}>
            ← Blue Chat
          </Link>
          <Link href="/hub" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>
            Blue Hub →
          </Link>
        </div>

      </div>
    </div>
  );
}
