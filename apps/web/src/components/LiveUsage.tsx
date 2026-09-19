"use client";

import { useEffect, useState } from "react";
import { TOOL_COUNT } from "@/lib/agent-tools";

/**
 * LiveUsage — Halo-style headline stat for the landing §04.
 *
 * ONE hero number (all-time LLM tokens served through the inference nets) over a
 * row of real sub-stats. No number is fabricated — same no-zero doctrine the
 * stats module (buildPublicStats) enforces:
 *
 *   • tokens.total carries tokens.ok. Forward-only meter (starts at deploy,
 *     never backfilled) counting only the non-streaming inference path, so even
 *     when ok it is an honest lower bound. Unreadable / non-positive / absent
 *     renders "—", never "0".
 *   • usage.totalRuns carries usage.ok; unreadable / non-positive → "—".
 *   • Models and Hub skills are compile-time constants (MODELS length, passed in
 *     as `models`; TOOL_COUNT) — always real, never "—".
 *
 * The landing is a client component, so this fetches client-side. Until the
 * request lands (or if it fails), the live values stay "—".
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

  // tokens — forward-only, ok-gated: unreadable / non-positive / absent → "—".
  const rawTokens = stats?.tokens?.total;
  const tokensOk = stats?.tokens?.ok !== false;
  const tokens =
    !failed && tokensOk && typeof rawTokens === "number" && rawTokens > 0 ? fmt(rawTokens) : "—";

  // paid tool runs — same ok-gate; compact so a large lifetime count stays legible.
  const rawRuns = stats?.usage?.totalRuns;
  const runsOk = stats?.usage?.ok !== false;
  const runs =
    !failed && runsOk && typeof rawRuns === "number" && rawRuns > 0 ? compact(rawRuns) : "—";

  // Two constants (always real) + one live meter. Never a fabricated zero.
  const subs: { label: string; value: string }[] = [
    { label: "Models", value: models ? String(models) : "—" },
    { label: "Hub skills", value: String(TOOL_COUNT) },
    { label: "Paid tool runs", value: runs },
  ];

  return (
    <div className="ba-card ba-card--hot rounded-2xl px-6 py-10 sm:px-10 sm:py-12 text-center">
      <div className="font-mono text-[10.5px] tracking-[0.26em] uppercase ln-faint mb-4">
        All-time tokens served
      </div>
      <div className="text-5xl sm:text-7xl font-bold tracking-tight tabular-nums ln-accent leading-none">
        {tokens}
      </div>
      <div className="font-mono text-[11.5px] ln-mut mt-4">
        through Virtuals + Venice inference
      </div>

      <div className="mt-9 grid grid-cols-3 gap-3 sm:gap-4 max-w-lg mx-auto border-t ln-divide pt-7">
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
