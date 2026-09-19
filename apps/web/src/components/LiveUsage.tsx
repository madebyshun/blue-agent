"use client";

import { useEffect, useState } from "react";

/**
 * LiveUsage — Halo-style aggregate usage counter for the landing §04.
 *
 * Shows the REAL totals from /api/stats/public (buildPublicStats). No number is
 * ever fabricated — the same no-zero doctrine the stats module enforces:
 *
 *   • credits.messages — chat messages routed through the two inference nets
 *     (Virtuals + Venice). credits.* carries NO `ok` flag: on a source failure
 *     it degrades silently to 0, so a 0 is indistinguishable from an outage.
 *     Any non-positive / absent value therefore renders "—", never "0".
 *
 *   • usage.totalRuns — Σ paid Hub tool runs. Carries `usage.ok`; when false the
 *     sum dropped an unreadable counter and is a LOWER BOUND, so we prefix "≥".
 *     Non-positive / absent → "—".
 *
 * The landing is a client component, so this fetches client-side. Until the
 * request lands (or if it fails), both values stay "—".
 */

type Stats = {
  usage?: { totalRuns?: number; ok?: boolean };
  credits?: { messages?: number };
};

const fmt = (n: number) => n.toLocaleString("en-US");

export default function LiveUsage() {
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

  // messages — no ok flag ⟹ any non-positive/absent value renders "—", never 0.
  const rawMsgs = stats?.credits?.messages;
  const messages =
    !failed && typeof rawMsgs === "number" && rawMsgs > 0 ? fmt(rawMsgs) : "—";

  // runs — usage.ok:false ⟹ lower bound ("≥"); non-positive/absent ⟹ "—".
  const rawRuns = stats?.usage?.totalRuns;
  const runsOk = stats?.usage?.ok !== false;
  const runs =
    !failed && typeof rawRuns === "number" && rawRuns > 0
      ? (runsOk ? "" : "≥ ") + fmt(rawRuns)
      : "—";

  const items = [
    { value: messages, label: "messages routed through Virtuals + Venice" },
    { value: runs, label: "paid tool runs settled on the Hub" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      {items.map((it) => (
        <div key={it.label} className="ba-card rounded-2xl p-6 sm:p-7 flex flex-col items-center text-center">
          <div className="text-4xl sm:text-5xl font-bold tracking-tight tabular-nums ln-accent">
            {it.value}
          </div>
          <div className="font-mono text-[11.5px] ln-mut mt-2 leading-snug max-w-[24ch]">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}
