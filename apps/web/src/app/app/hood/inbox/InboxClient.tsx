"use client";

/**
 * /hood/inbox client — feed + last-read bookmark.
 *
 * Lists every arrow (open / graded / informational), newest first. Rows
 * above the `last_read_at` bookmark are visually marked unread (bold
 * ticker + green dot). "Mark all read" POSTs the current timestamp so
 * the bookmark moves forward to now.
 *
 * Same accordion pattern as /hood/arrows — click a row to see the
 * shared ArrowBriefBlock (verdict_note · one_line_context · warnings ·
 * facts_at_fire · outcome_detail).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Arrow } from "@/lib/blue-hood/types";
import ArrowBriefBlock from "../ArrowBriefBlock";
import EnableAlertsButton from "./EnableAlertsButton";

const REFRESH_MS = 15_000;
const RH_GREEN = "#00C805";
const BLUE = "#4FC3F7";
const RED = "#ef4444";
const GREEN = "#22c55e";
const MUTED = "#6b7280";
const BG = "#050508";
const SURFACE = "#0B0D13";
const BORDER = "#1A1A2E";

interface ArrowsRes {
  ok: boolean;
  arrows: Arrow[];
  arrows_today: number;
}
interface LastReadRes {
  ok: boolean;
  last_read_at: string | null;
}

export default function InboxClient() {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [lastRead, setLastRead] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const [a, lr] = await Promise.all([
        fetch("/api/hood/arrows?limit=200", { cache: "no-store", signal }).then((r) => r.json() as Promise<ArrowsRes>),
        fetch("/api/hood/inbox/last-read", { cache: "no-store", signal }).then((r) => r.json() as Promise<LastReadRes>),
      ]);
      if (a.ok) setArrows(a.arrows);
      if (lr.ok) setLastRead(lr.last_read_at);
      setErr(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setErr((e as Error).message);
    }
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    load(ctl.signal);
    const t = setInterval(() => load(ctl.signal), REFRESH_MS);
    return () => { ctl.abort(); clearInterval(t); };
  }, [load]);

  const cutoff = useMemo(() => (lastRead ? new Date(lastRead).getTime() : 0), [lastRead]);
  const unread = useMemo(
    () => arrows.filter((a) => new Date(a.fired_at).getTime() > cutoff).length,
    [arrows, cutoff],
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    // Optimistic — flip local bookmark immediately.
    setLastRead(now);
    try {
      await fetch("/api/hood/inbox/last-read", { method: "POST", cache: "no-store" });
    } catch {
      // If the POST fails the next 15s refresh will pull the server state.
    }
  }, []);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-4xl px-4 py-6 md:px-6 md:py-8">
        <Header unread={unread} onMarkAllRead={markAllRead} />
        {err && (
          <div
            role="alert"
            className="mb-6 rounded border px-3 py-2 text-sm"
            style={{ borderColor: "#3b2a15", backgroundColor: "#1a1408", color: "#f6c88f" }}
          >
            {err}
          </div>
        )}

        <SectionHeader label="// HOOD · INBOX" />
        {arrows.length === 0 ? (
          <EmptyState />
        ) : (
          <ul className="space-y-2">
            {arrows.map((a) => (
              <InboxCard
                key={a.id}
                a={a}
                isUnread={new Date(a.fired_at).getTime() > cutoff}
              />
            ))}
          </ul>
        )}

        <Footer />
      </div>
    </div>
  );
}

function Header({ unread, onMarkAllRead }: { unread: number; onMarkAllRead: () => void }) {
  return (
    <header className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-bold tracking-tight" style={{ color: RH_GREEN }}>Inbox</div>
        <div className="text-sm" style={{ color: "#9aa1ac" }}>
          {unread === 0 ? "all caught up" : `${unread} unread`}
        </div>
      </div>
      <div className="ml-auto flex items-center gap-3 font-mono text-xs">
        <Link href="/hood" className="hover:text-white" style={{ color: MUTED }}>
          ← Live board
        </Link>
        <Link href="/hood/arrows" className="hover:text-white" style={{ color: MUTED }}>
          Track record →
        </Link>
        <EnableAlertsButton />
        {unread > 0 && (
          <button
            onClick={onMarkAllRead}
            className="rounded border px-2 py-1 hover:text-white"
            style={{ borderColor: BORDER, color: "#9aa1ac" }}
          >
            Mark all read
          </button>
        )}
      </div>
    </header>
  );
}

function InboxCard({ a, isUnread }: { a: Arrow; isUnread: boolean }) {
  const [open, setOpen] = useState(false);
  const outcome = (() => {
    if (a.status === "open") return { label: "WATCHING", color: BLUE };
    if (a.outcome === "hit") return { label: "HIT", color: GREEN };
    if (a.outcome === "miss") return { label: "MISS", color: RED };
    if (a.outcome === "informational") return { label: "INFO", color: MUTED };
    return { label: "—", color: MUTED };
  })();
  const signal = (() => {
    if (a.type === "drift") return `DRIFT ${a.expected_direction === "up" ? "↑" : "↓"}`;
    if (a.type === "arb") return `ARB ${a.expected_direction === "up" ? "long dex" : "short dex"}`;
    if (a.type === "flow") return `FLOW ${a.expected_direction === "up" ? "buy" : "sell"}`;
    return "WHALE Δ";
  })();
  const briefLine = a.brief?.verdict_note ?? "No brief attached at fire time.";

  return (
    <li>
      <div
        className="rounded border cursor-pointer transition-colors hover:bg-black/40"
        style={{
          borderColor: isUnread ? "#1f3924" : BORDER,
          backgroundColor: SURFACE,
        }}
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-start gap-3 px-3 py-2.5">
          {isUnread && (
            <span
              className="mt-2 w-1.5 h-1.5 rounded-full shrink-0"
              style={{ backgroundColor: RH_GREEN, boxShadow: `0 0 6px ${RH_GREEN}80` }}
              aria-label="unread"
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-[11px]" style={{ color: RH_GREEN }}>{a.serial}</span>
              <span className={`font-mono text-[13px] ${isUnread ? "text-white font-semibold" : "text-slate-300"}`}>
                {a.ticker}
              </span>
              <span className="font-mono text-[10px] uppercase" style={{ color: MUTED }}>{signal}</span>
              <span className="ml-auto font-mono text-[10px]" style={{ color: MUTED }}>
                {formatRelTime(a.fired_at)}
              </span>
            </div>
            <div className="mt-1 font-mono text-[12px] truncate" style={{ color: "#9aa1ac" }}>
              {briefLine}
            </div>
          </div>
          <span
            className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider shrink-0"
            style={{ color: outcome.color, backgroundColor: `${outcome.color}18` }}
          >
            {outcome.label}
          </span>
          <span className="font-mono text-[10px]" style={{ color: MUTED }}>{open ? "▾" : "▸"}</span>
        </div>
        {open && (
          <div className="border-t px-3 py-3" style={{ borderColor: "#0f1218" }}>
            <ArrowBriefBlock a={a} hasBrief={!!a.brief} />
          </div>
        )}
      </div>
    </li>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded border py-12 text-center text-sm"
      style={{ borderColor: BORDER, backgroundColor: SURFACE, color: MUTED }}
    >
      <div className="font-mono text-white mb-2">Inbox empty.</div>
      <p className="max-w-md mx-auto">
        Arrows land here the moment the engine fires. First delivery when NYSE opens Monday.
      </p>
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-3 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
      {label}
    </div>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t pt-6 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <span>Oracle: Chainlink AggregatorV3 on RH Chain</span>
        <span>DEX: GeckoTerminal (Uniswap V3/V4)</span>
        <span>
          Powered by 30 <span style={{ color: BLUE }}>Blue Hub</span> skills · x402 · $0.05/call
        </span>
      </div>
    </footer>
  );
}

function formatRelTime(iso: string): string {
  const sec = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return `${d}d ago`;
}
