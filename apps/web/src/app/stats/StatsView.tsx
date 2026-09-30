"use client";

/**
 * StatsView — the animated, client-side render of the /stats traction page.
 *
 * The page.tsx server component fetches the sanitized aggregate (no per-user
 * data) and hands the plain object to this island. All motion lives here:
 *   - count-up numbers (rAF, easeOutCubic, triggered on scroll-into-view)
 *   - scroll reveals (fade + slide up, staggered)
 *   - animated bar charts (adoption funnel + most-used tools)
 * Everything respects `prefers-reduced-motion` (renders final values instantly).
 *
 * No number is invented here — this component only formats + animates the
 * values computed in buildPublicStats().
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PublicStats } from "@/lib/public-stats";
import { ARROWS_FROZEN, ARROWS_FROZEN_SINCE } from "@/lib/blue-hood/arrow-freeze";

// ─── motion primitives ───────────────────────────────────────────────────────

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduce(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduce(e.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

function useInView<T extends HTMLElement>(rootMargin = "0px 0px -10% 0px") {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const ob = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setInView(true); ob.disconnect(); } },
      { rootMargin, threshold: 0.15 },
    );
    ob.observe(el);
    return () => ob.disconnect();
  }, [rootMargin]);
  return { ref, inView };
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

function useCountUp(target: number, active: boolean, duration = 1300): number {
  const [val, setVal] = useState(0);
  const reduce = usePrefersReducedMotion();
  useEffect(() => {
    if (!active) return;
    if (reduce || duration <= 0) { setVal(target); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setVal(target * easeOutCubic(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration, reduce]);
  return val;
}

/** Count-up number. Pass a numeric `value`, or `raw` for an unparseable string ("—"). */
function AnimatedNumber({
  value, decimals = 0, prefix = "", suffix = "", raw, format, className, style,
}: {
  value?: number; decimals?: number; prefix?: string; suffix?: string;
  raw?: string; format?: (n: number) => string; className?: string; style?: React.CSSProperties;
}) {
  const { ref, inView } = useInView<HTMLSpanElement>();
  const v = useCountUp(value ?? 0, inView && raw === undefined);
  const text = raw !== undefined
    ? raw
    : format
      ? format(v)
      : prefix + v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;
  return <span ref={ref} className={className} style={style}>{text}</span>;
}

function Reveal({ children, delay = 0, className = "" }: { children: React.ReactNode; delay?: number; className?: string }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduce = usePrefersReducedMotion();
  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: inView || reduce ? 1 : 0,
        transform: inView || reduce ? "none" : "translateY(18px)",
        transition: reduce ? undefined : `opacity .6s ease-out ${delay}ms, transform .6s ease-out ${delay}ms`,
      }}
    >
      {children}
    </div>
  );
}

// ─── formatting helpers ──────────────────────────────────────────────────────

/* `parseCompact` lived here — it split the pre-formatted "822.3M" that
   public-stats returned for total BLUE staked back into a number the animated
   counter could tick. Every other stat on this page arrives as a raw number,
   so once the staking panel went, nothing needed re-parsing. */

/** Compact token/number formatting: 3_300_000 → "3.3M". */
function compact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, "") + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toLocaleString("en-US");
}

/** USD formatting: sub-cent gets more precision so "$0.0089" doesn't read as $0.00. */
function fmtUSD(n: number): string {
  if (n > 0 && n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── charts ──────────────────────────────────────────────────────────────────

/** Adoption funnel: Onboarded → Active → Creators. Real counts, animated bars. */
/** A `null` value ⟹ #150: that source was unreadable. The row renders "—" with
 *  an empty bar instead of a 0-length bar, which would draw as a real measured
 *  drop-off in the funnel — the one shape a reader is guaranteed to read as a
 *  finding rather than as a missing input. */
function Funnel({ claims, active, traders }: { claims: number | null; active: number; traders: number | null }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduce = usePrefersReducedMotion();
  const max = Math.max(claims ?? 0, active, traders ?? 0, 1);
  const rows = [
    { label: "Onboarded", sub: claims === null ? "counter unreadable" : "free-credit claims", value: claims, color: "#A78BFA" },
    { label: "Active",    sub: "wallets that spent", value: active,   color: "#4FC3F7" },
    // Was "Creators · launched a token" — retired with the launches block
    // (2026-09-30): the flow it counted is gone and it read 0.
    { label: "Traders",   sub: traders === null ? "action meter unreadable" : "signed a trade the chain confirmed", value: traders, color: "#34D399" },
  ];
  return (
    <div ref={ref} className="space-y-4">
      {rows.map((r, i) => {
        const pct = r.value === null ? 0 : Math.max(3, Math.round((r.value / max) * 100));
        return (
          <div key={r.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="font-mono text-[11px] text-slate-300">
                {r.label} <span className="text-slate-600">· {r.sub}</span>
              </span>
              <AnimatedNumber
                value={r.value ?? undefined}
                raw={r.value === null ? "—" : undefined}
                className="font-mono text-sm font-bold"
                style={{ color: r.color }}
              />
            </div>
            <div className="h-2.5 rounded-full bg-[#12121a] overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: inView || reduce ? `${pct}%` : "0%",
                  background: `linear-gradient(90deg, ${r.color}, ${r.color}99)`,
                  boxShadow: `0 0 12px ${r.color}55`,
                  transition: reduce ? undefined : `width 1s cubic-bezier(.22,1,.36,1) ${i * 120}ms`,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** Most-used tools — animated horizontal bars with count-up run totals. */
function ToolBars({ tools }: { tools: { name: string; runs: number }[] }) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const reduce = usePrefersReducedMotion();
  const max = tools[0]?.runs || 1;
  return (
    <div ref={ref} className="rounded-2xl border border-[#1A1A2E] overflow-hidden divide-y divide-[#111119]">
      {tools.map((tl, i) => {
        const pct = Math.max(4, Math.round((tl.runs / max) * 100));
        return (
          <div key={`${tl.name}-${i}`} className="relative flex items-center gap-3 px-5 py-3 bg-[#0a0a0f]">
            <div
              className="absolute inset-y-0 left-0"
              aria-hidden
              style={{
                width: inView || reduce ? `${pct}%` : "0%",
                background: "linear-gradient(90deg, #4FC3F71f, #4FC3F708)",
                transition: reduce ? undefined : `width .9s cubic-bezier(.22,1,.36,1) ${i * 90}ms`,
              }}
            />
            <span className="relative font-mono text-[10px] text-slate-600 w-5 shrink-0">{i + 1}</span>
            <span className="relative font-mono text-xs text-white flex-1 truncate">{tl.name}</span>
            <AnimatedNumber value={tl.runs} className="relative font-mono text-xs text-[#4FC3F7] shrink-0" />
          </div>
        );
      })}
    </div>
  );
}

// ─── metric card ─────────────────────────────────────────────────────────────

interface Cell { label: string; sub?: string; color: string; value?: number; decimals?: number; prefix?: string; suffix?: string; raw?: string; }

function MetricGrid({ cells, cols }: { cells: Cell[]; cols: string }) {
  return (
    <div className={`grid ${cols} gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E]`}>
      {cells.map((c, i) => (
        <Reveal key={c.label} delay={i * 70}>
          <div className="group h-full bg-[#0a0a0f] p-5 transition-colors hover:bg-[#0d0d15]">
            <AnimatedNumber
              value={c.value} decimals={c.decimals} prefix={c.prefix} suffix={c.suffix} raw={c.raw}
              className="block font-mono text-2xl sm:text-3xl font-bold mb-1"
              style={{ color: c.color }}
            />
            <div className="font-mono text-[10px] text-slate-400 tracking-wide uppercase">{c.label}</div>
            {c.sub && <div className="font-mono text-[10px] text-slate-600 mt-1">{c.sub}</div>}
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/*
 * The "AI model usage" section lived here until 2026-09-18 and is GONE, not
 * disabled — there is no state in which it comes back.
 *
 * It read GET https://llm.bankr.bot/v1/usage with BANKR_API_KEY and published the
 * result under the heading "live · via Bankr" / "Live model spend … across Blue
 * Chat + hub tools". Two independent reasons that was false:
 *
 *  1. MEASURED 2026-09-18, all three windows (7/30/90d):
 *       403 {"error":{"message":"This account has been banned","type":"auth_error"}}
 *     The ban is on the ACCOUNT (see CLAUDE.md), so it is not a transient outage
 *     and no key rotation fixes it. Every window came back null.
 *  2. Even when the read worked it could not describe this product. Bankr stopped
 *     being an inference provider on 2026-07-20 (403-banned) and callLLM has been
 *     Virtuals-only since 2026-07-25. So "model spend across Blue Chat + hub
 *     tools" was measuring a provider that serves neither.
 *
 * And the failure mode was the dangerous one: the four summary cards read
 * `active?.cost ?? 0`, with no null gate of their own. With every window null the
 * page rendered **Cost $0.00 · 0 tokens · 0 requests · 0 models** — a fabricated
 * financial figure on the public traction page, which reads as "we spent nothing"
 * when the truth is "we cannot read it". That is the silent-zero family (#150,
 * #259) and the wallet-honesty rule: missing data is "unknown", never a zero.
 *
 * If per-model spend should be published again it has to come from the provider
 * that actually serves the traffic (Virtuals), as a new read — not by repointing
 * this one. Deleting is the honest interim; an empty panel headed "live" is not.
 */

// ─── main view ───────────────────────────────────────────────────────────────

export default function StatsView({ stats }: { stats: PublicStats }) {
  const { actions, product, usage, users, credits, settlement } = stats;
  const revenue = parseFloat((usage.revenueEst ?? "").replace(/[^0-9.]/g, "")) || 0;

  // #150 — `usage.ok === false` means some `usage:<id>` counters could not be
  // READ and were left out of both sums, so Tool Runs / Est. Revenue are a FLOOR.
  // Publish them with "≥" rather than as a measured total; this page is the
  // public traction claim, and a smaller number here is indistinguishable from
  // a quiet week unless we say which it is.
  const runsFloor = usage.ok === false ? "≥" : "";
  // `claimsOk === false` means `claim:count` itself was unreadable. A 0 would
  // read as "nobody has ever signed up" — a far stronger claim than we can make,
  // so it renders "—" like every other unavailable source on this page.
  const claimsRaw = users.claimsOk === false ? "—" : undefined;
  // `actions.ok === false` means an action counter could not be READ; every
  // figure from it is a placeholder, and "0 trades" would deny real ones.
  const actionsRaw = actions.ok === false ? "—" : undefined;
  // Median realized slippage is withheld below `min_n` samples: one swap's
  // slippage is an anecdote, not a property of the router.
  const slip = actions.slippage;
  const slipRaw = actions.ok === false ? "—" : slip.median_bps === null ? "—" : undefined;
  const slipSub = actions.ok === false ? "meter unreadable"
    : slip.median_bps === null ? `insufficient data · ${slip.n} of ${slip.min_n} swaps`
    : `realized vs quoted · median of ${slip.n} swaps`;
  const since = actions.since ? actions.since.slice(0, 10) : null;

  // "BLUE Staked" used to sit in the middle of the hero. It was removed with the
  // stake surface: the staking contract is unchanged on Base, but this page is
  // no longer selling a stake, so headlining its TVL advertised a product that
  // isn't offered. Active Users replaces it — same ledger the rest of the page reads.
  const heroCards: Cell[] = [
    { label: "Tool Runs", color: "#4FC3F7", value: usage.totalRuns, prefix: runsFloor },
    { label: "Active Users", color: "#34D399", value: users.total },
    // Was "Tokens Launched" — the block read 0 and its flow is gone (2026-09-30).
    { label: "Trades Signed", color: "#A78BFA", value: actions.confirmed, raw: actionsRaw },
  ];

  const usageCells: Cell[] = [
    // The counters include free and internal runs — this used to say "lifetime
    // paid x402 calls", which the file that increments them contradicts.
    { label: "Total Tool Runs",   sub: usage.ok === false ? `lower bound · ${usage.unreadable} counters unreadable` : "lifetime runs · paid, free & internal",
      color: "#4FC3F7", value: usage.totalRuns, prefix: runsFloor },
    { label: "Revenue Estimate",  sub: usage.ok === false ? "lower bound · partial read" : "estimate · runs × list price · not settled",
      color: "#34D399", value: revenue, decimals: 2, prefix: `${runsFloor}$` },
    { label: "Wallets Onboarded", sub: users.claimsOk === false ? "claim counter unreadable" : `free-credit claims · cap ${users.claimCap}`,
      color: "#A78BFA", value: users.claims, raw: claimsRaw },
  ];

  const tradeCells: Cell[] = [
    { label: "Confirmed", sub: "proven sent by the wallet", color: "#34D399", value: actions.confirmed, raw: actionsRaw },
    { label: "Base 8453", sub: "confirmed on Base", color: "#4FC3F7", value: actions.by_chain.base, raw: actionsRaw },
    { label: "Robinhood 4663", sub: "confirmed on Robinhood Chain", color: "#A78BFA", value: actions.by_chain.robinhood, raw: actionsRaw },
    { label: "Via Agents", sub: "built over MCP", color: "#FBBF24", value: actions.via_agent, raw: actionsRaw },
  ];

  const guardCells: Cell[] = [
    { label: "Median Slippage", sub: slipSub, color: "#4FC3F7",
      value: slip.median_bps === null ? undefined : slip.median_bps / 100, decimals: 2, suffix: "%", raw: slipRaw },
    { label: "Tokens Refused", sub: "impostors + measured honeypots · distinct", color: "#F87171", value: actions.blocked.tokens, raw: actionsRaw },
  ];

  const activityCells: Cell[] = [
    { label: "Active Users",  sub: "distinct wallets that spent", color: "#4FC3F7", value: users.total },
    { label: "Credits Spent", sub: "Σ debited · chat + tools",    color: "#34D399", value: credits.spent },
    { label: "Chat Messages", sub: "credited chat turns",         color: "#A78BFA", value: credits.messages },
  ];

  return (
    <div className="relative">
      {/* keyframes for ambient hero motion */}
      <style>{`
        @keyframes statsGlow { 0%,100% { opacity:.55; transform:translateY(0) } 50% { opacity:1; transform:translateY(-8px) } }
        @keyframes statsSpin { to { transform:rotate(360deg) } }
      `}</style>

      {/* Ambient glow (breathing) */}
      <div className="fixed inset-x-0 top-0 h-[600px] pointer-events-none overflow-hidden">
        <div
          style={{
            background: "radial-gradient(ellipse 70% 40% at 50% -5%, #4FC3F714 0%, transparent 70%)",
            animation: "statsGlow 7s ease-in-out infinite",
          }}
          className="absolute inset-0"
        />
      </div>

      <div className="relative">
        {/* ══ HERO ══ */}
        <section className="max-w-5xl mx-auto px-6 pt-32 pb-16 text-center">
          <Reveal>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#4FC3F730] bg-[#4FC3F708] mb-8">
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399] animate-pulse" />
              <span className="font-mono text-[11px] text-[#4FC3F7] tracking-widest">
                LIVE · ON-CHAIN VERIFIABLE · BASE
              </span>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight mb-6 leading-tight">
              Built on Base.<br />
              <span className="text-[#4FC3F7]">Proven on-chain.</span>
            </h1>
          </Reveal>

          <Reveal delay={160}>
            <p className="text-slate-400 text-lg max-w-2xl mx-auto leading-relaxed mb-12">
              Every number here is aggregate — no per-user data. A trade counts only after the
              chain proves the wallet signed it, and settlement links to Basescan.
            </p>
          </Reveal>

          <Reveal delay={240}>
            <div className="inline-grid grid-cols-3 gap-px bg-[#1A1A2E] rounded-2xl overflow-hidden border border-[#1A1A2E]">
              {heroCards.map((s) => (
                <div key={s.label} className="bg-[#0d0d12] px-6 sm:px-10 py-6 text-center transition-colors hover:bg-[#111119]">
                  <AnimatedNumber
                    value={s.value} decimals={s.decimals} prefix={s.prefix} suffix={s.suffix} raw={s.raw}
                    className="block font-mono text-2xl sm:text-3xl font-bold mb-1"
                    style={{ color: s.color }}
                  />
                  <div className="font-mono text-[10px] text-slate-600 tracking-widest">
                    {s.label.toUpperCase()}
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* AI MODEL USAGE removed 2026-09-18 — see the block comment above
            the main view for the measurement and why it is not coming back. */}

        {/* ══ ADOPTION FUNNEL ══ */}
        <section className="max-w-5xl mx-auto px-6 py-6">
          <Reveal>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-mono text-sm text-white">Adoption funnel</h2>
              <span className="font-mono text-[10px] text-slate-600">onboarded → active → traders</span>
            </div>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6">
              <Funnel
                claims={users.claimsOk === false ? null : users.claims}
                active={users.total}
                traders={actions.ok === false ? null : actions.wallets}
              />
            </div>
          </Reveal>
        </section>

        {/* ══ USAGE & CREDITS ══ */}
        <section className="max-w-5xl mx-auto px-6 py-6">
          <Reveal>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-mono text-sm text-white">Usage &amp; credits</h2>
              <span className="font-mono text-[10px] text-slate-600">aggregate · real sources</span>
            </div>
          </Reveal>
          <MetricGrid cells={usageCells} cols="grid-cols-1 sm:grid-cols-3" />
          <p className="font-mono text-[10px] text-slate-600 mt-3 leading-relaxed">
            Credits are claimed free on signup, refilled daily per connected wallet, and topped up in USDC —
            then spent per Blue Chat message. Balances are per-wallet and private; only these aggregate counts are shown.
          </p>
        </section>

        {/* ══ ACTIVITY ══ */}
        <section className="max-w-5xl mx-auto px-6 py-6">
          <Reveal>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-mono text-sm text-white">Activity</h2>
              <span className="font-mono text-[10px] text-slate-600">all-time · from on-ledger history</span>
            </div>
          </Reveal>
          <MetricGrid cells={activityCells} cols="grid-cols-3" />
          <p className="font-mono text-[10px] text-slate-600 mt-3 leading-relaxed">
            Derived from the on-ledger spend history across all wallets — aggregate counts only, no wallet
            is ever exposed. Reflects real activity to date.
          </p>
        </section>

        {/* ══ TRADES (G4, 2026-09-30) ══ — swaps, sends and bridges signed
            through Blue Agent, counted when the chain proves the wallet sent
            them. Replaces arrow figures: arrows had no traders. */}
        <section className="max-w-5xl mx-auto px-6 py-6">
          <Reveal>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-mono text-sm text-white">Trades</h2>
              <span className="font-mono text-[10px] text-slate-600">
                swap · send · bridge · {since ? `since ${since} · forward-only` : "meter starts with the first confirmed trade"}
              </span>
            </div>
          </Reveal>
          <MetricGrid cells={tradeCells} cols="grid-cols-2 lg:grid-cols-4" />
          <div className="mt-px" />
          <MetricGrid cells={guardCells} cols="grid-cols-1 sm:grid-cols-2" />
          <p className="font-mono text-[10px] text-slate-600 mt-3 leading-relaxed">
            Every trade runs a pre-trade check first. It refuses only on evidence — a token impersonating a
            registered one, a sell tax measured at 50% or more, a bridge whose measured cost is over 20% —
            and each refusal is counted once. Slippage compares what the wallet received, read from the
            receipt, with the quote it signed against. Aggregate only; no wallet is ever shown.
          </p>
        </section>

        {/* ══ ONCHAIN SETTLEMENT (Coinbase CDP) ══ */}
        <section className="max-w-5xl mx-auto px-6 py-6">
          <Reveal>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-mono text-sm text-white">Onchain settlement</h2>
              <span className="font-mono text-[10px] text-slate-600">real USDC · Coinbase CDP · Base</span>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6 transition-colors hover:border-[#0052FF40]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-2">USDC settled</p>
                  {settlement.ok ? (
                    <AnimatedNumber
                      value={settlement.usdc} decimals={2} prefix="$"
                      className="font-mono text-3xl font-bold text-[#0052FF]"
                    />
                  ) : (
                    <span className="font-mono text-3xl font-bold text-slate-600">—</span>
                  )}
                </div>
                <div>
                  <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-2">Settlements</p>
                  {settlement.ok ? (
                    <AnimatedNumber
                      value={settlement.count}
                      className="font-mono text-3xl font-bold text-[#4FC3F7]"
                    />
                  ) : (
                    <span className="font-mono text-3xl font-bold text-slate-600">—</span>
                  )}
                </div>
              </div>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed mt-4">
                Real USDC settled on Base through the Coinbase CDP x402 facilitator for paid tool
                calls. {settlement.scope} Aggregate only; no payer address is shown.
              </p>
              <a
                href={settlement.verify_url}
                target="_blank" rel="noopener noreferrer"
                className="block font-mono text-[10px] text-[#0052FF] hover:underline mt-2"
              >
                Payee&apos;s USDC history on Basescan ↗
              </a>
              {settlement.ok && settlement.lastTx && (
                <a
                  href={`https://basescan.org/tx/${settlement.lastTx}`}
                  target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] text-[#0052FF] hover:underline"
                >
                  Latest settlement on Basescan ↗
                </a>
              )}
            </div>
          </Reveal>
        </section>

        {/* ══ PRODUCT ══
            A "Staking" panel sat to the left of this one, headlining total BLUE
            locked in BlueMarketStaking. It went out with the stake surface —
            the contract is untouched on Base, but the app no longer sells a
            stake, so quoting its TVL here was advertising a retired product. */}
        <section className="max-w-5xl mx-auto px-6 py-6">
          <Reveal>
            <div className="h-full rounded-2xl border border-[#1A1A2E] bg-[#0a0a0f] p-6 transition-colors hover:border-[#4FC3F730]">
              <p className="font-mono text-[10px] text-slate-600 tracking-widest uppercase mb-3">Product surface</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <AnimatedNumber value={product.tools} className="block font-mono text-3xl font-bold text-[#4FC3F7]" />
                  <div className="font-mono text-[10px] text-slate-600 mt-1">x402 TOOLS</div>
                </div>
                <div>
                  <AnimatedNumber value={product.commands} className="block font-mono text-3xl font-bold text-[#A78BFA]" />
                  <div className="font-mono text-[10px] text-slate-600 mt-1">CORE COMMANDS</div>
                </div>
              </div>
              <p className="font-mono text-[11px] text-slate-500 leading-relaxed mt-4">
                Pay-per-use AI tools + the idea → build → audit → ship → raise workflow,
                MCP-native for Claude, Cursor & Claude Code.
              </p>
              <Link href="/hub" className="font-mono text-[10px] text-[#4FC3F7] hover:underline">
                Explore the Hub ↗
              </Link>
            </div>
          </Reveal>
        </section>

        {/* ══ TOP TOOLS BY RUNS ══ */}
        {usage.topTools.length > 0 && (
          <section className="max-w-5xl mx-auto px-6 py-10">
            <Reveal>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-mono text-sm text-white">Most-used tools</h2>
                <span className="font-mono text-[10px] text-slate-600">by lifetime runs</span>
              </div>
            </Reveal>
            <ToolBars tools={usage.topTools} />
          </section>
        )}

        {/* ══ TRUST STRIP ══ */}
        <section className="max-w-5xl mx-auto px-6 py-10">
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[10px] text-slate-600">
            <span>◆ on-chain verifiable</span>
            <span>◆ non-custodial</span>
            <span>◆ Base native (8453)</span>
            <span>◆ aggregate only — no per-user data</span>
          </div>
          <p className="text-center font-mono text-[9px] text-slate-700 mt-4">
            Updated {new Date(stats.updatedAt).toISOString().replace("T", " ").slice(0, 16)} UTC · refreshes every 60s
          </p>
          <p className="text-center font-mono text-[10px] text-slate-500 mt-6">
            {ARROWS_FROZEN ? (
              <>
                Blue Hood stopped publishing arrows on {ARROWS_FROZEN_SINCE}.{" "}
                <Link href="/track" className="text-[#4FC3F7] hover:underline">
                  The arrow record stays public, as history →
                </Link>
              </>
            ) : (
              <>
                Want the signal receipts?{" "}
                <Link href="/track" className="text-[#4FC3F7] hover:underline">
                  Blue Hood public track record →
                </Link>
              </>
            )}
          </p>
        </section>
      </div>
    </div>
  );
}
