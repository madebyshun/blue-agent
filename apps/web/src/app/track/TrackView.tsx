"use client";

/**
 * /track client island — the public receipt book.
 *
 * Renders a server-provided, already-gated `PublicTrackRecord` (no client fetch:
 * SEO + the gate both want the data resolved server-side). Pure presentation +
 * client-side filter/sort over `record.receipts.arrows`.
 *
 * THE GATE, restated in the UI: `headline.hit_rate` is either
 * `{ready:true,pct}` or `{ready:false,graded,needed}`. When not ready this
 * component renders "warming up · N/needed" and NOTHING that discloses the rate
 * — no pct, no hits/misses aggregate. Individual arrow outcomes still show
 * (that's the evidence, and misses are the point).
 *
 * THE SAME GATE BINDS THE EVIDENCE PANEL, and there it is load-bearing rather
 * than decorative: `chain:base` is currently 2 hits / 0 misses, so printing the
 * tally a `ready:false` cohort carries would publish a readable 100% off n=2 —
 * the exact number the gate exists to withhold. <DeskRow> therefore renders
 * `n of needed` and nothing else until the sample earns a rate.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import type { Arrow, HoodChain } from "@/lib/blue-hood/types";
import { chainOf } from "@/lib/blue-hood/types";
import type { PublicTrackRecord, PublicPerTypeStats } from "@/lib/blue-hood/track-record-public";
// Type-only on purpose: both modules are server-side (cohort-read reaches KV),
// and `import type` is erased by tsc, so nothing follows them into the bundle.
import type { CohortRead } from "@/lib/blue-hood/cohort-read";
import type { CohortStat } from "@/lib/blue-hood/cohort-stats";

const RH_GREEN = "#34D399";
// Base venue accent — text-only (pills stay green; venue color lives in the tag).
const BASE_BLUE_TEXT = "#5b8cff";
const BLUE = "#4FC3F7";
const RED = "#ef4444";
const GREEN = "#22c55e";
const AMBER = "#f5b342";
const MUTED = "#6b7280";
const SURFACE = "#0B0D13";
const BORDER = "#1A1A2E";

type OutcomeFilter = "all" | "hit" | "miss" | "void" | "open";
type TypeFilter = "all" | "arb" | "drift" | "flow";
type ChainFilter = "all" | "base" | "robinhood";
type SortKey = "newest" | "oldest" | "duration";

const PAGE_SIZE = 50;

export default function TrackView({
  record,
  cohorts,
}: {
  record: PublicTrackRecord;
  cohorts: CohortRead;
}) {
  const arrows = record.receipts.arrows;
  const [outcome, setOutcome] = useState<OutcomeFilter>("all");
  const [ttype, setTtype] = useState<TypeFilter>("all");
  const [chain, setChain] = useState<ChainFilter>("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [rulesOpen, setRulesOpen] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo<Arrow[]>(() => {
    let list = arrows;
    if (outcome === "hit") list = list.filter((a) => a.outcome === "hit");
    else if (outcome === "miss") list = list.filter((a) => a.outcome === "miss");
    else if (outcome === "void") list = list.filter((a) => a.outcome === "void");
    else if (outcome === "open") list = list.filter((a) => a.status === "open");
    if (ttype !== "all") list = list.filter((a) => a.type === ttype);
    if (chain !== "all") list = list.filter((a) => chainOf(a) === chain);
    return [...list].sort((a, b) => {
      if (sort === "newest") return new Date(b.fired_at).getTime() - new Date(a.fired_at).getTime();
      if (sort === "oldest") return new Date(a.fired_at).getTime() - new Date(b.fired_at).getTime();
      const durA = a.graded_at ? new Date(a.graded_at).getTime() - new Date(a.fired_at).getTime() : Infinity;
      const durB = b.graded_at ? new Date(b.graded_at).getTime() - new Date(b.fired_at).getTime() : Infinity;
      return durB - durA;
    });
  }, [arrows, outcome, ttype, chain, sort]);

  const paged = filtered.slice(0, page * PAGE_SIZE);
  const canPage = filtered.length > paged.length;

  const buckets = useMemo(() => ({
    all: arrows.length,
    hit: arrows.filter((a) => a.outcome === "hit").length,
    miss: arrows.filter((a) => a.outcome === "miss").length,
    void: arrows.filter((a) => a.outcome === "void").length,
    open: arrows.filter((a) => a.status === "open").length,
    arb: arrows.filter((a) => a.type === "arb").length,
    drift: arrows.filter((a) => a.type === "drift").length,
    flow: arrows.filter((a) => a.type === "flow").length,
    base: arrows.filter((a) => chainOf(a) === "base").length,
    robinhood: arrows.filter((a) => chainOf(a) === "robinhood").length,
  }), [arrows]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 md:py-14">
      <Header arrowsToday={record.receipts.arrows_today} />
      <HeadlineHero headline={record.headline} />
      <MetricStrip record={record} filteredCount={filtered.length} />
      <EvidencePanel cohorts={cohorts} />

      <div className="mb-3 mt-10 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
        // every graded arrow · forever · misses included
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterPills
          label="outcome"
          value={outcome}
          onChange={(v) => { setOutcome(v); setPage(1); }}
          opts={[
            { key: "all", label: "All", count: buckets.all },
            { key: "hit", label: "Hit", count: buckets.hit },
            { key: "miss", label: "Miss", count: buckets.miss },
            { key: "void", label: "Void", count: buckets.void },
            { key: "open", label: "Open", count: buckets.open },
          ]}
        />
        <FilterPills
          label="type"
          value={ttype}
          onChange={(v) => { setTtype(v); setPage(1); }}
          opts={[
            { key: "all", label: "All", count: buckets.all },
            { key: "arb", label: "Arb", count: buckets.arb },
            { key: "drift", label: "Drift", count: buckets.drift },
            { key: "flow", label: "Flow", count: buckets.flow },
          ]}
        />
        <FilterPills
          label="chain"
          value={chain}
          onChange={(v) => { setChain(v); setPage(1); }}
          opts={[
            { key: "all", label: "All", count: buckets.all },
            { key: "base", label: "Base", count: buckets.base },
            { key: "robinhood", label: "RH", count: buckets.robinhood },
          ]}
        />
        <div className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
          <button
            onClick={() => setRulesOpen(true)}
            className="rounded border px-2 py-1 hover:text-white"
            style={{ borderColor: BORDER }}
          >
            How grading works
          </button>
          <span>sort</span>
          <SortToggle value={sort} onChange={(v) => { setSort(v); setPage(1); }} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState allZero={arrows.length === 0} />
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

      <Footer meta={record.meta} />

      {rulesOpen && <GradingRulesModal onClose={() => setRulesOpen(false)} />}
    </div>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────
function Header({ arrowsToday }: { arrowsToday: number }) {
  return (
    <header className="mb-8 flex flex-wrap items-baseline gap-x-4 gap-y-2">
      <div className="flex items-baseline gap-3">
        <div className="text-[26px] font-bold tracking-tight text-white">
          BLUE<span style={{ color: RH_GREEN }}>HOOD</span>
          <span className="ml-2 text-[13px] font-normal" style={{ color: MUTED, letterSpacing: "0.08em" }}>
            · TRACK RECORD
          </span>
        </div>
        <div className="text-[11px]" style={{ color: "#9aa1ac" }}>
          public receipt book — every signal graded, misses included
        </div>
      </div>
      <div className="ml-auto flex items-center gap-4 text-[11px]">
        {arrowsToday > 0 && (
          <span className="font-mono" style={{ color: MUTED }}>
            <span style={{ color: RH_GREEN }}>{arrowsToday}</span> fired today
          </span>
        )}
        <Link href="/hood" className="hover:text-white" style={{ color: MUTED }}>
          Live board →
        </Link>
      </div>
    </header>
  );
}

// ── Headline hero (GATED) ────────────────────────────────────────────────────
function HeadlineHero({ headline }: { headline: PublicTrackRecord["headline"] }) {
  const hr = headline.hit_rate;
  const curve = headline.record_curve;

  const perTypeSub = (() => {
    const parts: { label: string; node: React.ReactNode }[] = [];
    const t = (key: "arb" | "drift", label: string) => {
      const s = headline.per_type[key] as PublicPerTypeStats | undefined;
      if (!s) return;
      if (s.ready && typeof s.pct === "number") {
        parts.push({ label, node: <><span className="text-white">{label} {s.pct}%</span> <span style={{ color: MUTED }}>· {s.graded}</span></> });
      } else {
        parts.push({ label, node: <span style={{ color: MUTED }}>{label} warming {s.graded}/{s.needed}</span> });
      }
    };
    t("arb", "arb");
    t("drift", "drift");
    return parts;
  })();

  return (
    <section
      className="mb-8 rounded-xl border p-6 md:p-8"
      style={{ borderColor: BORDER, backgroundColor: SURFACE }}
    >
      <div className="flex flex-wrap items-center justify-between gap-6">
        <div>
          <div className="mb-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
            7-day hit rate
          </div>
          {hr.ready ? (
            <div className="flex items-baseline gap-3">
              <div className="font-mono text-5xl font-bold text-white tabular-nums">{hr.pct}%</div>
              <div className="text-[13px]" style={{ color: MUTED }}>
                {hr.graded} graded signals
              </div>
            </div>
          ) : (
            <div>
              <div className="font-mono text-4xl font-bold tabular-nums" style={{ color: AMBER }}>
                warming up
              </div>
              <div className="mt-1 text-[13px]" style={{ color: MUTED }}>
                {hr.graded} graded · {Math.max(0, hr.needed - hr.graded)} more to unlock the rate
              </div>
            </div>
          )}
          {perTypeSub.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[12px]">
              {perTypeSub.map((p) => <span key={p.label}>{p.node}</span>)}
            </div>
          )}
        </div>

        {/* Record curve — the gated HIT−MISS walk. Only when the sample earns it. */}
        {curve.ready && <RecordCurve curve={curve} />}
      </div>

      {!hr.ready && (
        <div className="mt-5">
          <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ backgroundColor: "#12151c" }}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.min(100, Math.round((hr.graded / hr.needed) * 100))}%`,
                backgroundColor: RH_GREEN,
              }}
            />
          </div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
            we don&apos;t publish a hit rate the sample hasn&apos;t earned — this bar fills as arrows grade
          </div>
        </div>
      )}
    </section>
  );
}

function RecordCurve({ curve }: { curve: Extract<PublicTrackRecord["headline"]["record_curve"], { ready: true }> }) {
  const pts = curve.points;
  if (pts.length < 2) return null;
  const W = 220, H = 64, pad = 4;
  const vals = pts.map((p) => p.v);
  const min = Math.min(0, ...vals), max = Math.max(0, ...vals);
  const span = Math.max(1, max - min);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - 2 * pad);
  const y = (v: number) => pad + (1 - (v - min) / span) * (H - 2 * pad);
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(" ");
  const zeroY = y(0);
  const up = curve.final >= 0;
  return (
    <div className="flex flex-col items-end">
      <svg width={W} height={H} className="overflow-visible">
        <line x1={pad} y1={zeroY} x2={W - pad} y2={zeroY} stroke={BORDER} strokeWidth={1} strokeDasharray="3 3" />
        <path d={d} fill="none" stroke={up ? GREEN : RED} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div className="mt-1 font-mono text-[10px]" style={{ color: MUTED }}>
        net <span style={{ color: up ? GREEN : RED }}>{curve.final >= 0 ? "+" : ""}{curve.final}</span> · peak +{curve.peak} · W/L walk
      </div>
    </div>
  );
}

// ── Metric strip (no pct leak when not ready) ────────────────────────────────
function MetricStrip({ record, filteredCount }: { record: PublicTrackRecord; filteredCount: number }) {
  const arrows = record.receipts.arrows;
  const graded = arrows.filter((a) => a.status === "graded");
  const durations = graded
    .filter((a) => a.graded_at)
    .map((a) => new Date(a.graded_at!).getTime() - new Date(a.fired_at).getTime());
  const avgDurationMs = durations.length ? durations.reduce((s, d) => s + d, 0) / durations.length : 0;

  const hr = record.headline.hit_rate;
  // Only ever a % when the gate says ready; otherwise "n/a" — never a raw rate.
  const hitRate = hr.ready ? `${hr.pct}%` : "n/a";
  const hitSub = hr.ready ? `${hr.graded} graded · 7d` : `warming up · ${hr.graded}/${hr.needed}`;

  const items: { label: string; value: string; sub?: string }[] = [
    { label: "HIT RATE 7D", value: hitRate, sub: hitSub },
    { label: "TOTAL GRADED", value: String(graded.length), sub: `${filteredCount} match filter` },
    {
      label: "AVG DURATION",
      value: durations.length ? formatDuration(avgDurationMs) : "—",
      sub: durations.length ? "fire → grade" : "no graded arrows yet",
    },
    {
      label: "SIGNALS LOGGED",
      value: String(arrows.length),
      sub: "engine-fired · non-test",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {items.map((it) => (
        <div key={it.label} className="rounded border px-4 py-3" style={{ borderColor: BORDER, backgroundColor: SURFACE }}>
          <div className="mb-1 font-mono text-[9px] uppercase tracking-widest" style={{ color: MUTED }}>{it.label}</div>
          <div className="font-mono text-xl text-white">{it.value}</div>
          {it.sub && <div className="mt-1 text-[11px]" style={{ color: MUTED }}>{it.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Evidence panel (recent-window, multiplicity-corrected) ───────────────────
/**
 * The claim, with its own caveats attached — not a second headline.
 *
 * WHY IT SITS UNDER THE 7-DAY HERO AND NOT BESIDE IT: these are two different
 * windows over two different samples, and a reader who compares them is being
 * misled by the layout rather than by any number. The window is measured, not
 * assumed, and printed, so the panel cannot drift from its own basis.
 *
 * IT DOES NOT SAY "ALL TIME", THOUGH `window_basis` DOES. That field means "the
 * analysis applied no time filter", which is true of the function and false of
 * the claim: the input was already cut to the newest ~250 arrows by the feed
 * blob, out of 532 in the index (measured 2026-09-17). The cut also slides, so
 * `graded` came back 240, 238, then 234 on three reads that day — a reader who
 * refreshed would watch the "all time" record shrink. This panel prints the
 * count it actually analysed and says older arrows are excluded. See
 * cohort-read.ts ③.
 *
 * WHAT MAY BE CALLED AN EDGE: only `validated` — cohorts that survive
 * Benjamini-Hochberg across the whole pre-registered family. A cohort that
 * reaches p<0.05 alone but not as best-of-N is `exploratory` and is counted
 * here, never quoted. The naive version of this feature fires on 38.5% of
 * pure-noise records in our own control test, which is why the correction is
 * rendered next to the number instead of in a footnote.
 *
 * THE BASE ROW IS THE POINT OF THE GATE. `chain:base` was pre-declared in
 * `cohortDefs` while n was 0 — precisely so it could never be added ad hoc once
 * the data looked good — and it currently holds 2 hits / 0 misses. A tally is
 * a percentage a reader can do in their head, so below the gate this renders
 * `n of needed` and NOTHING else. It also assumes nothing about Base ever
 * clearing it: the row states the sample it has, and if Base pools stay
 * efficient and never produce drift, "no arrows" is a finding about Base, not a
 * broken desk.
 */
function EvidencePanel({ cohorts }: { cohorts: CohortRead }) {
  // An unreadable feed is NOT "no edge" (see cohort-read.ts ②). The honest
  // answer and the alarming one look identical from outside unless we say which.
  if (cohorts.status !== "ok") {
    return (
      <section
        className="mt-6 rounded-xl border p-6"
        style={{ borderColor: BORDER, backgroundColor: SURFACE }}
      >
        <div className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
          // the evidence
        </div>
        <div className="font-mono text-[14px]" style={{ color: AMBER }}>
          Couldn&apos;t read the arrow feed — no analysis was run.
        </div>
        <p className="mt-2 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
          This is the absence of an answer, not a result: it is neither
          &ldquo;not enough data&rdquo; nor &ldquo;no edge found&rdquo;. The receipts below are served
          separately and are unaffected. Reload in a minute.
        </p>
      </section>
    );
  }

  const a = cohorts.analysis;
  const o = a.overall;
  const rh = a.cohorts.find((c) => c.key === "chain:robinhood");
  const base = a.cohorts.find((c) => c.key === "chain:base");
  // NOT "all time" when the feed was capped — that is the one phrase the data
  // does not support. `rolling 7d` is a real time filter and stays as-is.
  const basis =
    a.window_basis === "rolling_7d"
      ? "rolling 7d"
      : cohorts.feed_capped
        ? `newest ${cohorts.analyzed} arrows`
        : "full record";

  return (
    <section
      className="mt-6 rounded-xl border p-6 md:p-8"
      style={{ borderColor: BORDER, backgroundColor: SURFACE }}
    >
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
          // the evidence · {basis} · {a.graded} graded
        </div>
        {/* Said out loud so it can never be silently read against the 7d hero. */}
        <div className="font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
          different window from the hit rate above
        </div>
      </div>

      {o.ready && typeof o.pct === "number" ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <div className="font-mono text-4xl font-bold text-white tabular-nums">{o.pct}%</div>
          <div className="font-mono text-[13px]" style={{ color: MUTED }}>
            n={o.n}
            {o.ci && <> · 95% CI {o.ci.lo}–{o.ci.hi}</>}
            {typeof o.p_value === "number" && (
              <> · p={formatP(o.p_value)} vs a coin flip</>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="font-mono text-3xl font-bold tabular-nums" style={{ color: AMBER }}>
            warming up
          </div>
          <div className="mt-1 text-[13px]" style={{ color: MUTED }}>
            {o.n} graded — not enough sample for a rate yet
          </div>
        </div>
      )}

      {o.ready && (
        <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: "#9aa1ac" }}>
          One pre-declared test of the whole record against a 50% null — no
          multiplicity to correct, because nothing was selected to produce it.
          The splits below are a different matter: {a.tests_run} pre-registered
          hypotheses were tested, and{" "}
          <span style={{ color: a.validated.length > 0 ? GREEN : MUTED }}>
            {a.validated.length}
          </span>{" "}
          survive Benjamini-Hochberg as best-of-{a.tests_run}
          {a.exploratory.length > 0 && (
            <> ({a.exploratory.length} more clear p&lt;0.05 alone but not the correction, so they are not quoted)</>
          )}
          .
        </p>
      )}

      <div className="mt-5">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-widest" style={{ color: MUTED }}>
          by desk
        </div>
        <DeskRow label="Robinhood Chain" chain="robinhood" stat={rh} />
        <DeskRow label="Base" chain="base" stat={base} />
      </div>

      {base && !base.ready && (
        <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
          The Base desk is expanding and does not have the sample yet — so it
          gets no percentage here, not even a hits/misses tally, which is a rate
          in disguise. It was declared as a split before it had any data, so it
          can never be added later just because it looks good. If Base pools
          simply stay efficient and never drift far enough to fire, that is a
          result about Base — not a desk that is broken.
        </p>
      )}

      {/* Said here rather than omitted: a reader who refreshes WILL see these
          counts move down as well as up, and an unexplained shrinking record
          reads as tampering. Cheaper to state the window than to be doubted. */}
      {cohorts.feed_capped && (
        <p className="mt-3 max-w-2xl text-[12.5px] leading-relaxed" style={{ color: MUTED }}>
          This panel analysed the newest {cohorts.analyzed} arrows, not the entire
          history — the feed we read is capped, so older arrows are excluded, and
          the window slides forward as new arrows fire. That means these counts can
          go down between two visits even though the record only ever grows, and a
          cohort sitting near the {a.tests_run}-way correction can gain or lose its
          &ldquo;survives correction&rdquo; mark for that reason alone, with nothing
          about the signal having changed. The receipts below are a separate and
          shallower read of the same feed, so they do not fill the gap.
        </p>
      )}

      <div className="mt-5 border-t pt-3 font-mono text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
        Wilson 95% intervals · exact two-sided binomial · BH FDR across the whole
        family · cohorts fixed in code before the data.{" "}
        <Link href="/api/hood/cohorts" className="underline" style={{ color: BLUE }}>
          Full payload ↗
        </Link>
      </div>
    </section>
  );
}

/** One venue line. Below the gate it shows a sample, never a rate — see above. */
function DeskRow({ label, chain, stat }: { label: string; chain: HoodChain; stat?: CohortStat }) {
  if (!stat) return null;
  const accent = chain === "base" ? BASE_BLUE_TEXT : RH_GREEN;

  return (
    <div
      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t py-2.5"
      style={{ borderColor: "#0f1218" }}
    >
      <span className="min-w-[9rem] font-mono text-[12px] font-semibold" style={{ color: accent }}>
        {label}
      </span>

      {stat.ready && typeof stat.pct === "number" ? (
        <>
          <span className="font-mono text-[15px] font-bold text-white tabular-nums">{stat.pct}%</span>
          <span className="font-mono text-[12px]" style={{ color: MUTED }}>n={stat.n}</span>
          {stat.ci && (
            <span className="font-mono text-[12px]" style={{ color: MUTED }}>
              CI {stat.ci.lo}–{stat.ci.hi}
            </span>
          )}
          {typeof stat.p_value === "number" && (
            <span className="font-mono text-[12px]" style={{ color: MUTED }}>
              p={formatP(stat.p_value)}
            </span>
          )}
          {stat.survives_correction ? (
            <span
              className="rounded px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: GREEN, backgroundColor: `${GREEN}18` }}
            >
              survives correction
            </span>
          ) : (
            <span
              className="rounded px-2 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider"
              style={{ color: AMBER, backgroundColor: `${AMBER}18` }}
              title="Reaches significance alone but not as best-of-N — not quotable as an edge."
            >
              not corrected-significant
            </span>
          )}
        </>
      ) : (
        <>
          <span className="font-mono text-[13px]" style={{ color: AMBER }}>expanding</span>
          {/* n and needed ONLY. hits/misses here would publish the rate the gate withholds. */}
          <span className="font-mono text-[12px]" style={{ color: MUTED }}>
            {stat.n} of {stat.needed} graded — not enough sample yet
          </span>
        </>
      )}
    </div>
  );
}

// ── Filters ──────────────────────────────────────────────────────────────────
function FilterPills<K extends string>({
  label, value, onChange, opts,
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

// ── Table ────────────────────────────────────────────────────────────────────
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
  const signal = signalLabel(a);
  const oc = outcomeBadge(a);
  const dur = a.graded_at
    ? formatDuration(new Date(a.graded_at).getTime() - new Date(a.fired_at).getTime())
    : "—";
  const serialParam = a.serial.replace(/^#/, "");

  return (
    <tr className="border-b last:border-b-0 hover:bg-black/40" style={{ borderColor: "#0f1218" }}>
      <td className="px-3 py-2 text-left">
        <Link
          href={`/share/arrow/${serialParam}`}
          className="hover:underline"
          style={{ color: RH_GREEN }}
          title="Open shareable permalink"
        >
          {a.serial} <span style={{ color: MUTED }}>↗</span>
        </Link>
      </td>
      <td className="px-3 py-2 text-left text-white">{a.ticker}<ChainTag chain={chainOf(a)} /></td>
      <td className="px-3 py-2 text-left" style={{ color: "#9aa1ac" }}>{signal}</td>
      <td className="px-3 py-2 text-left" style={{ color: MUTED }}>{formatEtTime(a.fired_at)}</td>
      <td className="px-3 py-2 text-left" style={{ color: MUTED }}>{a.graded_at ? formatEtTime(a.graded_at) : "—"}</td>
      <td className="px-3 py-2 text-left" style={{ color: MUTED }}>{dur}</td>
      <td className="px-3 py-2 text-right" style={{ color: "#E7E9EE" }}>${a.reference_price.toFixed(2)}</td>
      <td className="px-3 py-2 text-left">
        <span
          className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider"
          style={{ color: oc.color, backgroundColor: `${oc.color}18` }}
        >
          {oc.label}
        </span>
      </td>
    </tr>
  );
}

// Venue tag beside the ticker. Base rows (Coinbase B20) read blue, RH rows
// green — mirrors the live board's <ChainTag>. `chainOf` back-fills the legacy
// "absent ⟹ robinhood" default so pre-Base arrows keep their RH badge.
function ChainTag({ chain }: { chain: HoodChain }) {
  const isBase = chain === "base";
  return (
    <span
      className="ml-2 rounded px-1.5 py-0.5 align-middle font-mono text-[9px] font-semibold uppercase tracking-wider"
      style={{
        color: isBase ? BASE_BLUE_TEXT : RH_GREEN,
        backgroundColor: isBase ? "rgba(0,82,255,0.16)" : "rgba(52,211,153,0.12)",
      }}
      title={isBase
        ? "Coinbase B20 tokenized stock on Base (chain 8453)"
        : "Tokenized stock on Robinhood Chain (chain 4663)"}
    >
      {isBase ? "BASE" : "RH"}
    </span>
  );
}

function EmptyState({ allZero }: { allZero: boolean }) {
  return (
    <div className="rounded border py-12 text-center" style={{ borderColor: BORDER, backgroundColor: SURFACE, color: MUTED }}>
      {allZero ? (
        <>
          <div className="font-mono text-white text-[13px] mb-2">No graded arrows yet.</div>
          <p className="mx-auto max-w-md text-[13.5px] leading-relaxed">
            The engine fires on live Chainlink-vs-DEX setups and grades them automatically. First receipts land when NYSE opens.
          </p>
        </>
      ) : (
        <span className="font-mono text-[13px]">No arrows match this filter.</span>
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
          <div className="font-mono text-[11px] uppercase tracking-widest" style={{ color: MUTED }}>// how grading works</div>
          <button onClick={onClose} className="text-slate-400 hover:text-white" aria-label="Close">✕</button>
        </div>
        <ul className="space-y-3 text-sm font-mono">
          <li>
            <span style={{ color: RH_GREEN }}>drift</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= DEX↔oracle gap closes ≥ 50% within the first 2h of NYSE regular session (clock pauses at close — Chainlink freezes off-hours, so the gap literally can&apos;t close then).</span>
          </li>
          <li>
            <span style={{ color: RH_GREEN }}>arb</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= spread returns below 0.5% within 4h of NYSE regular-session time (same market-aware clock as drift).</span>
          </li>
          <li>
            <span style={{ color: "#f5b342" }}>void</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= graded before its regular-session window fully elapsed → excluded from the hit rate (never hidden — VOID stays in the list).</span>
          </li>
          <li>
            <span style={{ color: MUTED }}>flow / whale</span>{" "}
            <span style={{ color: "#9aa1ac" }}>= informational, does NOT count toward the hit rate.</span>
          </li>
        </ul>
        <p className="mt-4 text-[11px] font-mono" style={{ color: MUTED }}>
          Every outcome is hard-mapped in code by the same tool that fired the arrow — the LLM never picks HIT / MISS.{" "}
          <Link href="/docs/blue-hood#grading" className="underline" style={{ color: BLUE }}>Full rules ↗</Link>
        </p>
      </div>
    </div>
  );
}

function Footer({ meta }: { meta: PublicTrackRecord["meta"] }) {
  return (
    <footer className="mt-12 border-t pt-6 text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <span>Oracle: Chainlink AggregatorV3 (RH) + B20 share price (Base)</span>
        <span>DEX: GeckoTerminal (Uniswap V3/V4 · Aerodrome)</span>
        <span>
          Track-record API <span style={{ color: BLUE }}>v{meta.api_version}</span> ·{" "}
          <Link href="/docs/blue-hood#grading" className="underline">grading rules</Link>
        </span>
      </div>
    </footer>
  );
}

// ── Shared label/format helpers (mirror the in-app track record) ─────────────
function signalLabel(a: Arrow): string {
  if (a.type === "drift") return `DRIFT ${a.expected_direction === "up" ? "↑" : "↓"}`;
  if (a.type === "arb") return `ARB ${a.expected_direction === "up" ? "long dex" : "short dex"}`;
  if (a.type === "flow") return `FLOW ${a.expected_direction === "up" ? "buy" : "sell"}`;
  return "WHALE Δ";
}

function outcomeBadge(a: Arrow): { label: string; color: string } {
  if (a.status === "open") return { label: "OPEN", color: BLUE };
  if (a.outcome === "hit") return { label: "HIT", color: GREEN };
  if (a.outcome === "miss") return { label: "MISS", color: RED };
  if (a.outcome === "void") return { label: "VOID", color: AMBER };
  if (a.outcome === "informational") return { label: "INFO", color: MUTED };
  return { label: "—", color: MUTED };
}

/**
 * p-values here run to 1e-08, which `toFixed` renders as a row of zeros and
 * `String()` renders with a full mantissa. Two significant figures in
 * scientific notation is the form a reader can actually compare.
 */
function formatP(p: number): string {
  if (!Number.isFinite(p) || p < 0) return "—";
  if (p >= 0.001) return p.toFixed(3);
  const exp = Math.floor(Math.log10(p));
  const mantissa = p / Math.pow(10, exp);
  const sign = exp < 0 ? "-" : "+";
  return `${mantissa.toFixed(1)}e${sign}${String(Math.abs(exp)).padStart(2, "0")}`;
}

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
  const d = new Date(iso);
  const et = new Date(d.getTime() - 4 * 3600 * 1000);
  const mm = String(et.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(et.getUTCDate()).padStart(2, "0");
  const hh = String(et.getUTCHours()).padStart(2, "0");
  const mi = String(et.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi} ET`;
}
