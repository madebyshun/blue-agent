"use client";
/**
 * Price alerts on the Scheduled page (2026-10-01): the Alerts box (what fired)
 * and the watch list (what is being watched), plus a small form. Watches are
 * checked every 5 minutes by the server tick (lib/watches) — free, max 20.
 *
 * Reading needs the SIWE session (the alerts are the wallet's). Opening the
 * page never pops a signature by itself: without a session it shows a Sign in
 * button, and only that click asks.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useChat } from "../ChatContext";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { describeRule, MAX_WATCHES_PER_WALLET, type Watch, type WatchAlert } from "@/lib/watches/types";

type Load =
  | { s: "no-wallet" } | { s: "signed-out" } | { s: "loading" } | { s: "error"; msg: string }
  | { s: "ok"; watches: Watch[]; alerts: WatchAlert[]; seenAt: number };

const input = "bg-[#050508] border border-[#1A1A2E] focus:border-[#4FC3F7]/40 rounded-lg px-2.5 py-2 font-mono text-[12px] text-white outline-none";

export default function WatchesPanel() {
  const { walletAddr } = useChat();
  const { hasSession, ensureSession, fetchWithSession } = useEnsureSession();
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [form, setForm] = useState({ token: "", chain: "base", kind: "price", direction: "above", threshold: "", window: "24h", repeat: false });
  const [formMsg, setFormMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (interactive = false) => {
    if (!walletAddr) { setLoad({ s: "no-wallet" }); return; }
    if (!interactive && !(await hasSession(walletAddr))) { setLoad({ s: "signed-out" }); return; }
    try {
      const r = await fetchWithSession(walletAddr, `/api/watches?address=${walletAddr}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setLoad({ s: "error", msg: j.error ?? `HTTP ${r.status}` }); return; }
      setLoad({ s: "ok", watches: j.watches ?? [], alerts: j.alerts ?? [], seenAt: j.seenAt ?? 0 });
      // Opening the box is reading it: clear the unread badge.
      if ((j.unread ?? 0) > 0) void fetchWithSession(walletAddr, `/api/watches?address=${walletAddr}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ seen: true }),
      }).catch(() => {});
    } catch (e) { setLoad({ s: "error", msg: (e as Error).message.slice(0, 120) }); }
  }, [walletAddr, hasSession, fetchWithSession]);

  useEffect(() => { void refresh(false); }, [refresh]);

  async function call(method: "PATCH" | "DELETE", q: string, body?: unknown) {
    if (!walletAddr) return;
    await fetchWithSession(walletAddr, `/api/watches?address=${walletAddr}${q}`, {
      method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined,
    }).catch(() => {});
    await refresh(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!walletAddr) return;
    setBusy(true); setFormMsg("");
    try {
      const body = {
        chain: form.chain, token: form.token.trim(), kind: form.kind,
        direction: form.kind === "price" ? (form.direction === "below" || form.direction === "down" ? "below" : "above") : (form.direction === "below" || form.direction === "down" ? "down" : "up"),
        threshold: Number(form.threshold), window: form.kind === "change" ? form.window : undefined, repeat: form.repeat,
      };
      const r = await fetchWithSession(walletAddr, `/api/watches?address=${walletAddr}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setFormMsg(j.error ?? `HTTP ${r.status}`); return; }
      setFormMsg(`Armed: ${j.rule}.`);
      setForm((f) => ({ ...f, token: "", threshold: "" }));
      await refresh(true);
    } finally { setBusy(false); }
  }

  const chainName = (c: string) => (c === "base" ? "Base" : "Robinhood Chain");

  return (
    <div className="shrink-0 px-5 py-4 border-b border-[#1A1A2E]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-3">
        <span className="font-mono text-[11px] font-semibold tracking-[0.14em] text-[#E2E8F0] whitespace-nowrap">🔔 PRICE ALERTS</span>
        <span className="font-mono text-[10px] text-[#64748B]">checked every 5 min · free · up to {MAX_WATCHES_PER_WALLET} · or ask in chat: “alert me when ETH on Base goes above $3,000”</span>
      </div>

      {load.s === "no-wallet" && <p className="font-mono text-[11px] text-slate-500">Connect your wallet to set price alerts.</p>}
      {load.s === "signed-out" && (
        <button onClick={async () => { if (walletAddr) { await ensureSession(walletAddr); await refresh(true); } }}
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg" style={{ color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
          Sign in to see your alerts
        </button>
      )}
      {load.s === "loading" && <p className="font-mono text-[11px] text-slate-600">Loading…</p>}
      {load.s === "error" && <p className="font-mono text-[11px] text-amber-400">Could not load alerts: {load.msg}</p>}

      {load.s === "ok" && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Alerts box */}
          <div>
            <p className="font-mono text-[10px] text-slate-500 mb-1.5">ALERTS</p>
            {load.alerts.length === 0 ? (
              <p className="font-mono text-[11px] text-slate-600">Nothing has fired yet.</p>
            ) : (
              <ul className="space-y-1.5 max-h-[260px] overflow-y-auto pr-1">
                {load.alerts.map((a) => (
                  <li key={a.id} className={`rounded-lg border px-2.5 py-2 ${a.at > load.seenAt ? "border-[#4FC3F7]/40 bg-[#4FC3F7]/5" : "border-[#1A1A2E]"}`}>
                    <p className="text-[12px] text-slate-200">{a.text}</p>
                    <p className="font-mono text-[10px] text-slate-500 mt-0.5">
                      {new Date(a.at).toLocaleString()} ·{" "}
                      <Link className="underline hover:text-slate-300" href={`/chat?prefill=${encodeURIComponent(`Check ${a.token} on ${chainName(a.chain)}`)}`}>Open in chat</Link>
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Watches + form */}
          <div>
            <p className="font-mono text-[10px] text-slate-500 mb-1.5">WATCHING ({load.watches.length}/{MAX_WATCHES_PER_WALLET})</p>
            {load.watches.length === 0 && <p className="font-mono text-[11px] text-slate-600 mb-2">No watches yet.</p>}
            <ul className="space-y-1.5 mb-3">
              {load.watches.map((w) => (
                <li key={w.id} className="flex items-center gap-2 rounded-lg border border-[#1A1A2E] px-2.5 py-1.5">
                  <span className={`text-[12px] ${w.active ? "text-slate-200" : "text-slate-500 line-through"}`}>{describeRule(w)}{w.repeat ? " · repeats" : ""}</span>
                  {!w.active && w.lastTriggeredAt && <span className="font-mono text-[9px] text-emerald-400">fired</span>}
                  <span className="ml-auto flex gap-2 shrink-0">
                    <button className="font-mono text-[10px] text-slate-400 hover:text-white" onClick={() => void call("PATCH", "", { id: w.id, active: !w.active })}>{w.active ? "Pause" : "Re-arm"}</button>
                    <button className="font-mono text-[10px] text-red-400/80 hover:text-red-300" onClick={() => void call("DELETE", `&id=${encodeURIComponent(w.id)}`)}>Delete</button>
                  </span>
                </li>
              ))}
            </ul>
            <form onSubmit={create} className="flex flex-wrap gap-1.5 items-center">
              <input className={`${input} w-[150px]`} placeholder="0x… / NVDA / ETH" value={form.token} onChange={(e) => setForm((f) => ({ ...f, token: e.target.value }))} />
              <select className={input} value={form.chain} onChange={(e) => setForm((f) => ({ ...f, chain: e.target.value }))}>
                <option value="base">Base</option><option value="robinhood">Robinhood</option>
              </select>
              <select className={input} value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                <option value="price">price</option><option value="change">% change</option>
              </select>
              <select className={input} value={form.direction} onChange={(e) => setForm((f) => ({ ...f, direction: e.target.value }))}>
                <option value="above">{form.kind === "price" ? "above" : "up"}</option><option value="below">{form.kind === "price" ? "below" : "down"}</option>
              </select>
              <input className={`${input} w-[90px]`} placeholder={form.kind === "price" ? "$ level" : "%"} inputMode="decimal" value={form.threshold} onChange={(e) => setForm((f) => ({ ...f, threshold: e.target.value }))} />
              {form.kind === "change" && (
                <select className={input} value={form.window} onChange={(e) => setForm((f) => ({ ...f, window: e.target.value }))}>
                  <option value="1h">in 1h</option><option value="24h">in 24h</option>
                </select>
              )}
              <label className="font-mono text-[10px] text-slate-500 flex items-center gap-1">
                <input type="checkbox" checked={form.repeat} onChange={(e) => setForm((f) => ({ ...f, repeat: e.target.checked }))} /> repeat
              </label>
              <button type="submit" disabled={busy || !form.token || !form.threshold}
                className="font-mono text-[11px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40" style={{ color: "#050508", background: "#4FC3F7" }}>
                {busy ? "…" : "Arm"}
              </button>
            </form>
            {formMsg && <p className="font-mono text-[10px] text-slate-400 mt-1.5">{formMsg}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
