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
 *
 * Confirm-in-chat (2026-10-16, lib/chat/confirm.ts): a strip whose message is
 * younger than CONFIRM_WINDOW_MS registers itself as pending. When the user
 * types "yes" (or ok / confirm / có / đồng ý), the newest one opens its card
 * and arms it (AutoConfirmContext); the card runs its own sign path once ready.
 * BLOCK refuses, WARN opens the card for a manual look instead of signing.
 */
import { useCallback, useContext, useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { usePreTradeCheck } from "@/components/wallet/PreTradeBanner";
import { ActionMessageContext, AutoConfirmContext } from "@/components/wallet/action-context";
import { CONFIRM_WINDOW_MS, SILENT_MAX_USD, registerPending, type ConfirmOutcome } from "@/lib/chat/confirm";

export type StripCheck = {
  chain: "base" | "robinhood";
  kind: "swap" | "send" | "bridge";
  token: string | null | undefined;
  recipient?: string | null;
};

const VERDICT_COLOR: Record<string, string> = { PASS: "#22C55E", WARN: "#F59E0B", BLOCK: "#EF4444" };
const ADDR_OR_ETH = /^(0x[a-fA-F0-9]{40}|ETH)$/i;

type Pt = ReturnType<typeof usePreTradeCheck>;

function VerdictChip({ pt }: { pt: Pt }) {
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
  summary, chain, check, cta = "Review & sign", usd = null, confirmable = false, children,
}: {
  summary: string;
  chain: "base" | "robinhood" | null;
  check?: StripCheck;
  cta?: string;
  /** Estimated USD value of what is spent, when the server could price it.
   *  Below SILENT_MAX_USD an embedded wallet signs a chat-confirmed action
   *  without its modal; unknown (null) always keeps the wallet's prompt. */
  usd?: number | null;
  /** Only an action whose card runs itself on a chat "yes" (useAutoConfirm)
   *  registers as pending. A revoke list, an alert or a B20 admin panel does
   *  not: "yes" there would have no single action to mean. */
  confirmable?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const chainLabel = chain === "robinhood" ? "Robinhood Chain" : chain === "base" ? "Base" : null;

  const usable = !!check?.token && ADDR_OR_ETH.test(check.token);
  const pt = usePreTradeCheck({
    chain: check?.chain ?? "base", kind: check?.kind ?? "swap", token: usable ? check!.token : null,
    recipient: check?.recipient ?? null, enabled: usable,
  });

  const silent = typeof usd === "number" && Number.isFinite(usd) && usd < SILENT_MAX_USD;
  const what = chainLabel ? `${summary} on ${chainLabel}` : summary;

  const fire = useCallback((): ConfirmOutcome => {
    const v = usable ? pt.check?.verdict : undefined;
    const why = pt.check?.reasons.find((r) => r.level === v)?.text ?? "";
    if (v === "BLOCK") return { kind: "blocked", what, why };
    if (v === "WARN") { setOpen(true); return { kind: "warn", what, why }; }
    setOpen(true);
    setArmed(true);
    return { kind: "armed", what, silent };
  }, [usable, pt.check, what, silent]);

  // Pending only while its message is recent and it has not been armed yet.
  const msg = useContext(ActionMessageContext);
  const id = useId();
  useEffect(() => {
    if (!confirmable || !msg?.createdAt || armed || Date.now() - msg.createdAt > CONFIRM_WINDOW_MS) return;
    return registerPending({ id, createdAt: msg.createdAt, fire });
  }, [id, confirmable, msg?.createdAt, armed, fire]);

  const auto = useMemo(() => ({ armed, silent }), [armed, silent]);

  return (
    <div className="mt-2">
      <div className="flex items-center gap-2 flex-wrap font-mono text-[11px] rounded-lg border border-[#1A1A2E] bg-[#0a0a0f] px-3 py-2">
        <span className="text-slate-200">{summary}</span>
        {chainLabel && <span className="text-slate-500">· {chainLabel}</span>}
        {usable && <VerdictChip pt={pt} />}
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="ml-auto px-2.5 py-1 rounded-md border border-[#4FC3F740] text-[#4FC3F7] hover:bg-[#4FC3F710]">
          {open ? "Hide" : `${cta} ▸`}
        </button>
      </div>
      {open && (
        <div className="mt-1">
          <AutoConfirmContext.Provider value={auto}>{children}</AutoConfirmContext.Provider>
        </div>
      )}
    </div>
  );
}
