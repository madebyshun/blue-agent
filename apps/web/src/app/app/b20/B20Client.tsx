"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import { useAppChrome } from "@/app/app/AppChrome";
import { runB20Inspect }  from "./inspect-action";
import { runB20Roles }    from "./roles-action";
import { runB20Registry } from "./registry-action";
import type { B20Inspection, PolicyInfo } from "@/lib/b20/inspect";
import type { B20RolesResult }            from "@/lib/b20/roles";
import type { B20RegistryResult }         from "@/lib/b20/registry-logs";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab     = "scanner" | "roles" | "registry" | "launch";
type Network = "mainnet" | "sepolia";

// ── Shared input style (module-level so LaunchTab can use it) ─────────────────

const INPUT_CLS = [
  "w-full bg-[#0a0a12] border border-[#1A1A2E]",
  "focus:border-[#4FC3F740] rounded-xl px-3 py-2.5",
  "font-mono text-sm text-slate-200 placeholder:text-slate-700",
  "outline-none transition-colors",
].join(" ");

// ── Icons ─────────────────────────────────────────────────────────────────────

const TabIcons: Record<Tab, React.ReactNode> = {
  scanner: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
    </svg>
  ),
  roles: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
    </svg>
  ),
  registry: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
    </svg>
  ),
  launch: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round"
        d="M15.59 14.37a6 6 0 0 1-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 0 0 6.16-12.12A14.98 14.98 0 0 0 9.631 8.41m5.96 5.96a14.926 14.926 0 0 1-5.841 2.58m-.119-8.54a6 6 0 0 0-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 0 0-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 0 1-2.448-2.448 14.9 14.9 0 0 1 .06-.312m-2.24 2.39a4.493 4.493 0 0 0-1.757 4.306 4.493 4.493 0 0 0 4.306-1.758M16.5 9a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z" />
    </svg>
  ),
};

const DocsIcon = (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
  </svg>
);

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "scanner",  label: "Scanner"  },
  { id: "roles",    label: "Roles"    },
  { id: "registry", label: "Registry" },
  { id: "launch",   label: "Launch"   },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function isValidAddr(v: string) { return /^0x[a-fA-F0-9]{40}$/.test(v.trim()); }
function truncAddr(a: string, n = 6) { return `${a.slice(0, n)}…${a.slice(-4)}`; }

interface VerdictLine { kind: "warn" | "ok"; text: string }

function computeVerdict(info: B20Inspection): VerdictLine[] {
  const lines: VerdictLine[] = [];
  if (info.paused?.transfer) lines.push({ kind: "warn", text: "Transfers are paused by the issuer." });
  if (info.paused?.mint)     lines.push({ kind: "warn", text: "Minting is paused." });
  if (info.paused?.burn)     lines.push({ kind: "warn", text: "Burns are paused." });
  const sl: Record<string, string> = {
    transferSender: "transfer sender", transferReceiver: "transfer receiver",
    transferExecutor: "transfer executor", mintReceiver: "mint receiver",
  };
  if (info.policies) {
    for (const [scope, policy] of Object.entries(info.policies) as [string, PolicyInfo][]) {
      if (policy.restricted)
        lines.push({ kind: "warn", text: `Policy-gated on ${sl[scope] ?? scope} scope.` });
    }
  }
  if (info.supplyCapUncapped) lines.push({ kind: "warn", text: "Uncapped supply — issuer can mint unlimited tokens." });
  const noPause = !info.paused?.transfer && !info.paused?.mint && !info.paused?.burn;
  const noGate  = !info.policies || Object.values(info.policies).every(p => !p.restricted);
  if (noPause && noGate) lines.push({ kind: "ok", text: "No issuer-side transfer restrictions detected." });
  if (!info.supplyCapUncapped && info.supplyCapFormatted && info.supplyCapFormatted !== "uncapped")
    lines.push({ kind: "ok", text: `Supply capped at ${info.supplyCapFormatted} ${info.symbol ?? "tokens"}.` });
  return lines;
}

// ── Shared UI pieces ──────────────────────────────────────────────────────────

function VariantBadge({ variant }: { variant?: string }) {
  const colors: Record<string, { bg: string; text: string; border: string }> = {
    ASSET:      { bg: "#4FC3F718", text: "#4FC3F7", border: "#4FC3F730" },
    STABLECOIN: { bg: "#22C55E18", text: "#22C55E", border: "#22C55E30" },
    UNKNOWN:    { bg: "#64748b18", text: "#94a3b8", border: "#64748b30" },
  };
  const c = colors[variant ?? "UNKNOWN"] ?? colors.UNKNOWN;
  return (
    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
      style={{ background: c.bg, color: c.text, borderColor: c.border }}>
      {variant ?? "UNKNOWN"}
    </span>
  );
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border"
      style={{ borderColor: active ? "#22C55E30" : "#EF444430", background: active ? "#22C55E08" : "#EF444408" }}>
      <span className="w-2 h-2 rounded-full shrink-0"
        style={{ background: active ? "#22C55E" : "#EF4444", boxShadow: active ? "0 0 5px #22C55E80" : "0 0 5px #EF444480" }} />
      <span className="font-mono text-xs font-medium" style={{ color: active ? "#22C55E" : "#EF4444" }}>{label}</span>
      <span className="font-mono text-[9px] text-slate-700 ml-auto">{active ? "active" : "paused"}</span>
    </div>
  );
}

function PolicyRow({ label, policy }: { label: string; policy: PolicyInfo }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#0d0d18] last:border-0">
      <span className="font-mono text-xs text-slate-400">{label}</span>
      {policy.restricted ? (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
            style={{ background: "#F59E0B15", color: "#F59E0B", borderColor: "#F59E0B30" }}>
            RESTRICTED
          </span>
          {policy.policyId && <span className="font-mono text-[9px] text-slate-600">id:{policy.policyId}</span>}
        </div>
      ) : (
        <span className="font-mono text-xs" style={{ color: "#22C55E" }}>ALWAYS_ALLOW</span>
      )}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">{children}</p>;
}

function InfoChip({ children, color = "#4FC3F7" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="font-mono text-[10px] px-2.5 py-0.5 rounded-full border"
      style={{ color, borderColor: `${color}35`, background: `${color}0a` }}>
      {children}
    </span>
  );
}

// ── Scanner result card ───────────────────────────────────────────────────────

function ResultCard({ info, onScanAnother }: { info: B20Inspection; onScanAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const verdict   = computeVerdict(info);
  const hasWarns  = verdict.some(v => v.kind === "warn");
  const trustColor = hasWarns ? "#F59E0B" : "#22C55E";

  if (!info.isB20) {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden mt-5">
        <div className="px-5 py-4 bg-[#0a0a0f] border-b border-[#1A1A2E] flex items-center gap-3">
          <span className="font-mono text-xl text-slate-500">✕</span>
          <div>
            <p className="font-mono text-sm font-bold text-white">Not a B20 Token</p>
            <p className="font-mono text-xs text-slate-500 mt-0.5">This address is not a B20 token on {info.network}.</p>
          </div>
        </div>
        <div className="px-5 py-4">
          <p className="font-mono text-[10px] text-slate-600 break-all mb-2">{info.address}</p>
          {info._note && <p className="font-mono text-xs text-slate-500 mb-4">{info._note}</p>}
          <div className="flex gap-2 flex-wrap">
            <a href={info.explorerUrl} target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs px-3 py-1.5 rounded-xl border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
              View on Basescan ↗
            </a>
            <button onClick={onScanAnother}
              className="font-mono text-xs px-3 py-1.5 rounded-xl border text-[#4FC3F7] transition-colors"
              style={{ borderColor: "#4FC3F730" }}>
              Scan another →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border overflow-hidden mt-5" style={{ borderColor: `${trustColor}35` }}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-[#1A1A2E]" style={{ background: `${trustColor}06` }}>
        <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
          <div>
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="font-mono text-lg font-bold text-white">{info.name ?? "—"}</span>
              {info.symbol && <span className="font-mono text-sm text-slate-400">${info.symbol}</span>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
                style={{ background: "#22C55E18", color: "#22C55E", borderColor: "#22C55E30" }}>✓ B20</span>
              <VariantBadge variant={info.variant} />
              <span className="font-mono text-[10px] text-slate-500">
                {info.network === "mainnet" ? "Base Mainnet" : "Base Sepolia"}
              </span>
              <span className="font-mono text-[9px] text-slate-600">
                {(info.rpcLatencyMs / 1000).toFixed(2)}s
              </span>
            </div>
          </div>
          <span className="font-mono text-xs px-2.5 py-1 rounded-full border shrink-0"
            style={{ background: `${trustColor}12`, color: trustColor, borderColor: `${trustColor}40` }}>
            {hasWarns ? "Restrictions found" : "No restrictions"}
          </span>
        </div>
        <a href={info.explorerUrl} target="_blank" rel="noopener noreferrer"
          className="font-mono text-[9px] text-slate-600 hover:text-[#4FC3F7] transition-colors break-all">
          {info.address}
        </a>
      </div>

      <div className="p-5 space-y-5">
        {/* Key Facts */}
        <div>
          <SectionLabel>Token Info</SectionLabel>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: "Decimals",     value: info.decimals?.toString() ?? "—" },
              { label: "Total Supply", value: info.totalSupplyFormatted ?? "—" },
              { label: "Supply Cap",   value: info.supplyCapFormatted ?? "—" },
              ...(info.variant === "STABLECOIN" && info.currency
                ? [{ label: "Currency", value: info.currency }] : []),
              ...(info.variant === "ASSET" && info.multiplier
                ? [{ label: "Multiplier", value: info.multiplier === "1000000000000000000" ? "1× (no rebase)" : info.multiplier }] : []),
            ].map(({ label, value }) => (
              <div key={label} className="rounded-xl bg-[#0a0a12] border border-[#1A1A2E] px-3 py-2.5">
                <p className="font-mono text-[9px] text-slate-600 mb-0.5">{label}</p>
                <p className="font-mono text-xs text-slate-200">{value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Pause Status */}
        {info.paused && (
          <div>
            <SectionLabel>Pause Status</SectionLabel>
            <div className="grid grid-cols-3 gap-2">
              <StatusDot active={!info.paused.transfer} label="Transfer" />
              <StatusDot active={!info.paused.mint}     label="Mint"     />
              <StatusDot active={!info.paused.burn}     label="Burn"     />
            </div>
          </div>
        )}

        {/* Transfer Policies */}
        {info.policies && (
          <div>
            <SectionLabel>Transfer Policies</SectionLabel>
            <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a12] px-4 py-1">
              <PolicyRow label="Transfer Sender"   policy={info.policies.transferSender} />
              <PolicyRow label="Transfer Receiver" policy={info.policies.transferReceiver} />
              <PolicyRow label="Transfer Executor" policy={info.policies.transferExecutor} />
              <PolicyRow label="Mint Receiver"     policy={info.policies.mintReceiver} />
            </div>
          </div>
        )}

        {/* Trust Verdict */}
        <div>
          <SectionLabel>Trust Verdict</SectionLabel>
          <div className="rounded-xl border px-4 py-3 space-y-2.5"
            style={{ borderColor: `${trustColor}25`, background: `${trustColor}05` }}>
            {verdict.map((line, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <span className="font-mono text-sm shrink-0 mt-px" style={{ color: line.kind === "warn" ? "#F59E0B" : "#22C55E" }}>
                  {line.kind === "warn" ? "!" : "✓"}
                </span>
                <span className="font-mono text-xs leading-relaxed"
                  style={{ color: line.kind === "warn" ? "#FCD34D" : "#86efac" }}>
                  {line.text}
                </span>
              </div>
            ))}
            <p className="font-mono text-[9px] text-slate-600 pt-2 border-t border-[#1A1A2E]">
              Reflects on-chain config at read time. Roles and policies can be changed by the issuer.
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={() => {
              navigator.clipboard.writeText(info.address)
                .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
            }}
            className="font-mono text-xs px-3 py-1.5 rounded-xl border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <button onClick={() => {
              const p = new URLSearchParams({ address: info.address, network: info.network });
              navigator.clipboard.writeText(`${window.location.origin}/app/b20?${p}`);
            }}
            className="font-mono text-xs px-3 py-1.5 rounded-xl border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Share link
          </button>
          <a href={info.explorerUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-xs px-3 py-1.5 rounded-xl border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Basescan ↗
          </a>
          <button onClick={onScanAnother}
            className="font-mono text-xs px-3 py-1.5 rounded-xl border text-[#4FC3F7] hover:border-[#4FC3F750] transition-colors"
            style={{ borderColor: "#4FC3F730" }}>
            Scan another →
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Launch tab — direct wallet deploy via /api/b20/prepare ────────────────────

const LAUNCH_NETS = {
  sepolia: { chainId: 84532, label: "Sepolia",  explorer: "https://sepolia.basescan.org" },
  mainnet: { chainId: 8453,  label: "Mainnet",  explorer: "https://basescan.org"         },
} as const;
type LaunchNet = keyof typeof LAUNCH_NETS;

function LaunchTab({ onScanToken }: { onScanToken: (addr: string, net: Network) => void }) {
  // Form
  const [name,       setName]       = useState("");
  const [symbol,     setSymbol]     = useState("");
  const [variant,    setVariant]    = useState<"asset" | "stablecoin">("asset");
  const [decimals,   setDecimals]   = useState(18);
  const [decManual,  setDecManual]  = useState(false);
  const [supplyCap,  setSupplyCap]  = useState("");
  const [currCode,   setCurrCode]   = useState("USD");
  const [lNetwork,   setLNetwork]   = useState<LaunchNet>("sepolia");

  // Deploy
  const [deploying,     setDeploying]     = useState(false);
  const [polling,       setPolling]       = useState(false);
  const [deployErr,     setDeployErr]     = useState("");
  const [deployTxHash,  setDeployTxHash]  = useState("");
  const [deployedToken, setDeployedToken] = useState("");

  // Wagmi
  const { address, chainId: currentChainId } = useAccount();
  const { sendTransactionAsync }             = useSendTransaction();
  const { switchChainAsync }                 = useSwitchChain();

  function switchVariant(v: "asset" | "stablecoin") {
    setVariant(v);
    if (!decManual) setDecimals(v === "stablecoin" ? 6 : 18);
  }

  const n      = name.trim();
  const s      = symbol.replace(/^\$/, "").trim();
  const cap    = supplyCap.trim();
  const cur    = currCode.trim() || "USD";
  const net    = LAUNCH_NETS[lNetwork];
  const canDeploy = !!n && !!s;

  async function deploy() {
    if (!address || !canDeploy) return;
    setDeploying(true); setDeployErr(""); setDeployTxHash(""); setDeployedToken("");
    try {
      const prepRes = await fetch("/api/b20/prepare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: n, symbol: s, variant, decimals,
          supply_cap:    cap || undefined,
          currency_code: variant === "stablecoin" ? cur : undefined,
          admin: address,
          network: lNetwork,
        }),
      });
      const prep = await prepRes.json();
      if (!prep.ok) throw new Error(prep.error || "Prepare failed");
      if (!prep.berylLive) {
        throw new Error(
          lNetwork === "mainnet"
            ? "Mainnet Beryl activates June 25, 2026 18:00 UTC"
            : "B20 factory not active on this network yet",
        );
      }

      if (currentChainId !== net.chainId) {
        try { await switchChainAsync({ chainId: net.chainId }); }
        catch { throw new Error(`Switch wallet to Base ${net.label} and try again`); }
      }

      const hash = await sendTransactionAsync({
        to:      prep.tx.to as `0x${string}`,
        data:    prep.tx.data as `0x${string}`,
        value:   0n,
        chainId: net.chainId,
      });
      setDeployTxHash(hash);
      setPolling(true);

      for (let i = 0; i < 20; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const rec = await fetch("/api/b20/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tx_hash: hash, network: lNetwork }),
        }).then(r => r.json());
        if (rec.ok && rec.status === "success" && rec.tokenAddress) {
          setDeployedToken(rec.tokenAddress);
          break;
        }
        if (rec.ok && rec.status === "reverted") throw new Error("Transaction reverted");
      }
      setPolling(false);
    } catch (e) {
      setDeployErr((e as Error).message);
    } finally {
      setDeploying(false);
      setPolling(false);
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <span className="text-2xl">🚀</span>
          <h2 className="font-mono text-xl font-bold text-white">Launch B20 Token</h2>
        </div>
        <p className="font-mono text-sm text-slate-500">
          Connect your wallet and deploy a B20 token directly on Base.
          The hub builds the calldata, your wallet signs the transaction.
        </p>
      </div>

      {/* Main deploy card */}
      <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden mb-5">

        {/* Token preview header */}
        <div className="px-5 py-4 bg-[#0a0a0f] border-b border-[#1A1A2E] flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-mono text-sm font-bold shrink-0"
            style={{ background: "#4FC3F715", border: "1px solid #4FC3F730", color: "#4FC3F7" }}>
            {(s || n).slice(0, 2).toUpperCase() || "B2"}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-sm font-bold text-white truncate">{n || "Token Name"}</p>
            <p className="font-mono text-xs text-slate-500">${s || "SYMBOL"} · {variant} · B20</p>
          </div>
          {/* Network toggle */}
          <div className="flex rounded-lg border border-[#1A1A2E] overflow-hidden shrink-0">
            {(["sepolia", "mainnet"] as const).map(nk => (
              <button key={nk} onClick={() => setLNetwork(nk)}
                className="px-3 py-1.5 font-mono text-xs transition-colors"
                style={lNetwork === nk
                  ? { background: "#4FC3F715", color: "#4FC3F7" }
                  : { color: "#475569" }}>
                {LAUNCH_NETS[nk].label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
                Token Name *
              </label>
              <input value={name} onChange={e => setName(e.target.value)}
                placeholder="My Token" spellCheck={false} className={INPUT_CLS} />
            </div>
            <div>
              <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
                Symbol *
              </label>
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())}
                placeholder="MTK" spellCheck={false} className={INPUT_CLS} />
            </div>
          </div>

          {/* Variant */}
          <div>
            <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
              Variant
            </label>
            <div className="flex rounded-xl border border-[#1A1A2E] overflow-hidden">
              {(["asset", "stablecoin"] as const).map(v => (
                <button key={v} onClick={() => switchVariant(v)}
                  className="flex-1 py-2.5 font-mono text-xs transition-all capitalize"
                  style={variant === v
                    ? v === "asset"
                      ? { background: "#4FC3F715", color: "#4FC3F7", borderRight: "1px solid #1A1A2E" }
                      : { background: "#22C55E15", color: "#22C55E" }
                    : v === "asset"
                      ? { color: "#475569", borderRight: "1px solid #1A1A2E" }
                      : { color: "#475569" }}>
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
                Decimals <span className="text-slate-700 font-normal normal-case">(6–18)</span>
              </label>
              <input type="number" min={6} max={18} value={decimals}
                disabled={variant === "stablecoin"}
                onChange={e => { setDecManual(true); setDecimals(Number(e.target.value)); }}
                className="w-full bg-[#0a0a12] border border-[#1A1A2E] focus:border-[#4FC3F740] rounded-xl px-3 py-2.5 font-mono text-sm text-slate-200 outline-none transition-colors disabled:opacity-40 disabled:cursor-not-allowed" />
            </div>
            <div>
              <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
                Supply Cap <span className="text-slate-700 font-normal normal-case">(optional)</span>
              </label>
              <input value={supplyCap} onChange={e => setSupplyCap(e.target.value)}
                placeholder="e.g. 1000000" spellCheck={false} className={INPUT_CLS} />
            </div>
          </div>

          {variant === "stablecoin" && (
            <div>
              <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
                Currency Code
              </label>
              <input value={currCode} onChange={e => setCurrCode(e.target.value.toUpperCase())}
                placeholder="USD" spellCheck={false}
                className="w-full bg-[#0a0a12] border border-[#1A1A2E] focus:border-[#22C55E40] rounded-xl px-3 py-2.5 font-mono text-sm text-slate-200 placeholder:text-slate-700 outline-none transition-colors" />
            </div>
          )}
        </div>

        {/* Deploy section */}
        <div className="px-5 pb-5">
          {!deployedToken ? (
            <>
              <button onClick={deploy}
                disabled={!canDeploy || deploying || !address}
                className="w-full font-mono text-sm font-bold py-3 rounded-xl transition-all disabled:opacity-40"
                style={{ background: "#34D399", color: "#050508" }}>
                {!address
                  ? "Connect wallet to deploy"
                  : deploying
                    ? (polling ? "Confirming on-chain…" : "Preparing transaction…")
                    : `Deploy B20 on ${net.label} →`}
              </button>

              {lNetwork === "sepolia" && (
                <p className="font-mono text-[9px] text-slate-600 mt-2 text-center">
                  Sepolia testnet · free to test.{" "}
                  <a href="https://portal.cdp.coinbase.com/products/faucet"
                    target="_blank" rel="noopener noreferrer"
                    className="text-[#4FC3F7] hover:opacity-80">Get test ETH →</a>
                </p>
              )}
              {lNetwork === "mainnet" && (
                <p className="font-mono text-[9px] text-amber-400/70 mt-2 text-center">
                  Beryl is live on Mainnet. Real ETH required for gas.
                </p>
              )}

              {deployErr && (
                <div className="rounded-xl border border-[#EF444430] px-4 py-2.5 mt-3">
                  <p className="font-mono text-xs text-[#EF4444]">{deployErr}</p>
                </div>
              )}
              {deployTxHash && !deployedToken && (
                <p className="font-mono text-[9px] text-slate-600 mt-2 text-center break-all">
                  tx: {deployTxHash.slice(0, 16)}…{deployTxHash.slice(-8)}
                </p>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-[#34D399]/30 bg-[#34D399]/5 p-4">
              <p className="font-mono text-sm text-[#34D399] font-bold mb-1">✓ B20 Deployed</p>
              <p className="font-mono text-xs text-white break-all mb-3">{deployedToken}</p>
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={() => onScanToken(deployedToken, lNetwork as Network)}
                  className="font-mono text-xs px-3 py-1.5 rounded-xl transition-all"
                  style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                  Scan in Scanner →
                </button>
                <a href={`${net.explorer}/token/${deployedToken}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-mono text-xs px-3 py-1.5 rounded-xl border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
                  Basescan ↗
                </a>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* After deployment guide */}
      <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
        <div className="px-4 py-3 bg-[#0a0a0f] border-b border-[#1A1A2E]">
          <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase">After Deployment</p>
        </div>
        <div className="divide-y divide-[#0d0d18]">
          {[
            { n: "1", title: "Assign roles",     desc: "Grant MINT_ROLE, PAUSE_ROLE, BURN_ROLE, etc. via grantRole(role, address) from DEFAULT_ADMIN_ROLE." },
            { n: "2", title: "Set supply cap",   desc: "Call updateSupplyCap(amount) to enforce a hard ceiling. Omit (or set uint128.max) for uncapped." },
            { n: "3", title: "Configure policy", desc: "Create an ALLOWLIST or BLOCKLIST on PolicyRegistry, then apply with token.updatePolicy(scope, policyId)." },
            { n: "4", title: "Verify in Scanner", desc: "Paste your token address into the Scanner tab to confirm all on-chain config is correct before going live." },
          ].map(({ n: step, title, desc }) => (
            <div key={step} className="flex items-start gap-4 px-5 py-4">
              <span className="font-mono text-sm text-slate-600 w-5 shrink-0 pt-0.5">{step}.</span>
              <div>
                <p className="font-mono text-sm text-slate-300 font-medium mb-0.5">{title}</p>
                <p className="font-mono text-xs text-slate-600 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface B20ClientProps {
  initialAddress?: string;
  initialNetwork?: "mainnet" | "sepolia";
}

export default function B20Client({ initialAddress = "", initialNetwork = "mainnet" }: B20ClientProps) {
  const router = useRouter();

  // ── Shared ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("scanner");
  const [network,   setNetwork]   = useState<Network>(initialNetwork);
  const { setContextual } = useAppChrome();

  // Beryl badge (client-only to avoid hydration mismatch)
  const [berylLabel, setBerylLabel] = useState<{ active: boolean; text: string } | null>(null);
  useEffect(() => {
    const BERYL_TS = new Date("2026-06-25T18:00:00Z").getTime();
    const now = Date.now();
    if (network === "sepolia") {
      setBerylLabel({ active: true, text: "Active on Sepolia" });
    } else if (now >= BERYL_TS) {
      setBerylLabel({ active: true, text: "Beryl live on Mainnet" });
    } else {
      const diff  = BERYL_TS - now;
      const hours = Math.floor(diff / 3_600_000);
      const mins  = Math.floor((diff % 3_600_000) / 60_000);
      setBerylLabel({ active: false, text: `Mainnet in ${hours}h ${mins}m` });
    }
  }, [network]);

  // Register mobile contextual nav (Docs opens /docs/beryl as external link)
  useEffect(() => {
    setContextual({
      barTitle:   "B20 Hub",
      groupTitle: "B20 Hub",
      items: [
        ...TABS.map(tab => ({
          id:       tab.id,
          label:    tab.label,
          icon:     TabIcons[tab.id],
          active:   activeTab === tab.id,
          onSelect: () => setActiveTab(tab.id),
        })),
        {
          id:       "docs",
          label:    "Docs",
          icon:     DocsIcon,
          active:   false,
          onSelect: () => router.push("/docs/beryl"),
        },
      ],
    });
    return () => setContextual(null);
  }, [activeTab, setContextual, router]);

  // ── Scanner ───────────────────────────────────────────────────────────────
  const [scanAddr,    setScanAddr]    = useState(initialAddress);
  const [scanResult,  setScanResult]  = useState<B20Inspection | null>(null);
  const [scanError,   setScanError]   = useState("");
  const [scanPending, startScan]      = useTransition();
  const [recentScans, setRecentScans] = useState<Array<{ addr: string; name: string; symbol: string; net: Network }>>([]);

  const addrClean = scanAddr.trim();
  const addrValid = isValidAddr(addrClean);

  const doScan = useCallback((overrideAddr?: string) => {
    const clean = (overrideAddr ?? addrClean).trim();
    if (!isValidAddr(clean)) return;
    setScanError(""); setScanResult(null);
    startScan(async () => {
      try {
        const result = await runB20Inspect(clean, network);
        // Auto-detect: if not found on this network, try the other
        if (!result.isB20) {
          const other: Network = network === "mainnet" ? "sepolia" : "mainnet";
          try {
            const alt = await runB20Inspect(clean, other);
            if (alt.isB20) {
              setNetwork(other);
              setScanResult(alt);
              if (alt.name) setRecentScans(p => [{ addr: clean, name: alt.name!, symbol: alt.symbol ?? "", net: other }, ...p.filter(r => r.addr !== clean)].slice(0, 8));
              window.history.replaceState({}, "", `/app/b20?${new URLSearchParams({ address: clean, network: other })}`);
              return;
            }
          } catch { /* ignore */ }
        }
        setScanResult(result);
        if (result.isB20 && result.name) {
          setRecentScans(p => [{ addr: clean, name: result.name!, symbol: result.symbol ?? "", net: network }, ...p.filter(r => r.addr !== clean)].slice(0, 8));
        }
        window.history.replaceState({}, "", `/app/b20?${new URLSearchParams({ address: clean, network })}`);
      } catch (e) {
        setScanError((e as Error).message ?? "Inspection failed.");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrClean, addrValid, network]);

  // Auto-trigger on mount (share link)
  useEffect(() => {
    if (initialAddress && isValidAddr(initialAddress)) doScan(initialAddress);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Roles ─────────────────────────────────────────────────────────────────
  const [roleToken,    setRoleToken]   = useState("");
  const [roleWallet,   setRoleWallet]  = useState("");
  const [rolesResult,  setRolesResult] = useState<B20RolesResult | null>(null);
  const [rolesError,   setRolesError]  = useState("");
  const [rolesPending, startRoles]     = useTransition();

  function doRoles() {
    if (!isValidAddr(roleToken) || !isValidAddr(roleWallet)) return;
    setRolesError(""); setRolesResult(null);
    startRoles(async () => {
      try { setRolesResult(await runB20Roles(roleToken.trim(), roleWallet.trim(), network)); }
      catch (e) { setRolesError((e as Error).message ?? "Role check failed."); }
    });
  }

  // ── Registry ──────────────────────────────────────────────────────────────
  const [registryResult, setRegistryResult] = useState<B20RegistryResult | null>(null);
  const [registryError,  setRegistryError]  = useState("");
  const [regPending,     startReg]          = useTransition();
  const regLoadedFor = useRef<Network | null>(null);

  const doRegistry = useCallback(() => {
    setRegistryError("");
    startReg(async () => {
      try {
        const r = await runB20Registry(network);
        setRegistryResult(r);
        regLoadedFor.current = network;
      } catch (e) { setRegistryError((e as Error).message ?? "Registry load failed."); }
    });
  }, [network]);

  useEffect(() => {
    if (activeTab === "registry" && regLoadedFor.current !== network) doRegistry();
  }, [activeTab, network, doRegistry]);

  // Network change → reset all tab results
  useEffect(() => {
    regLoadedFor.current = null;
    setRegistryResult(null); setRegistryError("");
    setScanResult(null);     setScanError("");
    setRolesResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // Registry row → fill Scanner + auto-inspect
  function handleRegistrySelect(addr: string) {
    setScanAddr(addr);
    setActiveTab("scanner");
    setScanError(""); setScanResult(null);
    startScan(async () => {
      try {
        const result = await runB20Inspect(addr.trim(), network);
        setScanResult(result);
        if (result.isB20 && result.name)
          setRecentScans(p => [{ addr: addr.trim(), name: result.name!, symbol: result.symbol ?? "", net: network }, ...p.filter(r => r.addr !== addr.trim())].slice(0, 8));
        window.history.replaceState({}, "", `/app/b20?${new URLSearchParams({ address: addr.trim(), network })}`);
      } catch (e) { setScanError((e as Error).message ?? "Inspection failed."); }
    });
  }

  // ── Cross-tab: scan a just-deployed token ─────────────────────────────────
  function handleScanDeployed(addr: string, net: Network) {
    setScanAddr(addr);
    setNetwork(net);
    setActiveTab("scanner");
    setScanError(""); setScanResult(null);
    startScan(async () => {
      try {
        const result = await runB20Inspect(addr.trim(), net);
        setScanResult(result);
        if (result.isB20 && result.name)
          setRecentScans(p => [{ addr: addr.trim(), name: result.name!, symbol: result.symbol ?? "", net }, ...p.filter(r => r.addr !== addr.trim())].slice(0, 8));
        window.history.replaceState({}, "", `/app/b20?${new URLSearchParams({ address: addr.trim(), network: net })}`);
      } catch (e) { setScanError((e as Error).message ?? "Inspection failed."); }
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex bg-[#050508] font-mono h-full overflow-hidden">

      {/* ══════════════════════════════════════════════════════════════════
          SUB-SIDEBAR (lg+)
      ══════════════════════════════════════════════════════════════════ */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 h-full border-r border-[#1A1A2E] bg-[#050508]">

        {/* Header */}
        <div className="px-5 h-14 flex items-center justify-between border-b border-[#1A1A2E] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] shrink-0"
              style={{ boxShadow: "0 0 5px #4FC3F780" }} />
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// B20 HUB</p>
          </div>
          {/* Network toggle */}
          <div className="flex rounded-lg border border-[#1A1A2E] overflow-hidden">
            {(["mainnet", "sepolia"] as const).map(n => (
              <button key={n} onClick={() => setNetwork(n)}
                className="px-2.5 py-1 font-mono text-[8px] transition-colors"
                style={network === n ? { background: "#4FC3F715", color: "#4FC3F7" } : { color: "#334155" }}>
                {n === "mainnet" ? "Main" : "Sepolia"}
              </button>
            ))}
          </div>
        </div>

        {/* Nav */}
        <nav className="px-2 pt-2 pb-1 shrink-0 space-y-0.5">
          {TABS.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors relative"
                style={isActive ? { background: "#4FC3F712" } : undefined}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "#ffffff08"; }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-r-full bg-[#4FC3F7]"
                    style={{ boxShadow: "0 0 6px #4FC3F780" }} />
                )}
                <span className="shrink-0" style={{ color: isActive ? "#4FC3F7" : "#64748b" }}>
                  {TabIcons[tab.id]}
                </span>
                <span className="font-mono text-[13px] flex-1 text-left"
                  style={{ color: isActive ? "#4FC3F7" : "#cbd5e1" }}>
                  {tab.label}
                </span>
                {tab.id === "registry" && registryResult && (
                  <span className="font-mono text-[8px] text-slate-600">{registryResult.total}</span>
                )}
                {tab.id === "registry" && regPending && (
                  <span className="w-1 h-1 rounded-full bg-[#4FC3F7] animate-pulse shrink-0" />
                )}
              </button>
            );
          })}

          {/* Docs — navigates to /docs/beryl */}
          <a href="/docs/beryl"
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "#ffffff08"; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
            <span className="shrink-0 text-[#64748b]">{DocsIcon}</span>
            <span className="font-mono text-[13px] flex-1 text-left text-[#cbd5e1]">Docs</span>
            <span className="font-mono text-[8px] text-slate-600">↗</span>
          </a>
        </nav>

        {/* Beryl status */}
        {berylLabel && (
          <div className="px-5 py-2 border-t border-[#1A1A2E] shrink-0">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ background: berylLabel.active ? "#22C55E" : "#F59E0B",
                         boxShadow:  berylLabel.active ? "0 0 4px #22C55E80" : "0 0 4px #F59E0B80" }} />
              <span className="font-mono text-[9px]"
                style={{ color: berylLabel.active ? "#22C55E" : "#F59E0B" }}>
                {berylLabel.text}
              </span>
            </div>
          </div>
        )}

        {/* Recents */}
        {recentScans.length > 0 && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0 border-t border-[#1A1A2E] mt-1">
            <div className="px-5 pt-3 pb-1 shrink-0">
              <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase">Recents</p>
            </div>
            <div className="flex-1 overflow-y-auto pb-2">
              {recentScans.map(r => {
                const isActive = scanResult?.address?.toLowerCase() === r.addr && activeTab === "scanner";
                return (
                  <button key={r.addr}
                    onClick={() => { setScanAddr(r.addr); setActiveTab("scanner"); doScan(r.addr); }}
                    className={`w-full text-left flex items-center gap-2 px-5 py-2 transition-all ${isActive ? "bg-[#4FC3F7]/8" : "hover:bg-[#ffffff05]"}`}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: isActive ? "#4FC3F7" : "#334155" }} />
                    <div className="flex-1 min-w-0">
                      <p className={`font-mono text-[12px] truncate ${isActive ? "text-white" : "text-slate-400"}`}>
                        {r.name}{r.symbol ? ` $${r.symbol}` : ""}
                      </p>
                      <p className="font-mono text-[8px] text-slate-700 truncate">{r.addr.slice(0, 10)}…</p>
                    </div>
                    <span className="font-mono text-[8px] text-slate-700 shrink-0">
                      {r.net === "mainnet" ? "M" : "S"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {recentScans.length === 0 && <div className="flex-1" />}
      </aside>

      {/* ══════════════════════════════════════════════════════════════════
          MAIN CONTENT
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

        {/* Mobile tab bar (lg:hidden) */}
        <div className="lg:hidden flex items-center gap-1 px-3 py-2 border-b border-[#1A1A2E] overflow-x-auto shrink-0">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-[10px] shrink-0 transition-colors"
              style={activeTab === tab.id
                ? { background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }
                : { color: "#475569", border: "1px solid transparent" }}>
              <span style={{ color: activeTab === tab.id ? "#4FC3F7" : "#64748b" }}>{TabIcons[tab.id]}</span>
              {tab.label}
            </button>
          ))}
          <a href="/docs/beryl"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono text-[10px] shrink-0"
            style={{ color: "#475569", border: "1px solid transparent" }}>
            <span className="text-[#64748b]">{DocsIcon}</span>
            Docs ↗
          </a>
          <div className="ml-auto flex rounded-lg border border-[#1A1A2E] overflow-hidden shrink-0">
            {(["mainnet", "sepolia"] as const).map(n => (
              <button key={n} onClick={() => setNetwork(n)}
                className="px-2 py-1 font-mono text-[8px] transition-colors"
                style={network === n ? { background: "#4FC3F715", color: "#4FC3F7" } : { color: "#334155" }}>
                {n === "mainnet" ? "M" : "S"}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable tab content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8">

            {/* ── SCANNER ───────────────────────────────────────────── */}
            {activeTab === "scanner" && (
              <div>
                <div className="mb-6">
                  <h2 className="font-mono text-xl font-bold text-white mb-1">Token Scanner</h2>
                  <p className="font-mono text-sm text-slate-500 mb-3">
                    Real on-chain state via multicall. Zero LLM. Auto-detects Mainnet vs Sepolia.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <InfoChip>Multicall</InfoChip>
                    <InfoChip>Zero LLM</InfoChip>
                    <InfoChip>Auto-detect</InfoChip>
                  </div>
                </div>

                {/* Input */}
                <div className="flex gap-2">
                  <input value={scanAddr}
                    onChange={e => setScanAddr(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && addrValid && !scanPending) doScan(); }}
                    placeholder="0x… token address (40 hex chars)"
                    spellCheck={false}
                    className={`flex-1 min-w-0 ${INPUT_CLS}`}
                  />
                  <button onClick={() => doScan()} disabled={!addrValid || scanPending}
                    className="px-5 py-2.5 rounded-xl font-mono text-xs font-semibold transition-all shrink-0"
                    style={addrValid && !scanPending
                      ? { background: "#4FC3F720", color: "#4FC3F7", border: "1px solid #4FC3F740" }
                      : { background: "#0d0d18", color: "#334155", border: "1px solid #1A1A2E", cursor: "not-allowed" }}>
                    {scanPending ? "Reading…" : "Inspect"}
                  </button>
                </div>

                {scanAddr && !addrValid && (
                  <p className="font-mono text-xs text-[#EF4444] mt-1.5 ml-1">
                    Must be 0x followed by 40 hex characters.
                  </p>
                )}

                {/* Example chips */}
                {!scanResult && !scanPending && (
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    <span className="font-mono text-[9px] text-slate-700 self-center">Try:</span>
                    {[
                      { label: "B20Factory",     addr: "0xB20f000000000000000000000000000000000000" },
                      { label: "PolicyRegistry", addr: "0x8453000000000000000000000000000000000002" },
                    ].map(({ label, addr }) => (
                      <button key={addr} onClick={() => setScanAddr(addr)}
                        className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-slate-500 hover:text-slate-300 hover:border-[#2a2a3e] transition-colors">
                        {label}
                      </button>
                    ))}
                    {registryResult?.entries.slice(0, 2).map(e => (
                      <button key={e.token} onClick={() => setScanAddr(e.token)}
                        className="font-mono text-[9px] px-2 py-0.5 rounded border border-[#1A1A2E] text-[#4FC3F7] hover:border-[#4FC3F730] transition-colors">
                        {e.symbol || "B20"} ↗
                      </button>
                    ))}
                  </div>
                )}

                {/* Refresh */}
                {scanResult && !scanPending && (
                  <div className="mt-2">
                    <button onClick={() => doScan()} disabled={!addrValid}
                      className="font-mono text-xs px-3 py-1 rounded-lg border border-[#1A1A2E] text-slate-500 hover:text-slate-300 transition-colors">
                      Refresh
                    </button>
                  </div>
                )}

                {/* Loading */}
                {scanPending && (
                  <div className="mt-6 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                    <span className="font-mono text-xs text-slate-500">
                      Reading from Base {network === "mainnet" ? "Mainnet" : "Sepolia"} RPC…
                    </span>
                  </div>
                )}

                {/* Error */}
                {scanError && !scanPending && (
                  <div className="mt-4 rounded-2xl border border-[#EF444430] px-4 py-3">
                    <p className="font-mono text-sm text-[#EF4444]">{scanError}</p>
                    <button onClick={() => setScanError("")}
                      className="font-mono text-xs text-slate-500 hover:text-slate-300 mt-2 transition-colors">
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Result */}
                {scanResult && !scanPending && (
                  <ResultCard info={scanResult}
                    onScanAnother={() => {
                      setScanResult(null); setScanError(""); setScanAddr("");
                      window.history.replaceState({}, "", "/app/b20");
                    }} />
                )}

                {/* Empty state */}
                {!scanResult && !scanPending && !scanError && (
                  <div className="mt-6 rounded-2xl border border-[#1A1A2E] overflow-hidden">
                    <div className="px-5 py-4 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                      <p className="font-mono text-sm text-slate-300 font-medium mb-1">What this checks</p>
                      <p className="font-mono text-xs text-slate-600">
                        Paste any Base token address to read real-time on-chain data via multicall. No LLM involved.
                      </p>
                    </div>
                    <div className="divide-y divide-[#0d0d18]">
                      {[
                        { icon: "✓",  label: "B20 verification",   desc: "Confirms if the token is a real B20 precompile token on Base" },
                        { icon: "⏸",  label: "Pause status",       desc: "Transfer, Mint, and Burn pause state — each independently controlled" },
                        { icon: "🔐", label: "Policy gates",       desc: "Which scopes are allowlist/blocklist restricted (KYC, compliance)" },
                        { icon: "📊", label: "Supply & decimals",  desc: "Total supply, supply cap, decimals, variant-specific fields" },
                      ].map(({ icon, label, desc }) => (
                        <div key={label} className="flex items-center gap-4 px-5 py-4">
                          <span className="text-lg w-6 shrink-0 text-center">{icon}</span>
                          <div>
                            <p className="font-mono text-sm text-slate-300">{label}</p>
                            <p className="font-mono text-xs text-slate-600 mt-0.5">{desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── ROLES ─────────────────────────────────────────────── */}
            {activeTab === "roles" && (
              <div>
                <div className="mb-6">
                  <h2 className="font-mono text-xl font-bold text-white mb-1">Role Checker</h2>
                  <p className="font-mono text-sm text-slate-500 mb-4">
                    Check which of the 7 B20 roles a wallet holds on a specific token.
                  </p>
                  <div className="rounded-2xl border border-[#F59E0B25] bg-[#F59E0B05] px-4 py-3">
                    <p className="font-mono text-sm text-[#F59E0B] font-medium mb-0.5">
                      B20 omits AccessControlEnumerable
                    </p>
                    <p className="font-mono text-xs text-slate-500 leading-relaxed">
                      Role holders cannot be enumerated — you must check specific wallet addresses.
                      Use this to verify whether a known address holds a given role.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
                      Token Address
                    </label>
                    <input value={roleToken} onChange={e => setRoleToken(e.target.value)}
                      placeholder="0x… B20 token address" spellCheck={false} className={INPUT_CLS} />
                  </div>
                  <div>
                    <label className="font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1.5">
                      Wallet to Check
                    </label>
                    <input value={roleWallet} onChange={e => setRoleWallet(e.target.value)}
                      placeholder="0x… wallet address" spellCheck={false} className={INPUT_CLS} />
                  </div>
                </div>

                <button onClick={doRoles}
                  disabled={!isValidAddr(roleToken) || !isValidAddr(roleWallet) || rolesPending}
                  className="px-5 py-2.5 rounded-xl font-mono text-xs font-semibold transition-all mb-6"
                  style={isValidAddr(roleToken) && isValidAddr(roleWallet) && !rolesPending
                    ? { background: "#4FC3F720", color: "#4FC3F7", border: "1px solid #4FC3F740" }
                    : { background: "#0d0d18", color: "#334155", border: "1px solid #1A1A2E", cursor: "not-allowed" }}>
                  {rolesPending ? "Checking…" : "Check Roles"}
                </button>

                {rolesPending && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                    <span className="font-mono text-xs text-slate-500">Multicall in 2 rounds — fetching role hashes, then checking…</span>
                  </div>
                )}
                {rolesError && !rolesPending && (
                  <div className="rounded-2xl border border-[#EF444430] px-4 py-3 mb-4">
                    <p className="font-mono text-xs text-[#EF4444]">{rolesError}</p>
                  </div>
                )}

                {/* Results */}
                {rolesResult && !rolesPending && (
                  <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
                    <div className="px-4 py-3 bg-[#0a0a0f] border-b border-[#1A1A2E]">
                      <p className="font-mono text-xs text-slate-500">
                        <span className="text-slate-300">{truncAddr(rolesResult.wallet, 8)}</span>
                        <span className="text-slate-600"> on token </span>
                        <span className="text-slate-300">{truncAddr(rolesResult.token, 8)}</span>
                        <span className="text-slate-600"> · {rolesResult.network}</span>
                      </p>
                    </div>
                    <div className="divide-y divide-[#0d0d18]">
                      {rolesResult.roles.map(role => (
                        <div key={role.roleKey} className="flex items-center justify-between px-4 py-3.5">
                          <div>
                            <span className="font-mono text-sm text-slate-200">{role.name}</span>
                            {role.hash && (
                              <span className="font-mono text-[9px] text-slate-700 ml-3 hidden sm:inline">
                                {role.hash.slice(0, 14)}…
                              </span>
                            )}
                          </div>
                          <span className="font-mono text-xs font-semibold px-2.5 py-1 rounded-full"
                            style={role.held === null
                              ? { background: "#64748b15", color: "#64748b" }
                              : role.held
                                ? { background: "#22C55E15", color: "#22C55E", border: "1px solid #22C55E30" }
                                : { background: "#0f0f14", color: "#334155" }}>
                            {role.held === null ? "unknown" : role.held ? "HELD" : "—"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="px-4 py-2.5 bg-[#0a0a0f] border-t border-[#1A1A2E]">
                      <p className="font-mono text-[9px] text-slate-700">
                        Checked {new Date(rolesResult.checkedAt).toLocaleTimeString()} via multicall (2 rounds).
                      </p>
                    </div>
                  </div>
                )}

                {/* Empty state — role reference */}
                {!rolesResult && !rolesPending && !rolesError && (
                  <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
                    <div className="px-4 py-3 bg-[#0a0a0f] border-b border-[#1A1A2E]">
                      <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase">
                        7 B20 Roles Reference
                      </p>
                    </div>
                    <div className="divide-y divide-[#0d0d18]">
                      {[
                        { r: "DEFAULT_ADMIN_ROLE", d: "Manages all roles + supply cap via updateSupplyCap()" },
                        { r: "MINT_ROLE",          d: "Mint new tokens to any address" },
                        { r: "BURN_ROLE",          d: "Burn tokens (holder must approve or consent)" },
                        { r: "BURN_BLOCKED_ROLE",  d: "Freeze-seize — burnBlocked(from, amount) forcibly confiscates" },
                        { r: "PAUSE_ROLE",         d: "Pause TRANSFER, MINT, or BURN independently" },
                        { r: "UNPAUSE_ROLE",       d: "Unpause any paused feature" },
                        { r: "METADATA_ROLE",      d: "Update token name, symbol, and metadata" },
                      ].map(({ r, d }) => (
                        <div key={r} className="flex items-start gap-4 px-4 py-3">
                          <code className="font-mono text-[10px] text-[#4FC3F7] w-[155px] shrink-0 pt-0.5">{r}</code>
                          <span className="font-mono text-xs text-slate-500 leading-relaxed">{d}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── REGISTRY ──────────────────────────────────────────── */}
            {activeTab === "registry" && (
              <div>
                <div className="mb-6 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-mono text-xl font-bold text-white mb-1">On-chain Registry</h2>
                    <p className="font-mono text-sm text-slate-500">
                      All B20 tokens from B20Factory events. Newest first. Click a row to inspect.
                    </p>
                  </div>
                  <button onClick={doRegistry} disabled={regPending}
                    className="font-mono text-xs px-3 py-1.5 rounded-xl border border-[#1A1A2E] text-slate-500 hover:text-slate-300 transition-colors shrink-0 mt-0.5">
                    {regPending ? "Loading…" : "Refresh"}
                  </button>
                </div>

                {/* Stats */}
                {registryResult && !regPending && (
                  <div className="grid grid-cols-3 gap-2 mb-5">
                    {[
                      { label: "Total tokens", value: registryResult.total.toString() },
                      { label: "Network",      value: registryResult.network === "mainnet" ? "Mainnet" : "Sepolia" },
                      { label: "From block",   value: `#${Number(registryResult.fromBlock).toLocaleString()}` },
                    ].map(({ label, value }) => (
                      <div key={label} className="rounded-xl bg-[#0a0a12] border border-[#1A1A2E] px-3 py-2.5">
                        <p className="font-mono text-[9px] text-slate-600 mb-0.5">{label}</p>
                        <p className="font-mono text-xs text-slate-200">{value}</p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Initial placeholder — shown briefly before auto-load completes */}
                {!registryResult && !regPending && !registryError && (
                  <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
                    <div className="px-4 py-3 bg-[#0a0a0f] border-b border-[#1A1A2E]">
                      <p className="font-mono text-xs text-slate-400 font-medium mb-0.5">B20Factory</p>
                      <p className="font-mono text-[10px] text-slate-600 break-all">
                        0xB20f000000000000000000000000000000000000
                      </p>
                    </div>
                    <div className="divide-y divide-[#0d0d18]">
                      {[
                        { label: "B20Created event", desc: "Emitted on every token deployment — name, symbol, variant, creator" },
                        { label: "On-chain only",    desc: "Registry is reconstructed from raw event logs — no database, no indexer" },
                        { label: "Beryl required",   desc: "Factory only emits events after Beryl activation on the selected network" },
                      ].map(({ label, desc }) => (
                        <div key={label} className="flex items-start gap-4 px-4 py-3">
                          <span className="font-mono text-[9px] text-[#4FC3F7] w-[130px] shrink-0 pt-0.5">{label}</span>
                          <span className="font-mono text-xs text-slate-600 leading-relaxed">{desc}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {regPending && (
                  <div className="flex items-center gap-2 mb-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                    <span className="font-mono text-xs text-slate-500">Scanning B20Factory event log…</span>
                  </div>
                )}
                {registryError && !regPending && (
                  <div className="rounded-2xl border border-[#EF444430] px-4 py-3 mb-4">
                    <p className="font-mono text-xs text-[#EF4444]">{registryError}</p>
                    <button onClick={doRegistry}
                      className="font-mono text-xs text-slate-500 hover:text-slate-300 mt-2 transition-colors">
                      Retry
                    </button>
                  </div>
                )}

                {/* Empty */}
                {registryResult && !regPending && registryResult.entries.length === 0 && (
                  <div className="rounded-2xl border border-[#1A1A2E] px-5 py-10 text-center">
                    <p className="font-mono text-sm text-slate-400 mb-2">No B20 tokens on {network} yet.</p>
                    <p className="font-mono text-xs text-slate-600 mb-5">
                      {network === "mainnet"
                        ? "Beryl mainnet is live. Tokens will appear here as they are deployed."
                        : "Deploy a B20 token on Sepolia to see it here."}
                    </p>
                    <button onClick={() => setActiveTab("launch")}
                      className="font-mono text-xs px-5 py-2 rounded-xl transition-all"
                      style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F735" }}>
                      Launch your first B20 →
                    </button>
                  </div>
                )}

                {/* Token list */}
                {registryResult && !regPending && registryResult.entries.length > 0 && (
                  <div>
                    <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden divide-y divide-[#0d0d18]">
                      {registryResult.entries.map(entry => (
                        <button key={`${entry.token}-${entry.blockNumber}`}
                          onClick={() => handleRegistrySelect(entry.token)}
                          className="w-full flex items-center justify-between px-4 py-4 hover:bg-[#0d0d18] transition-colors text-left">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-mono text-sm text-white font-medium">{entry.name || "—"}</span>
                              {entry.symbol && <span className="font-mono text-xs text-slate-400">${entry.symbol}</span>}
                              <VariantBadge variant={entry.variantLabel} />
                            </div>
                            <div className="font-mono text-[9px] text-slate-600 truncate">{entry.token}</div>
                          </div>
                          <div className="flex items-center gap-3 shrink-0 ml-4">
                            <span className="font-mono text-xs text-slate-600">#{Number(entry.blockNumber).toLocaleString()}</span>
                            <span className="font-mono text-xs text-[#4FC3F7]">Inspect →</span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between mt-2 px-1">
                      <p className="font-mono text-[9px] text-slate-700">
                        {registryResult.entries.length} of {registryResult.total} tokens
                        {registryResult.capped ? " (capped at 100)" : ""}
                      </p>
                      <a href={`https://${network === "mainnet" ? "" : "sepolia."}basescan.org/address/0xb20f000000000000000000000000000000000000#events`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-mono text-[9px] text-slate-600 hover:text-slate-400 transition-colors">
                        All events on Basescan ↗
                      </a>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── LAUNCH ────────────────────────────────────────────── */}
            {activeTab === "launch" && <LaunchTab onScanToken={handleScanDeployed} />}

          </div>
        </div>
      </div>
    </div>
  );
}
