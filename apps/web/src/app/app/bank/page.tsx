"use client";

// BlueBank dashboard — the "account home" for the non-custodial Base neobank.
// Reuses the chat action cards (MoveToYieldCard / SendCard) for Earn + Send, and
// reads balances/positions on-chain (real data, no fabrication). Receive shows
// the address + Basename + QR. Activity is a placeholder until an indexer key
// is wired (we never fabricate transaction history).

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useBalance } from "wagmi";
import { formatUnits } from "viem";
import { QRCodeSVG } from "qrcode.react";
import {
  YIELD_NETWORKS, ERC20_ABI, AAVE_POOL_ABI, ERC4626_ABI, VENUES, supplyApyPct,
  type YieldNetwork,
} from "@/lib/yield-execution";
import { MoveToYieldCard, SendCard } from "@/app/chat/components/ToolCards";
import { useBasename, shortAddr } from "@/lib/useBasename";

const usd = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Action = "earn" | "send" | "receive" | null;

export default function BankPage() {
  const { address, isConnected } = useAccount();
  const acct = address as `0x${string}` | undefined;
  const { name } = useBasename(acct);
  const [network, setNetwork] = useState<YieldNetwork>("baseSepolia");
  const [action, setAction]   = useState<Action>(null);
  const [copied, setCopied]   = useState(false);

  const net = YIELD_NETWORKS[network];
  const chainId = net.chainId;
  const morphoVnet = VENUES.morpho.nets[network]; // mainnet only

  // ── Live on-chain reads ──────────────────────────────────────────────────
  const { data: walletRaw } = useReadContract({
    address: net.usdc, abi: ERC20_ABI, functionName: "balanceOf",
    args: acct ? [acct] : undefined, chainId, query: { enabled: !!acct },
  });
  const { data: ethRaw } = useBalance({ address: acct, chainId, query: { enabled: !!acct } });
  const { data: aaveRaw } = useReadContract({
    address: net.aUsdc, abi: ERC20_ABI, functionName: "balanceOf",
    args: acct ? [acct] : undefined, chainId, query: { enabled: !!acct },
  });
  const { data: aaveReserve } = useReadContract({
    address: net.pool, abi: AAVE_POOL_ABI, functionName: "getReserveData",
    args: [net.usdc], chainId,
  });
  const { data: morphoRaw } = useReadContract({
    address: morphoVnet?.target, abi: ERC4626_ABI, functionName: "maxWithdraw",
    args: acct ? [acct] : undefined, chainId,
    query: { enabled: !!acct && !!morphoVnet },
  });

  const walletUsdc = walletRaw != null ? Number(formatUnits(walletRaw as bigint, net.usdcDecimals)) : null;
  const ethBal     = ethRaw ? Number(formatUnits(ethRaw.value, ethRaw.decimals)) : null;
  const aavePos    = aaveRaw != null ? Number(formatUnits(aaveRaw as bigint, 6)) : null;
  const morphoPos  = morphoRaw != null ? Number(formatUnits(morphoRaw as bigint, 6)) : null;
  const aaveApy    = aaveReserve ? supplyApyPct((aaveReserve as { currentLiquidityRate: bigint }).currentLiquidityRate) : null;

  // ── Best-rate (DefiLlama) for the stat row + Morpho APY ───────────────────
  type Rate = { project: string; label: string; apy: number };
  const [rates, setRates] = useState<Rate[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch("/api/yield/rates").then(r => r.json()).then(d => { if (!off) setRates((d?.rates as Rate[]) ?? []); }).catch(() => {});
    return () => { off = true; };
  }, []);
  const bestApy   = rates && rates.length ? rates[0].apy : null;
  const morphoApy = rates?.find(r => r.project === "morpho-blue")?.apy ?? null;

  const inYield = (aavePos ?? 0) + (morphoPos ?? 0);
  const total   = (walletUsdc ?? 0) + inYield;

  function copyAddr() {
    if (!acct) return;
    navigator.clipboard?.writeText(acct).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }

  if (!isConnected) {
    return (
      <div className="min-h-full flex items-center justify-center p-8">
        <div className="text-center">
          <div className="font-mono text-[13px] tracking-widest text-[#4FC3F7] mb-2">🔵 BLUEBANK</div>
          <p className="font-mono text-[12px] text-slate-500">Connect your wallet to open your account.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#050508] text-slate-200 p-4 sm:p-6 max-w-5xl mx-auto w-full">

      {/* Header */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div>
          <div className="font-mono text-[13px] tracking-widest text-[#4FC3F7] font-bold">🔵 BLUEBANK</div>
          <div className="font-mono text-[11px] text-slate-400 mt-0.5">
            {name || shortAddr(acct)} · <span className="text-[#34D399]">non-custodial</span>
          </div>
        </div>
        <div className="flex items-center gap-1 font-mono text-[10px]">
          {(["baseSepolia", "base"] as const).map(nk => (
            <button key={nk} onClick={() => setNetwork(nk)}
              className="px-2.5 py-1 rounded-md transition-colors"
              style={network === nk
                ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#64748b", border: "1px solid #1A1A2E" }}>
              {nk === "base" ? "Mainnet" : "Sepolia"}
            </button>
          ))}
        </div>
      </div>

      {/* Cash balance hero */}
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 mb-4">
        <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-1">CASH BALANCE · {net.short}</div>
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <div className="font-mono text-3xl font-bold text-white">${usd(total)} <span className="text-sm text-slate-500">USDC</span></div>
            <div className="font-mono text-[11px] text-slate-500 mt-1">
              {usd(walletUsdc)} in wallet · {usd(inYield)} earning{ethBal != null ? ` · ${ethBal.toFixed(4)} ETH` : ""}
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAction(action === "receive" ? null : "receive")}
              className="font-mono text-[11px] px-3 py-2 rounded-lg" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>⬇ Receive</button>
            <button onClick={() => setAction(action === "send" ? null : "send")}
              className="font-mono text-[11px] px-3 py-2 rounded-lg" style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>➡ Send</button>
            <button onClick={() => setAction(action === "earn" ? null : "earn")}
              className="font-mono text-[11px] px-3 py-2 rounded-lg" style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>🌾 Earn</button>
          </div>
        </div>
      </div>

      {/* Active action panel (reuses the chat cards) */}
      {action === "receive" && (
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 mb-4 flex flex-col items-center text-center">
          <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-3 self-start">RECEIVE · {net.short}</div>
          <div className="bg-[#0a0a0f] p-2 rounded-xl border border-[#1A1A2E]">
            <QRCodeSVG value={acct ?? ""} size={168} bgColor="#0a0a0f" fgColor="#e2e8f0" level="M" />
          </div>
          {name && <div className="font-mono text-[13px] text-[#4FC3F7] mt-3">{name}</div>}
          <div className="font-mono text-[10px] text-slate-400 mt-2 break-all max-w-xs">{acct}</div>
          <button onClick={copyAddr} className="font-mono text-[11px] px-3 py-1.5 rounded-lg mt-3" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
            {copied ? "✓ Copied" : "Copy address"}
          </button>
          <p className="font-mono text-[9px] text-slate-600 mt-3 max-w-xs leading-relaxed">
            Send only <b>USDC or ETH on Base</b> ({net.short}) to this address. Funds from other chains may be lost.
          </p>
        </div>
      )}
      {action === "send" && <div className="mb-4"><SendCard result={{ network }} account={acct} /></div>}
      {action === "earn" && <div className="mb-4"><MoveToYieldCard result={{ network }} account={acct} /></div>}

      {/* Stat row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Stat label="BEST APY · BASE" value={bestApy != null ? `${bestApy.toFixed(2)}%` : "—"} note="live · DefiLlama" color="#34D399" />
        <Stat label="EARNING" value={`$${usd(inYield)}`} note="supplied across venues" color="#4FC3F7" />
        <Stat label="CUSTODY" value="You hold keys" note="non-custodial · 24/7" color="#A78BFA" />
      </div>

      {/* Positions */}
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5 mb-4">
        <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-3">POSITIONS</div>
        <PositionRow label="Aave v3" pos={aavePos} apy={aaveApy} onManage={() => setAction("earn")} />
        <PositionRow label="Morpho · Gauntlet USDC Prime" pos={morphoPos} apy={morphoApy}
          disabled={!morphoVnet} disabledNote="mainnet only" onManage={() => setAction("earn")} />
      </div>

      {/* Activity — honest placeholder (no fabricated history) */}
      <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
        <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-2">ACTIVITY</div>
        <p className="font-mono text-[11px] text-slate-600">
          On-chain history coming soon. View live on{" "}
          <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer" className="text-[#4FC3F7]">Basescan ↗</a>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, note, color }: { label: string; value: string; note: string; color: string }) {
  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0d0d12] px-3.5 py-3">
      <div className="font-mono text-[9px] text-slate-600 tracking-wide mb-1">{label}</div>
      <div className="font-mono text-lg font-bold" style={{ color }}>{value}</div>
      <div className="font-mono text-[9px] text-slate-600 mt-0.5">{note}</div>
    </div>
  );
}

function PositionRow({ label, pos, apy, onManage, disabled, disabledNote }: {
  label: string; pos: number | null; apy: number | null; onManage: () => void; disabled?: boolean; disabledNote?: string;
}) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#13131f] last:border-0">
      <div>
        <div className="font-mono text-[12px] text-slate-200">{label}</div>
        <div className="font-mono text-[10px] text-slate-600">
          {disabled ? <span className="text-slate-700">{disabledNote}</span>
            : <>{pos != null ? `${pos.toFixed(2)} USDC` : "—"}{apy != null && <span className="text-[#34D399]"> · ~{apy.toFixed(2)}%</span>}</>}
        </div>
      </div>
      {!disabled && (
        <button onClick={onManage} className="font-mono text-[10px] px-2.5 py-1 rounded-md text-[#4FC3F7]" style={{ border: "1px solid #4FC3F730" }}>
          Manage
        </button>
      )}
    </div>
  );
}
