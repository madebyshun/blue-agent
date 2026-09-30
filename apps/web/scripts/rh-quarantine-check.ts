/**
 * rh-quarantine-check — the Robinhood desk quarantine (F6, 2026-09-30;
 * lib/blue-hood/quarantine.ts) holds on every door that PUBLISHES the desk.
 *
 *   §1  every file under src/ that reads `KV_SNAPSHOT_LATEST` either publishes
 *       through the quarantine or is a non-publishing reader whose property
 *       is asserted here (not merely listed)
 *   §2  the test-only lift is never reachable from src/
 *   §3  the real handlers, on a fabricated KV: RH drift / DEX price / verdict
 *       withheld with the reason, the oracle and liquidity kept, the Base desk
 *       untouched, the cross-venue spread refused by name
 *   §4  lifting it (tests only) brings the numbers back — the quarantine is
 *       the ONLY thing withholding them
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}

import fs from "node:fs";
import path from "node:path";
import { kvSet } from "../src/lib/kv";
import { KV_SNAPSHOT_LATEST, KV_BASE_ROWS_LATEST } from "../src/lib/blue-hood/kv-keys";
import { RH_DESK_QUARANTINE, withQuarantineLiftedForTest } from "../src/lib/blue-hood/quarantine";
import type { TickerSnapshot } from "../src/lib/blue-hood/types";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const WEB = path.resolve(__dirname, "..");
const SRC = path.join(WEB, "src");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}
const rel = (p: string) => path.relative(WEB, p).split(path.sep).join("/");
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Readers that do not publish desk rows — each with the property that makes
 *  that true, CHECKED below. Being listed is not the exemption; passing is. */
const NON_PUBLISHING: Record<string, { why: string; holds: (src: string) => boolean }> = {
  "src/lib/blue-hood/kv-keys.ts": {
    why: "defines the key",
    holds: (s) => /export const KV_SNAPSHOT_LATEST\s*=/.test(s),
  },
  "src/lib/blue-hood/poller.ts": {
    why: "the recorder — keeps raw rows so the archive can be re-derived after the fix",
    holds: (s) => !/export\s+async\s+function\s+(GET|POST)\b/.test(s),
  },
  "src/lib/blue-hood/health.ts": {
    why: "reads cycle timestamps for the health probe, never a price",
    holds: (s) => !/\b(drift_pct|dex_usd)\b/.test(code(s)),
  },
  "src/app/api/cron/blue-hood/sparkline-refresh/route.ts": {
    why: "cron-only cache warmer; answers with ticker names, never a drift",
    holds: (s) => /CRON_SECRET/.test(s) && !/\bdrift_pct\b/.test(code(s)),
  },
};

(async () => {
  console.log("\n1. every reader of the RH desk snapshot publishes through the quarantine");
  // Code, not prose: a comment that NAMES the key (e.g. "not KV_SNAPSHOT_LATEST")
  // is not a reader.
  const readers = walk(SRC).filter((f) => code(fs.readFileSync(f, "utf8")).includes("KV_SNAPSHOT_LATEST"));
  ok(`found the readers (${readers.length})`, readers.length >= 8, readers.map(rel).join(", "));
  for (const f of readers) {
    const r = rel(f);
    const src = fs.readFileSync(f, "utf8");
    const exempt = NON_PUBLISHING[r];
    if (exempt) {
      ok(`${r}: non-publishing (${exempt.why}) — and the property holds`, exempt.holds(src));
      continue;
    }
    ok(`${r}: imports the quarantine and publishes rows through it`,
      /from "@\/lib\/blue-hood\/quarantine"/.test(src) && /\bpublishDeskRows?\(/.test(code(src)));
  }
  for (const listed of Object.keys(NON_PUBLISHING)) {
    ok(`exemption ${listed} still points at a real reader (no stale entry)`, readers.map(rel).includes(listed));
  }

  console.log("\n2. the lift is test-only");
  const lifters = walk(SRC).filter((f) => rel(f) !== "src/lib/blue-hood/quarantine.ts" && fs.readFileSync(f, "utf8").includes("withQuarantineLiftedForTest"));
  ok("nothing under src/ can lift the quarantine", lifters.length === 0, lifters.map(rel).join(", "));
  ok("the quarantine is not an env switch", !/process\.env/.test(code(fs.readFileSync(path.join(SRC, "lib/blue-hood/quarantine.ts"), "utf8"))));

  console.log("\n3. the real handlers");
  const at = new Date(Math.floor(Date.now() / 1000) * 1000 - 30_000).toISOString();
  const row = (over: Partial<TickerSnapshot>): TickerSnapshot => ({
    ticker: "NVDA", name: "NVIDIA", contract: "0x0000000000000000000000000000000000000001",
    verdict: "LONG_DEX", oracle_usd: 230.55, dex_usd: 237.7, tvl_usd: 5_000_000, total_tvl_usd: 6_000_000,
    volume_24h_usd: 900_000, drift_pct: 3.1, pool_ref: "0xpool", is_v4_pool_id: true,
    market: { is_open: false, session: "afterhours", ny_time_iso: at }, warnings: [],
    polled_at_ms: 1000, data_age_s: 5, sparkline: null, no_data_reason: null, ...over,
  });
  await kvSet(KV_SNAPSHOT_LATEST, {
    cycle_id: 1, started_at: at, finished_at: at, duration_ms: 1000,
    tickers: [row({ chain: "robinhood" })],
    metrics: { registry_total: 1, tokens_watched: 1, tokens_errored: 0, tvl_scanned_usd: 0, market_is_open: false, market_session: "afterhours" },
  });
  await kvSet(KV_BASE_ROWS_LATEST, {
    started_at: at,
    rows: [row({ chain: "base", contract: "0xb20000000000000000000078ee7ce2fe4908108c", dex_usd: 231.47, drift_pct: 0.4, verdict: "ALIGNED" })],
  });

  const snapRoute = await import("../src/app/api/hood/snapshot/route");
  const snap = (await (await snapRoute.GET()).json()) as { snapshot: { tickers: (TickerSnapshot & { provenance?: string; provenance_note?: string })[] }; rh_desk?: { provenance?: string } };
  const rhRow = snap.snapshot.tickers.find((t) => t.chain === "robinhood");
  const baseRow = snap.snapshot.tickers.find((t) => t.chain === "base");
  ok("/api/hood/snapshot: RH row → drift, DEX price and verdict withheld, marked quarantined with the note",
    rhRow?.drift_pct === null && rhRow?.dex_usd === null && rhRow?.verdict === "INSUFFICIENT_DATA" && rhRow?.provenance === "quarantined" && rhRow?.provenance_note === RH_DESK_QUARANTINE.note,
    JSON.stringify(rhRow && { d: rhRow.drift_pct, x: rhRow.dex_usd, v: rhRow.verdict, p: rhRow.provenance }));
  ok("…the facts that were read stay: Chainlink price, liquidity, volume", rhRow?.oracle_usd === 230.55 && rhRow?.total_tvl_usd === 6_000_000 && rhRow?.volume_24h_usd === 900_000);
  ok("…the Base row is untouched and marked measured", baseRow?.drift_pct === 0.4 && baseRow?.dex_usd === 231.47 && baseRow?.provenance === "measured");
  ok("…the response says the RH desk is quarantined", snap.rh_desk?.provenance === "quarantined");

  const dis = await import("../src/app/api/hood/dislocation/route");
  let body = (await (await dis.GET(new Request("https://blueagent.dev/api/hood/dislocation?ticker=NVDA&chain=robinhood"))).json()) as Record<string, unknown>;
  ok("/api/hood/dislocation (robinhood): drift and DEX price null, beyond_threshold null (not false), reason attached",
    body.drift_pct === null && body.dex_price_usd === null && body.beyond_threshold === null && body.provenance === "quarantined" && typeof body.provenance_note === "string" && body.oracle_price_usd === 230.55,
    JSON.stringify({ d: body.drift_pct, x: body.dex_price_usd, b: body.beyond_threshold, p: body.provenance }));
  body = (await (await dis.GET(new Request("https://blueagent.dev/api/hood/dislocation?ticker=NVDA&chain=base"))).json()) as Record<string, unknown>;
  ok("/api/hood/dislocation (base): measured, drift intact", body.drift_pct === 0.4 && body.provenance === "measured");

  const spread = await import("../src/app/api/hood/dislocation/spread/route");
  body = (await (await spread.GET(new Request("https://blueagent.dev/api/hood/dislocation/spread?ticker=NVDA"))).json()) as Record<string, unknown>;
  const venues = body.venues as Record<string, Record<string, unknown>>;
  ok("/api/hood/dislocation/spread: spread refused BY NAME (quarantined), with the note",
    body.spread_pct === null && body.spread_unavailable_reason === "quarantined" && body.spread_unavailable_note === RH_DESK_QUARANTINE.note,
    JSON.stringify({ s: body.spread_pct, r: body.spread_unavailable_reason }));
  ok("…the RH venue block withholds its drift; the Base block keeps it",
    venues.robinhood?.drift_pct === null && venues.robinhood?.provenance === "quarantined" && venues.base?.drift_pct === 0.4);

  const { HANDLERS } = await import("../src/app/api/x402/_handlers/index");
  const live = (await (await HANDLERS["hood-live"](new Request("https://blueagent.dev/api/x402/hood-live", { method: "POST", body: "{}" }))).json()) as { rows?: Record<string, unknown>[] };
  const liveRh = live.rows?.find((r) => r.chain === "robinhood");
  ok("x402 hood-live (paid): RH row quarantined, drift null", liveRh?.provenance === "quarantined" && liveRh?.drift_pct === null && liveRh?.dex_usd === null, JSON.stringify(liveRh && { p: liveRh.provenance, d: liveRh.drift_pct }));

  const acp = await import("../src/app/api/acp/drift/route");
  const acpBody = (await (await acp.GET(new Request("https://blueagent.dev/api/acp/drift", { headers: { "x-forwarded-for": "203.0.113.9" } }))).json()) as Record<string, unknown>;
  const acpText = JSON.stringify(acpBody);
  ok("/api/acp/drift (sold to agents): RH rows quarantined, no RH drift number on the wire",
    acpText.includes('"provenance":"quarantined"') && !acpText.includes('"drift_pct":3.1'), acpText.slice(0, 200));

  const tg = fs.readFileSync(path.join(SRC, "app/api/telegram/webhook/route.ts"), "utf8");
  ok("Telegram /drift answers through the quarantine (source)", /const row = publishDeskRow\(found\)/.test(tg) && /withheld/.test(tg));

  console.log("\n4. lifting it is the only thing that brings the numbers back");
  await withQuarantineLiftedForTest(async () => {
    const b = (await (await dis.GET(new Request("https://blueagent.dev/api/hood/dislocation?ticker=NVDA&chain=robinhood"))).json()) as Record<string, unknown>;
    ok("with the quarantine lifted (test only), the RH drift is served again", b.drift_pct === 3.1 && b.provenance === "measured", JSON.stringify({ d: b.drift_pct, p: b.provenance }));
  });

  console.log(failures === 0 ? "\nrh-quarantine-check: PASS" : `\nrh-quarantine-check: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
