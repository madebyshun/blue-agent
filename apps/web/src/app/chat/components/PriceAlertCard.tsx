"use client";
/**
 * The draft a `set_price_alert` call renders (2026-10-01). Chat only DRAFTS:
 * this button is what saves the watch, under the user's own SIWE session
 * (POST /api/watches decides the price source itself — the body here carries
 * only what the user asked for). One signature the first time; none after.
 */
import { useState } from "react";
import Link from "next/link";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { ConnectButton } from "@/components/ConnectModal";

export interface PriceAlertDraft {
  kind: "price_alert_draft";
  rule: string;
  priceNow: number | null;
  body: Record<string, unknown>;
}

export function PriceAlertCard({ result, account }: { result: PriceAlertDraft; account?: string }) {
  const { fetchWithSession } = useEnsureSession();
  const [state, setState] = useState<"idle" | "busy" | "armed" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function arm() {
    if (!account) return;
    setState("busy");
    try {
      const r = await fetchWithSession(account, `/api/watches?address=${account}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.body),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) { setState("error"); setMsg(j.error ?? `Could not arm (HTTP ${r.status}).`); return; }
      setState("armed");
    } catch (e) {
      setState("error");
      setMsg((e as Error).message.slice(0, 160));
    }
  }

  return (
    <div className="rounded-xl border border-[#1A1A2E] bg-[#0B0B12] p-3 my-2 max-w-[520px]">
      <p className="font-mono text-[10px] text-slate-500 mb-1">🔔 PRICE ALERT · checked every 5 min · free</p>
      <p className="text-[13px] text-slate-200">Alert me when {result.rule}.</p>
      <p className="font-mono text-[10px] text-slate-500 mt-1">
        Lands in Scheduled → Alerts and in the “Price alerts” chat. An alert is a message, not an order — nothing is traded.
      </p>
      <div className="mt-2.5">
        {!account ? (
          <ConnectButton label="Connect to arm" />
        ) : state === "armed" ? (
          <p className="font-mono text-[11px] text-emerald-400">
            Armed. <Link href="/cron" className="underline hover:text-emerald-300">See all alerts →</Link>
          </p>
        ) : (
          <>
            <button onClick={arm} disabled={state === "busy"}
              className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-50"
              style={{ background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
              {state === "busy" ? "Arming…" : "Arm alert"}
            </button>
            {state === "error" && <p className="font-mono text-[10px] text-amber-400 mt-1.5">{msg}</p>}
          </>
        )}
      </div>
    </div>
  );
}
