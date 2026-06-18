"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, BarChart, Bar, Cell, ResponsiveContainer } from "recharts";
import type { FeedItem, FeedAgent } from "@/app/api/cron/feed/route";

// ─── constants / helpers ────────────────────────────────────────────────────

const AGENT: Record<FeedAgent, { label: string; emoji: string; color: string }> = {
  aeon:      { label: "Aeon",       emoji: "⭐",   color: "#FB923C" },
  miroshark: { label: "MiroShark",  emoji: "🦈",   color: "#A78BFA" },
  blue:      { label: "Blue Agent", emoji: "🟦",   color: "#4FC3F7" },
  consensus: { label: "Consensus",  emoji: "⭐🟦🦈", color: "#34D399" },
};

const SIGNAL_COLOR: Record<string, string> = {
  STRONG_BUY: "#22C55E", BUY: "#84CC16", WATCH: "#F59E0B", SKIP: "#EF4444", NO_SIGNAL: "#64748B",
};
const PHASE_COLOR: Record<string, string> = {
  emerging: "#4FC3F7", rising: "#34D399", peak: "#F59E0B", fading: "#EF4444", mid: "#A78BFA",
};
const GREEN = "#34D399", RED = "#EF4444", AMBER = "#F59E0B";

type Metric = { label: string; value: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function raw(item?: FeedItem): any { return (item?.data as { raw?: unknown })?.raw ?? {}; }
function metricsOf(item: FeedItem): Metric[] {
  const m = (item.data as { metrics?: Metric[] })?.metrics;
  return Array.isArray(m) ? m : [];
}
function getMetric(item: FeedItem | undefined, re: RegExp): string | null {
  if (!item) return null;
  return metricsOf(item).find((x) => re.test(x.label))?.value ?? null;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.replace(/[$,↑↓+\s]/g, "");
  const mult = /b$/i.test(s) ? 1e9 : /m$/i.test(s) ? 1e6 : /k$/i.test(s) ? 1e3 : 1;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n * mult : null;
}
function ago(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
function pctTone(v: string | null): string {
  if (!v) return "#cbd5e1";
  const n = num(v); if (n === null) return "#cbd5e1";
  return n > 0 ? GREEN : n < 0 ? RED : AMBER;
}
function sentimentTone(s: string | null): string {
  if (!s) return AMBER;
  const t = s.toLowerCase();
  if (t.includes("bull") || t.includes("risk-on")) return GREEN;
  if (t.includes("bear") || t.includes("risk-off")) return RED;
  return AMBER;
}

// ─── small UI atoms ─────────────────────────────────────────────────────────

function Bar01({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-1.5 rounded-full bg-[#1A1A2E] overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

function Badge({ text, color }: { text: string; color: string }) {
  return (
    <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}>{text}</span>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">{label}</div>
      <div className="font-mono text-[13px] font-semibold" style={{ color: tone ?? "#fff" }}>{value}</div>
    </div>
  );
}

// ─── per-tool card bodies ───────────────────────────────────────────────────

function BasePulseBody({ item, history }: { item: FeedItem; history: FeedItem[] }) {
  const tvl = getMetric(item, /tvl/i);
  const sentiment = getMetric(item, /sentiment/i);
  const pulse = num(getMetric(item, /pulse|score/i));
  const series = history
    .filter((i) => i.tool === "base-pulse")
    .slice(0, 14).reverse()
    .map((i, x) => ({ x, v: num(getMetric(i, /tvl/i)) }))
    .filter((p) => p.v != null);
  return (
    <>
      <div className="flex items-end gap-4 mb-3">
        <Stat label="Base TVL" value={tvl ?? "—"} />
        {sentiment && <div><div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-1">Sentiment</div><Badge text={sentiment} color={sentimentTone(sentiment)} /></div>}
        {pulse != null && (
          <div className="ml-auto flex items-center gap-2">
            <div className="relative w-10 h-10">
              <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                <circle cx="18" cy="18" r="15" fill="none" stroke="#1A1A2E" strokeWidth="3" />
                <circle cx="18" cy="18" r="15" fill="none" stroke={GREEN} strokeWidth="3" strokeLinecap="round"
                  strokeDasharray={`${(pulse / 100) * 94.2} 94.2`} />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center font-mono text-[10px] font-bold text-white">{pulse}</span>
            </div>
            <span className="font-mono text-[9px] text-slate-600 uppercase">Pulse</span>
          </div>
        )}
      </div>
      {series.length >= 2 && (
        <div className="h-9 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <Line type="monotone" dataKey="v" stroke={GREEN} strokeWidth={1.5} dot={false} isAnimationActive />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </>
  );
}

function NarrativeBody({ item }: { item: FeedItem }) {
  const arr = (Array.isArray(raw(item).trending_narratives) ? raw(item).trending_narratives : []).slice(0, 3);
  if (arr.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  const vArrow = (v: unknown) => { const t = String(v ?? "").toLowerCase(); return t.includes("accel") || t.includes("up") ? "↑↑" : t.includes("steady") ? "→" : t.includes("fad") || t.includes("down") ? "↓" : "↑"; };
  return (
    <div className="flex flex-col gap-2">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {arr.map((n: any, i: number) => {
        const phase = String(n?.phase ?? "").toLowerCase();
        const color = PHASE_COLOR[phase] ?? "#94a3b8";
        return (
          <div key={i} className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-slate-200 truncate flex-1">{n?.name ?? "—"}</span>
            {n?.phase && <Badge text={String(n.phase)} color={color} />}
            <span className="font-mono text-[12px]" style={{ color }}>{vArrow(n?.velocity)}</span>
          </div>
        );
      })}
      {arr[0]?.entry_window && (
        <div className="font-mono text-[10px] text-slate-500">Entry window: <span className="text-[#34D399]">{String(arr[0].entry_window)}</span></div>
      )}
    </div>
  );
}

function TokenAlphaBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const sig = String(r.signal ?? "").toUpperCase();
  const color = SIGNAL_COLOR[sig] ?? "#64748B";
  const conf = num(r.confidence);
  const confPct = conf == null ? null : conf <= 1 ? conf * 100 : conf;
  const bars = [
    { name: "Stop", value: num(r.stop_loss), fill: RED },
    { name: "Entry", value: num(r.entry_price), fill: "#4FC3F7" },
    { name: "Target", value: num(r.target), fill: GREEN },
  ].filter((b) => b.value != null) as { name: string; value: number; fill: string }[];
  return (
    <>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {sig && <Badge text={sig} color={color} />}
        {r.symbol && <span className="font-mono text-[13px] font-bold text-white">{r.symbol}</span>}
        {r.entry_price != null && <span className="font-mono text-[12px] text-slate-400">@ ${r.entry_price}</span>}
        {r.whale_confirmation && <span className="font-mono text-[11px] text-[#34D399]">🐋 confirmed ✓</span>}
      </div>
      {confPct != null && (
        <div className="mb-3">
          <div className="flex justify-between font-mono text-[9px] text-slate-600 uppercase mb-1"><span>Confidence</span><span>{Math.round(confPct)}%</span></div>
          <Bar01 value={confPct} color={color} />
        </div>
      )}
      {bars.length >= 2 && (
        <div className="h-12 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 2, bottom: 0, left: 0, right: 0 }}>
              <Bar dataKey="value" radius={[3, 3, 0, 0]} isAnimationActive>
                {bars.map((b, i) => <Cell key={i} fill={b.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-[12px] text-slate-500 leading-relaxed mt-2">{item.summary}</p>
    </>
  );
}

function WhaleBody({ item }: { item: FeedItem }) {
  const flow = getMetric(item, /flow|signal|direction/i);
  const tone = flow ? sentimentTone(flow) : "#cbd5e1";
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-slate-400">{item.summary}</p>
      {flow && (
        <div className="flex items-center gap-2">
          <span className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">Smart money</span>
          <Badge text={flow} color={tone} />
        </div>
      )}
    </div>
  );
}

function BaseAlphaBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const phase = String(r.market_phase ?? "").toLowerCase();
  const phaseColor = phase.includes("risk-on") ? GREEN : phase.includes("risk-off") ? RED : AMBER;
  const top = Array.isArray(r.momentum_picks) ? r.momentum_picks[0] : null;
  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {r.market_phase && <div><div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-1">Market</div><Badge text={String(r.market_phase)} color={phaseColor} /></div>}
        {top?.symbol && <div><div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-1">Top pick</div><span className="font-mono text-[13px] font-bold text-[#34D399]">{top.symbol}{top.signal_type ? ` · ${top.signal_type}` : ""}</span></div>}
        {r.base_tvl_usd != null && <Stat label="TVL 7d" value={getMetric(item, /tvl 7d|7d/i) ?? "—"} tone={pctTone(getMetric(item, /7d/i))} />}
      </div>
      <p className="text-[13px] text-slate-400 leading-relaxed">{item.summary}</p>
    </>
  );
}

function CardBody({ item, history }: { item: FeedItem; history: FeedItem[] }) {
  switch (item.tool) {
    case "base-pulse":      return <BasePulseBody item={item} history={history} />;
    case "narrative-pulse": return <NarrativeBody item={item} />;
    case "token-alpha":     return <TokenAlphaBody item={item} />;
    case "whale-tracker":   return <WhaleBody item={item} />;
    case "base-alpha":      return <BaseAlphaBody item={item} />;
    default: {
      const ms = metricsOf(item);
      return (
        <>
          <p className="text-[13px] text-slate-400 leading-relaxed mb-3">{item.summary}</p>
          {ms.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {ms.map((m, i) => <Stat key={i} label={m.label} value={m.value} />)}
            </div>
          )}
        </>
      );
    }
  }
}

// ─── card shell ─────────────────────────────────────────────────────────────

function FeedCard({ item, history, hero, fresh, delay, onShare, copied }: {
  item: FeedItem; history: FeedItem[]; hero?: boolean; fresh?: boolean; delay: number;
  onShare: () => void; copied: boolean;
}) {
  const badge = AGENT[item.agent] ?? AGENT.blue;
  return (
    <div
      className={`ba-card rounded-2xl p-5 h-full flex flex-col feed-in ${fresh ? "feed-flash" : ""} ${hero ? "lg:col-span-2" : ""}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
          style={{ color: badge.color, borderColor: `${badge.color}40`, background: `${badge.color}12` }}>
          {badge.emoji} {badge.label}
        </span>
        <span className="font-mono text-[11px] text-slate-500">{item.tool}</span>
        <span className="font-mono text-[11px] text-slate-700">· {ago(item.timestamp)}</span>
        {hero && <span className="ml-auto font-mono text-[9px] text-[#34D399] uppercase tracking-widest">● Latest</span>}
      </div>

      <h3 className={`font-bold text-white mb-3 ${hero ? "text-xl" : "text-base"}`}>{item.title}</h3>

      <div className="flex-1">
        <CardBody item={item} history={history} />
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={onShare}
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#FB923C]/40 transition-colors">
          {copied ? "Copied ✓" : "Share ↗"}
        </button>
        <button disabled title="Cast to Farcaster — coming soon"
          className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-600 opacity-50 cursor-not-allowed">
          Cast 🟣
        </button>
      </div>
    </div>
  );
}

// ─── time grouping ──────────────────────────────────────────────────────────

function bucketOf(ts: number): string {
  const now = new Date(); const d = new Date(ts);
  const sameDay = now.toDateString() === d.toDateString();
  if (sameDay && now.getHours() === d.getHours()) return "This hour";
  if (sameDay) return "Today";
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return "Yesterday";
  return "Earlier";
}
const BUCKET_ORDER = ["This hour", "Today", "Yesterday", "Earlier"];

// ─── page ───────────────────────────────────────────────────────────────────

const FILTERS: { id: "all" | FeedAgent; label: string }[] = [
  { id: "all", label: "All" },
  { id: "aeon", label: "⭐" },
  { id: "miroshark", label: "🦈" },
  { id: "consensus", label: "⭐🟦🦈" },
];

export default function FeedPage() {
  const [items, setItems]   = useState<FeedItem[]>([]);
  const [updatedAt, setUpd] = useState(0);
  const [loading, setLoad]  = useState(true);
  const [running, setRun]   = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | FeedAgent>("all");
  const [freshIds, setFresh] = useState<Set<string>>(new Set());
  const prevTop = useRef<string | null>(null);
  const isDev = process.env.NODE_ENV !== "production";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoad(true);
    try {
      const res  = await fetch("/api/feed/items", { cache: "no-store" });
      const data = await res.json();
      const next: FeedItem[] = Array.isArray(data.items) ? data.items : [];
      // flag items newer than what we had → flash them in
      if (prevTop.current) {
        const cut = items.findIndex((i) => i.id === prevTop.current);
        const known = new Set(items.map((i) => i.id));
        const fresh = new Set(next.filter((i) => !known.has(i.id)).map((i) => i.id));
        if (fresh.size > 0 && cut !== 0) setFresh(fresh);
      }
      prevTop.current = next[0]?.id ?? null;
      setItems(next);
      setUpd(typeof data.updatedAt === "number" ? data.updatedAt : 0);
    } catch { /* keep current */ }
    finally { if (!silent) setLoad(false); }
  }, [items]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  // Auto-refresh every 5 minutes (silent, no reload)
  useEffect(() => {
    const id = setInterval(() => load(true), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [load]);

  const runNow = useCallback(async () => {
    setRun(true);
    try { await fetch("/api/cron/feed", { method: "POST" }); await load(); }
    finally { setRun(false); }
  }, [load]);

  const share = useCallback((item: FeedItem) => {
    try {
      navigator.clipboard?.writeText(item.shareText);
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1500);
    } catch { /* blocked */ }
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? items : items.filter((i) => i.agent === filter)),
    [items, filter],
  );

  // Header stats from the latest snapshots
  const stats = useMemo(() => {
    const pulse = items.find((i) => i.tool === "base-pulse");
    const alpha = items.find((i) => i.tool === "base-alpha");
    return {
      tvl:   getMetric(alpha, /tvl/i) ?? getMetric(pulse, /tvl/i) ?? "—",
      vol:   (() => { const r = raw(alpha); const v = r.volume_24h ?? r.dex_volume_24h ?? raw(pulse).volume_24h; const n = num(v); return n != null ? `$${(n / 1e6).toFixed(1)}M` : "—"; })(),
      pulse: getMetric(pulse, /pulse|score/i) ?? "—",
    };
  }, [items]);

  const hero = filtered[0];
  const rest = filtered.slice(1);
  const groups = useMemo(() => {
    const g: Record<string, FeedItem[]> = {};
    rest.forEach((i) => { (g[bucketOf(i.timestamp)] ??= []).push(i); });
    return BUCKET_ORDER.filter((b) => g[b]?.length).map((b) => ({ bucket: b, items: g[b] }));
  }, [rest]);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#050508]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 flex items-center gap-4 px-4 sm:px-6 py-3 border-b border-[#1A1A2E] bg-[#050508]/95 backdrop-blur shrink-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-[#34D399] live-dot" />
          <h1 className="text-base sm:text-lg font-bold text-white">Blue Feed</h1>
        </div>

        {/* center stats */}
        <div className="hidden md:flex items-center gap-5 ml-2">
          <Stat label="Base TVL" value={stats.tvl} />
          <Stat label="24h Vol" value={stats.vol} />
          <Stat label="Pulse" value={stats.pulse} tone={GREEN} />
        </div>

        {/* filter tabs */}
        <div className="flex items-center gap-1 ml-auto shrink-0">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className="font-mono text-[11px] px-2.5 py-1 rounded-lg border transition-colors"
              style={filter === f.id
                ? { color: "#FB923C", borderColor: "#FB923C40", background: "#FB923C12" }
                : { color: "#64748b", borderColor: "#1A1A2E", background: "transparent" }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {loading && items.length === 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className={`rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-5 animate-pulse ${i === 0 ? "lg:col-span-2" : ""}`}>
                <div className="h-4 w-40 bg-[#1A1A2E] rounded mb-3" />
                <div className="h-6 w-3/4 bg-[#15151f] rounded mb-3" />
                <div className="h-3 w-full bg-[#13131d] rounded mb-1.5" />
                <div className="h-3 w-2/3 bg-[#13131d] rounded" />
              </div>
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="rounded-2xl border border-[#1A1A2E] bg-[#0d0d12] p-10 text-center max-w-lg mx-auto mt-10">
            <div className="text-3xl mb-3">⭐🟦🦈</div>
            <h2 className="font-mono text-base font-bold text-white mb-1">Feed is warming up…</h2>
            <p className="font-mono text-[12px] text-slate-500 mb-5">BlueAgent Feed updates every hour via GitHub Actions.</p>
            {isDev && (
              <button onClick={runNow} disabled={running}
                className="font-mono text-[12px] px-4 py-2 rounded-xl border border-[#FB923C]/40 text-[#FB923C] hover:bg-[#FB923C]/10 transition-colors disabled:opacity-50">
                {running ? "Running…" : "Run Now →"}
              </button>
            )}
          </div>
        )}

        {filtered.length > 0 && (
          <div className="flex flex-col gap-6">
            {/* Hero (latest) */}
            {hero && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                <FeedCard item={hero} history={items} hero delay={0} fresh={freshIds.has(hero.id)}
                  onShare={() => share(hero)} copied={copied === hero.id} />
              </div>
            )}

            {/* Grouped feed */}
            {groups.map((g) => (
              <div key={g.bucket}>
                <div className="font-mono text-[10px] text-slate-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-slate-700" /> {g.bucket}
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                  {g.items.map((item, idx) => (
                    <FeedCard key={item.id} item={item} history={items} delay={Math.min(idx, 8) * 45}
                      fresh={freshIds.has(item.id)} onShare={() => share(item)} copied={copied === item.id} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
