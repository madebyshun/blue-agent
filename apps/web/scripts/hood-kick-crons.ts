/**
 * Blue Hood — kick crons manually (dev helper).
 *
 * On production, `vercel.json` schedules `/api/cron/blue-hood/poll`
 * (every 2 min) and `/api/cron/blue-hood/sparkline-refresh` (every 15
 * min) automatically. On localhost + preview URLs Vercel Cron does NOT
 * fire, so the sparkline cache stays empty and the drift board's 24h
 * column shows em-dash forever.
 *
 * Usage:
 *   cd apps/web && npm run hood:kick-crons
 *
 * Env:
 *   • CRON_SECRET (from .env.local, auto-loaded) — auth for both endpoints
 *   • BH_KICK_TARGET (default http://localhost:3005) — override for preview URLs
 */
import fs from "fs";
import path from "path";

// Load .env.local without pulling in dotenv (same pattern as blue-hood-smoke).
(function loadEnvLocal() {
  try {
    const p = path.resolve(__dirname, "../.env.local");
    if (!fs.existsSync(p)) return;
    const raw = fs.readFileSync(p, "utf8");
    for (const line of raw.split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const eq = s.indexOf("=");
      if (eq < 0) continue;
      const key = s.slice(0, eq).trim();
      let value = s.slice(eq + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* keep going */ }
})();

const TARGET = (process.env.BH_KICK_TARGET ?? "http://localhost:3005").replace(/\/+$/, "");
const SECRET = process.env.CRON_SECRET ?? "";

if (!SECRET) {
  console.error("CRON_SECRET missing from apps/web/.env.local — cannot auth cron endpoints.");
  process.exit(2);
}

async function kick(name: string, path: string) {
  const url = `${TARGET}${path}`;
  const t0 = Date.now();
  console.log(`▸ ${name} · POST ${url}`);
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${SECRET}` },
      signal: AbortSignal.timeout(240_000),
    });
    const elapsed = Math.round((Date.now() - t0) / 1000);
    const body = await r.text();
    let json: Record<string, unknown> | null = null;
    try { json = JSON.parse(body); } catch { /* non-JSON */ }
    if (!r.ok) {
      console.error(`  ✗ HTTP ${r.status} · ${elapsed}s · ${body.slice(0, 200)}`);
      return false;
    }
    // Compact summary — only the useful fields.
    const summary: string[] = [];
    if (json?.duration_ms !== undefined) summary.push(`${json.duration_ms}ms`);
    if (json?.tokens_watched !== undefined) summary.push(`watched=${json.tokens_watched}`);
    if (json?.tokens_errored !== undefined) summary.push(`errored=${json.tokens_errored}`);
    if (json?.refreshed !== undefined) summary.push(`refreshed=${json.refreshed}`);
    if (json?.detail_warm) {
      const dw = json.detail_warm as { tradable?: number; refreshed?: number; errored?: number };
      summary.push(`detail_warm=${dw.refreshed}/${dw.tradable}`);
    }
    if (json?.engine) {
      const e = json.engine as { fired?: number; deduped?: number; skipped_dust?: number };
      summary.push(`engine{fired=${e.fired ?? 0} deduped=${e.deduped ?? 0} dust=${e.skipped_dust ?? 0}}`);
    }
    console.log(`  ✓ ${elapsed}s · ${summary.join(" · ") || "ok"}`);
    return true;
  } catch (e) {
    const elapsed = Math.round((Date.now() - t0) / 1000);
    console.error(`  ✗ ${elapsed}s · ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  console.log(`Target: ${TARGET}`);
  console.log(`(each cron staggers ~72s over 24 tokens — be patient)\n`);
  const spark = await kick("sparkline-refresh", "/api/cron/blue-hood/sparkline-refresh");
  const poll = await kick("poll (+ engine + grader)", "/api/cron/blue-hood/poll");
  console.log("");
  if (spark && poll) {
    console.log("Done. /hood should now show sparkline candles + live snapshot.");
    process.exit(0);
  } else {
    console.error("At least one cron failed — see above for status.");
    process.exit(1);
  }
}

main();
