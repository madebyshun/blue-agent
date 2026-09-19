"use client";

import { useEffect, useState } from "react";

/**
 * LiveUsage — Halo-style single aggregate counter for the landing §04.
 *
 * Shows ONE real number: total LLM tokens served through the inference nets,
 * from /api/stats/public (buildPublicStats → `tokens`). No number is ever
 * fabricated — same no-zero doctrine the stats module enforces:
 *
 *   • tokens.total carries `tokens.ok`. It is a FORWARD-ONLY meter (starts at
 *     deploy, never backfilled) and counts only the non-streaming inference
 *     path, so even when ok it is an honest lower bound — never an invention.
 *     When ok is false the source was unreadable; a non-positive / absent /
 *     unreadable value renders "—", never "0".
 *
 * The landing is a client component, so this fetches client-side. Until the
 * request lands (or if it fails), the value stays "—".
 */

type Stats = {
  tokens?: { total?: number; ok?: boolean };
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

  // tokens — forward-only, ok-gated: unreadable / non-positive / absent → "—".
  const raw = stats?.tokens?.total;
  const ok = stats?.tokens?.ok !== false;
  const tokens =
    !failed && ok && typeof raw === "number" && raw > 0 ? fmt(raw) : "—";

  return (
    <div className="ba-card rounded-2xl p-8 sm:p-10 flex flex-col items-center text-center max-w-md mx-auto">
      <div className="text-5xl sm:text-6xl font-bold tracking-tight tabular-nums ln-accent">
        {tokens}
      </div>
      <div className="font-mono text-[11.5px] ln-mut mt-3 leading-snug max-w-[30ch]">
        tokens served through Virtuals + Venice inference
      </div>
    </div>
  );
}
