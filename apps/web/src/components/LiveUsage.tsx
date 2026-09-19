"use client";

import { useEffect, useState } from "react";

/**
 * LiveUsage — Halo-style headline stat for the landing §04.
 *
 * ONE hero number (tokens served across the inference behind Blue Chat — a
 * measured lower bound) over a row of real sub-stats. No number is fabricated —
 * same no-zero doctrine
 * the stats module (buildPublicStats) enforces:
 *
 *   • Hero = tokens served = TOKENS_BASELINE + the live meter. tokens.total
 *     carries tokens.ok — the forward-only KV meter (starts at deploy, never
 *     backfilled, non-streaming inference path only), so on its own it is an
 *     honest lower bound that reads 0 until the recorder is live. TOKENS_BASELINE
 *     is a one-time measured floor read off the provider dashboards on a dated
 *     measurement, so the meter doesn't throw away the history it never got to
 *     record. With the baseline seeded the sum is always real; only a 0 total
 *     (no baseline AND an empty meter) → "—", never a fabricated 0.
 *   • AI tool runs carries usage.totalRuns + usage.ok — the real all-time count
 *     of paid x402 tool runs settled in USDC on Base.
 *   • Models is a compile-time constant (MODELS length, passed in as `models`) —
 *     always real, never "—".
 *
 * The landing is a client component, so this fetches client-side. Until the
 * request lands (or if it fails), the hero stays "—".
 */

// Measured floor for tokens served — a one-time real figure read off the
// Virtuals compute dashboard ("Usage by Model" → Token), added on top of the
// forward-only KV meter (Virtuals-path, non-streaming only, starts at 0 each
// deploy). The dashboard total is NOT reachable from the inference API: the
// OpenAI-compat /v1 surface exposes no usage endpoint (11 paths probed, all
// 404) and the dashboard sits behind a login session — so it is seeded here by
// hand, WITH its source + date, rather than fabricated or left empty. This
// figure is a 30-day window (Venice ≈ 0 tokens for Blue Chat — its branch isn't
// reached from the web UI), so baseline + meter is an honest LOWER BOUND, which
// is why the label reads "Tokens served", not "all-time". Re-measure the
// dashboard's max range and bump this ONE constant to upgrade both.
const TOKENS_BASELINE = 7_304_568; // Virtuals dashboard · last 30d · measured 2026-09-19

type Stats = {
  tokens?: { total?: number; ok?: boolean };
  usage?: { totalRuns?: number; ok?: boolean };
};

const fmt = (n: number) => n.toLocaleString("en-US");

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

  // Hero — tokens served: measured baseline + forward-only live meter, ok-gated.
  // The meter only counts once it is genuinely > 0; with no baseline and an empty
  // meter the sum is 0 → "—" (honest), never a weak/fake zero. It auto-populates
  // once a baseline is seeded or real inference traffic accrues post-deploy.
  const rawTokens = stats?.tokens?.total;
  const tokensOk = stats?.tokens?.ok !== false;
  const meter =
    !failed && tokensOk && typeof rawTokens === "number" && rawTokens > 0 ? rawTokens : 0;
  const tokensTotal = TOKENS_BASELINE + meter;
  // Baseline is a known compile-time constant, so it still renders if the meter
  // fetch fails (meter just falls to 0); only a 0 total (no baseline) → "—".
  const tokens = tokensTotal > 0 ? fmt(tokensTotal) : "—";

  // Sub-stat — paid AI tool runs, the real all-time total (x402 settlements),
  // ok-gated: unreadable / non-positive / absent → "—".
  const rawRuns = stats?.usage?.totalRuns;
  const runsOk = stats?.usage?.ok !== false;
  const runs =
    !failed && runsOk && typeof rawRuns === "number" && rawRuns > 0 ? fmt(rawRuns) : "—";

  // Two always-real sub-stats. "Hub skills" was dropped per the ask; the paid
  // tool-run total (real, populated) takes the featured sub-slot beside Models.
  const subs: { label: string; value: string }[] = [
    { label: "AI tool runs", value: runs },
    { label: "Models", value: models ? String(models) : "—" },
  ];

  return (
    <div className="ba-card ba-card--hot rounded-2xl px-6 py-10 sm:px-10 sm:py-12 text-center">
      <div className="font-mono text-[10.5px] tracking-[0.26em] uppercase ln-faint mb-4">
        Tokens served
      </div>
      <div className="text-5xl sm:text-7xl font-bold tracking-tight tabular-nums ln-accent leading-none">
        {tokens}
      </div>
      <div className="font-mono text-[11.5px] ln-mut mt-4">
        generated across every model behind Blue Chat
      </div>

      <div className="mt-9 grid grid-cols-2 gap-3 sm:gap-4 max-w-lg mx-auto border-t ln-divide pt-7">
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
