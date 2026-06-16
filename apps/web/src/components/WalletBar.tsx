"use client";

import { useState, useEffect } from "react";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import {
  fetchBlueBalance,
  getTierInfo,
  getCredits,
  TierInfo,
} from "@/lib/credits";
import { useBasename } from "@/lib/useBasename"; // resolves wallet → shun.base

interface WalletBarProps {
  onWalletChange?: (address: string | undefined, tier: TierInfo) => void;
  refreshTrigger?: number; // increment to force balance re-fetch
}

function shortAddr(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}
function fmtCredits(n: number) {
  if (n >= 10_000) return (n / 1000).toFixed(1) + "k";
  return n.toLocaleString();
}
function walletIcon(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("metamask"))      return "🦊";
  if (n.includes("coinbase"))      return "🔵";
  if (n.includes("rabby"))         return "🐰";
  if (n.includes("phantom"))       return "👻";
  if (n.includes("walletconnect")) return "🔗";
  return "💼";
}

export default function WalletBar({ onWalletChange, refreshTrigger = 0 }: WalletBarProps) {
  const { address, isConnected }            = useAccount();
  const { connectors, connect, isPending }  = useConnect();
  const { disconnect }                      = useDisconnect();
  const { name: basename }                  = useBasename(address);

  const [tier,    setTier]    = useState<TierInfo>({ tier: "Starter", blueBalance: 0, dailyCr: 200, discount: 0, color: "#4FC3F7" });
  const [credits, setCredits] = useState(0);
  // Ledger balance fetched from /api/credits/balance/[address] — same source
  // as the dashboard + settings card. Connected wallets render this number;
  // guests fall back to the localStorage daily quota.
  const [ledger,  setLedger]  = useState<{ balance: number } | null>(null);
  const [picker,  setPicker]  = useState(false);

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
      setCredits(Math.max(0, getCredits(address) ?? 0));
      onWalletChange?.(address, t);

      try {
        const res = await fetch(`/api/credits/balance/${address}`);
        const d   = await res.json();
        const bal = Number(d?.balance);
        if (Number.isFinite(bal)) setLedger({ balance: bal });
      } catch { /* leave previous ledger in place */ }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, refreshTrigger]);

  // De-dup connectors by name (EIP-6963 discovery can surface the same wallet
  // twice — once as the generic "Injected" entry, once by its real name).
  const seen = new Set<string>();
  const wallets = connectors.filter((c) => {
    const key = c.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ── Not connected — wallet picker ───────────────────────────────────────────
  if (!isConnected || !address) {
    return (
      <div className="relative">
        <button
          onClick={() => setPicker((p) => !p)}
          disabled={isPending}
          className="w-full font-mono text-xs font-semibold px-3 py-2 rounded-lg border transition-all disabled:opacity-60"
          style={{ borderColor: "#4FC3F7", color: "#4FC3F7", background: "#4FC3F718" }}
        >
          {isPending ? "Connecting…" : "Connect Wallet"}
        </button>
        <span className="block font-mono text-[10px] text-slate-600 mt-1 px-0.5">→ Connect + hold/stake $BLUEAGENT to unlock tiers &amp; more credits</span>

        {picker && (
          <>
            <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-[#1A1A2E] bg-[#0A0A12] shadow-2xl overflow-hidden">
              <p className="font-mono text-[10px] text-slate-600 px-3 pt-3 pb-2 tracking-widest">SELECT WALLET</p>
              {wallets.map((c) => (
                <button
                  key={c.uid}
                  onClick={() => { connect({ connector: c }); setPicker(false); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#1A1A2E] transition-colors"
                >
                  <span className="w-7 h-7 rounded-lg bg-[#1A1A2E] flex items-center justify-center text-base shrink-0">
                    {walletIcon(c.name)}
                  </span>
                  <span className="font-mono text-xs text-slate-200">{c.name}</span>
                </button>
              ))}
            </div>
            <div className="fixed inset-0 z-40" onClick={() => setPicker(false)} />
          </>
        )}
      </div>
    );
  }

  // ── Connected — static chip + disconnect (no popup; full detail lives in the
  //    surrounding Settings card) ───────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 font-mono text-xs px-3 py-2 rounded-lg border border-[#1A1A2E] bg-[#0D0D14]">
        <span className="w-2 h-2 rounded-full shrink-0"
          style={{ background: tier.color, boxShadow: `0 0 6px ${tier.color}` }} />
        <span className="text-slate-300">{basename ?? shortAddr(address)}</span>
        <span className="text-slate-600">·</span>
        <span style={{ color: tier.dailyCr === -1 ? tier.color : "#4FC3F7" }}>
          {tier.dailyCr === -1 ? "∞" : fmtCredits(ledger?.balance ?? credits)} cr
        </span>
      </div>
      <button
        onClick={() => disconnect()}
        className="self-start font-mono text-[11px] text-slate-400 hover:text-red-400 hover:border-red-400/30 border border-[#1A1A2E] rounded-lg px-3 py-1.5 transition-colors"
      >
        Disconnect wallet
      </button>
    </div>
  );
}
