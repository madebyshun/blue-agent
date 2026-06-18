"use client";

import { useCallback, useEffect, useState } from "react";
import AppPageHeader from "@/components/app/AppPageHeader";
import type { FeedItem, FeedAgent } from "@/app/api/cron/feed/route";

const ACCENT = "#FB923C";

const AGENT_BADGE: Record<FeedAgent, { label: string; color: string }> = {
  aeon:      { label: "⭐ Aeon",       color: "#FB923C" },
  miroshark: { label: "🦈 MiroShark",  color: "#A78BFA" },
  blue:      { label: "🟦 Blue Agent", color: "#4FC3F7" },
  consensus: { label: "⭐🟦🦈",         color: "#34D399" },
};

type Metric = { label: string; value: string };

function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function FeedPage() {
  const [items, setItems]   = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [copied, setCopied]   = useState<string | null>(null);
  const isDev = process.env.NODE_ENV !== "production";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/feed/items", { cache: "no-store" });
      const data = await res.json();
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const runNow = useCallback(async () => {
    setRunning(true);
    try {
      await fetch("/api/cron/feed", { method: "POST" });
      await load();
    } finally {
      setRunning(false);
    }
  }, [load]);

  const share = useCallback((item: FeedItem) => {
    try {
      navigator.clipboard?.writeText(item.shareText);
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1500);
    } catch { /* clipboard blocked */ }
  }, []);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <AppPageHeader
        label="BLUE FEED"
        subtitle="⭐🟦🦈 · updates every hour"
        accent={ACCENT}
        right={
          <button
            onClick={load}
            disabled={loading}
            className="font-mono text-[10px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#FB923C]/40 transition-colors disabled:opacity-40"
          >
            {loading ? "Loading…" : "Refresh ↻"}
          </button>
        }
      />

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        <div className="max-w-2xl mx-auto flex flex-col gap-3">

          {/* Loading skeletons */}
          {loading && items.length === 0 && (
            <>
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 animate-pulse">
                  <div className="h-4 w-40 bg-[#1A1A2E] rounded mb-3" />
                  <div className="h-5 w-3/4 bg-[#15151f] rounded mb-2" />
                  <div className="h-3 w-full bg-[#13131d] rounded mb-1.5" />
                  <div className="h-3 w-2/3 bg-[#13131d] rounded" />
                </div>
              ))}
            </>
          )}

          {/* Empty state */}
          {!loading && items.length === 0 && (
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-10 text-center">
              <div className="text-3xl mb-3">⭐🟦🦈</div>
              <h2 className="font-mono text-base font-bold text-white mb-1">Feed is warming up…</h2>
              <p className="font-mono text-[12px] text-slate-500 mb-5">Check back in a few minutes.</p>
              {isDev && (
                <button
                  onClick={runNow}
                  disabled={running}
                  className="font-mono text-[12px] px-4 py-2 rounded-xl border border-[#FB923C]/40 text-[#FB923C] hover:bg-[#FB923C]/10 transition-colors disabled:opacity-50"
                >
                  {running ? "Running…" : "Run Now →"}
                </button>
              )}
            </div>
          )}

          {/* Feed cards (newest first) */}
          {items.map((item) => {
            const badge = AGENT_BADGE[item.agent] ?? AGENT_BADGE.blue;
            const metrics = (Array.isArray((item.data as { metrics?: Metric[] })?.metrics)
              ? (item.data as { metrics: Metric[] }).metrics
              : []) as Metric[];
            return (
              <div key={item.id} className="ba-card rounded-2xl p-5">
                {/* Header row: agent badge · tool · time */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span
                    className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
                    style={{ color: badge.color, borderColor: `${badge.color}40`, background: `${badge.color}12` }}
                  >
                    {badge.label}
                  </span>
                  <span className="font-mono text-[11px] text-slate-500">{item.tool}</span>
                  <span className="font-mono text-[11px] text-slate-700">· {ago(item.timestamp)}</span>
                </div>

                {/* Title + summary */}
                <h3 className="text-base font-bold text-white mb-1.5">{item.title}</h3>
                <p className="text-[13px] text-slate-400 leading-relaxed mb-4">{item.summary}</p>

                {/* Key metrics inline */}
                {metrics.length > 0 && (
                  <div className="flex flex-wrap gap-x-5 gap-y-2 mb-4">
                    {metrics.map((m, i) => (
                      <div key={i}>
                        <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">{m.label}</div>
                        <div className="font-mono text-[13px] font-semibold text-white">{m.value}</div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => share(item)}
                    className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#FB923C]/40 transition-colors"
                  >
                    {copied === item.id ? "Copied ✓" : "Share ↗"}
                  </button>
                  <button
                    disabled
                    title="Cast to Farcaster — coming soon"
                    className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-600 opacity-50 cursor-not-allowed"
                  >
                    Cast 🟣
                  </button>
                </div>
              </div>
            );
          })}

        </div>
      </div>
    </div>
  );
}
