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
const GREEN = "#34D399", RED = "#EF4444", AMBER = "#F59E0B", BLUE = "#4FC3F7", PURPLE = "#A78BFA";

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

// Per-tool accent (left border) + 8% background tint.
const TOOL_ACCENT: Record<string, string> = {
  "base-pulse": BLUE, "narrative-pulse": "#FB923C", "whale-tracker": PURPLE, "base-alpha": GREEN,
  "ecosystem-digest": GREEN, "new-pools": BLUE, "blue-stream": BLUE,
  "token-momentum-scanner": PURPLE, "narrative-position": GREEN, "defi-opportunity": PURPLE,
};
function accentFor(item: FeedItem): string {
  if (item.tool === "token-alpha") return SIGNAL_COLOR[String(raw(item).signal ?? "").toUpperCase()] ?? "#64748B";
  return TOOL_ACCENT[item.tool] ?? BLUE;
}
function tintRGBA(hex: string, a = 0.08): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Cast to Farcaster — composeCast inside a mini-app, else open Warpcast compose.
async function castToFarcaster(text: string) {
  try {
    const mod = await import("@farcaster/miniapp-sdk");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sdk: any = (mod as any).sdk;
    const inMini = typeof sdk?.isInMiniApp === "function" ? await sdk.isInMiniApp() : false;
    if (inMini && sdk?.actions?.composeCast) { await sdk.actions.composeCast({ text }); return; }
  } catch { /* fall back to web compose */ }
  if (typeof window !== "undefined")
    window.open(`https://warpcast.com/~/compose?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
}

// ─── small UI atoms ─────────────────────────────────────────────────────────

function AnimatedNumber({ value, className, style }: { value: string; className?: string; style?: React.CSSProperties }) {
  const m = value.match(/^([^\d.-]*)(-?[\d,.]+)(.*)$/);
  const target = m ? parseFloat(m[2].replace(/,/g, "")) : NaN;
  const decimals = m ? (m[2].split(".")[1] ?? "").length : 0;
  const [disp, setDisp] = useState(Number.isFinite(target) ? target : 0);
  const prev = useRef(Number.isFinite(target) ? target : 0);
  useEffect(() => {
    if (!Number.isFinite(target)) return;
    const from = prev.current, to = target, dur = 650, start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setDisp(from + (to - from) * e);
      if (p < 1) raf = requestAnimationFrame(tick); else prev.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  if (!m || !Number.isFinite(target)) return <span className={className} style={style}>{value}</span>;
  const shown = decimals > 0 ? disp.toFixed(decimals) : Math.round(disp).toLocaleString();
  return <span className={className} style={style}>{m[1]}{shown}{m[3]}</span>;
}

function Bar01({ value, color }: { value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 rounded-full bg-[#1A1A2E] overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color, boxShadow: `0 0 8px ${color}66` }} />
    </div>
  );
}
function Badge({ text, color, big }: { text: string; color: string; big?: boolean }) {
  return (
    <span className={`font-mono font-bold rounded uppercase tracking-wider ${big ? "text-[13px] px-3 py-1" : "text-[10px] px-2 py-0.5"}`}
      style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}>{text}</span>
  );
}
function Stat({ label, value, tone, animate }: { label: string; value: string; tone?: string; animate?: boolean }) {
  return (
    <div>
      <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">{label}</div>
      <div className="font-mono text-[13px] font-semibold" style={{ color: tone ?? "#fff" }}>
        {animate ? <AnimatedNumber value={value} /> : value}
      </div>
    </div>
  );
}
function PulseRing({ value, size = 44 }: { value: number; size?: number }) {
  const r = 15, circ = 2 * Math.PI * r;
  const color = value >= 70 ? GREEN : value >= 40 ? AMBER : RED;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" style={{ width: size, height: size }} className="-rotate-90">
        <circle cx="18" cy="18" r={r} fill="none" stroke="#1A1A2E" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
          strokeDasharray={`${(value / 100) * circ} ${circ}`} style={{ transition: "stroke-dasharray .7s ease" }} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold text-white" style={{ fontSize: size * 0.26 }}>{Math.round(value)}</span>
    </div>
  );
}

// ─── per-tool card bodies ───────────────────────────────────────────────────

function BasePulseBody({ item, history, large }: { item: FeedItem; history: FeedItem[]; large?: boolean }) {
  const tvl = getMetric(item, /tvl/i);
  const change = getMetric(item, /change|7d|24h/i);
  const sentiment = getMetric(item, /sentiment/i);
  const pulse = num(getMetric(item, /pulse|score/i));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens: any[] = Array.isArray(raw(item).trending) ? raw(item).trending : Array.isArray(raw(item).top_tokens) ? raw(item).top_tokens : [];
  const bpHist = history.filter((i) => i.tool === "base-pulse").slice(0, 14).reverse();
  const tvlSeries = bpHist.map((i) => num(getMetric(i, /tvl/i))).filter((v): v is number => v != null);
  const pulseSeries = bpHist.map((i) => num(getMetric(i, /pulse|score/i))).filter((v): v is number => v != null);
  const varies = (a: number[]) => { if (a.length < 2) return false; const mx = Math.max(...a), mn = Math.min(...a); return mx > 0 && (mx - mn) / mx > 0.005; };
  // Flat TVL → no meaningful sparkline; fall back to pulse-score bars, else hide.
  const chart: "tvl" | "pulse" | null = varies(tvlSeries) ? "tvl" : varies(pulseSeries) ? "pulse" : null;
  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Base TVL</div>
          <div className={`font-mono font-bold text-white ${large ? "text-3xl" : "text-2xl"}`}>{tvl ?? "—"}</div>
          {change && <div className="font-mono text-[12px] mt-0.5" style={{ color: pctTone(change) }}>{change}</div>}
          {sentiment && <div className="mt-2"><Badge text={sentiment} color={sentimentTone(sentiment)} /></div>}
        </div>
        {pulse != null && (
          <div className="flex flex-col items-center gap-1">
            <PulseRing value={pulse} size={large ? 64 : 48} />
            <span className="font-mono text-[9px] text-slate-600 uppercase">Pulse</span>
          </div>
        )}
      </div>
      {tokens.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {tokens.slice(0, 3).map((t: any, i: number) => (
            <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded-md border border-[#1A1A2E] bg-[#0a0a10] text-slate-300">
              {t?.symbol ?? t?.name ?? "—"}{t?.price ? ` $${t.price}` : ""}
            </span>
          ))}
        </div>
      )}
      {chart === "tvl" && (
        <div className="-mx-1 mt-3" style={{ height: large ? 100 : 40 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tvlSeries.map((v, x) => ({ x, v }))}>
              <Line type="monotone" dataKey="v" stroke={GREEN} strokeWidth={large ? 2 : 1.5} dot={false} isAnimationActive />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {chart === "pulse" && (
        <div className="mt-3">
          <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-1">Pulse history</div>
          <div className="-mx-1" style={{ height: large ? 80 : 36 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={pulseSeries.map((v, x) => ({ x, v }))}>
                <Bar dataKey="v" radius={[2, 2, 0, 0]} fill={GREEN} isAnimationActive />
              </BarChart>
            </ResponsiveContainer>
          </div>
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
    <div className="flex flex-col gap-2.5">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {arr.map((n: any, i: number) => {
        const phase = String(n?.phase ?? "").toLowerCase();
        const color = PHASE_COLOR[phase] ?? "#94a3b8";
        return (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[12px] text-slate-200 truncate flex-1">{n?.name ?? "—"}</span>
              {n?.phase && <Badge text={String(n.phase)} color={color} />}
              <span className="font-mono text-[13px] w-5 text-right" style={{ color }}>{vArrow(n?.velocity)}</span>
            </div>
            <div className="h-1 rounded-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}22)`, width: `${100 - i * 22}%` }} />
          </div>
        );
      })}
      {arr[0]?.entry_window && (
        <div className="font-mono text-[10px] text-slate-500 mt-0.5">Entry window: <span className="text-[#34D399]">{String(arr[0].entry_window)}</span></div>
      )}
    </div>
  );
}

function TokenAlphaBody({ item, large }: { item: FeedItem; large?: boolean }) {
  const r = raw(item);
  const sig = String(r.signal ?? "").toUpperCase();
  const color = SIGNAL_COLOR[sig] ?? "#64748B";
  const conf = num(r.confidence);
  const confPct = conf == null ? null : conf <= 1 ? conf * 100 : conf;
  const cols = [
    { label: "Stop", value: r.stop_loss, color: RED },
    { label: "Entry", value: r.entry_price, color: BLUE },
    { label: "Target", value: r.target, color: GREEN },
  ].filter((c) => c.value != null);
  const bars = cols.map((c) => ({ name: c.label, value: num(c.value) as number, fill: c.color })).filter((b) => b.value != null);
  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        {sig && (
          <span className="font-mono font-bold rounded-lg uppercase tracking-wider px-3 py-1.5 text-[14px]"
            style={{ color, background: `${color}1a`, border: `1px solid ${color}55`, boxShadow: `0 0 18px ${color}30` }}>{sig}</span>
        )}
        {r.symbol && <span className="font-mono text-[15px] font-bold text-white">{r.symbol}</span>}
        {r.whale_confirmation && (
          <span className="ml-auto font-mono text-[10px] px-2 py-0.5 rounded-full text-[#34D399] border border-[#34D399]/40 bg-[#34D399]/10">🐋 whale ✓</span>
        )}
      </div>
      {cols.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {cols.map((c) => (
            <div key={c.label} className="rounded-lg border border-[#1A1A2E] bg-[#0a0a10] px-2 py-1.5">
              <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">{c.label}</div>
              <div className="font-mono text-[13px] font-semibold" style={{ color: c.color }}>${c.value}</div>
            </div>
          ))}
        </div>
      )}
      {confPct != null && (
        <div className="mb-3">
          <div className="flex justify-between font-mono text-[9px] text-slate-600 uppercase mb-1"><span>Confidence</span><span style={{ color }}>{Math.round(confPct)}%</span></div>
          <Bar01 value={confPct} color={color} />
        </div>
      )}
      {large && bars.length >= 2 && (
        <div className="-mx-1 mb-2" style={{ height: 120 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={bars} margin={{ top: 4, bottom: 0, left: 0, right: 0 }}>
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive>{bars.map((b, i) => <Cell key={i} fill={b.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-[12px] text-slate-500 leading-relaxed">{item.summary}</p>
    </>
  );
}

function WhaleBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const activity = String(r.whaleActivity ?? r.signal ?? getMetric(item, /activity|flow|signal/i) ?? "NEUTRAL");
  const up = /accumul|bull|buy|inflow/i.test(activity);
  const down = /distrib|bear|sell|outflow/i.test(activity);
  const tone = up ? GREEN : down ? RED : AMBER;
  const arrow = up ? "↑" : down ? "↓" : "→";
  const strength = num(r.signalStrength);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const patterns: string[] = Array.isArray(r.patterns) ? r.patterns.filter((p: any) => typeof p === "string").slice(0, 2) : [];
  return (
    <div>
      <div className="flex items-center gap-4 mb-3">
        <span className="text-4xl font-bold leading-none shrink-0 w-12 text-center" style={{ color: tone }}>{arrow}</span>
        <div className="flex-1 min-w-0">
          <Badge text={activity} color={tone} big />
          {strength != null && (
            <div className="mt-2">
              <div className="flex justify-between font-mono text-[9px] text-slate-600 uppercase mb-1"><span>Signal strength</span><span style={{ color: tone }}>{Math.round(strength)}</span></div>
              <Bar01 value={strength} color={tone} />
            </div>
          )}
        </div>
      </div>
      <p className="text-[12px] text-slate-400 leading-relaxed">{r.recommendation || item.summary}</p>
      {patterns.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {patterns.map((p, i) => <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded-md border border-[#1A1A2E] bg-[#0a0a10] text-slate-400">{p}</span>)}
        </div>
      )}
    </div>
  );
}

function BaseAlphaBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const phase = String(r.market_phase ?? "").toLowerCase();
  const phaseColor = phase.includes("risk-on") ? GREEN : phase.includes("risk-off") ? RED : AMBER;
  const icon = phase.includes("risk-on") ? "📈" : phase.includes("risk-off") ? "📉" : "➖";
  const top = Array.isArray(r.momentum_picks) ? r.momentum_picks[0] : null;
  return (
    <>
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        {r.market_phase && (
          <span className="font-mono font-bold rounded-lg uppercase tracking-wider px-3 py-1.5 text-[13px] flex items-center gap-1.5"
            style={{ color: phaseColor, background: `${phaseColor}1a`, border: `1px solid ${phaseColor}45` }}>
            <span>{icon}</span>{String(r.market_phase)}
          </span>
        )}
        {top?.symbol && (
          <div className="ml-auto text-right">
            <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">Top pick</div>
            <div className="font-mono text-[16px] font-bold text-[#34D399]">{top.symbol}</div>
          </div>
        )}
      </div>
      <p className="text-[13px] text-slate-400 leading-relaxed">{item.summary}</p>
    </>
  );
}

function fmtUsdShort(v: unknown): string | null {
  const n = num(v); if (n == null) return null;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function Chip({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] px-2 py-0.5 rounded-md border border-[#1A1A2E] bg-[#0a0a10] text-slate-300">{children}</span>;
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 rounded-lg border border-[#1A1A2E] bg-[#0a0a10] px-2.5 py-1.5">{children}</div>;
}

function EcosystemDigestBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const movers = (Array.isArray(r.movers) ? r.movers : []).slice(0, 3);
  const narrs = (Array.isArray(r.narratives) ? r.narratives : []).slice(0, 3);
  return (
    <>
      <p className="text-[13px] text-slate-300 leading-relaxed mb-3">{r.headline ?? item.summary}</p>
      {movers.length > 0 && (
        <div className="mb-3">
          <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Top movers</div>
          <div className="flex flex-wrap gap-1.5">
            {movers.map((m: any, i: number) => { const ch = num(m?.change_24h ?? m?.change ?? m?.priceChange); return (
              <Chip key={i}><span className="text-slate-200">{m?.token ?? m?.symbol ?? "—"}</span>{ch != null && <span className="ml-1" style={{ color: ch >= 0 ? GREEN : RED }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</span>}</Chip>
            ); })}
          </div>
        </div>
      )}
      {narrs.length > 0 && (
        <div>
          <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Narratives</div>
          <div className="flex flex-wrap gap-1.5">{narrs.map((n: any, i: number) => <Chip key={i}><span className="text-slate-400">{typeof n === "string" ? n : (n?.name ?? "—")}</span></Chip>)}</div>
        </div>
      )}
    </>
  );
}

function NewPoolsBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const pools = (Array.isArray(r.pools) ? r.pools : Array.isArray(r.new_pools) ? r.new_pools : []).slice(0, 4);
  return (
    <>
      <p className="text-[13px] text-slate-400 leading-relaxed mb-3">{item.summary}</p>
      <div className="flex flex-col gap-1.5">
        {pools.map((p: any, i: number) => { const liq = fmtUsdShort(p?.liquidity ?? p?.liquidityUsd ?? p?.liq); const flagged = p?.honeypot || p?.flagged || p?.honeypotFlag; return (
          <Row key={i}>
            <span className="font-mono text-[11px] text-slate-200 flex-1 truncate">{p?.symbol ?? p?.baseSymbol ?? p?.name ?? "—"}</span>
            {liq && <span className="font-mono text-[10px] text-slate-500">{liq}</span>}
            {flagged && <span title="honeypot flag">🚨</span>}
          </Row>
        ); })}
      </div>
    </>
  );
}

function BlueStreamBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const trending = (Array.isArray(r.trending) ? r.trending : []).slice(0, 5);
  const newp = Array.isArray(r.new_pools) ? r.new_pools : [];
  return (
    <>
      <div className="flex gap-5 mb-3">
        <Stat label="Trending" value={`${trending.length}`} />
        <Stat label="New pools" value={`${newp.length}`} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {trending.map((t: any, i: number) => { const ch = num(t?.change_24h ?? t?.change ?? t?.priceChange); return (
          <Chip key={i}><span className="text-slate-200">{t?.token ?? t?.symbol ?? t?.baseSymbol ?? "—"}</span>{ch != null && <span className="ml-1" style={{ color: ch >= 0 ? GREEN : RED }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</span>}</Chip>
        ); })}
      </div>
    </>
  );
}

function MomentumBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const phase = r.market_phase;
  const plays = (Array.isArray(r.momentum_plays) ? r.momentum_plays : []).slice(0, 3);
  const sigOf = (sc: number | null) => sc == null ? null : sc >= 70 ? "BUY" : sc >= 40 ? "WATCH" : "SKIP";
  return (
    <>
      {phase && <div className="mb-3"><Badge text={String(phase)} color={/bull|risk-on/i.test(String(phase)) ? GREEN : /bear|risk-off/i.test(String(phase)) ? RED : AMBER} /></div>}
      {plays.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          {plays.map((p: any, i: number) => { const sc = num(p?.momentum_score); const sig = sigOf(sc); return (
            <Row key={i}>
              <span className="font-mono text-[11px] text-slate-200 flex-1 truncate">{p?.token ?? "—"}</span>
              {sc != null && <span className="font-mono text-[10px] text-slate-500">{sc}</span>}
              {sig && <Badge text={sig} color={SIGNAL_COLOR[sig] ?? "#64748b"} />}
            </Row>
          ); })}
        </div>
      ) : <p className="text-[13px] text-slate-400">{item.summary}</p>}
    </>
  );
}

const POS_COLOR: Record<string, string> = { "FRONT-RUN": GREEN, RIDE: BLUE, FADE: RED, IGNORE: "#64748b" };
function NarrativePositionBody({ item }: { item: FeedItem }) {
  const arr = (Array.isArray(raw(item).narratives) ? raw(item).narratives : []).slice(0, 3);
  if (arr.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  return (
    <div className="flex flex-col gap-2">
      {arr.map((n: any, i: number) => { const call = String(n?.position_call ?? "").toUpperCase(); return (
        <div key={i} className="flex items-center gap-2">
          <span className="font-mono text-[12px] text-slate-200 truncate flex-1">{n?.name ?? "—"}</span>
          {call && <Badge text={call} color={POS_COLOR[call] ?? "#64748b"} />}
        </div>
      ); })}
    </div>
  );
}

function DefiOpportunityBody({ item }: { item: FeedItem }) {
  const opps = (Array.isArray(raw(item).opportunities) ? raw(item).opportunities : []).slice(0, 3);
  const riskTone = (s: string) => /low/i.test(s) ? GREEN : /high/i.test(s) ? RED : AMBER;
  if (opps.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {opps.map((o: any, i: number) => (
        <Row key={i}>
          <span className="font-mono text-[11px] text-slate-200 flex-1 truncate">{o?.protocol ?? o?.pool ?? "—"}</span>
          {o?.apy && <span className="font-mono text-[11px] font-semibold" style={{ color: GREEN }}>{String(o.apy)}{String(o.apy).includes("%") ? "" : "%"}</span>}
          {o?.risk && <Badge text={String(o.risk)} color={riskTone(String(o.risk))} />}
        </Row>
      ))}
    </div>
  );
}
/* eslint-enable @typescript-eslint/no-explicit-any */

function CardBody({ item, history, large }: { item: FeedItem; history: FeedItem[]; large?: boolean }) {
  switch (item.tool) {
    case "base-pulse":      return <BasePulseBody item={item} history={history} large={large} />;
    case "narrative-pulse": return <NarrativeBody item={item} />;
    case "token-alpha":     return <TokenAlphaBody item={item} large={large} />;
    case "whale-tracker":   return <WhaleBody item={item} />;
    case "base-alpha":      return <BaseAlphaBody item={item} />;
    case "ecosystem-digest": return <EcosystemDigestBody item={item} />;
    case "new-pools":        return <NewPoolsBody item={item} />;
    case "blue-stream":      return <BlueStreamBody item={item} />;
    case "token-momentum-scanner": return <MomentumBody item={item} />;
    case "narrative-position":     return <NarrativePositionBody item={item} />;
    case "defi-opportunity":       return <DefiOpportunityBody item={item} />;
    default: {
      const ms = metricsOf(item);
      return (
        <>
          <p className="text-[13px] text-slate-400 leading-relaxed mb-3">{item.summary}</p>
          {ms.length > 0 && (
            <div className="flex flex-wrap gap-x-5 gap-y-2">{ms.map((m, i) => <Stat key={i} label={m.label} value={m.value} />)}</div>
          )}
        </>
      );
    }
  }
}

// ─── card shell ─────────────────────────────────────────────────────────────

function FeedCard({ item, history, hero, fresh, delay, onShare, onCast, copied }: {
  item: FeedItem; history: FeedItem[]; hero?: boolean; fresh?: boolean; delay: number;
  onShare: () => void; onCast: () => void; copied: boolean;
}) {
  const badge = AGENT[item.agent] ?? AGENT.blue;
  const accent = accentFor(item);
  return (
    <div
      className={`relative overflow-hidden ba-card rounded-2xl flex flex-col feed-in ${fresh ? "feed-flash" : ""} ${hero ? "p-6 sm:p-7 sm:col-span-2 lg:col-span-2" : "p-5 h-full"}`}
      style={{
        animationDelay: `${delay}ms`,
        borderLeft: `2px solid ${accent}`,
        maxHeight: hero ? 320 : undefined,
        backgroundImage: hero
          ? "linear-gradient(180deg,#0d0d12,#0a0a10)"
          : `linear-gradient(0deg, ${tintRGBA(accent, 0.08)}, ${tintRGBA(accent, 0.08)})`,
      }}
    >
      {hero && <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: "linear-gradient(90deg,#4FC3F7,#A78BFA)" }} />}

      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
          style={{ color: badge.color, borderColor: `${badge.color}40`, background: `${badge.color}12` }}>
          {badge.emoji} {badge.label}
        </span>
        <span className="font-mono text-[11px] text-slate-500">{item.tool}</span>
        <span className="font-mono text-[11px] text-slate-700">· {ago(item.timestamp)}</span>
        {hero && (
          <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] text-[#34D399] uppercase tracking-widest">
            <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] live-dot" /> Latest
          </span>
        )}
      </div>

      <h3 className={`font-bold text-white mb-3 ${hero ? "text-2xl" : "text-base"}`}>{item.title}</h3>

      <div className={hero ? "overflow-hidden" : "flex-1"}>
        <CardBody item={item} history={history} large={hero} />
      </div>

      <div className="flex gap-2 mt-4">
        <div className="relative">
          <button onClick={onShare}
            className={`font-mono rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#4FC3F7]/50 transition-colors ${hero ? "text-[12px] px-4 py-2" : "text-[11px] px-3 py-1.5"}`}>
            Share ↗
          </button>
          {copied && (
            <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] px-2 py-1 rounded-md bg-[#34D399] text-[#031b12] feed-in">Link copied!</span>
          )}
        </div>
        <button onClick={onCast}
          className={`font-mono rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10 transition-colors ${hero ? "text-[12px] px-4 py-2" : "text-[11px] px-3 py-1.5"}`}>
          Cast 🟣
        </button>
      </div>
    </div>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

const FILTERS: { id: "all" | FeedAgent; label: string }[] = [
  { id: "all", label: "All" },
  { id: "aeon", label: "⭐" },
  { id: "miroshark", label: "🦈" },
  { id: "consensus", label: "⭐🟦🦈" },
];

function SkeletonCard({ hero }: { hero?: boolean }) {
  return (
    <div className={`rounded-2xl border border-[#1A1A2E] feed-shimmer ${hero ? "p-8 lg:col-span-2" : "p-5"}`}>
      <div className="h-4 w-40 bg-[#1A1A2E] rounded mb-3" />
      <div className={`bg-[#15151f] rounded mb-3 ${hero ? "h-8 w-1/2" : "h-6 w-3/4"}`} />
      <div className="h-3 w-full bg-[#13131d] rounded mb-1.5" />
      <div className="h-3 w-2/3 bg-[#13131d] rounded" />
    </div>
  );
}

export default function FeedPage() {
  const [items, setItems]   = useState<FeedItem[]>([]);
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
      if (prevTop.current) {
        const cut = items.findIndex((i) => i.id === prevTop.current);
        const known = new Set(items.map((i) => i.id));
        const fresh = new Set(next.filter((i) => !known.has(i.id)).map((i) => i.id));
        if (fresh.size > 0 && cut !== 0) setFresh(fresh);
      }
      prevTop.current = next[0]?.id ?? null;
      setItems(next);
    } catch { /* keep current */ }
    finally { if (!silent) setLoad(false); }
  }, [items]);

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  useEffect(() => { const id = setInterval(() => load(true), 5 * 60 * 1000); return () => clearInterval(id); }, [load]);

  const runNow = useCallback(async () => {
    setRun(true);
    try { await fetch("/api/cron/feed", { method: "POST" }); await load(); }
    finally { setRun(false); }
  }, [load]);

  const share = useCallback((item: FeedItem) => {
    try {
      navigator.clipboard?.writeText(item.shareText);
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1600);
    } catch { /* blocked */ }
  }, []);

  const filtered = useMemo(() => (filter === "all" ? items : items.filter((i) => i.agent === filter)), [items, filter]);

  const stats = useMemo(() => {
    const pulse = items.find((i) => i.tool === "base-pulse");
    const alpha = items.find((i) => i.tool === "base-alpha");
    const sentiment = getMetric(pulse, /sentiment/i) ?? getMetric(alpha, /phase|sentiment/i) ?? "—";
    return {
      tvl:   getMetric(alpha, /tvl/i) ?? getMetric(pulse, /tvl/i) ?? "—",
      pulse: getMetric(pulse, /pulse|score/i) ?? "—",
      sentiment,
      sentimentTone: sentimentTone(sentiment === "—" ? null : sentiment),
    };
  }, [items]);

  // Dedup the repetitive hourly snapshots → latest item per tool (newest-first).
  const deduped = useMemo(() => {
    const seen = new Set<string>(); const out: FeedItem[] = [];
    for (const it of filtered) if (!seen.has(it.tool)) { seen.add(it.tool); out.push(it); }
    return out;
  }, [filtered]);
  const heroItem = useMemo(() => deduped.find((i) => i.tool === "base-alpha") ?? deduped[0], [deduped]);
  const rest = useMemo(() => deduped.filter((i) => i.id !== heroItem?.id), [deduped, heroItem]);
  const updatedAgo = items[0]?.timestamp ? ago(items[0].timestamp) : null;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#050508]">
      {/* Header — gradient border bottom */}
      <div className="sticky top-0 z-10 shrink-0 bg-[#050508]/95 backdrop-blur">
        <div className="flex items-center gap-4 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <img src="/logomark.svg" alt="" width={22} height={22} className="rounded-md" />
            <h1 className="text-base sm:text-lg font-bold text-white">Blue Feed</h1>
            <span className="w-2 h-2 rounded-full bg-[#34D399] live-dot" />
          </div>

          <div className="hidden md:flex items-center gap-5 ml-2">
            <Stat label="Base TVL" value={stats.tvl} animate />
            <Stat label="Pulse" value={stats.pulse} tone={GREEN} animate />
            <div>
              <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">Sentiment</div>
              <div className="font-mono text-[13px] font-semibold" style={{ color: stats.sentimentTone }}>{stats.sentiment}</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {FILTERS.map((f) => (
              <button key={f.id} onClick={() => setFilter(f.id)}
                className="font-mono text-[11px] px-2.5 py-1 rounded-full border transition-colors"
                style={filter === f.id
                  ? { color: "#FB923C", borderColor: "#FB923C55", background: "#FB923C18" }
                  : { color: "#64748b", borderColor: "#1A1A2E", background: "transparent" }}>
                {f.label}
              </button>
            ))}
            {updatedAgo && <span className="hidden sm:inline font-mono text-[10px] text-slate-600 ml-1">updated {updatedAgo}</span>}
            <button onClick={() => load()} disabled={loading}
              className="font-mono text-[11px] px-2.5 py-1 rounded-full border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#4FC3F7]/40 transition-colors disabled:opacity-40 ml-1">
              {loading ? "…" : "↻"}
            </button>
          </div>
        </div>
        <div className="h-px" style={{ background: "linear-gradient(90deg, transparent, #4FC3F740, #A78BFA40, transparent)" }} />
      </div>

      {/* body */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        {loading && items.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <SkeletonCard hero /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center text-center max-w-md mx-auto mt-16">
            <img src="/logomark.svg" alt="BlueAgent" width={56} height={56} className="rounded-2xl animate-breathe mb-5" />
            <h2 className="text-lg font-bold text-white mb-1.5">Feed runs every hour</h2>
            <p className="font-mono text-[12px] text-slate-500">
              ⭐ Aeon is collecting Base intelligence
              <span className="inline-flex gap-0.5 ml-0.5">
                <span className="animate-pulse">.</span>
                <span className="animate-pulse" style={{ animationDelay: "200ms" }}>.</span>
                <span className="animate-pulse" style={{ animationDelay: "400ms" }}>.</span>
              </span>
            </p>
            {isDev && (
              <button onClick={runNow} disabled={running}
                className="mt-6 font-mono text-[12px] px-4 py-2 rounded-xl border border-[#FB923C]/40 text-[#FB923C] hover:bg-[#FB923C]/10 transition-colors disabled:opacity-50">
                {running ? "Running…" : "Run Now →"}
              </button>
            )}
          </div>
        )}

        {deduped.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {heroItem && (
              <FeedCard item={heroItem} history={items} hero delay={0} fresh={freshIds.has(heroItem.id)}
                onShare={() => share(heroItem)} onCast={() => castToFarcaster(heroItem.shareText)} copied={copied === heroItem.id} />
            )}
            {rest.map((item, idx) => (
              <FeedCard key={item.id} item={item} history={items} delay={Math.min(idx + 1, 10) * 50}
                fresh={freshIds.has(item.id)} onShare={() => share(item)} onCast={() => castToFarcaster(item.shareText)} copied={copied === item.id} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
