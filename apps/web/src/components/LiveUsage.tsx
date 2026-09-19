"use client";

import { useEffect, useState } from "react";
import { TOOL_COUNT } from "@/lib/agent-tools";

/**
 * LiveUsage — Halo-style headline stat for the landing §04.
 *
 * ONE hero number (all-time paid AI tool runs the inference layer has served)
 * over a row of real sub-stats. No number is fabricated — same no-zero doctrine
 * the stats module (buildPublicStats) enforces:
 *
 *   • usage.totalRuns carries usage.ok — the real all-time count of paid x402
 *     tool runs settled in USDC on Base. This is the hero because it is a live,
 *     populated total; unreadable / non-positive / absent renders "—".
 *   • tokens.total carries tokens.ok. Forward-only meter (starts at deploy,
 *     never backfilled) counting only the non-streaming inference path, so it is
 *     an honest lower bound that reads 0 until the recorder is live. Shown as a
 *     sub-stat ONLY once it is genuinely > 0 — never featured as a weak zero,
 *     and it auto-appears post-deploy once real traffic accrues.
 *   • Models and Hub skills are compile-time constants (MODELS length, passed in
 *     as `models`; TOOL_COUNT) — always real, never "—".
 *
 * The landing is a client component, so this fetches client-side. Until the
 * request lands (or if it fails), the hero stays "—".
 */

type Stats = {
  tokens?: { total?: number; ok?: boolean };
  usage?: { totalRuns?: number; ok?: boolean };
};

const fmt = (n: number) => n.toLocaleString("en-US");
const compact = (n: number) =>
  Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export default function LiveUsage({ models }: { models?: number }) {
  const [stats, setStats] = useState<Stats | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/stats/public")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => { if (alive) setStats(d); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  // Hero — paid AI tool runs, the real all-time total (x402 settlements),
  // ok-gated: unreadable / non-positive / absent → "—".
  const rawRuns = stats?.usage?.totalRuns;
  const runsOk = stats?.usage?.ok !== false;
  const runs =
    !failed && runsOk && typeof rawRuns === "number" && rawRuns > 0 ? fmt(rawRuns) : "—";

  // tokens — forward-only, ok-gated. Honest lower bound that reads 0 until the
  // recorder is live, so it joins the sub-stats ONLY when genuinely > 0 (never a
  // weak zero); it auto-appears once real inference traffic accrues post-deploy.
  const rawTokens = stats?.tokens?.total;
  const tokensOk = stats?.tokens?.ok !== false;
  const tokensLive =
    !failed && tokensOk && typeof rawTokens === "number" && rawTokens > 0 ? compact(rawTokens) : null;

  // Two constants (always real) + the tokens meter once it's non-zero. Never a
  // fabricated zero.
  const subs: { label: string; value: string }[] = [
    { label: "Models", value: models ? String(models) : "—" },
    { label: "Hub skills", value: String(TOOL_COUNT) },
    ...(tokensLive ? [{ label: "Tokens served", value: tokensLive }] : []),
  ];

  return (
    <div className="ba-card ba-card--hot rounded-2xl px-6 py-10 sm:px-10 sm:py-12 text-center">
      <div className="font-mono text-[10.5px] tracking-[0.26em] uppercase ln-faint mb-4">
        All-time AI tool runs
      </div>
      <div className="text-5xl sm:text-7xl font-bold tracking-tight tabular-nums ln-accent leading-none">
        {runs}
      </div>
      <div className="font-mono text-[11.5px] ln-mut mt-4">
        paid x402 calls · settled in USDC on Base
      </div>

      <div
        className={
          "mt-9 grid gap-3 sm:gap-4 max-w-lg mx-auto border-t ln-divide pt-7 " +
          (subs.length === 3 ? "grid-cols-3" : "grid-cols-2")
        }
      >
        {subs.map((s) => (
          <div key={s.label}>
            <div className="text-2xl sm:text-3xl font-bold tabular-nums ln-h leading-none">{s.value}</div>
            <div className="font-mono text-[10px] sm:text-[10.5px] tracking-wider uppercase ln-faint mt-2">
              {s.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
