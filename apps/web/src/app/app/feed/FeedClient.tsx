"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LineChart, Line, YAxis, BarChart, Bar, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { FeedItem, FeedAgent } from "@/app/api/cron/feed/route";

// ─── constants / helpers ────────────────────────────────────────────────────

const AGENT: Record<FeedAgent, { label: string; emoji: string; color: string }> = {
  blueagent: { label: "BlueAgent", emoji: "🟦", color: "#4FC3F7" },
};

const SIGNAL_COLOR: Record<string, string> = {
  STRONG_BUY: "#22C55E", BUY: "#84CC16", WATCH: "#F59E0B", SKIP: "#EF4444", NO_SIGNAL: "#64748B",
};
const PHASE_COLOR: Record<string, string> = {
  emerging: "#4FC3F7", rising: "#34D399", peak: "#F59E0B", fading: "#EF4444", mid: "#A78BFA",
};
const GREEN = "#34D399", RED = "#EF4444", AMBER = "#F59E0B", BLUE = "#4FC3F7", PURPLE = "#A78BFA";
const ITEM_TYPE: Record<string, { label: string; color: string }> = {
  signal: { label: "signal", color: GREEN  },
  info:   { label: "info",   color: BLUE   },
  watch:  { label: "watch",  color: AMBER  },
  track:  { label: "track",  color: PURPLE },
};

type Metric = { label: string; value: string };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function raw(item?: FeedItem): any { return (item?.data as { raw?: unknown })?.raw ?? {}; }
function metricsOf(item: FeedItem): Metric[] {
  const m = (item.data as { metrics?: Metric[] })?.metrics;
  return Array.isArray(m) ? m : [];
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
function sentimentTone(s: string | null): string {
  if (!s) return AMBER;
  const t = s.toLowerCase();
  if (t.includes("bull") || t.includes("risk-on")) return GREEN;
  if (t.includes("bear") || t.includes("risk-off")) return RED;
  return AMBER;
}

function tintRGBA(hex: string, a = 0.08): string {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// Download card as PNG via html-to-image (dynamically imported to avoid SSR issues).
// Elements with data-exclude="true" are hidden during capture.
async function downloadCard(el: HTMLElement, title: string) {
  try {
    const { toPng } = await import("html-to-image");
    const dataUrl = await toPng(el, {
      backgroundColor: "#050508",
      pixelRatio: 2,
      filter: (node) => !(node as HTMLElement).dataset?.exclude,
    });
    const link = document.createElement("a");
    link.download = `blueagent-${title.toLowerCase().replace(/\s+/g, "-")}.png`;
    link.href = dataUrl;
    link.click();
  } catch (e) {
    console.error("Download failed:", e);
  }
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

// Per-item share link → server route /app/feed/[id], which renders crawler-
// readable OG tags then redirects humans to the live feed (?item=<id>).
function shareLinkFor(item: FeedItem): string { return `https://app.blueagent.dev/feed/${item.id}`; }
function shareTextFor(item: FeedItem): string { return `${item.title} — ${item.summary} via @blueagent_ ${shareLinkFor(item)}`; }

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

// Dependency-free area sparkline (mirrors the Spark in BlueBank for visual parity).
function Spark({ points, color, height = 28 }: { points: number[]; color: string; height?: number }) {
  if (!points || points.length < 2)
    return <div className="font-mono text-[9px] text-slate-700 flex items-center" style={{ height }}>—</div>;
  const w = 100, h = 48; // internal coord space; svg stretches via preserveAspectRatio
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 1;
  const step = w / (points.length - 1);
  const coords = points.map((p, i) => `${(i * step).toFixed(2)},${(h - ((p - min) / range) * h).toFixed(2)}`);
  const line = "M" + coords.join(" L");
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height }}>
      <path d={area} fill={color} fillOpacity="0.12" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// Market regime (BULL / MIXED / BEAR) — derived in CODE from base-pulse's real
// sentiment + pulse + 7d TVL trend. Never LLM-chosen (deterministic per CLAUDE.md).
function deriveRegime(item?: FeedItem): { label: string; color: string; note: string } {
  const r = raw(item);
  const sent = String(r.market_sentiment ?? "").toLowerCase();
  const pulse = num(r.pulse_score);
  const ch7d = num(r.tvl_change_7d);
  let s = 0;
  if (sent.includes("bull")) s += 2; else if (sent.includes("bear")) s -= 2;
  if (pulse != null) { if (pulse >= 65) s += 1; else if (pulse <= 35) s -= 1; }
  if (ch7d != null) { if (ch7d > 3) s += 1; else if (ch7d < -3) s -= 1; }
  if (s >= 2) return { label: "BULL", color: GREEN, note: "risk-on" };
  if (s <= -2) return { label: "BEAR", color: RED, note: "risk-off" };
  return { label: "MIXED", color: AMBER, note: "balanced" };
}

// Token SIGNALS strip (DELU-style) — each row maps to a MEASURED field from the
// token-alpha handler, never an LLM estimate. Rows are skipped when data absent.
type SignalDef = { label: string; state: string; arrow: string; tone: string };
function tokenSignals(r: Record<string, unknown>): SignalDef[] {
  const out: SignalDef[] = [];
  const mo = num(r.momentum_score);
  if (mo != null) out.push(mo >= 60 ? { label: "momentum", state: "bullish", arrow: "↗", tone: GREEN }
    : mo >= 40 ? { label: "momentum", state: "neutral", arrow: "→", tone: AMBER }
    : { label: "momentum", state: "bearish", arrow: "↘", tone: RED });
  if (typeof r.whale_confirmation === "boolean")
    out.push(r.whale_confirmation ? { label: "flow", state: "inflow", arrow: "↗", tone: GREEN }
      : { label: "flow", state: "balanced", arrow: "→", tone: AMBER });
  const ch = num(r.change_24h);
  if (ch != null) out.push(ch > 1 ? { label: "structure", state: "markup", arrow: "↗", tone: GREEN }
    : ch < -1 ? { label: "structure", state: "markdown", arrow: "↘", tone: RED }
    : { label: "structure", state: "range", arrow: "→", tone: AMBER });
  const liq = num(r.liquidity_usd);
  if (liq != null) out.push(liq >= 1e6 ? { label: "liquidity", state: "deep", arrow: "✓", tone: GREEN }
    : liq >= 2.5e5 ? { label: "liquidity", state: "ok", arrow: "→", tone: AMBER }
    : { label: "liquidity", state: "thin", arrow: "⚠", tone: RED });
  return out;
}
function Signals({ rows }: { rows: SignalDef[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mb-3 rounded-lg border border-[#1A1A2E] bg-[#0a0a10] px-3 py-2">
      <div className="font-mono text-[9px] text-slate-600 uppercase tracking-widest mb-1.5">Signals</div>
      <div className="flex flex-col gap-1">
        {rows.map((s, i) => (
          <div key={i} className="flex items-center justify-between font-mono text-[11px]">
            <span className="text-slate-400">{s.label}</span>
            <span style={{ color: s.tone }}>{s.arrow} {s.state}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── per-tool card bodies ───────────────────────────────────────────────────

function BasePulseBody({ item, history, large }: { item: FeedItem; history: FeedItem[]; large?: boolean }) {
  const r = raw(item);
  const tvl = fmtUsdShort(r.tvl_usd);
  const ch24 = num(r.tvl_change_24h);
  const ch7d = num(r.tvl_change_7d);
  const dexVol = fmtUsdShort(r.dex_volume_24h);
  const sentiment = typeof r.market_sentiment === "string" ? r.market_sentiment : null;
  const pulse = num(r.pulse_score);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens: any[] = Array.isArray(r.top_tokens) ? r.top_tokens : [];
  return (
    <>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Base TVL</div>
          <div className={`font-mono font-bold text-white ${large ? "text-3xl" : "text-2xl"}`}>{tvl ?? "—"}</div>
          <div className="flex items-center gap-3 mt-0.5">
            {ch24 != null && <span className="font-mono text-[12px]" style={{ color: ch24 > 0 ? GREEN : ch24 < 0 ? RED : AMBER }}>{ch24 >= 0 ? "+" : ""}{ch24.toFixed(2)}% 24h</span>}
            {ch7d != null && <span className="font-mono text-[11px]" style={{ color: ch7d > 0 ? GREEN : ch7d < 0 ? RED : AMBER }}>{ch7d >= 0 ? "+" : ""}{ch7d.toFixed(2)}% 7d</span>}
          </div>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {dexVol && <span className="font-mono text-[10px] text-slate-500">DEX vol <span className="text-slate-300">{dexVol}</span></span>}
            {sentiment && <Badge text={sentiment} color={sentimentTone(sentiment)} />}
          </div>
        </div>
        {pulse != null && (
          <div className="flex flex-col items-center gap-1">
            <PulseRing value={pulse} size={large ? 64 : 48} />
            <span className="font-mono text-[9px] text-slate-600 uppercase">Pulse</span>
          </div>
        )}
      </div>
      {tokens.length > 0 && (
        <TokenChipRow tokens={tokens.slice(0, large ? 5 : 4)} />
      )}
    </>
  );
}

function NarrativeBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const arr = (Array.isArray(r.trending_narratives) ? r.trending_narratives : []).slice(0, 3);
  const sentiment = typeof r.market_sentiment === "string" ? r.market_sentiment : null;
  const topOpp = r.top_opportunity && typeof r.top_opportunity === "object" ? r.top_opportunity : null;
  if (arr.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  const vArrow = (v: unknown) => { const t = String(v ?? "").toLowerCase(); return t === "up" || t.includes("accel") ? "↑↑" : t === "down" || t.includes("fad") ? "↓" : "→"; };
  const ewEmoji = (w: unknown) => { const t = String(w ?? "").toLowerCase(); return t === "open" ? "🟢" : t === "closing" ? "🟡" : t === "closed" ? "🔴" : ""; };
  return (
    <div className="flex flex-col gap-2.5">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {arr.map((n: any, i: number) => {
        const phase = String(n?.phase ?? "").toLowerCase();
        const color = PHASE_COLOR[phase] ?? "#94a3b8";
        const ew = ewEmoji(n?.entry_window);
        return (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[12px] text-slate-200 truncate flex-1">{n?.name ?? "—"}</span>
              {ew && <span className="text-[11px] leading-none" title={String(n?.entry_window)}>{ew}</span>}
              {n?.phase && <Badge text={String(n.phase)} color={color} />}
              <span className="font-mono text-[13px] w-5 text-right" style={{ color }}>{vArrow(n?.velocity)}</span>
            </div>
            <div className="h-1 rounded-full" style={{ background: `linear-gradient(90deg, ${color}, ${color}22)`, width: `${100 - i * 22}%` }} />
          </div>
        );
      })}
      {topOpp && (
        <div className="rounded-lg px-2.5 py-2 mt-0.5" style={{ background: tintRGBA(GREEN, 0.08), border: `1px solid ${GREEN}40` }}>
          <div className="font-mono text-[9px] uppercase tracking-wider mb-0.5" style={{ color: GREEN }}>Top opportunity</div>
          <div className="font-mono text-[11px] text-slate-200">{String(topOpp.narrative ?? topOpp.name ?? "—")}</div>
          {topOpp.reason && <div className="text-[11px] text-slate-400 leading-snug mt-0.5">{String(topOpp.reason)}</div>}
        </div>
      )}
      {sentiment && <div className="mt-0.5"><Badge text={sentiment} color={sentimentTone(sentiment)} /></div>}
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
  const riskFlags: string[] = Array.isArray(r.risk_flags) ? r.risk_flags.filter((x: unknown) => typeof x === "string").slice(0, 3) : [];
  const thesis = typeof r.thesis === "string" ? r.thesis : "";
  const thesisShort = thesis.length > 100 ? thesis.slice(0, 100).trimEnd() + "…" : thesis;
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
      {r.horizon && (
        <div className="font-mono text-[10px] text-slate-500 mb-3">horizon <span className="text-slate-300">{String(r.horizon)}</span></div>
      )}
      <Signals rows={tokenSignals(r)} />
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
              <Tooltip contentStyle={{ background: "#0a0a10", border: "1px solid #1A1A2E", borderRadius: 8, fontFamily: "monospace", fontSize: 10 }} /* eslint-disable-next-line @typescript-eslint/no-explicit-any */ formatter={(v: any) => [`$${v}`, ""]} labelFormatter={(l) => l} cursor={{ fill: "#ffffff08" }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive>{bars.map((b, i) => <Cell key={i} fill={b.fill} />)}</Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {thesisShort && <p className="text-[12px] text-slate-400 leading-relaxed">{thesisShort}</p>}
      {riskFlags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {riskFlags.map((f, i) => (
            <span key={i} className="font-mono text-[9px] px-1.5 py-0.5 rounded-md" style={{ color: RED, background: `${RED}1a`, border: `1px solid ${RED}40` }}>{f}</span>
          ))}
        </div>
      )}
    </>
  );
}

// whale-tracker — renders the REAL top on-chain movements only. When there are
// no movements the page filters the card out entirely (this returns null too).
function WhaleBody({ item }: { item: FeedItem }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const moves: any[] = Array.isArray(raw(item).topMovements) ? raw(item).topMovements : [];
  if (moves.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {moves.slice(0, 5).map((m: any, i: number) => {
        const inbound = String(m?.direction ?? "").toUpperCase() === "IN" || /receiv/i.test(String(m?.action));
        const tone = inbound ? GREEN : RED;
        return (
          <Row key={i}>
            <span className="font-mono text-[11px] text-slate-200 flex-1 truncate">{m?.token ?? "—"}</span>
            {m?.amount != null && <span className="font-mono text-[10px] text-slate-400">{String(m.amount)}</span>}
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded uppercase tracking-wide" style={{ color: tone, background: `${tone}1a`, border: `1px solid ${tone}40` }}>
              {inbound ? "received" : "sent"}
            </span>
          </Row>
        );
      })}
    </div>
  );
}

function BaseAlphaBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  const phase = String(r.market_phase ?? "").toLowerCase();
  const phaseColor = /risk-on|bull|expansion/.test(phase) ? GREEN : /risk-off|bear|cooling/.test(phase) ? RED : AMBER;
  const icon = /risk-on|bull|expansion/.test(phase) ? "📈" : /risk-off|bear|cooling/.test(phase) ? "📉" : "➖";
  const tvl = fmtUsdShort(r.base_tvl_usd);
  const ch7d = num(r.tvl_change_7d);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const narrs: any[] = Array.isArray(r.top_narratives) ? r.top_narratives.slice(0, 3) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const picks: any[] = Array.isArray(r.momentum_picks) ? r.momentum_picks.slice(0, 2) : [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const divs: any[] = Array.isArray(r.divergence_signals) ? r.divergence_signals.slice(0, 2) : [];
  const summary = typeof r.summary === "string" && r.summary ? r.summary : item.summary;
  return (
    <>
      <div className="flex items-center gap-3 mb-2 flex-wrap">
        {r.market_phase && (
          <span className="font-mono font-bold rounded-lg uppercase tracking-wider px-3 py-1.5 text-[13px] flex items-center gap-1.5"
            style={{ color: phaseColor, background: `${phaseColor}1a`, border: `1px solid ${phaseColor}45` }}>
            <span>{icon}</span>{String(r.market_phase)}
          </span>
        )}
        {tvl && (
          <div className="ml-auto text-right">
            <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider">Base TVL</div>
            <div className="font-mono text-[14px] font-bold text-white">
              {tvl}{ch7d != null && <span className="ml-1 text-[11px]" style={{ color: ch7d >= 0 ? GREEN : RED }}>{ch7d >= 0 ? "+" : ""}{ch7d.toFixed(1)}% 7d</span>}
            </div>
          </div>
        )}
      </div>
      {narrs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {narrs.map((n: any, i: number) => <Chip key={i}>{n?.name ?? "—"}</Chip>)}
        </div>
      )}
      {picks.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {picks.map((p: any, i: number) => { const sc = num(p?.score); return (
            <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded-md" style={{ color: GREEN, background: `${GREEN}14`, border: `1px solid ${GREEN}40` }}>
              {p?.symbol ?? "—"}{sc != null ? ` ${sc}` : ""}{p?.signal_type ? ` · ${p.signal_type}` : ""}
            </span>
          ); })}
        </div>
      )}
      {divs.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {divs.map((d: any, i: number) => (
            <span key={i} className="font-mono text-[10px] px-2 py-0.5 rounded-md" style={{ color: PURPLE, background: `${PURPLE}14`, border: `1px solid ${PURPLE}40` }}>⚡ {d?.symbol ?? "—"}</span>
          ))}
        </div>
      )}
      <p className="text-[13px] text-slate-400 leading-relaxed">{summary}</p>
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
          <TokenChipRow tokens={movers.map((m: any) => ({ symbol: m?.token ?? m?.symbol ?? "—", change24h: m?.change_24h ?? m?.change ?? m?.priceChange }))} />
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

// H3 — Interactive token sparkline: linear trend from 0→change24h with noise + explicit YAxis domain
function InlineTokenSpark({ change24h }: { change24h: number | null }) {
  if (change24h == null) return <div className="h-10 flex items-center font-mono text-[10px] text-slate-700">No data</div>;
  const color = change24h >= 0 ? GREEN : RED;
  // Linear trend from 0 to change24h so the slope is always clearly visible
  const data = Array.from({ length: 14 }, (_, i) => {
    const t = i / 13;
    const trend = change24h * t;
    const noise = Math.abs(change24h) * 0.1 * Math.sin(i * 1.8 + change24h * 0.25);
    return { i, v: trend + noise };
  });
  return (
    <div style={{ height: 52 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
          <YAxis domain={["auto", "auto"]} hide />
          <Tooltip
            contentStyle={{ background: "#0a0a10", border: `1px solid ${color}30`, borderRadius: 6, fontFamily: "monospace", fontSize: 9, padding: "3px 8px" }}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            formatter={(_v: any) => [`${change24h >= 0 ? "+" : ""}${change24h.toFixed(2)}% 24h`, ""]}
            labelFormatter={() => ""}
            cursor={{ stroke: color, strokeWidth: 1, strokeDasharray: "3 2" }}
            isAnimationActive={false}
          />
          <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive animationDuration={500} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// C3 — Token chip row: first chip auto-selected; click switches chart
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function TokenChipRow({ tokens }: { tokens: any[] }) {
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const active = tokens[activeIdx] ?? null;
  const activeSym = active?.symbol ?? "—";
  const activeCh = active ? num(active.change24h) : null;
  return (
    <div className="mt-3" onClick={e => e.stopPropagation()}>
      <div className="flex flex-wrap gap-1.5">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {tokens.map((t: any, i: number) => {
          const sym = t?.symbol ?? "—";
          const ch = num(t?.change24h);
          const isActive = activeIdx === i;
          return (
            <button key={i} onClick={() => setActiveIdx(i)}
              className="font-mono text-[10px] px-2 py-0.5 rounded-md border transition-all"
              style={isActive
                ? { borderColor: "#4FC3F740", background: "#4FC3F710", color: "#4FC3F7" }
                : { borderColor: "#1A1A2E", background: "#0a0a10", color: "#cbd5e1" }}>
              <span>{sym}</span>
              {ch != null && <span className="ml-1" style={{ color: ch >= 0 ? GREEN : RED }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</span>}
            </button>
          );
        })}
      </div>
      {/* Inline chart — expands below chips, no popup */}
      {active && (
        <div className="mt-2 rounded-lg border border-[#1A1A2E] bg-[#0a0a10] px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[11px] font-bold text-white">{activeSym}</span>
            {activeCh != null && (
              <span className="font-mono text-[11px] font-bold" style={{ color: activeCh >= 0 ? GREEN : RED }}>
                {activeCh >= 0 ? "+" : ""}{activeCh.toFixed(2)}% 24h
              </span>
            )}
          </div>
          <InlineTokenSpark change24h={activeCh} />
          <a href={`https://dexscreener.com/base?q=${encodeURIComponent(activeSym)}`} target="_blank" rel="noopener noreferrer"
            className="mt-1 block text-right font-mono text-[9px] text-slate-700 hover:text-[#4FC3F7] transition-colors">
            DexScreener ↗
          </a>
        </div>
      )}
    </div>
  );
}

// C2 — BlueStream horizontal bar chart (trending tokens by 24h change%)
function BlueStreamBody({ item }: { item: FeedItem }) {
  const r = raw(item);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trending = (Array.isArray(r.trending) ? r.trending : []).slice(0, 6) as any[];
  const newp = Array.isArray(r.new_pools) ? r.new_pools : [];
  const changes = trending.map((t) => num(t?.change_24h ?? t?.change ?? t?.priceChange)).filter((c): c is number => c !== null);
  const maxAbs = changes.length > 0 ? Math.max(...changes.map(Math.abs), 1) : 1;

  if (trending.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  return (
    <>
      <div className="flex gap-5 mb-3">
        <Stat label="Trending" value={`${trending.length}`} />
        <Stat label="New pools" value={`${newp.length}`} />
      </div>
      <div className="flex flex-col gap-1.5">
        {trending.map((t, i) => {
          const ch = num(t?.change_24h ?? t?.change ?? t?.priceChange);
          const sym = t?.token ?? t?.symbol ?? t?.baseSymbol ?? "—";
          const color = ch == null ? "#64748b" : ch >= 0 ? GREEN : RED;
          const pct = ch == null ? 0 : (Math.abs(ch) / maxAbs) * 100;
          return (
            <div key={i} className="flex items-center gap-2">
              <span className="font-mono text-[10px] text-slate-300 w-16 shrink-0 truncate">{sym}</span>
              <div className="flex-1 h-1.5 rounded-full bg-[#1A1A2E] overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(pct, 4)}%`, background: color, opacity: 0.8 }} />
              </div>
              {ch != null && <span className="font-mono text-[10px] w-14 text-right shrink-0" style={{ color }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</span>}
            </div>
          );
        })}
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
// ── Blue Feed v2 card bodies ──────────────────────────────────────────────────

function BaseTokenScanBody({ item }: { item: FeedItem }) {
  const signals: any[] = Array.isArray(raw(item).signals) ? raw(item).signals : [];
  if (signals.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {signals.map((s: any, i: number) => {
        const ch = num(s?.change_24h);
        const liq = fmtUsdShort(s?.liquidity_usd);
        const vol = fmtUsdShort(s?.volume_24h);
        const chColor = ch != null && ch >= 0 ? GREEN : RED;
        return (
          <Row key={i}>
            <span className="font-mono text-[12px] font-bold text-white w-16 shrink-0">{s?.symbol ?? "—"}</span>
            {ch != null && <span className="font-mono text-[12px] font-semibold" style={{ color: chColor }}>{ch >= 0 ? "+" : ""}{ch.toFixed(1)}%</span>}
            <span className="flex-1" />
            {vol && <span className="font-mono text-[9px] text-slate-600">vol {vol}</span>}
            {liq && <span className="font-mono text-[9px] text-slate-600">liq {liq}</span>}
          </Row>
        );
      })}
      <div className="font-mono text-[9px] text-slate-700 mt-1">5 filters · GeckoTerminal</div>
    </div>
  );
}

function DefiYieldScanBody({ item }: { item: FeedItem }) {
  const opps: any[] = Array.isArray(raw(item).opportunities) ? raw(item).opportunities : [];
  if (opps.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {opps.map((o: any, i: number) => {
        const apy = num(o?.apy);
        const tvl = fmtUsdShort(o?.tvl_usd);
        return (
          <Row key={i}>
            <span className="font-mono text-[11px] text-slate-200 flex-1 truncate">{o?.protocol ?? "—"}</span>
            {o?.symbol && <span className="font-mono text-[9px] text-slate-600 truncate max-w-[80px]">{o.symbol}</span>}
            {apy != null && <span className="font-mono text-[12px] font-semibold" style={{ color: GREEN }}>{apy.toFixed(2)}%</span>}
            {tvl && <span className="font-mono text-[9px] text-slate-600">{tvl}</span>}
            {o?.stablecoin && <span className="font-mono text-[9px]" style={{ color: BLUE }}>stable</span>}
          </Row>
        );
      })}
      <div className="font-mono text-[9px] text-slate-700 mt-1">APY ≥4% · TVL ≥$500K · deduped · DefiLlama</div>
    </div>
  );
}

function NarrativeScanBody({ item }: { item: FeedItem }) {
  const all: any[] = Array.isArray(raw(item).narratives) ? raw(item).narratives : [];
  const active = all.filter((n: any) => n?.phase !== "Fading");
  const fading = all.filter((n: any) => n?.phase === "Fading");
  if (all.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  return (
    <div className="flex flex-col gap-2">
      {active.map((n: any, i: number) => {
        const phase = String(n?.phase ?? "").toLowerCase();
        const color = PHASE_COLOR[phase] ?? AMBER;
        const tokens: string[] = Array.isArray(n?.tokens) ? n.tokens.slice(0, 3) : [];
        return (
          <div key={i}>
            <div className="flex items-center gap-2 mb-1">
              <span className="font-mono text-[12px] text-slate-200 truncate flex-1">{n?.name ?? "—"}</span>
              {n?.phase && <Badge text={String(n.phase)} color={color} />}
            </div>
            {tokens.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {tokens.map((t: string, j: number) => <Chip key={j}>{t}</Chip>)}
              </div>
            )}
          </div>
        );
      })}
      {fading.length > 0 && (
        <div className="pt-1.5 border-t border-[#1A1A2E]">
          <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-1.5">Fading</div>
          <div className="flex flex-wrap gap-1.5">
            {fading.map((n: any, i: number) => (
              <span key={i} className="font-mono text-[10px] px-1.5 py-0.5 rounded-md" style={{ color: RED, background: `${RED}1a`, border: `1px solid ${RED}40` }}>{n?.name ?? "—"}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PicksCheckBody({ item }: { item: FeedItem }) {
  const r = raw(item) as any;
  const tr = r?.track_record as any;
  const winRate = num(tr?.win_rate);
  const recent: any[] = Array.isArray(r?.recent_picks) ? r.recent_picks.slice(0, 3) : [];
  if (!tr && recent.length === 0) return <p className="text-[13px] text-slate-400">{item.summary}</p>;
  return (
    <>
      {tr && winRate != null && (
        <div className="mb-3">
          <div className="flex justify-between font-mono text-[9px] text-slate-600 uppercase mb-1">
            <span>Filter accuracy</span>
            <span style={{ color: winRate >= 60 ? GREEN : winRate >= 40 ? AMBER : RED }}>{winRate}%</span>
          </div>
          <Bar01 value={winRate} color={winRate >= 60 ? GREEN : winRate >= 40 ? AMBER : RED} />
          <div className="flex gap-4 mt-2 flex-wrap">
            {tr.wins  != null && <Stat label="Wins"    value={`${tr.wins}`}   tone={GREEN} />}
            {tr.losses != null && <Stat label="Losses"  value={`${tr.losses}`} tone={RED}   />}
            {tr.neutral != null && tr.neutral > 0 && <Stat label="Neutral" value={`${tr.neutral}`} tone={AMBER} />}
            {tr.total  != null && <Stat label="Signals" value={`${tr.total}`} />}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="font-mono text-[9px] text-slate-600 uppercase tracking-wider mb-0.5">Recent checks</div>
          {recent.map((p: any, i: number) => {
            const tone = p?.outcome === "WIN" ? GREEN : p?.outcome === "LOSS" ? RED : AMBER;
            return (
              <Row key={i}>
                <span className="font-mono text-[11px] text-slate-200 flex-1">{p?.symbol ?? "—"}</span>
                {p?.outcome_pct != null && <span className="font-mono text-[11px]" style={{ color: tone }}>{p.outcome_pct > 0 ? "+" : ""}{p.outcome_pct.toFixed(1)}%</span>}
                {p?.outcome && <Badge text={p.outcome} color={tone} />}
              </Row>
            );
          })}
        </div>
      )}
      <div className="font-mono text-[9px] text-slate-700 mt-2">22h accuracy · filter correctness only · not financial advice</div>
    </>
  );
}

/* eslint-enable @typescript-eslint/no-explicit-any */

function CardBody({ item, history }: { item: FeedItem; history: FeedItem[] }) {
  switch (item.tool) {
    case "base-pulse":      return <BasePulseBody item={item} history={history} />;
    case "narrative-pulse": return <NarrativeBody item={item} />;
    case "token-alpha":     return <TokenAlphaBody item={item} />;
    case "whale-tracker":   return <WhaleBody item={item} />;
    case "base-alpha":      return <BaseAlphaBody item={item} />;
    case "ecosystem-digest": return <EcosystemDigestBody item={item} />;
    case "new-pools":        return <NewPoolsBody item={item} />;
    case "blue-stream":      return <BlueStreamBody item={item} />;
    case "token-momentum-scanner": return <MomentumBody item={item} />;
    case "narrative-position":     return <NarrativePositionBody item={item} />;
    case "defi-opportunity":       return <DefiOpportunityBody item={item} />;
    case "base-token-scan":        return <BaseTokenScanBody item={item} />;
    case "defi-yield-scan":        return <DefiYieldScanBody item={item} />;
    case "narrative-scan":         return <NarrativeScanBody item={item} />;
    case "picks-check":            return <PicksCheckBody item={item} />;
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

// C4 — Large body for full-screen expand modal
function CardBodyLarge({ item, history }: { item: FeedItem; history: FeedItem[] }) {
  switch (item.tool) {
    case "base-pulse":      return <BasePulseBody item={item} history={history} large />;
    case "token-alpha":     return <TokenAlphaBody item={item} large />;
    case "narrative-pulse": return <NarrativeBody item={item} />;
    case "whale-tracker":   return <WhaleBody item={item} />;
    case "base-alpha":      return <BaseAlphaBody item={item} />;
    case "ecosystem-digest": return <EcosystemDigestBody item={item} />;
    case "new-pools":        return <NewPoolsBody item={item} />;
    case "blue-stream":      return <BlueStreamBody item={item} />;
    case "token-momentum-scanner": return <MomentumBody item={item} />;
    case "narrative-position":     return <NarrativePositionBody item={item} />;
    case "defi-opportunity":       return <DefiOpportunityBody item={item} />;
    case "base-token-scan":        return <BaseTokenScanBody item={item} />;
    case "defi-yield-scan":        return <DefiYieldScanBody item={item} />;
    case "narrative-scan":         return <NarrativeScanBody item={item} />;
    case "picks-check":            return <PicksCheckBody item={item} />;
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

function FeedCard({ item, history, fresh, delay, onShare, onCast, copied, highlighted }: {
  item: FeedItem; history: FeedItem[]; fresh?: boolean; delay: number;
  onShare: () => void; onCast: () => void; copied: boolean; highlighted?: boolean;
}) {
  const badge = AGENT.blueagent;
  const [expanded, setExpanded] = useState(false);
  const [mlinkCopied, setMlinkCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  return (
    <>
      <div
        ref={cardRef}
        id={item.id}
        className={`rounded-2xl border bg-[#0a0a0f] flex flex-col break-inside-avoid mb-4 feed-in feed-card ${fresh ? "feed-flash" : ""} p-5 ${highlighted ? "border-[#4FC3F7]/60 ring-2 ring-[#4FC3F7]/25" : "border-[#1A1A2E]"}`}
        style={{ animationDelay: `${delay}ms` }}
        onClick={() => setExpanded(true)}
      >
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="font-mono text-[10px] px-2 py-0.5 rounded-full border"
            style={{ color: badge.color, borderColor: `${badge.color}40`, background: `${badge.color}12` }}>
            {badge.emoji} {badge.label}
          </span>
          {item.itemType && ITEM_TYPE[item.itemType] && (
            <span className="font-mono text-[9px] px-1.5 py-0.5 rounded tracking-wider"
              style={{ color: ITEM_TYPE[item.itemType].color, background: `${ITEM_TYPE[item.itemType].color}1a`, border: `1px solid ${ITEM_TYPE[item.itemType].color}40` }}>
              [{ITEM_TYPE[item.itemType].label}]
            </span>
          )}
          <span className="font-mono text-[10px] text-slate-500 tracking-widest uppercase">{item.tool}</span>
          <span className="font-mono text-[10px] text-slate-700">· {ago(item.timestamp)}</span>
          {fresh && (
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[9px] text-[#34D399] uppercase tracking-widest">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] live-dot" /> New
            </span>
          )}
        </div>

        <h3 className="font-bold text-white mb-3 text-base">{item.title}</h3>

        <div>
          <CardBody item={item} history={history} />
        </div>

        <div className="flex gap-2 mt-4">
          <div className="relative">
            <button onClick={e => { e.stopPropagation(); onShare(); }}
              className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#4FC3F7]/50 transition-colors">
              Share ↗
            </button>
            {copied && (
              <span className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[10px] px-2 py-1 rounded-md bg-[#34D399] text-[#031b12] feed-in">Link copied!</span>
            )}
          </div>
          <button onClick={e => { e.stopPropagation(); onCast(); }}
            className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10 transition-colors">
            Cast 🟣
          </button>
          <button
            data-exclude="true"
            onClick={e => { e.stopPropagation(); cardRef.current && downloadCard(cardRef.current, item.title); }}
            className="ml-auto font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#1A1A2E] text-slate-400 hover:text-white hover:border-[#4FC3F7]/30 transition-colors"
            title="Download as image">
            ⬇
          </button>
        </div>
      </div>

      {/* H2 full-screen expand modal — larger, sticky footer with share */}
      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(5,5,8,0.92)" }}
          onClick={() => setExpanded(false)}>
          <div className="w-[92vw] max-w-5xl max-h-[85vh] rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] flex flex-col"
            onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4 shrink-0">
              <div>
                <span className="font-mono text-[9px] px-2 py-0.5 rounded-full border inline-block mb-2"
                  style={{ color: badge.color, borderColor: `${badge.color}40`, background: `${badge.color}12` }}>
                  {badge.emoji} {badge.label} · {item.tool}
                </span>
                <h3 className="font-bold text-white text-lg leading-snug">{item.title}</h3>
              </div>
              <button onClick={() => setExpanded(false)}
                className="shrink-0 font-mono text-[13px] text-slate-600 hover:text-white transition-colors mt-1">✕</button>
            </div>
            {/* Scrollable body */}
            <div className="flex-1 overflow-y-auto px-6 pb-4">
              <CardBodyLarge item={item} history={history} />
            </div>
            {/* Footer — share + cast */}
            <div className="shrink-0 px-6 py-4 border-t border-[#1A1A2E] flex items-center gap-2">
              <button onClick={() => {
                const url = shareLinkFor(item);
                try { navigator.clipboard.writeText(url).then(() => { setMlinkCopied(true); setTimeout(() => setMlinkCopied(false), 1800); }).catch(() => {}); }
                catch { const ta = document.createElement("textarea"); ta.value = url; ta.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(ta); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); setMlinkCopied(true); setTimeout(() => setMlinkCopied(false), 1800); }
              }}
                className="font-mono text-[11px] px-3 py-1.5 rounded-lg border transition-colors"
                style={mlinkCopied ? { borderColor: "#34D39950", color: "#34D399", background: "#34D39912" } : { borderColor: "#1A1A2E", color: "#94a3b8" }}>
                {mlinkCopied ? "✓ Copied!" : "Share link ↗"}
              </button>
              <button onClick={() => castToFarcaster(shareTextFor(item))}
                className="font-mono text-[11px] px-3 py-1.5 rounded-lg border border-[#A78BFA]/30 text-[#A78BFA] hover:bg-[#A78BFA]/10 transition-colors">
                Cast 🟣
              </button>
              <span className="ml-auto font-mono text-[10px] text-slate-700">{ago(item.timestamp)}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── page ───────────────────────────────────────────────────────────────────

const FILTERS: { id: "all"; label: string; emoji: string }[] = [
  { id: "all", label: "All", emoji: "◎" },
];

function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] feed-shimmer p-5">
      <div className="h-4 w-40 bg-[#1A1A2E] rounded mb-3" />
      <div className="h-6 w-3/4 bg-[#15151f] rounded mb-3" />
      <div className="h-3 w-full bg-[#13131d] rounded mb-1.5" />
      <div className="h-3 w-2/3 bg-[#13131d] rounded" />
    </div>
  );
}

export default function FeedClient() {
  const [items, setItems]   = useState<FeedItem[]>([]);
  const [loading, setLoad]  = useState(true);
  const [running, setRun]   = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all">("all");
  const [freshIds, setFresh] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const prevTop = useRef<string | null>(null);
  const isDev = process.env.NODE_ENV !== "production";

  // Read ?item= from URL to scroll-to / highlight that card
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    setHighlightId(p.get("item"));
  }, []);

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

  // Scroll to ?item= card once items have loaded
  useEffect(() => {
    if (!highlightId || items.length === 0) return;
    const timer = setTimeout(() => {
      document.getElementById(highlightId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => clearTimeout(timer);
  }, [highlightId, items]);

  const runNow = useCallback(async () => {
    setRun(true);
    try { await fetch("/api/cron/feed", { method: "POST" }); await load(); }
    finally { setRun(false); }
  }, [load]);

  const share = useCallback((item: FeedItem) => {
    try {
      navigator.clipboard?.writeText(shareTextFor(item));
      setCopied(item.id);
      setTimeout(() => setCopied((c) => (c === item.id ? null : c)), 1600);
    } catch { /* blocked */ }
  }, []);

  const filtered = useMemo(() => {
    // whale-tracker with no real on-chain movements → hide (no fabricated card).
    return items.filter((i) => {
      if (i.tool !== "whale-tracker") return true;
      const mv = raw(i).topMovements;
      return Array.isArray(mv) && mv.length > 0;
    });
  }, [items, filter]);

  // Dedup the repetitive hourly snapshots → latest item per tool (newest-first).
  const deduped = useMemo(() => {
    const seen = new Set<string>(); const out: FeedItem[] = [];
    for (const it of filtered) if (!seen.has(it.tool)) { seen.add(it.tool); out.push(it); }
    return out;
  }, [filtered]);
  // base-alpha first (richest market read), then the rest — all uniform cards.
  const ordered = useMemo(() => {
    const ba = deduped.filter((i) => i.tool === "base-alpha");
    const others = deduped.filter((i) => i.tool !== "base-alpha");
    return [...ba, ...others];
  }, [deduped]);

  // Sidebar market read — from base-pulse's REAL raw fields (code, not LLM).
  const bpItem = useMemo(() => items.find((i) => i.tool === "base-pulse"), [items]);
  const market = useMemo(() => {
    const r = raw(bpItem);
    return {
      tvl: fmtUsdShort(r.tvl_usd),
      ch7d: num(r.tvl_change_7d),
      sentiment: typeof r.market_sentiment === "string" ? r.market_sentiment : null,
      pulse: num(r.pulse_score),
    };
  }, [bpItem]);
  const tvlSeries = useMemo(
    () => items.filter((i) => i.tool === "base-pulse").slice(0, 14).reverse()
      .map((i) => num(raw(i).tvl_usd)).filter((v): v is number => v != null),
    [items],
  );
  const regime = useMemo(() => deriveRegime(bpItem), [bpItem]);
  const updatedAgo = items[0]?.timestamp ? ago(items[0].timestamp) : null;

  return (
    <div className="flex h-full w-full bg-[#050508] text-slate-200">

      {/* ── Secondary sidebar — shared /app format (matches Chat / Hub) ────── */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 h-full border-r border-[#1A1A2E] bg-[#050508] overflow-y-auto">
        <div className="px-5 h-14 flex items-center border-b border-[#1A1A2E] shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4FC3F7] animate-pulse shrink-0 mr-2" />
          <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// BLUE FEED</p>
        </div>

        {/* MARKET widget — Base TVL + sparkline (mirrors BlueBank's EARNING card) */}
        <div className="m-3 rounded-xl border border-[#1A1A2E] bg-gradient-to-b from-[#0d1117] to-[#0a0a0f] p-3.5">
          <div className="font-mono text-[9px] text-slate-500 tracking-wide">BASE TVL</div>
          <div className="font-mono text-[20px] font-bold text-white mt-0.5">{market.tvl ?? "—"}</div>
          <div className="font-mono text-[9px] mt-0.5 mb-2 flex items-center gap-2">
            {market.ch7d != null && <span style={{ color: market.ch7d >= 0 ? GREEN : RED }}>{market.ch7d >= 0 ? "+" : ""}{market.ch7d.toFixed(1)}% 7d</span>}
            {market.sentiment && <span style={{ color: sentimentTone(market.sentiment) }}>{market.sentiment}</span>}
          </div>
          <Spark points={tvlSeries} color={market.ch7d != null && market.ch7d < 0 ? RED : GREEN} height={28} />
          <div className="font-mono text-[8px] text-slate-700 mt-1">Base TVL · recent cycles</div>
        </div>

        {/* Pulse + Regime */}
        <div className="px-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3 flex flex-col items-center justify-center">
            {market.pulse != null ? <PulseRing value={market.pulse} size={46} /> : <div className="font-mono text-[18px] text-slate-700">—</div>}
            <div className="font-mono text-[8px] text-slate-600 uppercase mt-1.5">Pulse</div>
          </div>
          <div className="rounded-xl border border-[#1A1A2E] bg-[#0a0a0f] p-3 flex flex-col items-center justify-center">
            <div className="font-mono text-[16px] font-bold" style={{ color: regime.color }}>{regime.label}</div>
            <div className="font-mono text-[8px] text-slate-600 uppercase mt-1.5">{regime.note}</div>
          </div>
        </div>

        {/* Agent badge */}
        <div className="px-3 pt-4">
          <div className="font-mono text-[9px] text-slate-600 tracking-widest uppercase mb-1.5">Agent</div>
          <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-mono text-[11px]"
            style={{ color: "#4FC3F7", background: "#4FC3F712", border: "1px solid #4FC3F730" }}>
            <span className="text-[12px] leading-none">🟦</span>BlueAgent
          </div>
        </div>

        <div className="flex-1" />

        {/* Footer — updated / (dev) run */}
        <div className="px-4 py-3 border-t border-[#1A1A2E]">
          <div className="font-mono text-[9px] text-slate-600">{updatedAgo ? `updated ${updatedAgo}` : "—"}</div>
          {isDev && (
            <button onClick={runNow} disabled={running}
              className="w-full mt-2 font-mono text-[11px] py-1.5 rounded-lg border border-[#FB923C]/40 text-[#FB923C] hover:bg-[#FB923C]/10 transition-colors disabled:opacity-50">
              {running ? "Running…" : "Run Now →"}
            </button>
          )}
          <div className="font-mono text-[8px] text-slate-700 mt-2">Powered by Bankr</div>
        </div>
      </aside>

      {/* ── Content ───────────────────────────────────────────────────────── */}
      <main className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Standard /app page header — // TITLE format (matches Chat / Hub) */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-14 border-b border-[#1A1A2E] shrink-0">
          <div className="min-w-0">
            <p className="font-mono text-xs text-[#4FC3F7] tracking-widest">// LIVE INTELLIGENCE</p>
            <p className="font-mono text-[10px] text-slate-700 mt-1 truncate">Base ecosystem · updates hourly</p>
          </div>
          <button onClick={() => load()} disabled={loading}
            className="font-mono text-[12px] font-bold px-4 py-2 rounded-lg transition-all shrink-0 hover:opacity-90 disabled:opacity-50"
            style={{ background: "#4FC3F715", color: "#4FC3F7", border: "1px solid #4FC3F740" }}>
            {loading ? "Refreshing…" : "Refresh ↻"}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-6">
        {/* Mobile agent badge */}
        <div className="lg:hidden flex items-center gap-1.5 mb-4">
          <span className="font-mono text-[11px] px-2.5 py-1 rounded-full border shrink-0"
            style={{ color: "#4FC3F7", borderColor: "#4FC3F755", background: "#4FC3F718" }}>
            🟦 BlueAgent
          </span>
        </div>

        {/* C5 Beryl banner — shows until June 30 2026 */}
        {Date.now() < new Date("2026-06-30T00:00:00Z").getTime() && (
          <div className="mb-4 rounded-xl border border-[#4FC3F730] bg-[#4FC3F708] px-4 py-3 flex items-center gap-3">
            <span className="text-[16px] shrink-0">⚡</span>
            <div className="flex-1 min-w-0">
              <p className="font-mono text-[11px] font-bold text-[#4FC3F7]">Beryl upgrade live on Base · June 25, 2026</p>
              <p className="font-mono text-[10px] text-slate-500 mt-0.5">B20 native token standard · 5-day withdrawal finalization · Reth V2 node</p>
            </div>
            <a href="https://docs.base.org/base-chain/specs/upgrades/beryl/overview" target="_blank" rel="noopener noreferrer"
              className="font-mono text-[10px] text-[#4FC3F7] hover:underline shrink-0 whitespace-nowrap">Docs →</a>
          </div>
        )}

        {loading && items.length === 0 && (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
            <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
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

        {ordered.length > 0 && (
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-4">
            {ordered.map((item, idx) => (
              <FeedCard key={item.id} item={item} history={items} delay={Math.min(idx, 10) * 50}
                fresh={freshIds.has(item.id)} onShare={() => share(item)} onCast={() => castToFarcaster(shareTextFor(item))} copied={copied === item.id} highlighted={highlightId === item.id} />
            ))}
          </div>
        )}
        </div>
      </main>
    </div>
  );
}
