"use client";

import { useState, useTransition, useEffect, useCallback } from "react";
import { runB20Inspect } from "./inspect-action";
import type { B20Inspection, PolicyInfo } from "@/lib/b20/inspect";

// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidAddr(v: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

// ── Trust verdict (pure function, no LLM) ─────────────────────────────────────

interface VerdictLine {
  kind: "warn" | "ok";
  text: string;
}

function computeVerdict(info: B20Inspection): VerdictLine[] {
  const lines: VerdictLine[] = [];

  // Pause flags
  if (info.paused?.transfer)
    lines.push({ kind: "warn", text: "Transfers are paused by the issuer." });
  if (info.paused?.mint)
    lines.push({ kind: "warn", text: "Minting is paused by the issuer." });
  if (info.paused?.burn)
    lines.push({ kind: "warn", text: "Burns are paused by the issuer." });

  // Policy flags
  const scopeLabel: Record<string, string> = {
    transferSender:   "transfer sender",
    transferReceiver: "transfer receiver",
    transferExecutor: "transfer executor",
    mintReceiver:     "mint receiver",
  };
  if (info.policies) {
    for (const [scope, policy] of Object.entries(info.policies) as [string, PolicyInfo][]) {
      if (policy.restricted) {
        lines.push({
          kind: "warn",
          text: `Transfers are policy-gated (KYC/allowlist) on the ${scopeLabel[scope] ?? scope} scope.`,
        });
      }
    }
  }

  // Supply cap flag
  if (info.supplyCapUncapped)
    lines.push({ kind: "warn", text: "Supply is uncapped — issuer can mint unlimited tokens." });

  // Positives
  const noPause = !info.paused?.transfer && !info.paused?.mint && !info.paused?.burn;
  const noPolicyGate = !info.policies || Object.values(info.policies).every(p => !p.restricted);
  if (noPause && noPolicyGate)
    lines.push({ kind: "ok", text: "No issuer-side transfer restrictions detected." });
  if (!info.supplyCapUncapped && info.supplyCapFormatted && info.supplyCapFormatted !== "uncapped")
    lines.push({ kind: "ok", text: `Supply is capped at ${info.supplyCapFormatted} ${info.symbol ?? "tokens"}.` });

  return lines;
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
                 boxShadow: active ? "0 0 4px #22C55E80" : "0 0 4px #EF444480" }} />
      <span className="font-mono text-[10px]" style={{ color: active ? "#22C55E" : "#EF4444" }}>
        {label}
      </span>
      <span className="font-mono text-[9px] text-slate-600 ml-0.5">
        {active ? "(active)" : "(paused)"}
      </span>
    </div>
  );
}

function PolicyRow({ label, policy }: { label: string; policy: PolicyInfo }) {
  return (
    <div className="flex items-start gap-2 py-1.5 border-b border-[#0d0d18]">
      <span className="font-mono text-[9px] text-slate-500 w-[120px] shrink-0 mt-0.5">{label}</span>
      {policy.restricted ? (
        <div>
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "#F59E0B20", color: "#F59E0B" }}>
            RESTRICTED
          </span>
          {policy.admin && (
            <span className="font-mono text-[9px] text-slate-500 ml-2">
              admin {truncAddr(policy.admin)}
            </span>
          )}
          <div className="font-mono text-[9px] text-slate-600 mt-0.5">
            policyId {policy.policyId}
          </div>
        </div>
      ) : (
        <span className="font-mono text-[9px]" style={{ color: "#22C55E" }}>
          Open (ALWAYS_ALLOW)
        </span>
      )}
    </div>
  );
}

// ── Results card ──────────────────────────────────────────────────────────────

function ResultCard({ info, onReset }: { info: B20Inspection; onReset: () => void }) {
  const [copied, setCopied] = useState(false);
  const verdict = computeVerdict(info);
  const hasWarns = verdict.some(v => v.kind === "warn");

  function copyAddr() {
    navigator.clipboard.writeText(info.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function buildShareUrl() {
    const params = new URLSearchParams({ address: info.address, network: info.network });
    return `${window.location.origin}/app/b20?${params}`;
  }

  function copyShare() {
    navigator.clipboard.writeText(buildShareUrl());
  }

  if (!info.isB20) {
    return (
      <div className="rounded-xl border border-[#1A1A2E] p-4 mt-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full"
            style={{ background: "#64748b20", color: "#94a3b8" }}>
            NOT B20
          </span>
          <span className="font-mono text-[10px] text-slate-500">{info.network}</span>
        </div>
        <p className="font-mono text-[11px] text-slate-300 mb-1">
          This address is not a B20 token.
        </p>
        <p className="font-mono text-[10px] text-slate-500 mb-3">{info._note}</p>
        <div className="font-mono text-[9px] text-slate-600 break-all mb-4">{info.address}</div>
        <div className="flex gap-2">
          <a href={info.explorerUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Basescan ↗
          </a>
          <button onClick={onReset}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Inspect another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border mt-4 overflow-hidden"
      style={{ borderColor: hasWarns ? "#F59E0B40" : "#22C55E30" }}>

      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-[#1A1A2E]"
        style={{ background: hasWarns ? "#F59E0B06" : "#22C55E06" }}>
        <div className="flex flex-wrap items-center gap-2 mb-1">
          <span className="font-mono text-[13px] font-bold text-white">
            {info.name ?? "—"}
          </span>
          {info.symbol && (
            <span className="font-mono text-[11px] text-slate-400">${info.symbol}</span>
          )}
          <VariantBadge variant={info.variant} />
          <span className="font-mono text-[9px] px-1.5 py-0.5 rounded"
            style={{ background: "#22C55E20", color: "#22C55E" }}>
            ✓ B20
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-1">
          <span className="font-mono text-[9px] text-slate-500">
            {info.network === "mainnet" ? "Base Mainnet" : "Base Sepolia"}
          </span>
          <span className="font-mono text-[9px] text-slate-600">
            read live in {(info.rpcLatencyMs / 1000).toFixed(2)}s
          </span>
          <a href={info.explorerUrl} target="_blank" rel="noopener noreferrer"
            className="font-mono text-[9px] text-[#4FC3F7] hover:underline">
            Basescan ↗
          </a>
        </div>
        <div className="font-mono text-[9px] text-slate-600 mt-1 break-all">{info.address}</div>
      </div>

      <div className="p-4 space-y-4">

        {/* Key facts */}
        <section>
          <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">Key Facts</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
            <Fact label="Decimals"    value={info.decimals?.toString() ?? "—"} />
            <Fact label="Total Supply" value={info.totalSupplyFormatted ?? "—"} />
            <Fact label="Supply Cap"  value={info.supplyCapFormatted ?? "—"} />
            {info.variant === "STABLECOIN" && info.currency && (
              <Fact label="Currency" value={info.currency} />
            )}
            {info.variant === "ASSET" && info.multiplier && (
              <Fact label="Multiplier" value={info.multiplier === "1000000000000000000" ? "1× (no rebase)" : info.multiplier} />
            )}
          </div>
        </section>

        {/* Pause status */}
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

        {/* Policies */}
        {info.policies && (
          <section>
            <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">Transfer Policies</p>
            <div className="rounded-lg border border-[#1A1A2E] px-3 py-1 divide-y divide-[#0d0d18]">
              <PolicyRow label="Transfer Sender"   policy={info.policies.transferSender} />
              <PolicyRow label="Transfer Receiver" policy={info.policies.transferReceiver} />
              <PolicyRow label="Transfer Executor" policy={info.policies.transferExecutor} />
              <PolicyRow label="Mint Receiver"     policy={info.policies.mintReceiver} />
            </div>
          </section>
        )}

        {/* Trust verdict */}
        <section>
          <p className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-2">Trust Verdict</p>
          <div className="rounded-lg border border-[#1A1A2E] px-3 py-2 space-y-1.5">
            {verdict.map((line, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="font-mono text-[10px] shrink-0 mt-px"
                  style={{ color: line.kind === "warn" ? "#F59E0B" : "#22C55E" }}>
                  {line.kind === "warn" ? "⚠" : "✓"}
                </span>
                <span className="font-mono text-[10px]"
                  style={{ color: line.kind === "warn" ? "#FCD34D" : "#86efac" }}>
                  {line.text}
                </span>
              </div>
            ))}
            <div className="font-mono text-[9px] text-slate-600 pt-1 border-t border-[#1A1A2E] mt-1">
              This reflects on-chain config at read time. Roles and policies can be changed by the issuer.
            </div>
          </div>
        </section>

        {/* _note — always visible, verbatim */}
        <section>
          <div className="rounded-lg border border-[#1A1A2E] px-3 py-2">
            <p className="font-mono text-[9px] text-slate-600 mb-1">Note</p>
            <p className="font-mono text-[9px] text-slate-500">{info._note}</p>
          </div>
        </section>

        {/* Actions */}
        <div className="flex flex-wrap gap-2 pt-1">
          <button onClick={copyAddr}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <button onClick={copyShare}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white transition-colors">
            Share link
          </button>
          <button onClick={onReset}
            className="font-mono text-[9px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] hover:border-[#4FC3F760] transition-colors">
            Inspect another
          </button>
        </div>
      </div>
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

// ── Main component ─────────────────────────────────────────────────────────────

interface B20ClientProps {
  initialAddress?: string;
  initialNetwork?: "mainnet" | "sepolia";
}

export default function B20Client({ initialAddress = "", initialNetwork = "mainnet" }: B20ClientProps) {
  const [address, setAddress]   = useState(initialAddress);
  const [network, setNetwork]   = useState<"mainnet" | "sepolia">(initialNetwork);
  const [result,  setResult]    = useState<B20Inspection | null>(null);
  const [error,   setError]     = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const addrClean  = address.trim();
  const addrValid  = isValidAddr(addrClean);
  const canInspect = addrValid && !isPending;

  const doInspect = useCallback(() => {
    if (!addrValid) return;
    setError("");
    setResult(null);
    startTransition(async () => {
      try {
        const info = await runB20Inspect(addrClean, network);
        setResult(info);
        // Update URL for share-ability without full navigation.
        const params = new URLSearchParams({ address: addrClean, network });
        window.history.replaceState({}, "", `/app/b20?${params}`);
      } catch (e) {
        setError((e as Error).message ?? "Inspection failed.");
      }
    });
  }, [addrClean, addrValid, network]);

  // Auto-trigger when launched with a pre-filled address (share link).
  useEffect(() => {
    if (initialAddress && isValidAddr(initialAddress)) {
      doInspect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only on mount

  function reset() {
    setResult(null);
    setError("");
    setAddress("");
    window.history.replaceState({}, "", "/app/b20");
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">

        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-4 h-4 text-[#4FC3F7]" fill="none" viewBox="0 0 24 24"
              stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
            </svg>
            <h1 className="font-mono text-[13px] font-bold text-white tracking-wide">
              B20 Trust Scanner
            </h1>
          </div>
          <p className="font-mono text-[10px] text-slate-500">
            Real on-chain state — zero LLM. Reads live from Base RPC via multicall.
          </p>
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <input
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && canInspect) doInspect(); }}
            placeholder="0x… token address (40 hex chars)"
            spellCheck={false}
            className="flex-1 min-w-0 bg-[#0a0a12] border border-[#1A1A2E] focus:border-[#4FC3F740] rounded-xl px-3 py-2.5 font-mono text-[11px] text-slate-200 placeholder:text-slate-700 outline-none transition-colors"
          />

          {/* Network toggle */}
          <div className="flex rounded-xl border border-[#1A1A2E] overflow-hidden shrink-0">
            {(["mainnet", "sepolia"] as const).map(n => (
              <button
                key={n}
                onClick={() => setNetwork(n)}
                className="px-2.5 font-mono text-[9px] transition-colors"
                style={
                  network === n
                    ? { background: "#4FC3F715", color: "#4FC3F7" }
                    : { color: "#334155" }
                }
              >
                {n === "mainnet" ? "Mainnet" : "Sepolia"}
              </button>
            ))}
          </div>

          <button
            onClick={doInspect}
            disabled={!canInspect}
            className="px-4 py-2.5 rounded-xl font-mono text-[10px] font-semibold transition-all shrink-0"
            style={
              canInspect
                ? { background: "#4FC3F720", color: "#4FC3F7", border: "1px solid #4FC3F740" }
                : { background: "#0d0d18", color: "#334155", border: "1px solid #1A1A2E", cursor: "not-allowed" }
            }
          >
            {isPending ? "Reading…" : "Inspect"}
          </button>
        </div>

        {/* Validation hint */}
        {address && !addrValid && (
          <p className="font-mono text-[9px] text-[#EF4444] mt-1.5 ml-1">
            Invalid address — must be 0x followed by 40 hex characters.
          </p>
        )}

        {/* Loading */}
        {isPending && (
          <div className="mt-6 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse" />
            <span className="font-mono text-[10px] text-slate-500">
              Reading from Base {network === "mainnet" ? "Mainnet" : "Sepolia"} RPC…
            </span>
          </div>
        )}

        {/* Error */}
        {error && !isPending && (
          <div className="mt-4 rounded-xl border border-[#EF444430] px-4 py-3">
            <p className="font-mono text-[10px] text-[#EF4444]">{error}</p>
            <button
              onClick={() => setError("")}
              className="font-mono text-[9px] text-slate-500 hover:text-slate-300 mt-2 transition-colors"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Results */}
        {result && !isPending && (
          <ResultCard info={result} onReset={reset} />
        )}

        {/* Empty state hint */}
        {!result && !isPending && !error && (
          <div className="mt-8 rounded-xl border border-[#1A1A2E] px-4 py-5 text-center">
            <p className="font-mono text-[10px] text-slate-600 mb-2">
              Paste a Base token address above and hit Inspect.
            </p>
            <p className="font-mono text-[9px] text-slate-700">
              Works for any address — returns "Not a B20" honestly for non-B20 tokens.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
