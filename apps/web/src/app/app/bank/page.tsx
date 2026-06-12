"use client";

// BlueBank dashboard — the "account home" for the non-custodial Base neobank.
// Reuses the chat action cards (MoveToYieldCard / SendCard) for Earn + Send, and
// reads balances/positions on-chain (real data, no fabrication). Receive shows
// the address + Basename + QR. Activity is a placeholder until an indexer key
// is wired (we never fabricate transaction history).

import { useState, useEffect } from "react";
import { useAccount, useReadContract, useBalance, useConnect } from "wagmi";
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

type Section = "overview" | "earn" | "send" | "receive" | "activity";

export default function BankPage() {
  const { address, isConnected } = useAccount();
  const acct = address as `0x${string}` | undefined;
  const { name } = useBasename(acct);
  const [network, setNetwork] = useState<YieldNetwork>("baseSepolia");
  const [section, setSection] = useState<Section>("overview");
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
    return <BankLanding bestApy={bestApy} />;
  }

  const NAV: { id: Section; label: string; icon: string }[] = [
    { id: "overview", label: "Overview", icon: "⌂" },
    { id: "earn",     label: "Earn",     icon: "🌾" },
    { id: "send",     label: "Send",     icon: "➡" },
    { id: "receive",  label: "Receive",  icon: "⬇" },
    { id: "activity", label: "Activity", icon: "≡" },
  ];

  return (
    <div className="flex h-full w-full bg-[#050508] text-slate-200">

      {/* ── BlueBank sidebar (like Blue Chat / Blue Hub) ─────────────────── */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 border-r border-[#1A1A2E] bg-[#070710] overflow-y-auto">
        <div className="px-4 py-4 border-b border-[#1A1A2E]">
          <div className="font-mono text-[12px] tracking-widest text-[#4FC3F7] font-bold">🔵 BLUEBANK</div>
          <div className="font-mono text-[10px] text-slate-500 mt-1 truncate">{name || shortAddr(acct)}</div>
          <div className="font-mono text-[9px] text-[#34D399] mt-0.5">● non-custodial</div>
        </div>
        <div className="px-4 py-3 border-b border-[#1A1A2E]">
          <div className="font-mono text-[9px] text-slate-600">BALANCE · {net.short}</div>
          <div className="font-mono text-[16px] font-bold text-white mt-0.5">${usd(total)}</div>
          <div className="font-mono text-[9px] text-slate-600 mt-0.5">{usd(inYield)} earning</div>
        </div>
        <nav className="flex flex-col gap-0.5 p-2 flex-1">
          {NAV.map(item => {
            const active = section === item.id;
            return (
              <button key={item.id} onClick={() => setSection(item.id)}
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg font-mono text-[12px] transition-colors text-left"
                style={active
                  ? { background: "#4FC3F712", color: "#4FC3F7", boxShadow: "inset 0 0 0 1px #4FC3F720" }
                  : { color: "#64748b" }}>
                <span className="w-4 text-center">{item.icon}</span>{item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-3 border-t border-[#1A1A2E]">
          <div className="font-mono text-[9px] text-slate-600 mb-1.5">NETWORK</div>
          <div className="flex gap-1">
            {(["baseSepolia", "base"] as const).map(nk => (
              <button key={nk} onClick={() => setNetwork(nk)}
                className="flex-1 font-mono text-[10px] py-1.5 rounded-md transition-colors"
                style={network === nk
                  ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                  : { color: "#64748b", border: "1px solid #1A1A2E" }}>
                {nk === "base" ? "Mainnet" : "Sepolia"}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">

        {/* Mobile section tabs (sidebar hidden on small screens) */}
        <div className="md:hidden flex gap-1 mb-4 overflow-x-auto pb-1">
          {NAV.map(item => (
            <button key={item.id} onClick={() => setSection(item.id)}
              className="shrink-0 font-mono text-[11px] px-3 py-1.5 rounded-lg transition-colors"
              style={section === item.id
                ? { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#64748b", border: "1px solid #1A1A2E" }}>
              {item.label}
            </button>
          ))}
        </div>

        {/* Overview */}
        {section === "overview" && (
          <div className="max-w-screen-xl">
            <div className="grid lg:grid-cols-3 gap-4 mb-4">
              <div className="lg:col-span-2 rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6 flex flex-col">
                <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-2">CASH BALANCE · {net.short}</div>
                <div className="font-mono text-4xl sm:text-5xl font-bold text-white">${usd(total)} <span className="text-base text-slate-500">USDC</span></div>
                <div className="font-mono text-[11px] text-slate-500 mt-2">
                  {usd(walletUsdc)} in wallet · {usd(inYield)} earning{ethBal != null ? ` · ${ethBal.toFixed(4)} ETH` : ""}
                </div>
                <div className="flex gap-2 mt-auto pt-6">
                  <button onClick={() => setSection("receive")} className="font-mono text-[12px] px-4 py-2.5 rounded-xl" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>⬇ Receive</button>
                  <button onClick={() => setSection("send")} className="font-mono text-[12px] px-4 py-2.5 rounded-xl" style={{ background: "#34D39915", color: "#34D399", border: "1px solid #34D39940" }}>➡ Send</button>
                  <button onClick={() => setSection("earn")} className="font-mono text-[12px] px-4 py-2.5 rounded-xl" style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B40" }}>🌾 Earn</button>
                </div>
              </div>
              <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-5">
                <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-3">POSITIONS</div>
                <PositionRow label="Aave v3" pos={aavePos} apy={aaveApy} onManage={() => setSection("earn")} />
                <PositionRow label="Morpho · Gauntlet USDC Prime" pos={morphoPos} apy={morphoApy}
                  disabled={!morphoVnet} disabledNote="mainnet only" onManage={() => setSection("earn")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Stat label="BEST APY · BASE" value={bestApy != null ? `${bestApy.toFixed(2)}%` : "—"} note="live · DefiLlama" color="#34D399" />
              <Stat label="EARNING" value={`$${usd(inYield)}`} note="supplied across venues" color="#4FC3F7" />
              <Stat label="CUSTODY" value="You hold keys" note="non-custodial · 24/7" color="#A78BFA" />
            </div>
          </div>
        )}

        {/* Earn */}
        {section === "earn" && (
          <div className="max-w-md">
            <div className="font-mono text-[12px] text-slate-300 mb-1">🌾 Earn yield</div>
            <p className="font-mono text-[10px] text-slate-600 mb-3">Supply USDC into Aave or Morpho — non-custodial, you sign.</p>
            <MoveToYieldCard result={{ network }} account={acct} />
          </div>
        )}

        {/* Send */}
        {section === "send" && (
          <div className="max-w-md">
            <div className="font-mono text-[12px] text-slate-300 mb-1">➡ Send / Pay</div>
            <p className="font-mono text-[10px] text-slate-600 mb-3">Send USDC or ETH to any address or <span className="text-slate-400">name.base</span>.</p>
            <SendCard result={{ network }} account={acct} />
          </div>
        )}

        {/* Receive */}
        {section === "receive" && (
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6 max-w-md flex flex-col items-center text-center">
            <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-4 self-start">RECEIVE · {net.short}</div>
            <div className="bg-[#0a0a0f] p-2 rounded-xl border border-[#1A1A2E]">
              <QRCodeSVG value={acct ?? ""} size={184} bgColor="#0a0a0f" fgColor="#e2e8f0" level="M" />
            </div>
            {name && <div className="font-mono text-[14px] text-[#4FC3F7] mt-4">{name}</div>}
            <div className="font-mono text-[10px] text-slate-400 mt-2 break-all max-w-xs">{acct}</div>
            <button onClick={copyAddr} className="font-mono text-[11px] px-4 py-2 rounded-lg mt-4" style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
              {copied ? "✓ Copied" : "Copy address"}
            </button>
            <p className="font-mono text-[9px] text-slate-600 mt-4 max-w-xs leading-relaxed">
              Send only <b>USDC or ETH on Base</b> ({net.short}) to this address. Funds from other chains may be lost.
            </p>
          </div>
        )}

        {/* Activity */}
        {section === "activity" && (
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6 max-w-screen-xl">
            <div className="font-mono text-[10px] text-slate-500 tracking-widest mb-2">ACTIVITY · {net.short}</div>
            <p className="font-mono text-[11px] text-slate-600 mb-3">
              On-chain history view coming soon (needs an indexer). For now, your full transaction history is live on Basescan.
            </p>
            <a href={`${net.explorer}/address/${acct}`} target="_blank" rel="noopener noreferrer"
              className="inline-block font-mono text-[11px] px-3 py-1.5 rounded-lg text-[#4FC3F7]" style={{ border: "1px solid #4FC3F730" }}>
              View on Basescan ↗
            </a>
          </div>
        )}
      </main>
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

// ── Landing hero (shown until the wallet connects) ───────────────────────────
function BankLanding({ bestApy }: { bestApy: number | null }) {
  const apyText = bestApy != null ? `~${bestApy.toFixed(1)}%` : "up to ~5%";
  const features: { icon: string; title: string; body: string }[] = [
    { icon: "📈", title: `Earn ${apyText} APY on idle USDC`, body: "Live rates across blue-chip lending (Aave · Morpho). Your USDC works while you sleep — no lockups." },
    { icon: "➡", title: "Send to any wallet or name.base", body: "Pay anyone on Base by address or Basename. Instant, 24/7, no cut-off times." },
    { icon: "🔒", title: "Non-custodial — you hold the keys", body: "You sign every transaction from your own wallet. BlueBank never holds your keys or funds." },
    { icon: "🌐", title: "On-chain, withdraw anytime", body: "Your money lives on Base, not in a silo. Pull it out whenever you want, in one click." },
  ];
  return (
    <div className="min-h-full bg-[#050508] flex items-center justify-center p-5 sm:p-8">
      <div className="w-full max-w-4xl grid md:grid-cols-2 gap-6 items-center">
        {/* Left — marketing */}
        <div>
          <div className="font-mono text-[13px] tracking-widest text-[#4FC3F7] font-bold mb-3">🔵 BLUEBANK</div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white leading-tight mb-3">
            Banking that you<br />actually own.
          </h1>
          <p className="font-mono text-[12px] text-slate-400 leading-relaxed mb-5 max-w-md">
            Hold USDC, earn real yield, and move money on Base — <span className="text-slate-200">non-custodial</span>.
            You hold the keys; BlueBank only prepares the transaction, you sign it.
          </p>
          <div className="space-y-3">
            {features.map(f => (
              <div key={f.title} className="flex gap-3">
                <span className="text-base shrink-0">{f.icon}</span>
                <div>
                  <div className="font-mono text-[12px] text-slate-200">{f.title}</div>
                  <div className="font-mono text-[10px] text-slate-600 leading-relaxed">{f.body}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right — connect card */}
        <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
          <div className="font-mono text-[14px] font-bold text-white mb-1">Open your account</div>
          <p className="font-mono text-[11px] text-slate-500 mb-5">Connect a wallet to start — no signup, no KYC, no custody.</p>
          <ConnectButton />
          <div className="flex items-center gap-2 my-4">
            <div className="h-px flex-1 bg-[#1A1A2E]" /><span className="font-mono text-[9px] text-slate-700">SECURED BY YOU</span><div className="h-px flex-1 bg-[#1A1A2E]" />
          </div>
          <div className="flex items-center justify-center gap-4 font-mono text-[9px] text-slate-600">
            <span>🔒 Non-custodial</span><span>·</span><span>⛓ On Base</span><span>·</span><span>↩ Withdraw anytime</span>
          </div>
          <p className="font-mono text-[9px] text-slate-700 text-center mt-4">Powered by Base · Aave v3 · Morpho</p>
        </div>
      </div>
    </div>
  );
}

// Connect-wallet CTA — reuses wagmi connectors (same as the sidebar WalletBar),
// de-duped, rendered as a prominent button + picker for the landing hero.
function ConnectButton() {
  const { connectors, connect, isPending } = useConnect();
  const [open, setOpen] = useState(false);
  const seen = new Set<string>();
  const wallets = connectors.filter(c => { const k = c.name.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const icon = (name: string) => {
    const n = name.toLowerCase();
    if (n.includes("coinbase")) return "🔵";
    if (n.includes("metamask")) return "🦊";
    if (n.includes("rabby")) return "🐰";
    if (n.includes("phantom")) return "👻";
    return "💼";
  };
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)} disabled={isPending}
        className="w-full font-mono text-[13px] font-bold py-2.5 rounded-xl transition-all disabled:opacity-60"
        style={{ background: "#4FC3F7", color: "#050508" }}>
        {isPending ? "Connecting…" : "Connect Wallet"}
      </button>
      {open && (
        <>
          <div className="absolute left-0 right-0 top-full mt-2 z-50 rounded-xl border border-[#1A1A2E] bg-[#0A0A12] shadow-2xl overflow-hidden">
            <p className="font-mono text-[10px] text-slate-600 px-3 pt-3 pb-2 tracking-widest">SELECT WALLET</p>
            {wallets.map(c => (
              <button key={c.uid} onClick={() => { connect({ connector: c }); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[#1A1A2E] transition-colors">
                <span className="w-7 h-7 rounded-lg bg-[#1A1A2E] flex items-center justify-center text-base shrink-0">{icon(c.name)}</span>
                <span className="font-mono text-xs text-slate-200">{c.name}</span>
              </button>
            ))}
          </div>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
        </>
      )}
    </div>
  );
}
