"use client";
/**
 * Scheduled → Activity: one timeline of what fired, what ran, what was traded
 * and what was refused (/api/timeline, lib/activity.ts). Each line keeps the
 * source its number came from. A source the server could not read is named
 * above the list — never shown as "nothing happened".
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import type { ActivityItem } from "@/lib/activity";
import { C, ChainBadge } from "./ui";

type State = { s: "no-wallet" } | { s: "signed-out" } | { s: "loading" } | { s: "error"; msg: string }
  | { s: "ok"; items: ActivityItem[]; unavailable: string[] };

const KIND: Record<ActivityItem["kind"], { icon: string; color: string; label: string }> = {
  alert:              { icon: "🔔", color: C.accent, label: "alert" },
  automation_checked: { icon: "⏱", color: C.dim,    label: "check" },
  trade:              { icon: "⇄", color: C.green,  label: "trade" },
  task_run:           { icon: "▶", color: C.sub,    label: "task" },
  task_failed:        { icon: "!", color: C.amber,  label: "task" },
  blocked:            { icon: "⛔", color: C.red,    label: "blocked" },
};

const FILTERS: Array<{ id: "all" | ActivityItem["kind"]; label: string }> = [
  { id: "all", label: "All" }, { id: "alert", label: "Alerts" }, { id: "trade", label: "Trades" },
  { id: "automation_checked", label: "Checks" }, { id: "task_run", label: "Tasks" }, { id: "blocked", label: "Blocked" },
];

function day(at: number): string {
  const d = new Date(at);
  const today = new Date();
  const y = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
}

export default function ActivityTab({ walletAddr }: { walletAddr?: string | null }) {
  const { hasSession, ensureSession, fetchWithSession } = useEnsureSession();
  const [st, setSt] = useState<State>({ s: "loading" });
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  const load = useCallback(async (interactive = false) => {
    if (!walletAddr) { setSt({ s: "no-wallet" }); return; }
    if (!interactive && !(await hasSession(walletAddr))) { setSt({ s: "signed-out" }); return; }
    try {
      const r = await fetchWithSession(walletAddr, `/api/timeline?address=${walletAddr}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setSt({ s: "error", msg: j.error ?? `HTTP ${r.status}` }); return; }
      setSt({ s: "ok", items: j.items ?? [], unavailable: j.unavailable ?? [] });
    } catch (e) { setSt({ s: "error", msg: (e as Error).message.slice(0, 120) }); }
  }, [walletAddr, hasSession, fetchWithSession]);
  useEffect(() => { void load(false); }, [load]);

  if (st.s === "no-wallet") return <Note>Connect your wallet to see its activity.</Note>;
  if (st.s === "signed-out") return (
    <Note>
      Activity is private to your wallet.{" "}
      <button className="underline text-[#4FC3F7]" onClick={async () => { if (walletAddr) { await ensureSession(walletAddr); await load(true); } }}>Sign in</button> to see it.
    </Note>
  );
  if (st.s === "loading") return <Note>Loading activity…</Note>;
  if (st.s === "error") return <Note>Could not load activity: {st.msg}</Note>;

  const items = st.items.filter((i) => filter === "all" || i.kind === filter || (filter === "task_run" && i.kind === "task_failed"));
  const groups: Array<{ day: string; items: ActivityItem[] }> = [];
  for (const i of items) {
    const d = day(i.at);
    const g = groups[groups.length - 1];
    if (g && g.day === d) g.items.push(i); else groups.push({ day: d, items: [i] });
  }

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {FILTERS.map((f) => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            className="font-mono text-[10.5px] rounded-lg px-2.5 py-1 border transition-colors"
            style={filter === f.id ? { color: C.accent, borderColor: "#4FC3F740", background: "#4FC3F710" } : { color: C.dim, borderColor: C.line }}>
            {f.label}
          </button>
        ))}
        <button onClick={() => void load(true)} className="ml-auto font-mono text-[10px] text-[#64748B] hover:text-white">↻ Refresh</button>
      </div>
      {st.unavailable.length > 0 && (
        <p className="font-mono text-[10px] text-amber-400 mb-3">Could not read: {st.unavailable.join(", ")} — those entries are missing below, not absent.</p>
      )}
      {groups.length === 0 ? (
        <Note>Nothing here yet. Alerts that fire, automation checks, recurring runs and the trades you sign all land on this timeline.</Note>
      ) : groups.map((g) => (
        <div key={g.day} className="mb-5">
          <p className="font-mono text-[9.5px] tracking-[0.14em] text-[#475569] mb-2">{g.day.toUpperCase()}</p>
          <ol className="relative border-l border-[#1A1A2E] ml-2 space-y-3">
            {g.items.map((i) => {
              const k = KIND[i.kind];
              return (
                <li key={i.id} className="pl-5 relative">
                  <span className="absolute -left-[9px] top-0.5 w-[17px] h-[17px] rounded-full flex items-center justify-center text-[9px] bg-[#0D0D14] border border-[#1A1A2E]" style={{ color: k.color }}>{k.icon}</span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-[11.5px] font-medium" style={{ color: k.color === C.dim ? C.sub : k.color }}>{i.title}</span>
                    {i.chain && <ChainBadge chain={i.chain} />}
                    <span className="font-mono text-[9.5px] text-[#475569]">{new Date(i.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  {i.detail && <p className="text-[12px] text-[#94A3B8] mt-0.5 leading-snug">{i.detail}</p>}
                  <p className="font-mono text-[9.5px] text-[#475569] mt-0.5 flex gap-2">
                    {i.href && <a className="hover:text-[#4FC3F7]" href={i.href} target="_blank" rel="noreferrer">{i.source ?? "explorer"} ↗</a>}
                    {i.kind === "alert" && i.title.includes("trade prepared") && <Link className="text-[#4FC3F7] hover:underline" href="/chat?alerts=1">Review &amp; sign →</Link>}
                  </p>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="font-mono text-[11px] text-[#64748B] border border-dashed border-[#1A1A2E] rounded-2xl px-5 py-8 text-center">{children}</p>;
}
