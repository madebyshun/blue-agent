"use client";
/**
 * ActionStrip — an action the user signs, shown as ONE line (ShunTr
 * 2026-10-13, Hướng 1: no more cards, still non-custodial).
 *
 *   Swap 0.5 USDC → ETH · Base · PASS · [Review & sign ▸]
 *
 * The line carries what will happen, on which chain, and — when the action has
 * a token to judge — the same pre-trade verdict the signing card gates on
 * (usePreTradeCheck; BLOCK shows here before anything is opened). "Review &
 * sign" expands the existing signing component in place: every quote, balance
 * check, approve step and signature path stays exactly the code that was
 * already tested; this only changes what is on screen until the user asks.
 */
import { useState, type ReactNode } from "react";
import { usePreTradeCheck } from "@/components/wallet/PreTradeBanner";

export type StripCheck = {
  chain: "base" | "robinhood";
  kind: "swap" | "send" | "bridge";
  token: string | null | undefined;
  recipient?: string | null;
};

const VERDICT_COLOR: Record<string, string> = { PASS: "#22C55E", WARN: "#F59E0B", BLOCK: "#EF4444" };
const ADDR_OR_ETH = /^(0x[a-fA-F0-9]{40}|ETH)$/i;

function VerdictChip({ check }: { check: StripCheck }) {
  const usable = !!check.token && ADDR_OR_ETH.test(check.token);
  const pt = usePreTradeCheck({ chain: check.chain, kind: check.kind, token: usable ? check.token : null, recipient: check.recipient ?? null, enabled: usable });
  if (!usable) return null;
  if (pt.state === "loading") return <span className="text-slate-500">· checking…</span>;
  const c = pt.check;
  const v = c?.verdict;
  if (!c || !v) return <span className="text-slate-500">· check unavailable</span>;
  const why = c.reasons.find((r) => r.level === v)?.text;
  // A stock token's gap to its oracle is price information, shown as the number.
  const gap = typeof c.drift_pct === "number" ? `DEX ${c.drift_pct > 0 ? "+" : ""}${c.drift_pct.toFixed(2)}% vs oracle` : null;
  // A token the user picked from a verified list (native, a pinned major, a
  // registry stock) needs no "PASS": nothing was in doubt. Only a doubt, a
  // refusal, or an unknown token's clean read is worth the space (2026-10-16).
  if (v === "PASS" && c.asset_type !== "crypto") return gap ? <span className="text-slate-400">· {gap}</span> : null;
  return (
    <span title={why} style={{ color: VERDICT_COLOR[v] }}>
      <span className="text-slate-500">· </span>{v}{gap ? <span className="text-slate-400"> · {gap}</span> : null}
    </span>
  );
}

export function ActionStrip({
  summary, chain, check, cta = "Review & sign", children,
}: {
  summary: string;
  chain: "base" | "robinhood" | null;
  check?: StripCheck;
  cta?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const chainLabel = chain === "robinhood" ? "Robinhood Chain" : chain === "base" ? "Base" : null;
  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] rounded-lg border border-[#1A1A2E] bg-[#0a0a0f] px-3 py-2">
        <span className="text-slate-200">{summary}</span>
        {chainLabel && <span className="text-slate-500">· {chainLabel}</span>}
        {check && <VerdictChip check={check} />}
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="ml-auto px-2.5 py-1 rounded-md border border-[#4FC3F740] text-[#4FC3F7] hover:bg-[#4FC3F710]">
          {open ? "Hide" : `${cta} ▸`}
        </button>
      </div>
      {open && <div className="mt-1">{children}</div>}
    </div>
  );
}
