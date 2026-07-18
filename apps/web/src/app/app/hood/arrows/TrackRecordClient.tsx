"use client";

/**
 * /hood/arrows client — track record.
 *
 * Live-refresh feed of every engine arrow, filtered/sorted client-side.
 * Data source reused from the drift-board feed (`/api/hood/arrows`) so
 * the origin/test filter that already gates the public track record
 * stays the single source of truth — no separate query.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { Arrow } from "@/lib/blue-hood/types";
import ArrowBriefBlock from "../ArrowBriefBlock";

const REFRESH_MS = 15_000;
const PAGE_SIZE = 50;
const RH_GREEN = "#00C805";
const BLUE = "#4FC3F7";
const RED = "#ef4444";
const GREEN = "#22c55e";
const AMBER = "#f5b342";
const MUTED = "#6b7280";
const BG = "#050508";
const SURFACE = "#0B0D13";
const BORDER = "#1A1A2E";

type OutcomeFilter = "all" | "hit" | "miss" | "open";
type TypeFilter = "all" | "arb" | "drift" | "flow";
type SortKey = "newest" | "oldest" | "duration";

interface ArrowsRes {
  ok: boolean;
  arrows: Arrow[];
  arrows_today: number;
  hit_rate:
    | { ready: true; pct: number; sample: number }
    | { ready: false; sample: number; needed: number };
  test_arrows_hidden?: number;
}

export default function TrackRecordClient() {
  const [data, setData] = useState<ArrowsRes | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [ttype, setTtype] = useState<TypeFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const r = await fetch("/api/hood/arrows?limit=200", { cache: "no-store", signal });
      const body = (await r.json()) as ArrowsRes;
      if (body.ok) {
        setData(body);
        setErr(null);
      } else {
        setErr("feed unavailable");
      }
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

  const filtered = useMemo<Arrow[]>(() => {
    if (!data) return [];
    let list = data.arrows;
    if (outcome === "hit") list = list.filter((a) => a.outcome === "hit");
    else if (outcome === "miss") list = list.filter((a) => a.outcome === "miss");
    else if (outcome === "open") list = list.filter((a) => a.status === "open");
    if (ttype !== "all") list = list.filter((a) => a.type === ttype);
    return [...list].sort((a, b) => {
      if (sort === "newest") return new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime();
      if (sort === "oldest") return new Date(a.fired_at).getTime() - new Date(b.fired_at).getTime();
      // duration — how long between fire and grade; open arrows sort last
      const durA = a.graded_at ? new Date(a.graded_at).getTime() - new Date(a.fired_at).getTime() : Infinity;
      const durB = b.graded_at ? new Date(b.graded_at).getTime() - new Date(b.fired_at).getTime() : Infinity;
      return durB - durA;
    });
  }, [data, outcome, ttype, sort]);

  useEffect(() => { setPage(1); }, [outcome, ttype, sort]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const canPage = filtered.length > paged.length;

  // Bucket counts for filter pills.
  const buckets = useMemo(() => {
    if (!data) return { all: 0, hit: 0, miss: 0, open: 0, arb: 0, drift: 0, flow: 0 };
    return {
      all: data.arrows.length,
      hit: data.arrows.filter((a) => a.outcome === "hit").length,
      miss: data.arrows.filter((a) => a.outcome === "miss").length,
      open: data.arrows.filter((a) => a.status === "open").length,
      arb: data.arrows.filter((a) => a.type === "arb").length,
      drift: data.arrows.filter((a) => a.type === "drift").length,
      flow: data.arrows.filter((a) => a.type === "flow").length,
    };
  }, [data]);

  return (
    <div className="h-full overflow-y-auto" style={{ backgroundColor: BG }}>
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-8">
        <TrackHeader />
        <MetricStrip data={data} filtered={filtered} />

        <SectionHeader label="// HOOD · TRACK RECORD" />

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <FilterPills
            label="outcome"
            value={outcome}
            onChange={setOutcome}
            opts={[
              { key: "all", label: "All", count: buckets.all },
              { key: "hit", label: "Hit", count: buckets.hit },
              { key: "miss", label: "Miss", count: buckets.miss },
              { key: "open", label: "Open", count: buckets.open },
            ]}
          />
          <FilterPills
            label="type"
            value={ttype}
            onChange={setTtype}
            opts={[
              { key: "all", label: "All", count: buckets.all },
              { key: "arb", label: "Arb", count: buckets.arb },
              { key: "drift", label: "Drift", count: buckets.drift },
              { key: "flow", label: "Flow", count: buckets.flow },
            ]}
          />
          <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
            <button
              onClick={() => setRulesOpen(true)}
              className="rounded border px-2 py-1 hover:text-white"
              style={{ borderColor: BORDER }}
            >
              Grading rules
            </button>
            <span>sort</span>
            <SortToggle value={sort} onChange={setSort} />
          </div>
        </div>

        {err && (
          <div
            role="alert"
            className="mb-6 rounded border px-3 py-2 text-sm"
            style={{ borderColor: "#3b2a15", backgroundColor: "#1a1408", color: "#f6c88f" }}
          >
            {err}
          </div>
        )}

        {!data ? (
          <div className="rounded border py-8 text-center text-sm" style={{ borderColor: BORDER, color: MUTED }}>
            Loading feed…
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState allZero={data.arrows.length === 0} />
        ) : (
          <>
            <ArrowTable arrows={paged} />
            {canPage && (
              <div className="mt-4 text-center">
                <button
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded border px-4 py-1.5 text-xs font-mono"
                  style={{ borderColor: BORDER, color: "#9aa1ac" }}
                >
                  load {Math.min(PAGE_SIZE, filtered.length - paged.length)} more
                </button>
              </div>
            )}
          </>
        )}

        <Footer />
      </div>

      {rulesOpen && <GradingRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
function TrackHeader() {
  return (
    <header className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <div className="flex items-baseline gap-3">
        <div className="text-2xl font-bold tracking-tight" style={{ color: RH_GREEN }}>
          Track record
        </div>
        <div className="text-sm" style={{ color: "#9aa1ac" }}>
          every graded arrow, forever
        </div>
      </div>
      <Link
        href="/hood"
        className="ml-auto font-mono text-xs hover:text-white"
        style={{ color: MUTED }}
      >
        ← Live board
      </Link>
    </header>
  );
}

function MetricStrip({ data, filtered }: { data: ArrowsRes | null; filtered: Arrow[] }) {
  const graded = data?.arrows.filter((a) => a.status === "graded") ?? [];
  const durations = graded
    .filter((a) => a.graded_at)
    .map((a) => new Date(a.graded_at!).getTime() - new Date(a.fired_at).getTime());
  const avgDurationMs = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;

  const hitRate = data
    ? data.hit_rate.ready
      ? `${data.hit_rate.pct}%`
      : "n/a"
    : "…";
  const hitSub = data
    ? data.hit_rate.ready
      ? `${data.hit_rate.sample} graded · 7d`
      : `warming up · ${data.hit_rate.sample}/${data.hit_rate.needed}`
    : undefined;

  // Best / worst — only shown when ≥ 10 graded (spec's threshold).
  const showBestWorst = graded.length >= 10;

  const items: { label: string; value: string; sub?: string }[] = [
    { label: "HIT RATE 7D", value: hitRate, sub: hitSub },
    { label: "TOTAL GRADED", value: String(graded.length), sub: `${filtered.length} match filter` },
    {
      label: "AVG DURATION",
      value: durations.length ? formatDuration(avgDurationMs) : "—",
      sub: durations.length ? "fire → grade" : "no graded arrows yet",
    },
    {
      label: "BEST / WORST",
      value: showBestWorst ? bestWorstLabel(graded) : "—",
      sub: showBestWorst ? undefined : `unlocks at 10 graded (${graded.length}/10)`,
    },
  ];

  return (
    <div className="mb-8 grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded border px-4 py-3" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: MUTED }}>
            {it.label}
          </div>
          <div className="font-mono text-xl text-white">{it.value}</div>
          {it.sub && <div className="mt-1 text-[11px]" style={{ color: MUTED }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

function bestWorstLabel(graded: Arrow[]): string {
  // Best = tightest HIT window (fastest fire→grade with outcome hit).
  // Worst = slowest MISS.
  const hits = graded.filter((a) => a.outcome === "hit" && a.graded_at);
  const misses = graded.filter((a) => a.outcome === "miss" && a.graded_at);
  const bestTicker = hits
    .map((a) => ({ t: a.ticker, d: new Date(a.graded_at!).getTime() - new Date(a.fired_at).getTime() }))
    .sort((a, b) => a.d - b.d)[0]?.t;
  const worstTicker = misses
    .map((a) => ({ t: a.ticker, d: new Date(a.graded_at!).getTime() - new Date(a.fired_at).getTime() }))
    .sort((a, b) => b.d - a.d)[0]?.t;
  if (!bestTicker && !worstTicker) return "—";
  return `${bestTicker ?? "—"} / ${worstTicker ?? "—"}`;
}

function FilterPills<K extends string>({
  label,
  value,
  onChange,
  opts,
}: {
  label: string;
  value: K;
  onChange: (k: K) => void;
  opts: { key: K; label: string; count: number }[];
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>{label}</span>
      {opts.map((o) => {
        const active = value === o.key;
        const empty = o.count === 0;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            disabled={empty && !active}
            className="rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:cursor-not-allowed"
            style={{
              borderColor: active ? RH_GREEN : BORDER,
              backgroundColor: active ? "rgba(0,200,5,0.10)" : "transparent",
              color: active ? RH_GREEN : empty ? "#3f4550" : "#9aa1ac",
              opacity: empty && !active ? 0.55 : 1,
            }}
          >
            <span>{o.label}</span>
            <span className="ml-1 font-mono tabular-nums" style={{ opacity: 0.65 }}>({o.count})</span>
          </button>
        );
      })}
    </div>
  );
}

function SortToggle({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const opts: { key: SortKey; label: string }[] = [
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "duration", label: "Duration" },
  ];
  return (
    <div className="flex gap-1">
      {opts.map((o) => {
        const active = o.key === value;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="rounded border px-2 py-1 text-[11px] font-medium transition-colors"
            style={{ borderColor: active ? "#3f4550" : BORDER, color: active ? "#E7E9EE" : MUTED }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function ArrowTable({ arrows }: { arrows: Arrow[] }) {
  return (
    <div className="overflow-x-auto rounded border" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
      <table className="w-full text-sm">
        <thead className="font-mono text-[9px] uppercase tracking-widest" style={{ color: MUTED }}>
          <tr className="border-b" style={{ borderColor: BORDER }}>
            <th className="px-3 py-2 text-left">Serial</th>
            <th className="px-3 py-2 text-left">Ticker</th>
            <th className="px-3 py-2 text-left">Signal</th>
            <th className="px-3 py-2 text-left">Fired</th>
            <th className="px-3 py-2 text-left">Graded</th>
            <th className="px-3 py-2 text-left">Duration</th>
            <th className="px-3 py-2 text-right">Ref px</th>
            <th className="px-3 py-2 text-left">Outcome</th>
          </tr>
        </thead>
        <tbody className="font-mono text-[13px]">
          {arrows.map((a) => <TrackRow key={a.id} a={a} />)}
        </tbody>
      </table>
    </div>
  );
}

function TrackRow({ a }: { a: Arrow }) {
  const [open, setOpen] = useState(false);
  const signal = (() => {
    if (a.type === "drift") return `DRIFT ${a.expected_direction === "up" ? "↑" : "↓"}`;
    if (a.type === "arb") return `ARB ${a.expected_direction === "up" ? "long dex" : "short dex"}`;
    if (a.type === "flow") return `FLOW ${a.expected_direction === "up" ? "buy" : "sell"}`;
    return "WHALE Δ";
  })();
  const outcome = (() => {
    if (a.status === "open") return { label: "OPEN", color: BLUE };
    if (a.outcome === "hit") return { label: "HIT", color: GREEN };
    if (a.outcome === "miss") return { label: "MISS", color: RED };
    if (a.outcome === "informational") return { label: "INFO", color: MUTED };
    return { label: "—", color: MUTED };
  })();
  const dur = a.graded_at
    ? formatDuration(new Date(a.graded_at).getTime() - new Date(a.fired_at).getTime())
    : "—";

  return (
    <>
      <tr
        className="border-b last:border-b-0 hover:bg-black/40 cursor-pointer"
        style={{ borderColor: "#0f1218" }}
        onClick={() => setOpen((v) => !v)}
      >
        <td className="px-3 py-2 text-left" style={{ color: RH_GREEN }}>
          <span style={{ color: MUTED, marginRight: 4 }}>{open ? "▾" : "▸"}</span>
          {a.serial}
        </td>
        <td className="px-3 py-2 text-left text-white">{a.ticker}</td>
        <td className="px-3 py-2 text-left" style={{ color: "#9aa1ac" }}>{signal}</td>
        <td className="px-3 py-2 text-left" style={{ color: MUTED }}>{formatEtTime(a.fired_at)}</td>
        <td className="px-3 py-2 text-left" style={{ color: MUTED }}>{a.graded_at ? formatEtTime(a.graded_at) : "—"}</td>
        <td className="px-3 py-2 text-left" style={{ color: MUTED }}>{dur}</td>
        <td className="px-3 py-2 text-right" style={{ color: "#E7E9EE" }}>${a.reference_price.toFixed(2)}</td>
        <td className="px-3 py-2 text-left">
          <span
            className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider"
            style={{ color: outcome.color, backgroundColor: `${outcome.color}18` }}
          >
            {outcome.label}
          </span>
        </td>
      </tr>
      {open && (
        <tr style={{ borderBottom: "1px solid #0f1218" }}>
          <td colSpan={8} className="px-4 py-3" style={{ backgroundColor: "#07090e" }}>
            <ArrowBriefBlock a={a} hasBrief={!!a.brief} />
          </td>
        </tr>
      )}
    </>
  );
}

function EmptyState({ allZero }: { allZero: boolean }) {
  return (
    <div
      className="rounded border py-12 text-center text-sm"
      style={{ borderColor: BORDER, backgroundColor: SURFACE, color: MUTED }}
    >
      {allZero ? (
        <>
          <div className="font-mono text-white mb-2">No graded arrows yet.</div>
          <p className="max-w-md mx-auto">
            The engine fires on live setups and grades them automatically — first receipts land when NYSE opens Monday.
          </p>
        </>
      ) : (
        <>No arrows match this filter.</>
      )}
    </div>
  );
}

function GradingRulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-w-lg rounded border p-6"
        style={{ borderColor: BORDER, backgroundColor: SURFACE }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="font-mono text-[11px] uppercase tracking-widest" style={{ color: MUTED }}>// grading rules</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
        </div>
        <ul className="space-y-3 text-sm font-mono">
          <li>
            <span style={{ color: RH_GREEN }}>drift</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= gap DEX↔oracle đóng ≥ 50% trong 2h đầu của phiên kế</span>
          </li>
          <li>
            <span style={{ color: RH_GREEN }}>arb</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= spread thu về &lt; 0.5% trong 4h</span>
          </li>
          <li>
            <span style={{ color: RH_GREEN }}>flow</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= giá DEX đi ≥ 1% ĐÚNG hướng dòng tiền trong 24h, trước khi đi 1% ngược hướng</span>
          </li>
          <li>
            <span style={{ color: MUTED }}>whale</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= informational, KHÔNG tính hit rate</span>
          </li>
        </ul>
        <p className="mt-4 text-[11px] font-mono" style={{ color: MUTED }}>
          Every outcome is hard-mapped in code by the same tool that fired the arrow. The LLM never picks HIT / MISS.
        </p>
      </div>
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

// ── Utils ──────────────────────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
function formatEtTime(iso: string): string {
  // ET = UTC-4 (during DST); for a receipt we render "MMM DD · HH:mm ET".
  const d = new Date(iso);
  const et = new Date(d.getTime() - 4 * 3600 * 1000);
  const mm = String(et.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(et.getUTCDate()).padStart(2, "0");
  const hh = String(et.getUTCHours()).padStart(2, "0");
  const mi = String(et.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi} ET`;
}
// Silence unused constants that show up conditionally.
void AMBER;
