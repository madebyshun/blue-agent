"use client";

// /app/link (app.blueagent.dev/link) — approve a BlueBot that asked to be
// linked, and see or unlink the ones that are (lib/devices.ts).
//
// A device shows a code like BCDF-GH23 (or a link with ?code=). Here the
// person signs in with their wallet, sees WHICH device is asking, and approves
// it, choosing what it may do (lib/devices.ts scopes): it always reads the
// timeline and alerts; it may also chat on this wallet's credits up to a daily
// cap, and set or change alerts. It never holds a key and never signs.
//
// Every request that sees or changes the list is SIWE (useEnsureSession). The
// lookup runs only after a click, so opening the page never pops a signature.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useWallet } from "@/hooks/useWallet";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { ConnectButton } from "@/components/ConnectModal";

type Pending = { code: string; name: string; kind: "mac" | "bot"; createdAt: number; approved: boolean };
type Scope = "read" | "chat" | "alerts";
type Device = { id: string; name: string; kind: "mac" | "bot"; createdAt: number; expiresAt: number; scopes?: Scope[]; chatDailyCap?: number };

const CAP_CHOICES = [100, 500, 2000] as const;

function grantLabel(d: Device): string {
  const s = d.scopes?.length ? d.scopes : ["read"];
  const parts = ["read"];
  if (s.includes("chat")) parts.push(`chat ≤ ${d.chatDailyCap ?? 0} cr/day`);
  if (s.includes("alerts")) parts.push("alerts");
  return parts.join(" · ");
}

const card = "rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-4";
const btn = "font-mono text-[12px] font-bold px-3 py-1.5 rounded-lg disabled:opacity-40";
const accent = { background: "#4FC3F712", color: "#4FC3F7", border: "1px solid #4FC3F740" };

function ago(ts: number) {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
}

function LinkInner() {
  const params = useSearchParams();
  const { address, isConnected } = useWallet();
  const { fetchWithSession } = useEnsureSession();
  const [code, setCode] = useState(params.get("code") ?? "");
  const [pending, setPending] = useState<Pending | null>(null);
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [allowChat, setAllowChat] = useState(true);
  const [allowAlerts, setAllowAlerts] = useState(true);
  const [cap, setCap] = useState<number>(500);

  const call = useCallback(async (path: string, init?: RequestInit) => {
    if (!address) throw new Error("Connect your wallet first.");
    const r = await fetchWithSession(address, path, { ...init, headers: { "Content-Type": "application/json" } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j;
  }, [address, fetchWithSession]);

  const loadDevices = useCallback(async () => {
    try { setDevices((await call("/api/devices")).devices ?? []); }
    catch (e) { setMsg({ tone: "err", text: (e as Error).message }); }
  }, [call]);

  // A new wallet: forget the previous wallet's view.
  useEffect(() => { setPending(null); setDevices(null); setMsg(null); }, [address]);

  const check = async () => {
    setBusy(true); setMsg(null); setPending(null);
    try { setPending(await call(`/api/devices/approve?code=${encodeURIComponent(code)}`)); }
    catch (e) { setMsg({ tone: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!pending) return;
    setBusy(true); setMsg(null);
    try {
      const j = await call("/api/devices/approve", { method: "POST", body: JSON.stringify({
        code: pending.code,
        scopes: [...(allowChat ? ["chat"] : []), ...(allowAlerts ? ["alerts"] : [])],
        chatDailyCap: allowChat ? cap : 0,
      }) });
      setMsg({ tone: "ok", text: `Linked. ${j.name} will be ready in a few seconds.` });
      setPending(null); setCode("");
      await loadDevices();
    } catch (e) { setMsg({ tone: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  const unlink = async (id: string) => {
    setBusy(true); setMsg(null);
    try { await call(`/api/devices?id=${id}`, { method: "DELETE" }); await loadDevices(); }
    catch (e) { setMsg({ tone: "err", text: (e as Error).message }); }
    finally { setBusy(false); }
  };

  return (
    <div className="mx-auto w-full max-w-[560px] px-4 py-8 space-y-4">
      <div>
        <p className="font-mono text-[11px] tracking-widest text-slate-500 uppercase">// Link BlueBot</p>
        <h1 className="text-[22px] font-bold text-slate-100 mt-1">Link a BlueBot to your wallet</h1>
        <p className="text-[13px] text-slate-400 mt-1">
          BlueBot is Blue Agent on your Mac: chat and alerts for this wallet, without a new wallet. It never holds a key
          and cannot sign or move funds.
        </p>
      </div>

      {!isConnected ? (
        <div className={card}>
          <p className="text-[13px] text-slate-300 mb-3">Connect the wallet you use on Blue Agent. BlueBot will use it, with no new wallet.</p>
          <ConnectButton label="Connect wallet" />
        </div>
      ) : (
        <>
          <div className={card}>
            <label className="font-mono text-[11px] text-slate-500">Code shown on your device</label>
            <div className="flex gap-2 mt-1.5">
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="BCDF-GH23"
                maxLength={9}
                className="flex-1 font-mono text-[16px] tracking-[0.2em] bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 text-slate-100 outline-none focus:border-[#4FC3F7]"
              />
              <button className={btn} style={accent} disabled={busy || code.replace(/[^A-Z0-9]/gi, "").length !== 8} onClick={check}>
                Continue
              </button>
            </div>

            {pending && (
              <div className="mt-4 rounded-lg border border-[#4FC3F740] bg-[#4FC3F70A] p-3 space-y-2">
                <p className="text-[13px] text-slate-200">
                  <b>{pending.name}</b> <span className="text-slate-500">({pending.kind === "mac" ? "Mac app" : "BlueBot device"}, asked {ago(pending.createdAt)})</span> wants to show
                  activity for <span className="font-mono">{address!.slice(0, 6)}…{address!.slice(-4)}</span>.
                </p>
                <div className="space-y-1.5 text-[13px] text-slate-300">
                  <label className="flex items-center gap-2"><input type="checkbox" checked disabled /> See your alerts and activity</label>
                  <label className="flex items-center gap-2"><input type="checkbox" checked={allowChat} onChange={(e) => setAllowChat(e.target.checked)} /> Chat with Blue Agent on your credits</label>
                  {allowChat && (
                    <div className="flex items-center gap-2 pl-6">
                      <span className="text-[12px] text-slate-500">Up to</span>
                      {CAP_CHOICES.map((c) => (
                        <button key={c} type="button" className={btn} onClick={() => setCap(c)}
                          style={cap === c ? { background: "#4FC3F7", color: "#050508", border: "1px solid #4FC3F7" } : accent}>{c}</button>
                      ))}
                      <span className="text-[12px] text-slate-500">credits a day</span>
                    </div>
                  )}
                  <label className="flex items-center gap-2"><input type="checkbox" checked={allowAlerts} onChange={(e) => setAllowAlerts(e.target.checked)} /> Set and change price alerts</label>
                </div>
                <p className="text-[12px] text-amber-400">Only approve a code shown on your own screen. BlueBot can never sign or move funds.</p>
                <button className={btn} style={{ background: "#4FC3F7", color: "#050508", border: "1px solid #4FC3F7" }} disabled={busy} onClick={approve}>
                  Approve
                </button>
              </div>
            )}
            {msg && <p className={`mt-3 text-[12px] ${msg.tone === "ok" ? "text-emerald-400" : "text-amber-400"}`}>{msg.text}</p>}
          </div>

          <div className={card}>
            <div className="flex items-center justify-between">
              <p className="font-mono text-[11px] tracking-widest text-slate-500 uppercase">Linked devices</p>
              {devices == null && <button className={btn} style={accent} disabled={busy} onClick={loadDevices}>Show</button>}
            </div>
            {devices != null && (devices.length === 0
              ? <p className="text-[13px] text-slate-500 mt-2">No BlueBot linked yet.</p>
              : <ul className="mt-2 space-y-2">
                  {devices.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 rounded-lg border border-[#1A1A2E] px-3 py-2">
                      <div className="flex-1">
                        <p className="text-[13px] text-slate-200">{d.name}</p>
                        <p className="font-mono text-[10px] text-slate-500">{d.kind === "mac" ? "Mac app" : "device"} · {grantLabel(d)} · linked {ago(d.createdAt)} · expires {new Date(d.expiresAt).toLocaleDateString()}</p>
                      </div>
                      <button className={btn} style={{ color: "#F87171", border: "1px solid #F8717155", background: "transparent" }} disabled={busy} onClick={() => unlink(d.id)}>Unlink</button>
                    </li>
                  ))}
                </ul>)}
          </div>
        </>
      )}
    </div>
  );
}

export default function LinkPage() {
  return (
    <Suspense fallback={null}>
      <LinkInner />
    </Suspense>
  );
}
