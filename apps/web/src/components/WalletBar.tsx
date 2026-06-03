"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  fetchBlueBalance,
  getTierInfo,
  refreshCreditsIfNeeded,
  getCredits,
  TierInfo,
} from "@/lib/credits";

const BLUE_ADDRESS = "0xf895783b2931c919955e18b5e3343e7c7c456ba3";

interface WalletBarProps {
  onWalletChange?: (address: string | undefined, tier: TierInfo) => void;
  refreshTrigger?: number; // increment to force balance re-fetch
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
function fmtBlue(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + "K";
  return n.toFixed(0);
}

export default function WalletBar({ onWalletChange, refreshTrigger = 0 }: WalletBarProps) {
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  const [tier,      setTier]      = useState<TierInfo>({ tier: "Starter", blueBalance: 0, dailyCr: 200, discount: 0, color: "#4FC3F7" });
  const [credits,   setCredits]   = useState(0);
  const [showPanel, setShowPanel] = useState(false);

  // Fetch BLUE balance + set tier whenever address or refreshTrigger changes
  useEffect(() => {
    if (!address) {
      const t = { tier: "Starter" as const, blueBalance: 0, dailyCr: 200, discount: 0, color: "#4FC3F7" };
      setTier(t);
      const result = refreshCreditsIfNeeded(0, undefined);
      setCredits(result.credits);
      onWalletChange?.(undefined, t);
      return;
    }
    (async () => {
      const balance = await fetchBlueBalance(address);
      const t       = getTierInfo(balance);
      const result  = refreshCreditsIfNeeded(balance, address);
      setTier(t);
      setCredits(result.credits);
      onWalletChange?.(address, t);
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, refreshTrigger]);

  // Refresh credits when panel opens
  useEffect(() => {
    if (showPanel && address) setCredits(getCredits(address) ?? 0);
  }, [showPanel, address]);

  // ── Not connected ──────────────────────────────────────────────────────────
  if (!isConnected || !address) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <button
          onClick={() => connect({ connector: injected() })}
          disabled={isConnecting}
          className="font-mono text-xs font-semibold px-3 py-1.5 rounded border transition-all disabled:opacity-60"
          style={{ borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F718" }}
        >
          {isConnecting ? "Connecting…" : "Connect Wallet"}
        </button>
        {!isConnecting && (
          <span className="font-mono text-[10px] text-slate-600 px-0.5">→ 200 cr/day free</span>
        )}
      </div>
    );
  }

  // ── Connected ──────────────────────────────────────────────────────────────
  return (
    <div className="relative">
      <button
        onClick={() => setShowPanel((p) => !p)}
        className="flex items-center gap-2 font-mono text-xs px-3 py-1.5 rounded border border-[#1A1A2E] hover:border-[#4FC3F7]/30 transition-all bg-[#0D0D14]"
      >
        <span className="w-2 h-2 rounded-full shrink-0"
          style={{ background: tier.color, boxShadow: `0 0 6px ${tier.color}` }} />
        <span className="text-slate-300">{shortAddr(address)}</span>
        <span className="text-slate-600">·</span>
        <span style={{ color: "#4FC3F7" }}>{credits} cr</span>
      </button>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-[#1A1A2E] bg-[#0D0D14] p-4 z-50 shadow-2xl">
          {/* Tier badge */}
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded"
              style={{ background: `${tier.color}20`, color: tier.color, border: `1px solid ${tier.color}40` }}>
              {tier.tier}
            </span>
            <span className="font-mono text-xs text-slate-500">{shortAddr(address)}</span>
          </div>

          {/* BLUE balance */}
          <div className="mb-3 p-2 rounded-lg bg-[#1A1A2E] border border-[#2A2A4E]">
            <div className="font-mono text-[10px] text-slate-500 mb-0.5">$BLUEAGENT balance</div>
            <div className="font-mono text-sm font-bold" style={{ color: tier.color }}>
              {fmtBlue(tier.blueBalance)} BLUE
            </div>
            {tier.discount > 0 && (
              <div className="font-mono text-[10px] text-green-400 mt-0.5">
                {Math.round(tier.discount * 100)}% discount on chat
              </div>
            )}
          </div>

          {/* Credit balance */}
          <div className="mb-3 p-2 rounded-lg bg-[#1A1A2E] border border-[#2A2A4E]">
            <div className="font-mono text-[10px] text-slate-500 mb-0.5">Chat credits</div>
            <div className="font-mono text-sm font-bold text-[#4FC3F7]">{credits}</div>
            <div className="font-mono text-[10px] text-slate-600 mt-0.5">
              {credits === 0 ? "Out of credits — get more BLUE" : "Used for every chat message"}
            </div>
          </div>

          {/* Next tier hint */}
          {tier.nextTier && (
            <div className="mb-3 font-mono text-[10px] text-slate-500">
              Hold {fmtBlue(tier.nextTier.need)} more BLUE → unlock {tier.nextTier.name}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <a href={`https://app.uniswap.org/swap?outputCurrency=${BLUE_ADDRESS}&chain=base`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] text-center py-1.5 rounded-lg border transition-all"
              style={{ borderColor: "#F59E0B", color: "#F59E0B", background: "#F59E0B10" }}>
              Get more BLUE →
            </a>
            <button onClick={() => { disconnect(); setShowPanel(false); }}
              className="font-mono text-[11px] text-slate-500 hover:text-slate-300 transition-colors py-1">
              Disconnect
            </button>
          </div>
        </div>
      )}

      {showPanel && (
        <div className="fixed inset-0 z-40" onClick={() => setShowPanel(false)} />
      )}
    </div>
  );
}
