"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { injected } from "wagmi/connectors";
import {
  fetchBlueBalance,
  getTierInfo,
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
function fmtCredits(n: number) {
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString();
}

export default function WalletBar({ onWalletChange, refreshTrigger = 0 }: WalletBarProps) {
  const { address, isConnected } = useAccount();
  const { connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();

  const [tier,      setTier]      = useState<TierInfo>({ tier: "Starter", blueBalance: 0, dailyCr: 200, discount: 0, color: "#4FC3F7" });
  const [credits,   setCredits]   = useState(0);
  // Ledger balance + accrual rate fetched from /api/credits/balance/[address].
  // Connected wallets see the on-chain ledger number (same source as the
  // dashboard + settings panel); guest sessions still see localStorage.
  const [ledger,    setLedger]    = useState<{ balance: number; accruedDaily: number } | null>(null);
  const [copied,    setCopied]    = useState(false);
  const [showPanel, setShowPanel] = useState(false);

  // Fetch BLUE balance + set tier whenever address or refreshTrigger changes.
  // Also re-pull the ledger so the popup's credit number stays in sync with
  // the dashboard's BALANCE card (no more "1,237 in Settings vs 40 here").
  useEffect(() => {
    if (!address) {
      const t = { tier: "Starter" as const, blueBalance: 0, dailyCr: 200, discount: 0, color: "#4FC3F7" };
      setTier(t);
      setCredits(getCredits(undefined) ?? 0);
      setLedger(null);
      onWalletChange?.(undefined, t);
      return;
    }
    (async () => {
      const balance = await fetchBlueBalance(address);
      const t       = getTierInfo(balance);
      setTier(t);
      // localStorage credit value still kept around for the guest-path UI
      // (pre-wallet-connect connector flow) — connected users render off
      // `ledger` below, not this number.
      setCredits(Math.max(0, getCredits(address) ?? 0));
      onWalletChange?.(address, t);

      // Pull the unified ledger — same endpoint the dashboard hits.
      try {
        const res = await fetch(`/api/credits/balance/${address}`);
        const d   = await res.json();
        const bal = Number(d?.balance);
        if (Number.isFinite(bal)) {
          setLedger({ balance: bal, accruedDaily: Math.max(0, t.dailyCr === -1 ? 9999 : t.dailyCr) });
        }
      } catch { /* leave previous ledger in place */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, refreshTrigger]);

  // Refresh credits when panel opens
  useEffect(() => {
    if (showPanel && address) {
      setCredits(getCredits(address) ?? 0);
      // Refresh ledger too — common to open the panel right after a chat,
      // so the displayed balance reflects the just-spent value.
      fetch(`/api/credits/balance/${address}`)
        .then(r => r.json())
        .then(d => {
          const bal = Number(d?.balance);
          if (Number.isFinite(bal)) setLedger(l => l ? { ...l, balance: bal } : { balance: bal, accruedDaily: 0 });
        })
        .catch(() => null);
    }
  }, [showPanel, address]);

  function copyAddress() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

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
        <span style={{ color: "#4FC3F7" }}>{fmtCredits(ledger?.balance ?? credits)} cr</span>
      </button>

      {showPanel && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-2xl border border-[#1A1A2E] bg-[#0A0A12] p-4 z-50 shadow-2xl">
          {/* Header: tier pill + clickable address (copy to clipboard) */}
          <div className="flex items-center justify-between mb-4">
            <span className="font-mono text-[10px] font-bold px-2 py-1 rounded-md tracking-wider"
              style={{ background: `${tier.color}15`, color: tier.color, border: `1px solid ${tier.color}30` }}>
              {tier.tier.toUpperCase()}
            </span>
            <button
              onClick={copyAddress}
              className="font-mono text-[10px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5"
            >
              <span>{shortAddr(address)}</span>
              <span className={copied ? "text-green-400" : "text-slate-700"}>
                {copied ? "✓ copied" : "copy"}
              </span>
            </button>
          </div>

          {/* Stats: two stacked rows — single source of truth = ledger balance */}
          <div className="rounded-xl bg-[#050508] border border-[#1A1A2E] divide-y divide-[#1A1A2E] mb-3">
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="font-mono text-[10px] text-slate-500 tracking-wider">CREDITS</span>
              <div className="text-right">
                <span className="font-mono text-base font-bold tabular-nums" style={{ color: "#4FC3F7" }}>
                  {fmtCredits(ledger?.balance ?? credits)}
                </span>
                {tier.dailyCr > 0 && (
                  <span className="font-mono text-[10px] text-slate-600 ml-1.5">
                    +{tier.dailyCr === -1 ? "∞" : tier.dailyCr.toLocaleString()}/day
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5">
              <span className="font-mono text-[10px] text-slate-500 tracking-wider">$BLUEAGENT</span>
              <div className="text-right">
                <span className="font-mono text-base font-bold tabular-nums" style={{ color: tier.color }}>
                  {fmtBlue(tier.blueBalance)}
                </span>
                {tier.discount > 0 && (
                  <span className="font-mono text-[10px] text-green-400 ml-1.5">
                    {Math.round(tier.discount * 100)}% off
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Next tier hint — same wording as SettingsPanel for consistency */}
          {tier.nextTier && (
            <p className="font-mono text-[10px] text-slate-600 mb-3 leading-relaxed px-1">
              Stake{" "}
              <span className="text-slate-400">
                {tier.nextTier.need >= 1_000_000
                  ? `${(tier.nextTier.need / 1_000_000).toFixed(1)}M`
                  : `${(tier.nextTier.need / 1_000).toFixed(0)}K`} BLUE
              </span>
              {" "}→ earn{" "}
              <span style={{ color: tier.color }}>
                {tier.nextTier.dailyCr === -1 ? "∞" : tier.nextTier.dailyCr.toLocaleString()} cr/day
              </span>
            </p>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <a href={`https://app.uniswap.org/swap?outputCurrency=${BLUE_ADDRESS}&chain=base`}
              target="_blank" rel="noopener noreferrer"
              className="font-mono text-[11px] font-semibold text-center py-2 rounded-xl transition-all hover:opacity-90"
              style={{ borderColor: "#F59E0B30", color: "#F59E0B", background: "#F59E0B12", border: "1px solid #F59E0B30" }}>
              Get more BLUE →
            </a>
            <button onClick={() => { disconnect(); setShowPanel(false); }}
              className="font-mono text-[10px] text-slate-600 hover:text-red-400 transition-colors py-1">
              Disconnect wallet
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
