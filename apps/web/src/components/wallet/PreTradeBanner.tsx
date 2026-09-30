"use client";

/**
 * The G2 pre-trade check, as every swap/send/bridge card shows it.
 *
 *   PASS  → a quiet line with the asset label (and any INFO notes).
 *   WARN  → the reasons, and a checkbox the user must tick before signing.
 *   BLOCK → the reasons in red; the card's sign button stays disabled.
 *   (unavailable) → says so, and does NOT block: a check that could not run
 *                   is not evidence against the trade (§7 #14: BLOCK only on
 *                   evidence), but the user is told it did not run.
 *
 * `usePreTradeCheck` fetches /api/pretrade-check whenever the chain, kind,
 * token or bridge cost changes; `cleared` is what a card gates its sign
 * button on — false while the answer for the CURRENT input is loading.
 */
import { useEffect, useState } from "react";

export type PreTradeResult = {
  verdict: "PASS" | "WARN" | "BLOCK";
  asset_type: string;
  label: string;
  reasons: { level: "BLOCK" | "WARN" | "INFO"; text: string }[];
};

export function usePreTradeCheck(input: {
  chain: "base" | "robinhood";
  kind: "swap" | "send" | "bridge";
  token: string | null | undefined;
  bridgeCostPercent?: number | null;
  enabled?: boolean;
}) {
  const { chain, kind, token, bridgeCostPercent, enabled = true } = input;
  const cost = typeof bridgeCostPercent === "number" && Number.isFinite(bridgeCostPercent) ? bridgeCostPercent : null;
  // Everything the answer depends on. A result — and a tick — only count for
  // the exact input they were given: change the token, the amount behind a
  // bridge cost, or the chain, and the card is held until the new answer lands.
  // Derived rather than reset in an effect, so there is no render in which an
  // old PASS (or an old tick) stands in for a new trade.
  const key = JSON.stringify([chain, kind, token ?? "", cost, enabled]);
  const [res, setRes] = useState<{ key: string; state: "ok" | "unavailable"; check: PreTradeResult | null } | null>(null);
  const [ackKey, setAckKey] = useState("");

  useEffect(() => {
    if (!enabled || !token) return;
    let live = true;
    fetch("/api/pretrade-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chain, kind, token, ...(cost != null ? { bridge_cost_percent: cost } : {}) }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: PreTradeResult | null) => {
        if (!live) return;
        if (j && (j.verdict === "PASS" || j.verdict === "WARN" || j.verdict === "BLOCK")) setRes({ key, state: "ok", check: j });
        else setRes({ key, state: "unavailable", check: null });
      })
      .catch(() => { if (live) setRes({ key, state: "unavailable", check: null }); });
    return () => { live = false; };
    // `key` encodes every input above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const idle = !enabled || !token;
  const current = !idle && res?.key === key ? res : null;
  const state: "idle" | "loading" | "ok" | "unavailable" = idle ? "idle" : current ? current.state : "loading";
  const check = current?.check ?? null;
  const ack = ackKey === key;
  const setAck = (v: boolean) => setAckKey(v ? key : "");
  // Held while the answer for THIS input is still on its way. An unavailable
  // check does not hold (§7 #14: BLOCK only on evidence) — the banner says so.
  const cleared = state !== "loading"
    && (!check || check.verdict === "PASS" || (check.verdict === "WARN" && ack));
  const blocked = check?.verdict === "BLOCK";
  return { check, state, ack, setAck, cleared, blocked };
}

export function PreTradeBanner({ pt }: { pt: ReturnType<typeof usePreTradeCheck> }) {
  const { check, state, ack, setAck } = pt;
  if (state === "idle") return null;
  if (state === "loading") return <p className="text-[9px] text-slate-600 mb-2">Checking this trade…</p>;
  if (state === "unavailable" || !check) {
    return <p className="text-[9px] text-slate-500 mb-2">Pre-trade check unavailable right now — it did not run, so nothing was checked.</p>;
  }
  const color = check.verdict === "BLOCK" ? "#f87171" : check.verdict === "WARN" ? "#fbbf24" : "#64748b";
  const shown = check.reasons.filter((r) => check.verdict !== "PASS" || r.level === "INFO");
  return (
    <div className="rounded-lg border px-2.5 py-2 mb-3" style={{ borderColor: `${color}40`, background: `${color}0d` }}>
      <div className="text-[9px] font-bold tracking-widest" style={{ color }}>
        {check.verdict === "BLOCK" ? "BLOCKED" : check.verdict === "WARN" ? "CHECK BEFORE SIGNING" : "CHECKED"} · {check.label}
      </div>
      {shown.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {shown.map((r, i) => (
            <li key={i} className="text-[9px] leading-relaxed" style={{ color: r.level === "INFO" ? "#94a3b8" : color }}>• {r.text}</li>
          ))}
        </ul>
      )}
      {check.verdict === "WARN" && (
        <label className="flex items-center gap-2 mt-1.5 cursor-pointer">
          <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
          <span className="text-[9px] text-slate-300">I read this and still want to continue.</span>
        </label>
      )}
    </div>
  );
}
