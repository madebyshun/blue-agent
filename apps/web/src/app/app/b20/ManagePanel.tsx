"use client";

/**
 * ManagePanel — write actions for B20 tokens.
 * Role-gated: only shows actions the connected wallet can perform.
 * Encodes tx client-side (viem), signs via wagmi, polls receipt.
 */

import { useState } from "react";
import { encodeFunctionData, parseUnits, formatUnits } from "viem";
import { useAccount, useSendTransaction, useSwitchChain } from "wagmi";
import {
  B20_WRITE_ABI,
  SUPPLY_CAP_MAX,
  PAUSE_FEATURE,
  ROLE_DEFS,
  POLICY_SCOPE_KEYS,
  POLICY_SCOPE_LABELS,
  type PolicyScopeKey,
} from "@/lib/b20/manage-abi";
import type { B20Inspection } from "@/lib/b20/inspect";
import type { B20RolesResult } from "@/lib/b20/roles";
import type { ScopeHashes } from "./manage-action";

// ── Types ─────────────────────────────────────────────────────────────────────

type Network = "mainnet" | "sepolia";
const CHAIN_IDS: Record<Network, number> = { mainnet: 8453, sepolia: 84532 };

interface TxState {
  action: string;
  status: "pending" | "polling" | "success" | "error";
  hash?:  string;
  error?: string;
}

export interface ManagePanelProps {
  token:       string;
  network:     Network;
  inspect:     B20Inspection;
  roles:       B20RolesResult;
  scopeHashes: ScopeHashes;
  balance:     string;   // raw uint256 string (wallet token balance)
  onRefresh?:  () => void;
  compact?:    boolean;  // true = scanner inline (fewer groups)
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT = [
  "w-full bg-[#0a0a12] border border-[#1A1A2E]",
  "focus:border-[#4FC3F740] rounded-xl px-3 py-2",
  "font-mono text-xs text-slate-200 placeholder:text-slate-700",
  "outline-none transition-colors",
].join(" ");

const LABEL = "font-mono text-[9px] text-slate-600 tracking-widest uppercase block mb-1";

function isAddr(v: string) { return /^0x[a-fA-F0-9]{40}$/.test(v.trim()); }
function isAmt (v: string) { return /^\d+(\.\d+)?$/.test(v.trim()) && parseFloat(v) > 0; }

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title, icon, color = "#4FC3F7", children, visible,
}: {
  title: string; icon: string; color?: string; children: React.ReactNode; visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="rounded-2xl border border-[#1A1A2E] overflow-hidden">
      <div className="px-4 py-3 bg-[#0a0a0f] border-b border-[#1A1A2E] flex items-center gap-2">
        <span style={{ color }} className="text-sm">{icon}</span>
        <p className="font-mono text-xs font-semibold" style={{ color }}>{title}</p>
      </div>
      <div className="px-4 py-4 space-y-4">{children}</div>
    </div>
  );
}

// ── Tx status display ─────────────────────────────────────────────────────────

function TxStatus({ tx, onDismiss }: { tx: TxState; onDismiss: () => void }) {
  const explorerBase = tx.hash ? "#" : undefined; // placeholder
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${
      tx.status === "success" ? "border-[#22C55E30] bg-[#22C55E08]"
      : tx.status === "error" ? "border-[#EF444430] bg-[#EF444408]"
      : "border-[#4FC3F730] bg-[#4FC3F708]"
    }`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-mono text-[10px] font-semibold" style={{
            color: tx.status === "success" ? "#22C55E" : tx.status === "error" ? "#EF4444" : "#4FC3F7",
          }}>
            {tx.action} · {
              tx.status === "pending"  ? "Waiting for wallet…" :
              tx.status === "polling"  ? "Confirming on-chain…" :
              tx.status === "success"  ? "Confirmed ✓" :
              "Failed"
            }
          </p>
          {tx.hash && (
            <p className="font-mono text-[8px] text-slate-600 mt-0.5 break-all">
              {tx.hash.slice(0, 18)}…{tx.hash.slice(-8)}
            </p>
          )}
          {tx.error && (
            <p className="font-mono text-[9px] text-[#EF4444] mt-0.5 leading-relaxed">{tx.error}</p>
          )}
        </div>
        {(tx.status === "success" || tx.status === "error") && (
          <button onClick={onDismiss}
            className="font-mono text-[9px] text-slate-600 hover:text-slate-400 shrink-0">
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

// ── Confirm dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  msg, consequence, onConfirm, onCancel,
}: {
  msg: string; consequence?: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onCancel}>
      <div className="bg-[#0a0a12] border border-[#EF444430] rounded-2xl p-5 max-w-sm w-full"
        onClick={e => e.stopPropagation()}>
        <div className="flex items-start gap-3 mb-4">
          <span className="text-xl shrink-0">⚠️</span>
          <div>
            <p className="font-mono text-sm font-bold text-white mb-1">{msg}</p>
            {consequence && (
              <p className="font-mono text-xs text-[#EF4444] leading-relaxed">{consequence}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onCancel}
            className="flex-1 font-mono text-xs py-2 rounded-xl border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button onClick={() => { onConfirm(); }}
            className="flex-1 font-mono text-xs py-2 rounded-xl transition-colors"
            style={{ background: "#EF444420", color: "#EF4444", border: "1px solid #EF444440" }}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ManagePanel({
  token, network, inspect, roles, scopeHashes, balance, onRefresh, compact = false,
}: ManagePanelProps) {
  const { address, chainId: currentChainId } = useAccount();
  const { sendTransactionAsync }             = useSendTransaction();
  const { switchChainAsync }                 = useSwitchChain();
  const chainId = CHAIN_IDS[network];

  // ── Tx & confirm state ────────────────────────────────────────────────────
  const [activeTx, setActiveTx] = useState<TxState | null>(null);
  const [confirm,  setConfirm]  = useState<{
    msg: string; consequence?: string; run: () => void;
  } | null>(null);

  // ── Form state — Supply ───────────────────────────────────────────────────
  const [mintTo,  setMintTo]  = useState("");
  const [mintAmt, setMintAmt] = useState("");
  const [burnAmt, setBurnAmt] = useState("");
  const [bbFrom,  setBbFrom]  = useState("");
  const [bbAmt,   setBbAmt]   = useState("");

  // ── Form state — Policy ───────────────────────────────────────────────────
  const [policyScope, setPolicyScope] = useState<PolicyScopeKey>("transferSender");
  const [policyId,    setPolicyId]    = useState("");

  // ── Form state — Roles ────────────────────────────────────────────────────
  const [roleOp,   setRoleOp]   = useState<"grant" | "revoke">("grant");
  const [roleKey,  setRoleKey]  = useState("MINT_ROLE");
  const [roleAddr, setRoleAddr] = useState("");

  // ── Form state — Supply cap ───────────────────────────────────────────────
  const [capAmt,     setCapAmt]     = useState("");
  const [capUncapped,setCapUncapped]= useState(false);

  // ── Form state — Metadata ─────────────────────────────────────────────────
  const [metaField, setMetaField] = useState<"name" | "symbol" | "uri">("name");
  const [metaValue, setMetaValue] = useState("");

  // ── Form state — Transfer ─────────────────────────────────────────────────
  const [xferTo,  setXferTo]  = useState("");
  const [xferAmt, setXferAmt] = useState("");

  // ── Role-gating ───────────────────────────────────────────────────────────
  const r = roles.roles;
  const held = {
    isAdmin:      !!r.find(x => x.roleKey === "DEFAULT_ADMIN_ROLE")?.held,
    canMint:      !!r.find(x => x.roleKey === "MINT_ROLE")?.held,
    canBurn:      !!r.find(x => x.roleKey === "BURN_ROLE")?.held,
    canBurnBlock: !!r.find(x => x.roleKey === "BURN_BLOCKED_ROLE")?.held,
    canPause:     !!r.find(x => x.roleKey === "PAUSE_ROLE")?.held,
    canUnpause:   !!r.find(x => x.roleKey === "UNPAUSE_ROLE")?.held,
    canMetadata:  !!r.find(x => x.roleKey === "METADATA_ROLE")?.held,
    hasBalance:   BigInt(balance) > 0n,
  };

  // Map roleKey → bytes32 hash (from roles result)
  const roleHashes: Record<string, string | null> = Object.fromEntries(
    r.map(x => [x.roleKey, x.hash])
  );

  const decimals = inspect.decimals ?? 18;
  const symbol   = inspect.symbol ?? "";
  const balFmt   = formatUnits(BigInt(balance), decimals);

  // ── Tx executor ───────────────────────────────────────────────────────────

  const isBusy = activeTx?.status === "pending" || activeTx?.status === "polling";

  async function exec(actionLabel: string, data: `0x${string}`) {
    if (!address || isBusy) return;
    setActiveTx({ action: actionLabel, status: "pending" });
    try {
      if (currentChainId !== chainId) {
        await switchChainAsync({ chainId });
      }
      const hash = await sendTransactionAsync({
        to: token as `0x${string}`, data, value: 0n, chainId,
      });
      setActiveTx({ action: actionLabel, status: "polling", hash });
      for (let i = 0; i < 30; i++) {
        await new Promise(res => setTimeout(res, 3000));
        const rec = await fetch("/api/b20/receipt", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tx_hash: hash, network }),
        }).then(res => res.json());
        if (rec.ok && rec.status === "success") {
          setActiveTx({ action: actionLabel, status: "success", hash });
          onRefresh?.();
          return;
        }
        if (rec.ok && rec.status === "reverted") {
          throw new Error("Transaction reverted on-chain. Check role / pause / cap state.");
        }
      }
      throw new Error("Timeout — tx may still confirm. Check Basescan.");
    } catch (e) {
      setActiveTx(prev => prev ? { ...prev, status: "error", error: (e as Error).message } : null);
    }
  }

  function dangerous(msg: string, consequence: string, run: () => void) {
    setConfirm({ msg, consequence, run });
  }

  // ── Tx status banner ──────────────────────────────────────────────────────

  const txBanner = activeTx && (
    <TxStatus tx={activeTx} onDismiss={() => setActiveTx(null)} />
  );

  // ── Pause feature rows ────────────────────────────────────────────────────

  const features = [
    { label: "TRANSFER", idx: PAUSE_FEATURE.TRANSFER, paused: !!inspect.paused?.transfer },
    { label: "MINT",     idx: PAUSE_FEATURE.MINT,     paused: !!inspect.paused?.mint     },
    { label: "BURN",     idx: PAUSE_FEATURE.BURN,     paused: !!inspect.paused?.burn     },
  ];

  // ── Render ────────────────────────────────────────────────────────────────

  if (!address) {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] px-5 py-8 text-center">
        <p className="font-mono text-sm text-slate-400">Connect wallet to manage this token</p>
        <p className="font-mono text-xs text-slate-700 mt-1">
          Actions are role-gated — only shown for roles your wallet holds.
        </p>
      </div>
    );
  }

  const hasAnyRole = Object.values(held).some(Boolean);

  if (!hasAnyRole) {
    return (
      <div className="rounded-2xl border border-[#1A1A2E] px-5 py-8 text-center">
        <p className="font-mono text-sm text-slate-400 mb-2">No management roles detected</p>
        <p className="font-mono text-xs text-slate-600 leading-relaxed">
          Your wallet ({address.slice(0, 8)}…{address.slice(-4)}) does not hold any of the 7 B20 roles
          on this token. Switch to the issuer wallet to manage.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Wallet + role summary */}
      {!compact && (
        <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] px-4 py-2.5 flex flex-wrap items-center gap-2">
          <span className="font-mono text-[9px] text-slate-600">Connected:</span>
          <span className="font-mono text-[9px] text-slate-400">{address.slice(0, 10)}…{address.slice(-4)}</span>
          <span className="mx-1 text-slate-700">·</span>
          <span className="font-mono text-[9px] text-slate-600">Roles:</span>
          {held.isAdmin      && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#4FC3F710] text-[#4FC3F7] border border-[#4FC3F720]">ADMIN</span>}
          {held.canMint      && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#22C55E10] text-[#22C55E] border border-[#22C55E20]">MINT</span>}
          {held.canBurn      && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#F59E0B10] text-[#F59E0B] border border-[#F59E0B20]">BURN</span>}
          {held.canBurnBlock && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#EF444410] text-[#EF4444] border border-[#EF444420]">BURN_BLOCKED</span>}
          {held.canPause     && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#F59E0B10] text-[#F59E0B] border border-[#F59E0B20]">PAUSE</span>}
          {held.canUnpause   && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#22C55E10] text-[#22C55E] border border-[#22C55E20]">UNPAUSE</span>}
          {held.canMetadata  && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#4FC3F710] text-[#4FC3F7] border border-[#4FC3F720]">METADATA</span>}
          {held.hasBalance   && <span className="font-mono text-[8px] px-1.5 py-0.5 rounded bg-[#ffffff08] text-slate-400 border border-[#ffffff10]">HOLDER</span>}
        </div>
      )}

      {/* Tx banner */}
      {txBanner}

      {/* ── SUPPLY ──────────────────────────────────────────────────────── */}
      <Section title="Supply" icon="⚡"
        visible={held.canMint || held.canBurn || held.canBurnBlock}>

        {/* Mint */}
        {held.canMint && (
          <div className="space-y-2">
            <p className={LABEL}>Mint — MINT_ROLE</p>
            {inspect.paused?.mint && (
              <p className="font-mono text-[9px] text-[#F59E0B] mb-1">⚠ Mint is currently paused</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={LABEL}>Recipient</p>
                <input value={mintTo} onChange={e => setMintTo(e.target.value)}
                  placeholder="0x…" spellCheck={false} className={INPUT} />
              </div>
              <div>
                <p className={LABEL}>Amount ({symbol})</p>
                <input value={mintAmt} onChange={e => setMintAmt(e.target.value)}
                  placeholder="0.0" spellCheck={false} className={INPUT} />
              </div>
            </div>
            <button
              disabled={!isAddr(mintTo) || !isAmt(mintAmt) || isBusy}
              onClick={() => exec("Mint", encodeFunctionData({
                abi: B20_WRITE_ABI, functionName: "mint",
                args: [mintTo as `0x${string}`, parseUnits(mintAmt, decimals)],
              }))}
              className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: "#22C55E15", color: "#22C55E", border: "1px solid #22C55E30" }}>
              Mint →
            </button>
          </div>
        )}

        {/* Burn */}
        {held.canBurn && (
          <div className="space-y-2 pt-2 border-t border-[#0d0d18]">
            <p className={LABEL}>Burn (from your balance) — BURN_ROLE</p>
            {inspect.paused?.burn && (
              <p className="font-mono text-[9px] text-[#F59E0B] mb-1">⚠ Burn is currently paused</p>
            )}
            <div className="flex gap-2">
              <input value={burnAmt} onChange={e => setBurnAmt(e.target.value)}
                placeholder={`Amount in ${symbol}`} spellCheck={false}
                className={`flex-1 ${INPUT}`} />
              <button
                disabled={!isAmt(burnAmt) || isBusy}
                onClick={() => exec("Burn", encodeFunctionData({
                  abi: B20_WRITE_ABI, functionName: "burn",
                  args: [parseUnits(burnAmt, decimals)],
                }))}
                className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
                style={{ background: "#F59E0B15", color: "#F59E0B", border: "1px solid #F59E0B30" }}>
                Burn →
              </button>
            </div>
          </div>
        )}

        {/* Burn Blocked */}
        {held.canBurnBlock && (
          <div className="space-y-2 pt-2 border-t border-[#0d0d18]">
            <p className={LABEL}>Burn Blocked (seize) — BURN_BLOCKED_ROLE</p>
            <div className="rounded-xl border border-[#EF444430] bg-[#EF444408] px-3 py-2 mb-2">
              <p className="font-mono text-[9px] text-[#EF4444] leading-relaxed">
                <strong>Seizes tokens from any holder without consent.</strong> Irreversible.
                Use only for regulatory / compliance enforcement.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={LABEL}>From Address</p>
                <input value={bbFrom} onChange={e => setBbFrom(e.target.value)}
                  placeholder="0x…" spellCheck={false} className={INPUT} />
              </div>
              <div>
                <p className={LABEL}>Amount ({symbol})</p>
                <input value={bbAmt} onChange={e => setBbAmt(e.target.value)}
                  placeholder="0.0" spellCheck={false} className={INPUT} />
              </div>
            </div>
            <button
              disabled={!isAddr(bbFrom) || !isAmt(bbAmt) || isBusy}
              onClick={() => dangerous(
                "Seize tokens from holder?",
                `This burns ${bbAmt} ${symbol} from ${bbFrom.slice(0,10)}… without their consent. This action cannot be undone.`,
                () => exec("Burn Blocked", encodeFunctionData({
                  abi: B20_WRITE_ABI, functionName: "burnBlocked",
                  args: [bbFrom as `0x${string}`, parseUnits(bbAmt, decimals)],
                })),
              )}
              className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: "#EF444415", color: "#EF4444", border: "1px solid #EF444430" }}>
              Seize Tokens →
            </button>
          </div>
        )}
      </Section>

      {/* ── PAUSE ───────────────────────────────────────────────────────── */}
      <Section title="Pause / Unpause" icon="⏸"
        color="#F59E0B"
        visible={held.canPause || held.canUnpause}>

        <div className="space-y-2">
          {features.map(f => (
            <div key={f.label} className="flex items-center justify-between py-2 border-b border-[#0d0d18] last:border-0">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: f.paused ? "#EF4444" : "#22C55E",
                           boxShadow: f.paused ? "0 0 4px #EF444480" : "0 0 4px #22C55E80" }} />
                <span className="font-mono text-xs text-slate-300">{f.label}</span>
                <span className="font-mono text-[9px]" style={{ color: f.paused ? "#EF4444" : "#22C55E" }}>
                  {f.paused ? "paused" : "active"}
                </span>
              </div>
              <div className="flex gap-1.5">
                {held.canPause && !f.paused && (
                  <button
                    disabled={isBusy}
                    onClick={() => exec(`Pause ${f.label}`, encodeFunctionData({
                      abi: B20_WRITE_ABI, functionName: "pause",
                      args: [[f.idx]],
                    }))}
                    className="font-mono text-[9px] px-3 py-1 rounded-lg transition-all disabled:opacity-40"
                    style={{ background: "#EF444415", color: "#EF4444", border: "1px solid #EF444430" }}>
                    Pause
                  </button>
                )}
                {held.canUnpause && f.paused && (
                  <button
                    disabled={isBusy}
                    onClick={() => exec(`Unpause ${f.label}`, encodeFunctionData({
                      abi: B20_WRITE_ABI, functionName: "unpause",
                      args: [[f.idx]],
                    }))}
                    className="font-mono text-[9px] px-3 py-1 rounded-lg transition-all disabled:opacity-40"
                    style={{ background: "#22C55E15", color: "#22C55E", border: "1px solid #22C55E30" }}>
                    Unpause
                  </button>
                )}
                {held.canPause && !held.canUnpause && f.paused && (
                  <span className="font-mono text-[9px] text-slate-700">need UNPAUSE_ROLE</span>
                )}
                {!held.canPause && held.canUnpause && !f.paused && (
                  <span className="font-mono text-[9px] text-slate-700">need PAUSE_ROLE</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ── POLICY (compact hidden) ─────────────────────────────────────── */}
      {!compact && (
        <Section title="Policy" icon="🔐" visible={held.isAdmin}>
          <div className="space-y-2">
            <p className="font-mono text-[9px] text-slate-600 leading-relaxed">
              Set a PolicyRegistry policy on a transfer/mint scope. policyId 0 = ALWAYS_ALLOW (no restriction).
              Policy IDs must exist in the PolicyRegistry at 0x8453…0002.
            </p>
            <div>
              <p className={LABEL}>Scope</p>
              <select value={policyScope}
                onChange={e => setPolicyScope(e.target.value as PolicyScopeKey)}
                className="w-full bg-[#0a0a12] border border-[#1A1A2E] rounded-xl px-3 py-2 font-mono text-xs text-slate-200 outline-none">
                {POLICY_SCOPE_KEYS.map(k => (
                  <option key={k} value={k}>{POLICY_SCOPE_LABELS[k]}</option>
                ))}
              </select>
            </div>
            <div>
              <p className={LABEL}>Policy ID <span className="text-slate-700 normal-case font-normal">(0 = ALWAYS_ALLOW)</span></p>
              <div className="flex gap-2">
                <input value={policyId} onChange={e => setPolicyId(e.target.value)}
                  placeholder="e.g. 42" spellCheck={false} className={`flex-1 ${INPUT}`} />
                <button
                  disabled={!/^\d+$/.test(policyId.trim()) || isBusy || !scopeHashes[policyScope]}
                  onClick={() => exec("Update Policy", encodeFunctionData({
                    abi: B20_WRITE_ABI, functionName: "updatePolicy",
                    args: [scopeHashes[policyScope] as `0x${string}`, BigInt(policyId)],
                  }))}
                  className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
                  style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
                  Update →
                </button>
              </div>
            </div>
          </div>
        </Section>
      )}

      {/* ── ROLES (compact hidden) ──────────────────────────────────────── */}
      {!compact && (
        <Section title="Roles" icon="🔑" visible={held.isAdmin}>
          <div className="space-y-3">
            {/* Grant / Revoke */}
            <div className="flex rounded-lg border border-[#1A1A2E] overflow-hidden mb-2">
              {(["grant", "revoke"] as const).map(op => (
                <button key={op} onClick={() => setRoleOp(op)}
                  className="flex-1 py-1.5 font-mono text-[10px] capitalize transition-colors"
                  style={roleOp === op
                    ? { background: "#4FC3F715", color: "#4FC3F7" }
                    : { color: "#475569" }}>
                  {op} Role
                </button>
              ))}
            </div>
            <div>
              <p className={LABEL}>Role</p>
              <select value={roleKey} onChange={e => setRoleKey(e.target.value)}
                className="w-full bg-[#0a0a12] border border-[#1A1A2E] rounded-xl px-3 py-2 font-mono text-xs text-slate-200 outline-none mb-2">
                {ROLE_DEFS.map(d => (
                  <option key={d.key} value={d.key}>{d.label} ({d.key})</option>
                ))}
              </select>
            </div>
            <div>
              <p className={LABEL}>Address</p>
              <input value={roleAddr} onChange={e => setRoleAddr(e.target.value)}
                placeholder="0x…" spellCheck={false} className={INPUT} />
            </div>
            <button
              disabled={!isAddr(roleAddr) || !roleHashes[roleKey] || isBusy}
              onClick={() => exec(
                roleOp === "grant" ? `Grant ${roleKey}` : `Revoke ${roleKey}`,
                encodeFunctionData({
                  abi: B20_WRITE_ABI,
                  functionName: roleOp === "grant" ? "grantRole" : "revokeRole",
                  args: [roleHashes[roleKey] as `0x${string}`, roleAddr as `0x${string}`],
                }),
              )}
              className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
              style={roleOp === "grant"
                ? { background: "#22C55E15", color: "#22C55E", border: "1px solid #22C55E30" }
                : { background: "#EF444415", color: "#EF4444", border: "1px solid #EF444430" }}>
              {roleOp === "grant" ? "Grant Role →" : "Revoke Role →"}
            </button>

            {/* Renounce last admin */}
            <div className="pt-3 border-t border-[#0d0d18]">
              <p className="font-mono text-[9px] text-slate-600 mb-2 leading-relaxed">
                <span className="text-[#EF4444]">renounceLastAdmin()</span> — permanently removes
                DEFAULT_ADMIN_ROLE from all holders. The token becomes immutable with no way to
                recover admin control. This is irreversible.
              </p>
              <button
                disabled={isBusy}
                onClick={() => dangerous(
                  "Renounce all admin permanently?",
                  "This calls renounceLastAdmin() and permanently removes DEFAULT_ADMIN_ROLE from all holders. No one can grant roles, update policy, or change supply cap after this. It cannot be undone.",
                  () => exec("Renounce Admin", encodeFunctionData({
                    abi: B20_WRITE_ABI, functionName: "renounceLastAdmin", args: [],
                  })),
                )}
                className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
                style={{ background: "#EF444415", color: "#EF4444", border: "1px solid #EF444430" }}>
                Renounce Last Admin →
              </button>
            </div>
          </div>
        </Section>
      )}

      {/* ── SUPPLY CAP (compact hidden) ─────────────────────────────────── */}
      {!compact && (
        <Section title="Supply Cap" icon="📊" visible={held.isAdmin}>
          <div className="space-y-2">
            {inspect.supplyCapFormatted && (
              <p className="font-mono text-[9px] text-slate-500">
                Current cap: <span className="text-slate-300">{inspect.supplyCapFormatted} {symbol}</span>
                {inspect.supplyCapUncapped && " (uncapped)"}
              </p>
            )}
            <div className="flex items-center gap-2 mb-2">
              <input type="checkbox" id="cap-uncapped" checked={capUncapped}
                onChange={e => setCapUncapped(e.target.checked)}
                className="accent-[#4FC3F7]" />
              <label htmlFor="cap-uncapped" className="font-mono text-[10px] text-slate-400 cursor-pointer">
                Set uncapped (uint128.max)
              </label>
            </div>
            {!capUncapped && (
              <input value={capAmt} onChange={e => setCapAmt(e.target.value)}
                placeholder={`New cap in ${symbol}`} spellCheck={false} className={INPUT} />
            )}
            <button
              disabled={(!capUncapped && !isAmt(capAmt)) || isBusy}
              onClick={() => {
                const newCap = capUncapped ? SUPPLY_CAP_MAX : parseUnits(capAmt, decimals);
                exec("Update Supply Cap", encodeFunctionData({
                  abi: B20_WRITE_ABI, functionName: "updateSupplyCap",
                  args: [newCap],
                }));
              }}
              className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
              Update Cap →
            </button>
          </div>
        </Section>
      )}

      {/* ── METADATA (compact hidden) ───────────────────────────────────── */}
      {!compact && (
        <Section title="Metadata" icon="✏️" visible={held.canMetadata}>
          <div className="space-y-2">
            <div>
              <p className={LABEL}>Field</p>
              <div className="flex rounded-lg border border-[#1A1A2E] overflow-hidden mb-2">
                {(["name", "symbol", "uri"] as const).map(f => (
                  <button key={f} onClick={() => setMetaField(f)}
                    className="flex-1 py-1.5 font-mono text-[10px] capitalize transition-colors"
                    style={metaField === f ? { background: "#4FC3F715", color: "#4FC3F7" } : { color: "#475569" }}>
                    {f === "uri" ? "Contract URI" : f}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className={LABEL}>New value</p>
              <input value={metaValue} onChange={e => setMetaValue(e.target.value)}
                placeholder={metaField === "name" ? "Token Name" : metaField === "symbol" ? "SYMBOL" : "ipfs://…"}
                spellCheck={false} className={INPUT} />
            </div>
            <button
              disabled={!metaValue.trim() || isBusy}
              onClick={() => {
                const fn =
                  metaField === "name"   ? "updateName" :
                  metaField === "symbol" ? "updateSymbol" :
                  "updateContractURI";
                exec(`Update ${metaField}`, encodeFunctionData({
                  abi: B20_WRITE_ABI, functionName: fn, args: [metaValue.trim()],
                }));
              }}
              className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
              Update {metaField === "uri" ? "URI" : metaField.charAt(0).toUpperCase() + metaField.slice(1)} →
            </button>
          </div>
        </Section>
      )}

      {/* ── TRANSFER ────────────────────────────────────────────────────── */}
      {held.hasBalance && (
        <Section title="Transfer" icon="→" visible={true}>
          <div className="space-y-2">
            {inspect.paused?.transfer && (
              <p className="font-mono text-[9px] text-[#F59E0B] mb-1">⚠ Transfers are currently paused</p>
            )}
            <p className="font-mono text-[9px] text-slate-600">
              Balance: <span className="text-slate-300">{balFmt} {symbol}</span>
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className={LABEL}>To</p>
                <input value={xferTo} onChange={e => setXferTo(e.target.value)}
                  placeholder="0x…" spellCheck={false} className={INPUT} />
              </div>
              <div>
                <p className={LABEL}>Amount ({symbol})</p>
                <input value={xferAmt} onChange={e => setXferAmt(e.target.value)}
                  placeholder="0.0" spellCheck={false} className={INPUT} />
              </div>
            </div>
            <button
              disabled={!isAddr(xferTo) || !isAmt(xferAmt) || isBusy}
              onClick={() => exec("Transfer", encodeFunctionData({
                abi: B20_WRITE_ABI, functionName: "transfer",
                args: [xferTo as `0x${string}`, parseUnits(xferAmt, decimals)],
              }))}
              className="font-mono text-xs px-4 py-2 rounded-xl transition-all disabled:opacity-40"
              style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
              Transfer →
            </button>
          </div>
        </Section>
      )}

      {/* Confirm dialog */}
      {confirm && (
        <ConfirmDialog
          msg={confirm.msg}
          consequence={confirm.consequence}
          onConfirm={() => { setConfirm(null); confirm.run(); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
