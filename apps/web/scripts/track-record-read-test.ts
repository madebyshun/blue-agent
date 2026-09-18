/**
 * The public track record — an outage is not an empty receipt book.
 *
 * Run: `npx tsx scripts/track-record-read-test.ts` from `apps/web/`.
 * Also runs automatically under `npm test` (opt-out discovery in run-tests.ts).
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `/track` and `/api/acp/track-record` both called `getPublicTrackRecord`, which
 * called `readPublicArrows` — documented in its own header as the #150 group-B
 * gap: it returns `[]` when KV is unreachable. Fed through
 * `buildPublicTrackRecord`, `[]` becomes a complete, confident, well-formed
 * track record asserting `arrows: []`, `total_graded: 0`, `hit_rate {ready:false,
 * graded:0}` — i.e. BLUE HOOD HAS NEVER FIRED AN ARROW — on the one page whose
 * entire purpose is to prove that it has, and in the one machine-readable
 * contract an agent is asked to trust.
 *
 * It was already visible as a self-contradiction on a single screen: `/track`
 * also reads `readCohortAnalysis`, which was made probe-shaped by #263, so
 * during an outage the evidence panel rendered "couldn't read the arrow feed"
 * directly above a receipts table rendering an empty record as fact. The two
 * halves disagreed and the lying half was the half the page exists for.
 *
 * ═══ HOW TO READ A CASE ═══
 *
 * Same TRIPLE discipline as `cohort-read-test.ts`, all three legs load-bearing:
 *   ·A CONTROL — the OLD call shape, reimplemented inline, asserted to LIE. If
 *                this ever stops lying, the fix below protects nothing
 *                measurable and these tests are theatre.
 *   ·B FIX     — the REAL `getPublicTrackRecordProbe`, identical fault,
 *                asserted to return `unavailable` and NO record.
 *   ·C HAPPY   — a healthy feed, asserted to actually produce the receipts.
 *                Without it, "always answer unavailable" would pass A and B
 *                forever while taking the proof page permanently dark.
 *
 * Group R does the same at the ROUTE level (status code + cache header), group
 * W pins the truncation flags in BOTH directions, and group S is static: it
 * guards the two things a runtime check cannot see — that the lying shape is
 * gone from the codebase entirely, and that the "every graded arrow · forever"
 * label can never be reinstated unconditionally.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { kv, kvSet, kvDel } from "../src/lib/kv";
import { KV_ARROW_HYDRATED, ARROW_HYDRATED_MAX } from "../src/lib/blue-hood/kv-keys";
import { HYDRATED_VERSION, type HydratedFeed } from "../src/lib/blue-hood/arrow-cache";
import { readPublicArrows } from "../src/lib/blue-hood/public-feed";
import {
  buildPublicTrackRecord,
  getPublicTrackRecordProbe,
  TRACK_RECORD_MAX_LIMIT,
} from "../src/lib/blue-hood/track-record-public";
// The REAL route: group R asserts a response STATUS and HEADER, which no
// library function underneath can tell you anything about.
import * as trackRecordRoute from "../src/app/api/acp/track-record/route";
import type { Arrow, ArrowType, MarketSession } from "../src/lib/blue-hood/types";

let failures = 0;
function check(label: string, pass: boolean, detail: string) {
  console.log(`${pass ? "  ✓" : "  ✗"} ${label} — ${detail}`);
  if (!pass) failures++;
}

/** Swap in a `kv.get` that throws; always restore. Mirrors the Upstash cap
 *  outages (#123, #148), where reads are throttled but the database is alive. */
async function withReadFailure<T>(fn: () => Promise<T>): Promise<T> {
  const real = kv.get.bind(kv);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (kv as any).get = async () => {
    throw new Error("max requests limit exceeded");
  };
  try {
    return await fn();
  } finally {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (kv as any).get = real;
  }
}

/**
 * Strip comments before a static source assertion.
 *
 * Group S searches for `getPublicTrackRecord` and for the words this page must
 * not hardcode — and the surviving files EXPLAIN the bug using those exact
 * strings. A check that cannot tell prose from code reports the fix as the bug
 * and trains the next person to delete the explanation. `//` is only a line
 * comment when not preceded by `:`, so a `https://` in a string survives.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Strip ONLY block comments — for TrackView.tsx specifically.
 *
 * That file's section labels are string literals that begin with `//` (a house
 * style: `"// every graded arrow · forever · misses included"` renders as the
 * grey `// caption` above each block). The generic stripper above treats that
 * as a line comment and deletes the exact copy group S is auditing, which is
 * how S-5 first failed: the guard reported the phrase as absent while it was
 * rendering on the page. A checker that cannot tell a caption from a comment
 * reports the opposite of the truth.
 */
function stripBlockComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "");
}

const SRC = path.resolve(path.dirname(path.resolve(process.argv[1])), "..", "src");
const readSrc = (rel: string) => stripComments(readFileSync(path.join(SRC, rel), "utf8"));

// ── Fixtures ────────────────────────────────────────────────────────────────
//
// Anchored to the REAL clock, not a frozen constant: the gate counts arrows
// graded inside a rolling 7 days (`HIT_RATE_WINDOW_MS`) and
// `getPublicTrackRecordProbe` builds with `Date.now()`. A fixed NOW would make
// this suite pass today and silently stop exercising the gate next week.
const NOW = Date.now();
const SESSIONS: MarketSession[] = ["regular", "premarket", "afterhours", "weekend"];

function makeArrow(i: number, hit: boolean): Arrow {
  const type: ArrowType = i % 2 === 0 ? "drift" : "arb";
  const session = SESSIONS[i % SESSIONS.length];
  const oracle = 100;
  return {
    id: `track-read-${i}`,
    serial: `#${String(9000 + i).padStart(4, "0")}`,
    ticker: ["NVDA", "AMD", "INTC", "MU"][i % 4],
    type,
    expected_direction: i % 2 === 0 ? "up" : "down",
    grading_window_h: type === "drift" ? 6 : 4,
    reference_price: oracle,
    snapshot_refs: [],
    // Spaced 1h apart and walking BACKWARD from ~2h ago, so 250 arrows still
    // land inside the 7-day gate window (250h ≈ 10.4d would not — hence /4).
    fired_at: new Date(NOW - 2 * 3_600_000 - (i + 1) * 900_000).toISOString(),
    status: "graded",
    outcome: hit ? "hit" : "miss",
    graded_at: new Date(NOW - 2 * 3_600_000 - i * 900_000).toISOString(),
    outcome_detail: null,
    origin: "engine",
    snapshot_at_fire: {
      dex_price_usd: oracle * 1.03,
      oracle_price_usd: oracle,
      dex_tvl_usd: 200_000,
      dex_total_tvl_usd: null,
      dex_volume_24h_usd: 150_000,
      dex_change_24h_pct: null,
      chainlink_age_seconds: null,
    },
    market_at_fire: {
      is_open: session === "regular",
      session,
      ny_time_iso: new Date(NOW).toISOString(),
    },
  };
}

/** 40 graded arrows, 70% hits — clears the 30-sample aggregate gate, so
 *  `ready: true` in group C is a real measurement and not an artefact. */
const FIXTURE: Arrow[] = Array.from({ length: 40 }, (_, i) => makeArrow(i, i % 10 < 7));

async function seedFeed(arrows: Arrow[] = FIXTURE): Promise<void> {
  await kvSet(KV_ARROW_HYDRATED, {
    v: HYDRATED_VERSION,
    built_at: new Date(NOW).toISOString(),
    arrows,
  } satisfies HydratedFeed);
}

/** Distinct IP per call — /api/acp/* rate-limits 20/min/IP in-process. */
let ipSeq = 0;
function acpReq(qs = ""): Request {
  return new Request(`https://blueagent.dev/api/acp/track-record${qs}`, {
    headers: { "x-forwarded-for": `10.0.0.${++ipSeq}` },
  });
}

async function main() {
  console.log("\ntrack-record — a dead database has not 'never fired an arrow'\n");

  // ── 0. SAFETY GATE ────────────────────────────────────────────────────────
  // This suite WRITES `bh:arrow:hydrated` — the blob every public Blue Hood
  // surface reads. Refuse to run against real credentials. (Memory #155:
  // `.env.local` points at a STALE KV, and "it's only the dev database" is not
  // a defence when the key name is byte-identical to production's.)
  const liveKv =
    (process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL) &&
    (process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN);
  if (liveKv) {
    console.error("  ✗ ABORT — KV credentials are set. This suite writes the hydrated arrow");
    console.error("            feed blob. Run it with no KV env.");
    process.exit(1);
  }
  console.log("  ✓ safety gate — no KV credentials; running against the in-memory fallback\n");

  // ══ A. CONTROL — the shape that shipped, asserted to LIE ═══════════════════
  //
  // `getPublicTrackRecord` is DELETED (that is half the fix), so the control is
  // reimplemented here from its two lines. Keeping it as a live export would
  // have left the lying shape one import away from being opted back into.
  console.log("A. CONTROL — readPublicArrows + buildPublicTrackRecord under a dead KV");
  {
    const record = await withReadFailure(async () => {
      const arrows = await readPublicArrows(200);
      return buildPublicTrackRecord(arrows);
    });

    check(
      "A-1 the old shape answers a dead database with a RECORD, not an error",
      record.receipts.arrows.length === 0,
      `arrows=${record.receipts.arrows.length} (KV threw on every read; this is fabricated)`,
    );
    check(
      "A-2 …and asserts as fact that nothing has ever been graded",
      record.receipts.graded_breakdown.total_graded === 0,
      `total_graded=${record.receipts.graded_breakdown.total_graded} — the proof page's core claim, inverted`,
    );
    check(
      "A-3 …wearing the same 'warming up' badge a genuinely new desk wears",
      record.headline.hit_rate.ready === false && record.headline.hit_rate.graded === 0,
      `ready=${record.headline.hit_rate.ready}, graded=${record.headline.hit_rate.graded}`,
    );
    check(
      "A-4 …with zero signal anywhere in the payload that the read failed",
      !JSON.stringify(record).toLowerCase().includes("unavailable"),
      "nothing in the object says 'we could not read the feed'",
    );
    check(
      "A-5 …and it is fully well-formed, so no consumer can reject it on shape",
      typeof record.meta.api_version === "string" && record.meta.api_version.length > 0 &&
        record.headline.record_curve.basis === "cumulative_hit_minus_miss",
      `api_version="${record.meta.api_version}" — a valid 0.2 body carrying a false record`,
    );
  }

  // ══ B. FIX — the real reader, same fault ══════════════════════════════════
  console.log("\nB. FIX — getPublicTrackRecordProbe under the same dead KV");
  {
    const read = await withReadFailure(() => getPublicTrackRecordProbe(200));

    check(
      "B-1 returns `unavailable` instead of a record",
      read.status === "unavailable",
      `status="${read.status}"`,
    );
    check(
      "B-2 carries a reason a human can act on",
      read.status === "unavailable" && read.reason.length > 0,
      read.status === "unavailable" ? `reason="${read.reason}"` : "n/a",
    );
    check(
      "B-3 produces NO receipts at all — absence of an answer, not an answer",
      !("record" in read),
      "no `record` key on the unavailable branch",
    );
    // A caller that trims the window must not be able to trim its way back into
    // the lie; the failure has to be the same at every depth.
    const shallow = await withReadFailure(() => getPublicTrackRecordProbe(1));
    check(
      "B-4 a small `limit` fails identically (no depth opts out of the probe)",
      shallow.status === "unavailable",
      `status="${shallow.status}" at limit=1`,
    );
  }

  // ══ C. HAPPY — a healthy feed must still actually render the receipts ═════
  console.log("\nC. HAPPY — healthy feed");
  {
    await seedFeed();
    const read = await getPublicTrackRecordProbe(200);

    check(
      "C-1 healthy KV yields a record",
      read.status === "ok",
      `status="${read.status}"`,
    );
    if (read.status === "ok") {
      check(
        "C-2 every seeded arrow is a receipt (the evidence is returned, not summarised)",
        read.record.receipts.arrows.length === FIXTURE.length,
        `arrows=${read.record.receipts.arrows.length}, seeded=${FIXTURE.length}`,
      );
      check(
        "C-3 the planted 70% edge is actually published (not a blanket 'unavailable')",
        read.record.headline.hit_rate.ready === true &&
          (read.record.headline.hit_rate as { pct: number }).pct > 50,
        `ready=${read.record.headline.hit_rate.ready}, pct=${(read.record.headline.hit_rate as { pct?: number }).pct}`,
      );
      check(
        "C-4 MISSES are in the receipts — showing them is the whole differentiator",
        read.record.receipts.graded_breakdown.misses > 0,
        `hits=${read.record.receipts.graded_breakdown.hits}, misses=${read.record.receipts.graded_breakdown.misses}`,
      );
      check(
        "C-5 `pct_internal` never escapes the gate onto a public surface",
        !JSON.stringify(read.record).includes("pct_internal"),
        "the sanitize still strips the ungated percentage",
      );
      check(
        "C-6 the blob's build time is surfaced so a reader can date the receipts",
        typeof read.built_at === "string" && read.built_at.length > 0,
        `built_at="${read.built_at}"`,
      );
    }
  }

  // ══ R. ROUTE — the status code an agent parses ════════════════════════════
  console.log("\nR. ROUTE — /api/acp/track-record");
  {
    // R-A: dead KV. This endpoint is the machine-readable half; a 200 here is
    // an assertion in a contract, which is strictly worse than a 503.
    const darkRes = await withReadFailure(() =>
      trackRecordRoute.GET(acpReq() as never),
    );
    const darkBody = await darkRes.json();
    const darkCC = darkRes.headers.get("Cache-Control") ?? "";

    check(
      "R-A1 answers 503, not a 200 with a fabricated record",
      darkRes.status === 503,
      `status=${darkRes.status}`,
    );
    check(
      "R-A2 a machine-readable error code, not prose",
      darkBody.error === "arrow_feed_unavailable",
      `error="${darkBody.error}"`,
    );
    check(
      "R-A3 NO receipts key in the body — this is not a record",
      !("receipts" in darkBody) && !("headline" in darkBody),
      `keys=[${Object.keys(darkBody).join(", ")}]`,
    );
    check(
      "R-A4 the body contains no zero-count the caller could read as a fact",
      !/"(total_graded|arrows_today)"\s*:\s*0/.test(JSON.stringify(darkBody)),
      "no `total_graded: 0` / `arrows_today: 0` on the failure path",
    );
    check(
      "R-A5 `no-store` — an outage must not outlive itself in a CDN",
      /no-store/.test(darkCC),
      `Cache-Control="${darkCC}"`,
    );

    // R-B: healthy. Without this the endpoint could satisfy every check above
    // by 503-ing forever, which is the same page-dark failure from the API side.
    await seedFeed();
    const liveRes = await trackRecordRoute.GET(acpReq() as never);
    const liveBody = await liveRes.json();

    check(
      "R-B1 healthy feed answers 200",
      liveRes.status === 200,
      `status=${liveRes.status}`,
    );
    check(
      "R-B2 receipts are present and free (the product is the evidence)",
      Array.isArray(liveBody.receipts?.arrows) &&
        liveBody.receipts.arrows.length === FIXTURE.length,
      `arrows=${liveBody.receipts?.arrows?.length}`,
    );
    check(
      "R-B3 the window travels WITH the receipts, never in a separate doc",
      typeof liveBody.window?.shown === "number" &&
        typeof liveBody.window?.truncated === "boolean" &&
        typeof liveBody.window?.feed_built_at === "string",
      `window=${JSON.stringify(liveBody.window ?? null)}`,
    );
    check(
      "R-B4 `shown` equals the receipts actually handed over — the denominator is honest",
      liveBody.window?.shown === liveBody.receipts?.arrows?.length,
      `shown=${liveBody.window?.shown}, arrows=${liveBody.receipts?.arrows?.length}`,
    );
    check(
      "R-B5 grading rules + their doc URL ship inline so an outcome can be checked",
      typeof liveBody.meta?.grading_rules_url === "string" &&
        liveBody.meta.grading_rules_url.startsWith("https://"),
      `grading_rules_url="${liveBody.meta?.grading_rules_url}"`,
    );
  }

  // ══ W. WINDOW — the truncation flags, measured in BOTH directions ════════
  //
  // MEASURED 2026-09-18 in production: `/track` rendered exactly 200 receipts
  // under the label "every graded arrow · forever", while the evidence panel one
  // section above it analysed 250 and reported `feed_capped: true`. Same blob,
  // two depths, and only one of them admitted it had a window. #265 fixed the
  // panel; this group pins the receipts half.
  //
  // Both flags must be right in both directions — "always report truncated"
  // would pass a one-sided check and put a permanent "≥" on an exact number.
  console.log("\nW. WINDOW — a capped read may not call itself the full record");
  {
    await seedFeed();
    const small = await getPublicTrackRecordProbe(200);
    check(
      "W-1 a short feed read shallowly reports truncated=false and its real size",
      small.status === "ok" &&
        small.truncated === false &&
        small.feed_capped === false &&
        small.limit_capped === false &&
        small.shown === FIXTURE.length,
      small.status === "ok"
        ? `shown=${small.shown}, truncated=${small.truncated}`
        : "read failed",
    );

    // W-2 — the caller's own ceiling. Remedy: raise `limit`.
    const cut = await getPublicTrackRecordProbe(10);
    check(
      "W-2 `limit` below the feed is reported as limit_capped, NOT feed_capped",
      cut.status === "ok" &&
        cut.truncated === true &&
        cut.limit_capped === true &&
        cut.feed_capped === false &&
        cut.shown === 10,
      cut.status === "ok"
        ? `shown=${cut.shown}, limit_capped=${cut.limit_capped}, feed_capped=${cut.feed_capped}`
        : "read failed",
    );

    // W-3 — the production condition: a blob AT the hydrated cap. Older arrows
    // exist in the index and were never handed to the assembler. Remedy is NOT
    // "read deeper" — that restores the ~600-command fan-out (arrow-cache.ts).
    await seedFeed(Array.from({ length: ARROW_HYDRATED_MAX }, (_, i) => makeArrow(i, i % 10 < 7)));
    const full = await getPublicTrackRecordProbe(TRACK_RECORD_MAX_LIMIT);
    check(
      "W-3 a feed AT the cap reports feed_capped=true (older arrows were excluded)",
      full.status === "ok" && full.truncated === true && full.feed_capped === true,
      full.status === "ok"
        ? `feed_capped=${full.feed_capped}, cap=${ARROW_HYDRATED_MAX}`
        : "read failed",
    );

    // W-4 — the ACP endpoint must SAY it, not merely flag it. An agent
    // recomputing a hit-rate from `arrows` needs to know its denominator is a
    // sliding window, or two snapshots look like a record that shrank.
    const res = await trackRecordRoute.GET(acpReq("?limit=50") as never);
    const body = await res.json();
    check(
      "W-4 a truncated ACP response carries a note in words, not just a boolean",
      body.window?.truncated === true &&
        typeof body.window?.note === "string" &&
        /slides/i.test(body.window.note) &&
        /older arrows/i.test(body.window.note),
      `note="${String(body.window?.note ?? "").slice(0, 60)}…"`,
    );
    check(
      "W-5 `limit` is clamped to the shared ceiling, so one caller cannot force a fan-out",
      (await (await trackRecordRoute.GET(acpReq("?limit=99999") as never)).json()).window
        .shown <= TRACK_RECORD_MAX_LIMIT,
      `TRACK_RECORD_MAX_LIMIT=${TRACK_RECORD_MAX_LIMIT}`,
    );
  }

  // ══ S. SHAPE — static guards a run cannot provide ════════════════════════
  console.log("\nS. SHAPE — the lying shape is gone, and the label is derived");
  {
    // S-1 — the deleted export. An `unavailable` a caller can opt out of is one
    // import away from being opted out of, so the old name must not resolve.
    const lib = readSrc("lib/blue-hood/track-record-public.ts");
    check(
      "S-1 `getPublicTrackRecord` no longer exists (deleted, not kept as a wrapper)",
      !/export\s+(async\s+)?function\s+getPublicTrackRecord\s*\(/.test(lib),
      "only the probe-shaped reader is exported",
    );

    // S-2 — both public surfaces go through the probe and own no feed read.
    for (const rel of ["app/track/page.tsx", "app/api/acp/track-record/route.ts"]) {
      const src = readSrc(rel);
      check(
        `S-2 ${rel} reads through getPublicTrackRecordProbe`,
        /getPublicTrackRecordProbe\s*\(/.test(src),
        "no private feed read of its own",
      );
      check(
        `S-3 ${rel} never calls readPublicArrows (the group-B shape)`,
        !/\breadPublicArrows\s*\(/.test(src),
        "the collapsing reader is not reachable from a public surface",
      );
    }

    // S-4 — the page must branch. Rendering `TrackView` unconditionally is what
    // made an outage look like a record.
    const page = readSrc("app/track/page.tsx");
    check(
      "S-4 /track renders an explicit unavailable state for the WHOLE page",
      /TrackUnavailable/.test(page) && /status\s*===\s*"ok"/.test(page),
      "the hit rate goes dark with the receipts — a headline with no evidence is the claim this page refuses",
    );

    // S-5 — the copy. `/track` said "every graded arrow · forever" over the
    // newest 200 of a 532-arrow index. The string may survive (it is TRUE when
    // nothing was truncated); what may not survive is it being unconditional.
    // Checked by proximity because the invariant is "guarded by the measured
    // flag", and that is a property of the source, not of a render.
    const view = stripBlockComments(
      readFileSync(path.join(SRC, "app/track/TrackView.tsx"), "utf8"),
    );
    const claims = [...view.matchAll(/forever|every graded arrow/gi)];
    check(
      "S-5 the 'forever' / 'every graded arrow' label appears at all (control)",
      claims.length > 0,
      `${claims.length} occurrence(s) — this check is meaningless if the phrase is simply absent`,
    );
    for (const m of claims) {
      const before = view.slice(Math.max(0, (m.index ?? 0) - 220), m.index ?? 0);
      check(
        `S-6 "${m[0]}" is gated on the measured window, never asserted`,
        /win\.truncated/.test(before),
        "the label is derived from the reader's truncation flag",
      );
    }
    check(
      "S-7 the receipts count is lower-bounded when the window is truncated",
      /win\.truncated\s*\?\s*"≥"/.test(view),
      "'≥' notation over a truncated list, same rule as the wallet's partial reads",
    );
  }

  await kvDel(KV_ARROW_HYDRATED);

  console.log(
    `\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} — track-record read\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("  ✗ suite crashed:", e);
  process.exit(1);
});
