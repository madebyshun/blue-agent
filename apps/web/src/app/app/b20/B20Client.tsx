"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { runB20Inspect } from "./inspect-action";
import { runB20Roles }   from "./roles-action";
import { runB20Registry } from "./registry-action";
import { runB20Simulate } from "./simulate-action";
import type { B20Inspection, PolicyInfo } from "@/lib/b20/inspect";
import type { B20RolesResult }            from "@/lib/b20/roles";
import type { B20RegistryResult }         from "@/lib/b20/registry-logs";
import type { B20SimulateResult, SimulateOutcome } from "@/lib/b20/simulate";

// ── Types ─────────────────────────────────────────────────────────────────────

type Tab     = "scanner" | "roles" | "registry" | "simulator" | "docs";
type Network = "mainnet" | "sepolia";

// ── Utilities ─────────────────────────────────────────────────────────────────

function isValidAddr(v: string) { return /^0x[a-fA-F0-9]{40}$/.test(v.trim()); }
function truncAddr(a: string)   { return `${a.slice(0, 6)}…${a.slice(-4)}`; }

interface VerdictLine { kind: "warn" | "ok"; text: string; }

function computeVerdict(info: B20Inspection): VerdictLine[] {
  const lines: VerdictLine[] = [];
  if (info.paused?.transfer) lines.push({ kind: "warn", text: "Transfers are paused by the issuer." });
  if (info.paused?.mint)     lines.push({ kind: "warn", text: "Minting is paused by the issuer." });
  if (info.paused?.burn)     lines.push({ kind: "warn", text: "Burns are paused by the issuer." });
  const scopeLabel: Record<string, string> = {
    transferSender: "transfer sender", transferReceiver: "transfer receiver",
    transferExecutor: "transfer executor", mintReceiver: "mint receiver",
  };
  if (info.policies) {
    for (const [scope, policy] of Object.entries(info.policies) as [string, PolicyInfo][]) {
      if (policy.restricted) {
        lines.push({ kind: "warn", text: `Policy-gated (KYC/allowlist) on the ${scopeLabel[scope] ?? scope} scope.` });
      }
    }
  }
  if (info.supplyCapUncapped) lines.push({ kind: "warn", text: "Supply is uncapped — issuer can mint unlimited tokens." });
  const noPause = !info.paused?.transfer && !info.paused?.mint && !info.paused?.burn;
  const noGate  = !info.policies || Object.values(info.policies).every(p => !p.restricted);
  if (noPause && noGate) lines.push({ kind: "ok", text: "No issuer-side transfer restrictions detected." });
  if (!info.supplyCapUncapped && info.supplyCapFormatted && info.supplyCapFormatted !== "uncapped")
    lines.push({ kind: "ok", text: `Supply is capped at ${info.supplyCapFormatted} ${info.symbol ?? "tokens"}.` });
  return lines;
}

// ── Shared visual components ──────────────────────────────────────────────────

function VariantBadge({ variant }: { variant?: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    ASSET:      { bg: "#4FC3F715", text: "#4FC3F7" },
    STABLECOIN: { bg: "#22C55E15", text: "#22C55E" },
    UNKNOWN:    { bg: "#64748b20", text: "#94a3b8" },
  };
  const c = colors[variant ?? "UNKNOWN"] ?? colors.UNKNOWN;
  return (
    <span className="font-mono text-[9px] px-2 py-0.5 rounded-full"
      style={{ background: c.bg, color: c.text }}>
      {variant ?? "UNKNOWN"}
    </span>
  );
}

function StatusDot({ active, label }: { active: boolean; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ background: active ? "#22C55E" : "#EF4444",
                 boxShadow:  active ? "0 0 4px #22C55E80" : "0 0 4px #EF444480" }} />
      <span className="font-mono text-[10px]" style={{ color: active ? "#22C55E" : "#EF4444" }}>{label}</span>
      <span className="font-mono text-[9px] text-slate-600 ml-0.5">{active ? "(active)" : "(paused)"}</span>
    </div>
  );
}

function PolicyRow({ label, policy }: { label: string; policy: PolicyInfo }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[#0d0d18]">
      <span className="font-mono text-[9px] text-slate-500 w-[130px] shrink-0 mt-0.5">{label}</span>
      {policy.restricted ? (
        <div>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#F59E0B20", color: "#F59E0B" }}>RESTRICTED</span>
          {policy.admin && <span className="font-mono text-[9px] text-slate-500 ml-2">admin {truncAddr(policy.admin)}</span>}
          <div className="font-mono text-[9px] text-slate-600 mt-0.5">policyId {policy.policyId}</div>
        </div>
      ) : (
        <span className="font-mono text-[9px]" style={{ color: "#22C55E" }}>Open (ALWAYS_ALLOW)</span>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="font-mono text-[8px] text-slate-600 block">{label}</span>
      <span className="font-mono text-[10px] text-slate-300">{value}</span>
    </div>
  );
}

// ── Scanner result card ───────────────────────────────────────────────────────

function ResultCard({ info, onScanAnother }: { info: B20Inspection; onScanAnother: () => void }) {
  const [copied, setCopied] = useState(false);
  const verdict   = computeVerdict(info);
  const hasWarns  = verdict.some(v => v.kind === "warn");

  function copyAddr() {
    navigator.clipboard.writeText(info.address).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }
  function copyShare() {
    const p = new URLSearchParams({ address: info.address, network: info.network });
    navigator.clipboard.writeText(`${window.location.origin}/app/b20?${p}`);
  }

  if (!info.isB20) {
    return (
      <div className="rounded-xl border border-[#1A1A2E] p-4 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full" style={{ background: "#64748b20", color: "#94a3b8" }}>NOT B20</span>
          <span className="font-mono text-[10px] text-slate-500">{info.network}</span>
        </div>
        <p className="font-mono text-[11px] text-slate-300 mb-1">This address is not a B20 token.</p>
        <p className="font-mono text-[10px] text-slate-500 mb-3">{info._note}</p>
        <div className="font-mono text-[9px] text-slate-600 break-all mb-4">{info.address}</div>
        <div className="flex gap-2">
          <a href={info.explorerUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Basescan ↗
          </a>
          <button onClick={onScanAnother}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Scan another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border mt-4 overflow-hidden" style={{ borderColor: hasWarns ? "#F59E0B40" : "#22C55E30" }}>
      <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E]" style={{ background: hasWarns ? "#F59E0B06" : "#22C55E06" }}>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-mono text-[13px] font-bold text-white">{info.name ?? "—"}</span>
          {info.symbol && <span className="font-mono text-[11px] text-slate-400">${info.symbol}</span>}
          <VariantBadge variant={info.variant} />
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded" style={{ background: "#22C55E20", color: "#22C55E" }}>✓ B20</span>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <span className="font-mono text-[9px] text-slate-500">{info.network === "mainnet" ? "Base Mainnet" : "Base Sepolia"}</span>
          <span className="font-mono text-[9px] text-slate-600">read in {(info.rpcLatencyMs / 1000).toFixed(2)}s</span>
          <a href={info.explorerUrl} target="_blank" rel="noopener noreferrer" className="font-mono text-[9px] text-[#4FC3F7] hover:underline">Basescan ↗</a>
        </div>
        <div className="font-mono text-[9px] text-slate-600 mt-1 break-all">{info.address}</div>
      </div>

      <div className="p-4 space-y-4">
        <section>
          <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">Key Facts</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <Fact label="Decimals"     value={info.decimals?.toString() ?? "—"} />
            <Fact label="Total Supply" value={info.totalSupplyFormatted ?? "—"} />
            <Fact label="Supply Cap"   value={info.supplyCapFormatted ?? "—"} />
            {info.variant === "STABLECOIN" && info.currency && <Fact label="Currency" value={info.currency} />}
            {info.variant === "ASSET" && info.multiplier && (
              <Fact label="Multiplier" value={info.multiplier === "1000000000000000000" ? "1× (no rebase)" : info.multiplier} />
            )}
          </div>
        </section>

        {info.paused && (
          <section>
            <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">Pause Status</p>
            <div className="flex flex-wrap gap-4">
              <StatusDot active={!info.paused.transfer} label="Transfer" />
              <StatusDot active={!info.paused.mint}     label="Mint" />
              <StatusDot active={!info.paused.burn}     label="Burn" />
            </div>
          </section>
        )}

        {info.policies && (
          <section>
            <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">Transfer Policies</p>
            <div className="rounded-lg border border-[#1A1A2E] px-3 py-1">
              <PolicyRow label="Transfer Sender"   policy={info.policies.transferSender} />
              <PolicyRow label="Transfer Receiver" policy={info.policies.transferReceiver} />
              <PolicyRow label="Transfer Executor" policy={info.policies.transferExecutor} />
              <PolicyRow label="Mint Receiver"     policy={info.policies.mintReceiver} />
            </div>
          </section>
        )}

        <section>
          <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">Trust Verdict</p>
          <div className="rounded-lg border border-[#1A1A2E] px-3 py-2 space-y-1.5">
            {verdict.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-mono text-[10px] shrink-0 mt-px" style={{ color: line.kind === "warn" ? "#F59E0B" : "#22C55E" }}>
                  {line.kind === "warn" ? "!" : "✓"}
                </span>
                <span className="font-mono text-[10px]" style={{ color: line.kind === "warn" ? "#FCD34D" : "#86efac" }}>{line.text}</span>
              </div>
            ))}
            <div className="font-mono text-[9px] text-slate-600 pt-1 border-t border-[#1A1A2E] mt-1">
              Reflects on-chain config at read time. Roles and policies can be changed by the issuer.
            </div>
          </div>
        </section>

        <section>
          <div className="rounded-lg border border-[#1A1A2E] px-3 py-2">
            <p className="font-mono text-[9px] text-slate-600 mb-1">Note</p>
            <p className="font-mono text-[9px] text-slate-500">{info._note}</p>
          </div>
        </section>

        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={copyAddr}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <button onClick={copyShare}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Share link
          </button>
          <button onClick={onScanAnother}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] hover:border-[#4FC3F760] transition-colors">
            Scan another
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Simulate outcome label ────────────────────────────────────────────────────

const OUTCOME_CONFIG: Record<SimulateOutcome, { color: string; icon: string; label: string; hint: string }> = {
  success: {
    color: "#22C55E", icon: "✓",
    label: "Transfer would succeed",
    hint:  "No pause, no policy block, and the simulation completed without revert.",
  },
  paused: {
    color: "#F59E0B", icon: "!",
    label: "Blocked — token is paused",
    hint:  "The issuer has paused this operation. Only the PAUSE_ROLE / UNPAUSE_ROLE can change this.",
  },
  policy_forbids: {
    color: "#F59E0B", icon: "!",
    label: "Blocked — policy forbids this transfer",
    hint:  "The sender, receiver, or executor is not in an allowlist (or is in a blocklist) for this token.",
  },
  insufficient_balance: {
    color: "#EF4444", icon: "×",
    label: "Reverts — insufficient balance",
    hint:  "The sender address does not hold enough tokens. Note: policy/pause checks run BEFORE balance checks in B20.",
  },
  other_revert: {
    color: "#EF4444", icon: "×",
    label: "Reverts — unexpected error",
    hint:  "The transaction reverts for an unrecognised reason. See the revert reason below.",
  },
};

// ── Main component ─────────────────────────────────────────────────────────────

interface B20ClientProps {
  initialAddress?: string;
  initialNetwork?: "mainnet" | "sepolia";
}

export default function B20Client({
  initialAddress = "",
  initialNetwork = "mainnet",
}: B20ClientProps) {

  // ── Shared ────────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<Tab>("scanner");
  const [network,   setNetwork]   = useState<Network>(initialNetwork);

  // Beryl activation badge — computed client-side to avoid hydration mismatch
  const [berylLabel, setBerylLabel] = useState<{ active: boolean; text: string } | null>(null);
  useEffect(() => {
    const BERYL_TS = new Date("2026-06-25T18:00:00Z").getTime();
    const now      = Date.now();
    if (network === "sepolia") {
      setBerylLabel({ active: true, text: "Beryl active on Sepolia" });
    } else if (now >= BERYL_TS) {
      setBerylLabel({ active: true, text: "Beryl active on Mainnet" });
    } else {
      const diff  = BERYL_TS - now;
      const hours = Math.floor(diff / 3_600_000);
      const mins  = Math.floor((diff % 3_600_000) / 60_000);
      setBerylLabel({ active: false, text: `Beryl mainnet in ${hours}h ${mins}m` });
    }
  }, [network]);

  // ── Scanner ───────────────────────────────────────────────────────────────
  const [scanAddr,  setScanAddr]  = useState(initialAddress);
  const [scanResult, setScanResult] = useState<B20Inspection | null>(null);
  const [scanError,  setScanError]  = useState("");
  const [scanPending, startScan]    = useTransition();

  const addrClean  = scanAddr.trim();
  const addrValid  = isValidAddr(addrClean);

  const doScan = useCallback(() => {
    if (!addrValid) return;
    setScanError("");
    setScanResult(null);
    startScan(async () => {
      try {
        const result = await runB20Inspect(addrClean, network);
        // Auto-detect: if not B20 on this network, try the other
        if (!result.isB20) {
          const other: Network = network === "mainnet" ? "sepolia" : "mainnet";
          try {
            const other2 = await runB20Inspect(addrClean, other);
            if (other2.isB20) {
              setNetwork(other);
              setScanResult(other2);
              const p = new URLSearchParams({ address: addrClean, network: other });
              window.history.replaceState({}, "", `/app/b20?${p}`);
              return;
            }
          } catch { /* fall through */ }
        }
        setScanResult(result);
        const p = new URLSearchParams({ address: addrClean, network });
        window.history.replaceState({}, "", `/app/b20?${p}`);
      } catch (e) {
        setScanError((e as Error).message ?? "Inspection failed.");
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addrClean, addrValid, network]);

  // Auto-trigger on mount when navigated via share link
  useEffect(() => {
    if (initialAddress && isValidAddr(initialAddress)) doScan();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Roles ─────────────────────────────────────────────────────────────────
  const [roleToken,  setRoleToken]  = useState("");
  const [roleWallet, setRoleWallet] = useState("");
  const [rolesResult, setRolesResult] = useState<B20RolesResult | null>(null);
  const [rolesError,  setRolesError]  = useState("");
  const [rolesPending, startRoles]    = useTransition();

  function doRoles() {
    if (!isValidAddr(roleToken) || !isValidAddr(roleWallet)) return;
    setRolesError("");
    setRolesResult(null);
    startRoles(async () => {
      try {
        const r = await runB20Roles(roleToken.trim(), roleWallet.trim(), network);
        setRolesResult(r);
      } catch (e) {
        setRolesError((e as Error).message ?? "Role check failed.");
      }
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
      } catch (e) {
        setRegistryError((e as Error).message ?? "Registry load failed.");
      }
    });
  }, [network]);

  // Auto-load when registry tab is opened (or network changes)
  useEffect(() => {
    if (activeTab === "registry" && regLoadedFor.current !== network) {
      doRegistry();
    }
  }, [activeTab, network, doRegistry]);

  // When network changes, invalidate registry cache
  useEffect(() => {
    regLoadedFor.current = null;
    setRegistryResult(null);
    setRegistryError("");
    setScanResult(null);
    setScanError("");
    setRolesResult(null);
    setSimResult(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  // From registry row → fill scanner
  function handleRegistrySelect(addr: string) {
    setScanAddr(addr);
    setActiveTab("scanner");
    // Trigger the scan immediately
    const clean = addr.trim();
    setScanError("");
    setScanResult(null);
    startScan(async () => {
      try {
        const result = await runB20Inspect(clean, network);
        setScanResult(result);
        const p = new URLSearchParams({ address: clean, network });
        window.history.replaceState({}, "", `/app/b20?${p}`);
      } catch (e) {
        setScanError((e as Error).message ?? "Inspection failed.");
      }
    });
  }

  // ── Simulator ─────────────────────────────────────────────────────────────
  const [simToken,    setSimToken]    = useState("");
  const [simSender,   setSimSender]   = useState("");
  const [simReceiver, setSimReceiver] = useState("");
  const [simAmount,   setSimAmount]   = useState("1");
  const [simResult,   setSimResult]   = useState<B20SimulateResult | null>(null);
  const [simError,    setSimError]    = useState("");
  const [simPending,  startSim]       = useTransition();

  function doSim() {
    if (!isValidAddr(simToken) || !isValidAddr(simSender) || !isValidAddr(simReceiver)) return;
    setSimError("");
    setSimResult(null);
    startSim(async () => {
      try {
        const r = await runB20Simulate(simToken.trim(), simSender.trim(), simReceiver.trim(), simAmount.trim() || "1", network);
        setSimResult(r);
      } catch (e) {
        setSimError((e as Error).message ?? "Simulation failed.");
      }
    });
  }

  // ── Shared input style ────────────────────────────────────────────────────
  const inputCls = "w-full bg-[#0a0a12] border border-[#1A1A2E] focus:border-[#4FC3F740] rounded-xl px-3 py-2.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors";

  // ── Render ────────────────────────────────────────────────────────────────
  const TABS: { id: Tab; label: string }[] = [
    { id: "scanner",   label: "Scanner"  },
    { id: "roles",     label: "Roles"    },
    { id: "registry",  label: "Registry" },
    { id: "simulator", label: "Simulate" },
    { id: "docs",      label: "Docs"     },
  ];

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="mb-5">
          <div className="flex items-start justify-between gap-4 mb-1">
            <div>
              <h1 className="font-mono text-[14px] font-bold text-white tracking-wide">B20 Hub</h1>
              <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                Real on-chain state — zero LLM. Reads live from Base RPC via multicall.
              </p>
            </div>
            <a href="/app/chat"
              className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] hover:border-[#4FC3F760] transition-colors shrink-0 mt-0.5">
              Deploy B20 in chat →
            </a>
          </div>

          {/* Network + Beryl badge row */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <div className="flex rounded-xl border border-[#1A1A2E] overflow-hidden">
              {(["mainnet", "sepolia"] as const).map(n => (
                <button key={n} onClick={() => setNetwork(n)}
                  className="px-3 py-1 font-mono text-[9px] transition-colors"
                  style={network === n
                    ? { background: "#4FC3F715", color: "#4FC3F7" }
                    : { color: "#334155" }}>
                  {n === "mainnet" ? "Mainnet" : "Sepolia"}
                </button>
              ))}
            </div>
            {berylLabel && (
              <span className="font-mono text-[9px] px-2 py-0.5 rounded-full"
                style={berylLabel.active
                  ? { background: "#22C55E12", color: "#22C55E" }
                  : { background: "#F59E0B12", color: "#F59E0B" }}>
                {berylLabel.text}
              </span>
            )}
            {registryResult && (
              <span className="font-mono text-[9px] text-slate-600">
                {registryResult.total} B20 token{registryResult.total !== 1 ? "s" : ""} on {network}
              </span>
            )}
          </div>
        </div>

        {/* ── Tab bar ────────────────────────────────────────────────────── */}
        <div className="flex gap-0 mb-6 border-b border-[#1A1A2E]">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="px-3 py-2 font-mono text-[10px] transition-colors relative"
              style={activeTab === tab.id
                ? { color: "#4FC3F7" }
                : { color: "#475569" }}>
              {tab.label}
              {activeTab === tab.id && (
                <span className="absolute bottom-0 left-0 right-0 h-px bg-[#4FC3F7]" />
              )}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            TAB 1 — SCANNER
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "scanner" && (
          <div>
            {/* Input row */}
            <div className="flex gap-2">
              <input value={scanAddr}
                onChange={e => setScanAddr(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && addrValid && !scanPending) doScan(); }}
                placeholder="0x… token address (40 hex chars)"
                spellCheck={false}
                className={`flex-1 min-w-0 ${inputCls}`}
              />
              <button onClick={doScan} disabled={!addrValid || scanPending}
                className="px-4 py-2.5 rounded-xl font-mono text-[10px] font-semibold transition-all shrink-0"
                style={addrValid && !scanPending
                  ? { background: "#4FC3F720", color: "#4FC3F7", border: "1px solid #4FC3F740" }
                  : { background: "#0d0d18", color: "#334155", border: "1px solid #1A1A2E", cursor: "not-allowed" }}>
                {scanPending ? "Reading…" : "Inspect"}
              </button>
            </div>

            {/* Validation hint */}
            {scanAddr && !addrValid && (
              <p className="font-mono text-[9px] text-[#EF4444] mt-1.5 ml-1">
                Must be 0x followed by 40 hex characters.
              </p>
            )}

            {/* Quick-example chips */}
            {!scanResult && !scanPending && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="font-mono text-[8px] text-slate-700 self-center">Examples:</span>
                {[
                  { label: "B20Factory",      addr: "0xB20f000000000000000000000000000000000000" },
                  { label: "PolicyRegistry",  addr: "0x8453000000000000000000000000000000000002" },
                ].map(({ label, addr }) => (
                  <button key={addr}
                    onClick={() => { setScanAddr(addr); }}
                    className="font-mono text-[8px] px-2 py-0.5 rounded border border-[#1A1A2E] text-slate-600 hover:text-slate-400 hover:border-[#2a2a3e] transition-colors">
                    {label}
                  </button>
                ))}
                {/* Recent tokens from registry */}
                {registryResult?.entries.slice(0, 2).map(e => (
                  <button key={e.token}
                    onClick={() => setScanAddr(e.token)}
                    className="font-mono text-[8px] px-2 py-0.5 rounded border border-[#1A1A2E] text-[#4FC3F7] hover:border-[#4FC3F730] transition-colors">
                    {e.symbol || "B20"} ↗
                  </button>
                ))}
              </div>
            )}

            {/* Refresh button (when result is showing) */}
            {scanResult && !scanPending && (
              <div className="mt-2">
                <button onClick={doScan} disabled={!addrValid}
                  className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-500 hover:text-slate-300 transition-colors">
                  Refresh
                </button>
              </div>
            )}

            {/* Loading */}
            {scanPending && (
              <div className="mt-6 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                <span className="font-mono text-[10px] text-slate-500">
                  Reading from Base {network === "mainnet" ? "Mainnet" : "Sepolia"} RPC…
                </span>
              </div>
            )}

            {/* Error */}
            {scanError && !scanPending && (
              <div className="mt-4 rounded-xl border border-[#EF444430] px-4 py-3">
                <p className="font-mono text-[10px] text-[#EF4444]">{scanError}</p>
                <button onClick={() => setScanError("")}
                  className="font-mono text-[9px] text-slate-500 hover:text-slate-300 mt-2 transition-colors">Dismiss</button>
              </div>
            )}

            {/* Result */}
            {scanResult && !scanPending && (
              <ResultCard info={scanResult}
                onScanAnother={() => { setScanResult(null); setScanError(""); setScanAddr(""); window.history.replaceState({}, "", "/app/b20"); }} />
            )}

            {/* Empty state */}
            {!scanResult && !scanPending && !scanError && (
              <div className="mt-8 rounded-xl border border-[#1A1A2E] px-4 py-5 text-center">
                <p className="font-mono text-[10px] text-slate-600 mb-2">Paste a Base token address and hit Inspect.</p>
                <p className="font-mono text-[9px] text-slate-700">Returns "Not a B20" honestly for non-B20 addresses. Auto-detects Mainnet vs Sepolia.</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 2 — ROLES
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "roles" && (
          <div>
            <p className="font-mono text-[10px] text-slate-500 mb-4">
              Check which of the 7 B20 roles a wallet holds on a token.
              B20 omits AccessControlEnumerable — you can only check specific accounts.
            </p>
            <div className="space-y-2 mb-3">
              <input value={roleToken} onChange={e => setRoleToken(e.target.value)}
                placeholder="Token address (0x…)"
                spellCheck={false} className={inputCls} />
              <input value={roleWallet} onChange={e => setRoleWallet(e.target.value)}
                placeholder="Wallet address to check (0x…)"
                spellCheck={false} className={inputCls} />
            </div>
            <button onClick={doRoles}
              disabled={!isValidAddr(roleToken) || !isValidAddr(roleWallet) || rolesPending}
              className="px-4 py-2.5 rounded-xl font-mono text-[10px] font-semibold transition-all mb-4"
              style={isValidAddr(roleToken) && isValidAddr(roleWallet) && !rolesPending
                ? { background: "#4FC3F720", color: "#4FC3F7", border: "1px solid #4FC3F740" }
                : { background: "#0d0d18", color: "#334155", border: "1px solid #1A1A2E", cursor: "not-allowed" }}>
              {rolesPending ? "Checking…" : "Check Roles"}
            </button>

            {rolesPending && (
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                <span className="font-mono text-[10px] text-slate-500">Reading role hashes via multicall…</span>
              </div>
            )}

            {rolesError && !rolesPending && (
              <div className="rounded-xl border border-[#EF444430] px-4 py-3 mb-4">
                <p className="font-mono text-[10px] text-[#EF4444]">{rolesError}</p>
              </div>
            )}

            {rolesResult && !rolesPending && (
              <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
                <div className="px-4 py-3 border-b border-[#1A1A2E] bg-[#0a0a0f]">
                  <p className="font-mono text-[9px] text-slate-500">
                    Wallet <span className="text-slate-400">{truncAddr(rolesResult.wallet)}</span>
                    {" "}on token <span className="text-slate-400">{truncAddr(rolesResult.token)}</span>
                    {" · "}<span className="text-slate-600">{rolesResult.network}</span>
                  </p>
                </div>
                <div className="divide-y divide-[#0d0d18]">
                  {rolesResult.roles.map(role => (
                    <div key={role.roleKey} className="flex items-center justify-between px-4 py-2.5">
                      <div>
                        <span className="font-mono text-[10px] text-slate-300">{role.name}</span>
                        {role.hash && (
                          <span className="font-mono text-[8px] text-slate-700 ml-2 hidden sm:inline">
                            {role.hash.slice(0, 10)}…
                          </span>
                        )}
                      </div>
                      <span className="font-mono text-[10px] font-medium"
                        style={
                          role.held === null ? { color: "#64748b" } :
                          role.held           ? { color: "#22C55E" } :
                                                { color: "#475569" }
                        }>
                        {role.held === null ? "unknown" : role.held ? "HELD" : "not held"}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="px-4 py-2.5 bg-[#0a0a0f] border-t border-[#1A1A2E]">
                  <p className="font-mono text-[8px] text-slate-700">
                    Checked at {new Date(rolesResult.checkedAt).toLocaleTimeString()} · multicall, 2 rounds.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 3 — REGISTRY
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "registry" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <p className="font-mono text-[10px] text-slate-500">
                All B20 tokens deployed via B20Factory on-chain. Newest first.
                Click a row to inspect it in the Scanner tab.
              </p>
              <button onClick={doRegistry} disabled={regPending}
                className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-500 hover:text-slate-300 transition-colors shrink-0 ml-3">
                {regPending ? "Loading…" : "Refresh"}
              </button>
            </div>

            {regPending && (
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                <span className="font-mono text-[10px] text-slate-500">Scanning B20Factory event log…</span>
              </div>
            )}

            {registryError && !regPending && (
              <div className="rounded-xl border border-[#EF444430] px-4 py-3 mb-4">
                <p className="font-mono text-[10px] text-[#EF4444]">{registryError}</p>
                <button onClick={doRegistry} className="font-mono text-[9px] text-slate-500 hover:text-slate-300 mt-2 transition-colors">Retry</button>
              </div>
            )}

            {registryResult && !regPending && registryResult.entries.length === 0 && (
              <div className="rounded-xl border border-[#1A1A2E] px-4 py-8 text-center">
                <p className="font-mono text-[11px] text-slate-500 mb-2">No B20 tokens found on {network}.</p>
                <p className="font-mono text-[9px] text-slate-700">
                  {network === "mainnet"
                    ? "Beryl mainnet launches June 25, 2026. Check back after activation."
                    : "Try switching to Mainnet, or check back after tokens are deployed."}
                </p>
              </div>
            )}

            {registryResult && !regPending && registryResult.entries.length > 0 && (
              <div>
                <div className="rounded-xl border border-[#1A1A2E] overflow-hidden divide-y divide-[#0d0d18]">
                  {registryResult.entries.map(entry => (
                    <button key={`${entry.token}-${entry.blockNumber}`}
                      onClick={() => handleRegistrySelect(entry.token)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#0d0d18] transition-colors text-left">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-[11px] text-white font-medium">{entry.name || "—"}</span>
                          {entry.symbol && <span className="font-mono text-[9px] text-slate-500">${entry.symbol}</span>}
                          <VariantBadge variant={entry.variantLabel} />
                        </div>
                        <div className="font-mono text-[8px] text-slate-600 mt-0.5 truncate">{entry.token}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-4">
                        <span className="font-mono text-[9px] text-slate-600">#{entry.blockNumber}</span>
                        <span className="font-mono text-[9px] text-[#4FC3F7]">Inspect →</span>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 px-1">
                  <p className="font-mono text-[8px] text-slate-700">
                    Showing {registryResult.entries.length} of {registryResult.total} tokens
                    {registryResult.capped ? " (capped at 100)" : ""}
                    {" · "}blocks {registryResult.fromBlock}–{registryResult.toBlock}
                  </p>
                  <a href={`https://basescan.org/address/0xb20f000000000000000000000000000000000000#events`}
                    target="_blank" rel="noopener noreferrer"
                    className="font-mono text-[8px] text-slate-600 hover:text-slate-400 transition-colors">
                    View all on Basescan ↗
                  </a>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 4 — SIMULATOR
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "simulator" && (
          <div>
            <p className="font-mono text-[10px] text-slate-500 mb-4">
              Simulate a token transfer without broadcasting. Uses eth_call (read-only). Reports whether the transfer would succeed, be paused, or be blocked by policy.
            </p>
            <div className="space-y-2 mb-3">
              <input value={simToken}    onChange={e => setSimToken(e.target.value)}
                placeholder="Token address (0x…)" spellCheck={false} className={inputCls} />
              <input value={simSender}   onChange={e => setSimSender(e.target.value)}
                placeholder="Sender address (0x…)" spellCheck={false} className={inputCls} />
              <input value={simReceiver} onChange={e => setSimReceiver(e.target.value)}
                placeholder="Receiver address (0x…)" spellCheck={false} className={inputCls} />
              <input value={simAmount}   onChange={e => setSimAmount(e.target.value)}
                placeholder="Amount (human-readable, e.g. 100)" spellCheck={false} className={inputCls} />
            </div>
            <button onClick={doSim}
              disabled={!isValidAddr(simToken) || !isValidAddr(simSender) || !isValidAddr(simReceiver) || simPending}
              className="px-4 py-2.5 rounded-xl font-mono text-[10px] font-semibold transition-all mb-4"
              style={isValidAddr(simToken) && isValidAddr(simSender) && isValidAddr(simReceiver) && !simPending
                ? { background: "#4FC3F720", color: "#4FC3F7", border: "1px solid #4FC3F740" }
                : { background: "#0d0d18", color: "#334155", border: "1px solid #1A1A2E", cursor: "not-allowed" }}>
              {simPending ? "Simulating…" : "Simulate Transfer"}
            </button>

            {simPending && (
              <div className="flex items-center gap-2 mb-4">
                <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
                <span className="font-mono text-[10px] text-slate-500">Running eth_call simulation…</span>
              </div>
            )}

            {simError && !simPending && (
              <div className="rounded-xl border border-[#EF444430] px-4 py-3 mb-4">
                <p className="font-mono text-[10px] text-[#EF4444]">{simError}</p>
              </div>
            )}

            {simResult && !simPending && (() => {
              const cfg = OUTCOME_CONFIG[simResult.outcome];
              return (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: `${cfg.color}40` }}>
                  <div className="px-4 py-3" style={{ background: `${cfg.color}08` }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-[14px]" style={{ color: cfg.color }}>{cfg.icon}</span>
                      <span className="font-mono text-[12px] font-bold text-white">{cfg.label}</span>
                    </div>
                    <p className="font-mono text-[10px] text-slate-400">{cfg.hint}</p>
                  </div>
                  <div className="px-4 py-3 space-y-1.5 border-t border-[#1A1A2E]">
                    <div className="flex gap-3">
                      <span className="font-mono text-[9px] text-slate-600 w-20 shrink-0">Token</span>
                      <span className="font-mono text-[9px] text-slate-400 break-all">{simResult.token}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="font-mono text-[9px] text-slate-600 w-20 shrink-0">Sender</span>
                      <span className="font-mono text-[9px] text-slate-400">{simResult.sender}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="font-mono text-[9px] text-slate-600 w-20 shrink-0">Receiver</span>
                      <span className="font-mono text-[9px] text-slate-400">{simResult.receiver}</span>
                    </div>
                    <div className="flex gap-3">
                      <span className="font-mono text-[9px] text-slate-600 w-20 shrink-0">Amount</span>
                      <span className="font-mono text-[9px] text-slate-400">{simResult.amount} (raw: {simResult.amountWei} wei)</span>
                    </div>
                    {simResult.gasEstimate && (
                      <div className="flex gap-3">
                        <span className="font-mono text-[9px] text-slate-600 w-20 shrink-0">Gas est.</span>
                        <span className="font-mono text-[9px] text-slate-400">{Number(simResult.gasEstimate).toLocaleString()} gas</span>
                      </div>
                    )}
                    {simResult.revertReason && (
                      <div className="mt-2 pt-2 border-t border-[#1A1A2E]">
                        <p className="font-mono text-[8px] text-slate-600 mb-1">Revert reason</p>
                        <p className="font-mono text-[8px] text-slate-500 break-all leading-relaxed">{simResult.revertReason}</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════
            TAB 5 — DOCS
        ═══════════════════════════════════════════════════════════════ */}
        {activeTab === "docs" && (
          <div className="space-y-5 font-mono text-[11px] text-slate-400 leading-relaxed">

            <div>
              <p className="text-[9px] text-slate-600 tracking-widest uppercase mb-2">What is B20?</p>
              <p>
                <span className="text-white font-bold">B20</span> is the Base Standard for tokenized real-world assets.
                Unlike ERC-20 (EVM bytecode), B20 is a <span className="text-[#4FC3F7]">Rust precompile built directly into the Base node</span> — compliance rules
                are enforced at the node level. No bytecode can bypass them.
              </p>
              <p className="mt-2">
                Activated by the <span className="text-white">Beryl</span> network upgrade
                (Mainnet: June 25, 2026 at 18:00 UTC · Sepolia: already active).
              </p>
            </div>

            <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0a0a0f] border-b border-[#1A1A2E]">
                <p className="text-[9px] text-slate-600 tracking-widest uppercase">Two Variants</p>
              </div>
              <div className="divide-y divide-[#0d0d18]">
                <div className="flex gap-3 px-4 py-3">
                  <VariantBadge variant="ASSET" />
                  <span>Tokenized real-world assets (stocks, commodities). Has a <code className="text-[#4FC3F7]">multiplier()</code> for rebase support.</span>
                </div>
                <div className="flex gap-3 px-4 py-3">
                  <VariantBadge variant="STABLECOIN" />
                  <span>Fiat-backed stablecoins. Has a <code className="text-[#4FC3F7]">currency()</code> field (e.g. "USD").</span>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0a0a0f] border-b border-[#1A1A2E]">
                <p className="text-[9px] text-slate-600 tracking-widest uppercase">Key Addresses (Base)</p>
              </div>
              {[
                { label: "B20Factory",         addr: "0xB20f000000000000000000000000000000000000", note: "deploy + isB20 check" },
                { label: "PolicyRegistry",     addr: "0x8453000000000000000000000000000000000002", note: "createPolicy / policyAdmin" },
                { label: "ActivationRegistry", addr: "0x8453000000000000000000000000000000000001", note: "Beryl activation" },
              ].map(({ label, addr, note }) => (
                <div key={addr} className="flex items-start gap-3 px-4 py-2.5 border-b border-[#0d0d18] last:border-0">
                  <span className="text-slate-300 w-[140px] shrink-0">{label}</span>
                  <div>
                    <code className="text-[#4FC3F7] text-[9px]">{addr}</code>
                    <span className="text-slate-600 text-[8px] ml-2">{note}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0a0a0f] border-b border-[#1A1A2E]">
                <p className="text-[9px] text-slate-600 tracking-widest uppercase">Policy System — exactly 2 types</p>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p>Each token can have <span className="text-white">4 policy scopes</span>, each assigned a policyId from the PolicyRegistry. policyId 0 = ALWAYS_ALLOW (no restriction).</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {[
                    { scope: "TRANSFER_SENDER_POLICY",   desc: "Who can send" },
                    { scope: "TRANSFER_RECEIVER_POLICY", desc: "Who can receive" },
                    { scope: "TRANSFER_EXECUTOR_POLICY", desc: "Who can call transferFrom" },
                    { scope: "MINT_RECEIVER_POLICY",     desc: "Who can receive mints" },
                  ].map(({ scope, desc }) => (
                    <div key={scope} className="rounded border border-[#1A1A2E] px-2.5 py-2">
                      <code className="text-[8px] text-[#4FC3F7] block">{scope}</code>
                      <span className="text-[9px] text-slate-500">{desc}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 rounded border border-[#1A1A2E] px-3 py-2 space-y-1">
                  <code className="text-[10px] text-slate-300 block">
                    <span className="text-slate-600">// 1. create policy</span>
                  </code>
                  <code className="text-[10px] text-slate-300 block">
                    <span className="text-[#4FC3F7]">uint64</span> id = policyRegistry.<span className="text-yellow-400">createPolicy</span>(admin, PolicyType.ALLOWLIST);
                  </code>
                  <code className="text-[10px] text-slate-300 block mt-1">
                    <span className="text-slate-600">// 2. apply to token</span>
                  </code>
                  <code className="text-[10px] text-slate-300 block">
                    token.<span className="text-yellow-400">updatePolicy</span>(TRANSFER_RECEIVER_POLICY, id);
                  </code>
                </div>
                <p className="text-[9px] text-slate-600 mt-1">
                  Policy types: <span className="text-slate-400">ALLOWLIST</span> (only listed addresses) and <span className="text-slate-400">BLOCKLIST</span> (listed addresses blocked).
                  Freeze-seize uses <code className="text-slate-400">burnBlocked()</code> via BURN_BLOCKED_ROLE — not a policy type.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-[#1A1A2E] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#0a0a0f] border-b border-[#1A1A2E]">
                <p className="text-[9px] text-slate-600 tracking-widest uppercase">7 Roles</p>
              </div>
              <div className="divide-y divide-[#0d0d18]">
                {[
                  { role: "DEFAULT_ADMIN_ROLE", desc: "Grants/revokes all other roles. Sets supply cap via updateSupplyCap()." },
                  { role: "MINT_ROLE",          desc: "Can mint new tokens." },
                  { role: "BURN_ROLE",          desc: "Can burn tokens (holder consent required)." },
                  { role: "BURN_BLOCKED_ROLE",  desc: "Freeze-seize: can call burnBlocked(from, amount) to seize and burn." },
                  { role: "PAUSE_ROLE",         desc: "Can pause TRANSFER / MINT / BURN features." },
                  { role: "UNPAUSE_ROLE",       desc: "Can unpause features." },
                  { role: "METADATA_ROLE",      desc: "Can update token name, symbol, and other metadata." },
                ].map(({ role, desc }) => (
                  <div key={role} className="flex items-start gap-3 px-4 py-2.5">
                    <code className="text-[9px] text-[#4FC3F7] w-[160px] shrink-0">{role}</code>
                    <span className="text-[9px] text-slate-500">{desc}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2.5 border-t border-[#1A1A2E] bg-[#0a0a0f]">
                <p className="text-[8px] text-slate-700">
                  B20 omits AccessControlEnumerable — role holders cannot be enumerated. Use hasRole(role, address) for specific checks (see Roles tab above).
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <a href="https://docs.base.org/base-std/overview" target="_blank" rel="noopener noreferrer"
                className="text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-[#4FC3F7] hover:border-[#4FC3F730] transition-colors">
                Base Std Docs ↗
              </a>
              <a href="/docs/beryl"
                className="text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
                Full Beryl Guide →
              </a>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
