/**
 * The ONE read behind the published cohort result — outage vs. "no edge".
 *
 * Run: `npx tsx scripts/cohort-read-test.ts` from `apps/web/`.
 * Also runs automatically under `npm test` (opt-out discovery in run-tests.ts).
 *
 * ═══ WHY THIS FILE EXISTS ═══
 *
 * `cohort-stats-test.ts` pins the MATH and the engine's behaviour under planted
 * noise/edges. It feeds `analyzeCohorts` an array directly, so it can say
 * nothing at all about where that array came from — and that is exactly where
 * the bug was.
 *
 * `/api/hood/cohorts` called `readPublicArrows`, which is DOCUMENTED to return
 * `[]` when KV is unreachable (#150 group B). `analyzeCohorts([])` yields
 * `graded: 0` → `overall.ready: false` → `verdict: "insufficient_data"` — the
 * byte-identical string a genuinely thin record produces. The endpoint then
 * shipped that with `s-maxage=300, stale-while-revalidate=600`, so ONE
 * throttled read pinned "we have not measured an edge" in front of every caller
 * for up to FIFTEEN MINUTES after KV recovered. This is the #149/#150
 * silent-collapse family landing on the single endpoint that carries the
 * project's headline statistical claim.
 *
 * ═══ HOW TO READ A CASE ═══
 *
 * Same TRIPLE discipline as the sibling KV suites, all three legs load-bearing:
 *   ·A CONTROL — the OLD call shape, reimplemented inline, asserted to LIE
 *                (answer a dead database with a confident verdict). If this
 *                ever stops lying, the fix below protects nothing measurable.
 *   ·B FIX     — the REAL exported `readCohortAnalysis`, identical fault,
 *                asserted to return `unavailable` and NO analysis.
 *   ·C HAPPY   — a healthy feed, asserted to actually produce the analysis.
 *                Without it, "always answer unavailable" would pass A and B
 *                forever.
 *
 * Group R does the same at the ROUTE level, because the status code and the
 * `Cache-Control` header are what made the outage outlive itself, and no
 * library function underneath can tell you anything about either.
 *
 * Group D pins the DEPTH DRIFT that the shared reader exists to prevent: the
 * API read the feed 600 deep and `/track` read it 200 deep, both served from
 * the same 250-capped blob, so the two surfaces published different `n` from
 * one snapshot with nothing on either admitting the other existed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { kv, kvSet, kvDel } from "../src/lib/kv";
import { KV_ARROW_HYDRATED, ARROW_HYDRATED_MAX } from "../src/lib/blue-hood/kv-keys";
import { HYDRATED_VERSION, type HydratedFeed } from "../src/lib/blue-hood/arrow-cache";
import { readPublicArrows } from "../src/lib/blue-hood/public-feed";
import { analyzeCohorts } from "../src/lib/blue-hood/cohort-stats";
import { readCohortAnalysis, COHORT_FEED_DEPTH } from "../src/lib/blue-hood/cohort-read";
// The REAL route: groups R-A/R-B assert a response STATUS and HEADER.
import * as cohortsRoute from "../src/app/api/hood/cohorts/route";
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
 * Group D searches for `analyzeCohorts(` and the route's own header EXPLAINS
 * the bug using that exact expression — so a raw regex reports the endpoint as
 * a second call site and the guard fails for documenting itself. A check that
 * cannot tell prose from code trains people to delete the prose.
 *
 * `//` is only treated as a line comment when it is not preceded by `:`, so a
 * `https://` inside a string literal does not swallow the rest of its line.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const NOW = Date.UTC(2026, 8, 17, 12, 0, 0);
const SESSIONS: MarketSession[] = ["regular", "premarket", "afterhours", "weekend"];

function makeArrow(i: number, hit: boolean): Arrow {
  const type: ArrowType = i % 2 === 0 ? "drift" : "arb";
  const session = SESSIONS[i % SESSIONS.length];
  const oracle = 100;
  return {
    id: `cohort-read-${i}`,
    serial: `#${String(9000 + i).padStart(4, "0")}`,
    ticker: ["NVDA", "AMD", "INTC", "MU"][i % 4],
    type,
    expected_direction: i % 2 === 0 ? "up" : "down",
    grading_window_h: type === "drift" ? 6 : 4,
    reference_price: oracle,
    snapshot_refs: [],
    fired_at: new Date(NOW - (i + 1) * 3_600_000).toISOString(),
    status: "graded",
    outcome: hit ? "hit" : "miss",
    graded_at: new Date(NOW - i * 3_600_000).toISOString(),
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

/** 40 graded arrows, 70% hits — enough to clear the gate so "ready" is real. */
const FIXTURE: Arrow[] = Array.from({ length: 40 }, (_, i) => makeArrow(i, i % 10 < 7));

async function seedFeed(): Promise<void> {
  const blob: HydratedFeed = {
    v: HYDRATED_VERSION,
    built_at: new Date(NOW).toISOString(),
    arrows: FIXTURE,
  };
  await kvSet(KV_ARROW_HYDRATED, blob);
}

async function main() {
  console.log("\ncohort-read — a dead database is not a measurement\n");

  // ── 0. SAFETY GATE ────────────────────────────────────────────────────────
  // This suite WRITES `hood:arrows:hydrated` — the blob every public Blue Hood
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
  console.log("A. CONTROL — readPublicArrows + analyzeCohorts under a dead KV");
  {
    const analysis = await withReadFailure(async () => {
      const arrows = await readPublicArrows(COHORT_FEED_DEPTH);
      return analyzeCohorts(arrows);
    });

    check(
      "A-1 the old shape answers a dead database with an ANALYSIS, not an error",
      analysis.graded === 0,
      `graded=${analysis.graded} (KV threw on every read; this is fabricated)`,
    );
    check(
      "A-2 …and its verdict is indistinguishable from a genuinely thin record",
      analysis.verdict === "insufficient_data",
      `verdict="${analysis.verdict}" — the exact string a real 5-arrow record produces`,
    );
    check(
      "A-3 …with zero signal anywhere in the payload that the read failed",
      !JSON.stringify(analysis).toLowerCase().includes("unavailable"),
      "nothing in the object says 'we could not read the feed'",
    );
  }

  // ══ B. FIX — the real reader, same fault ══════════════════════════════════
  console.log("\nB. FIX — readCohortAnalysis under the same dead KV");
  {
    const read = await withReadFailure(() => readCohortAnalysis());

    check(
      "B-1 returns `unavailable` instead of an analysis",
      read.status === "unavailable",
      `status="${read.status}"`,
    );
    check(
      "B-2 carries a reason a human can act on",
      read.status === "unavailable" && read.reason.length > 0,
      read.status === "unavailable" ? `reason="${read.reason}"` : "n/a",
    );
    check(
      "B-3 produces NO verdict at all — absence of an answer, not an answer",
      !("analysis" in read),
      "no `analysis` key on the unavailable branch",
    );
    // The rolling-7d caller must fail the same way; a second entry point that
    // silently degrades would reopen the hole from the other side.
    const read7d = await withReadFailure(() => readCohortAnalysis({ rolling7d: true }));
    check(
      "B-4 the ?window=7d entry point fails identically",
      read7d.status === "unavailable",
      `status="${read7d.status}"`,
    );
  }

  // ══ C. HAPPY — a healthy feed must still actually work ════════════════════
  console.log("\nC. HAPPY — healthy feed");
  {
    await seedFeed();
    const read = await readCohortAnalysis();

    check(
      "C-1 healthy KV yields an analysis",
      read.status === "ok",
      `status="${read.status}"`,
    );
    if (read.status === "ok") {
      check(
        "C-2 every seeded arrow is analysed",
        read.analysis.graded === FIXTURE.length,
        `graded=${read.analysis.graded}, seeded=${FIXTURE.length}`,
      );
      check(
        "C-3 the planted 70% edge is actually found (not a blanket 'unavailable')",
        read.analysis.overall.ready && (read.analysis.overall.pct ?? 0) > 50,
        `ready=${read.analysis.overall.ready}, pct=${read.analysis.overall.pct}`,
      );
      check(
        "C-4 the window basis is stamped so it can never be compared blind",
        read.analysis.window_basis === "all_time",
        `window_basis="${read.analysis.window_basis}"`,
      );
      check(
        "C-5 the blob's build time is surfaced so a reader can date the claim",
        typeof read.built_at === "string" && read.built_at.length > 0,
        `built_at="${read.built_at}"`,
      );
    }
  }

  // ══ R. ROUTE — the status + header that made the outage outlive itself ════
  console.log("\nR. ROUTE — /api/hood/cohorts");
  {
    // R-A: dead KV. The cache header is the whole point: a cached 200 pins the
    // wrong answer in a CDN for 15 minutes, long after KV has recovered.
    const darkRes = await withReadFailure(() =>
      cohortsRoute.GET(new Request("https://blueagent.dev/api/hood/cohorts") as never),
    );
    const darkBody = await darkRes.json();
    const darkCC = darkRes.headers.get("Cache-Control") ?? "";

    check(
      "R-A1 answers 503, not a 200 with a fabricated verdict",
      darkRes.status === 503,
      `status=${darkRes.status}`,
    );
    check(
      "R-A2 `ok: false` + a machine-readable error",
      darkBody.ok === false && darkBody.error === "arrow_feed_unavailable",
      `ok=${darkBody.ok}, error="${darkBody.error}"`,
    );
    check(
      "R-A3 NO verdict key in the body — this is not a measurement",
      !("verdict" in darkBody),
      `keys=[${Object.keys(darkBody).join(", ")}]`,
    );
    check(
      "R-A4 the body never utters the two strings it must not be confused with",
      !JSON.stringify(darkBody.verdict ?? "").includes("insufficient_data") &&
        darkBody.verdict !== "no_validated_edge",
      "no `insufficient_data` / `no_validated_edge` verdict on the failure path",
    );
    check(
      "R-A5 `no-store` — an outage must not outlive itself in a CDN",
      /no-store/.test(darkCC),
      `Cache-Control="${darkCC}"`,
    );
    check(
      "R-A6 …and specifically NOT the 15-minute s-maxage+swr that shipped",
      !/s-maxage/.test(darkCC),
      `Cache-Control="${darkCC}"`,
    );

    // R-B: healthy. Caching is correct here and must survive — otherwise the
    // fix is "never cache", which costs the endpoint its whole cost argument.
    await seedFeed();
    const liveRes = await cohortsRoute.GET(
      new Request("https://blueagent.dev/api/hood/cohorts") as never,
    );
    const liveBody = await liveRes.json();
    const liveCC = liveRes.headers.get("Cache-Control") ?? "";

    check(
      "R-B1 healthy feed answers 200 with ok:true",
      liveRes.status === 200 && liveBody.ok === true,
      `status=${liveRes.status}, ok=${liveBody.ok}`,
    );
    check(
      "R-B2 a real verdict is present",
      typeof liveBody.verdict === "string" && liveBody.verdict.length > 0,
      `verdict="${liveBody.verdict}"`,
    );
    check(
      "R-B3 the healthy path is STILL cached (the fix is conditional, not a blanket no-store)",
      /s-maxage=300/.test(liveCC) && !/no-store/.test(liveCC),
      `Cache-Control="${liveCC}"`,
    );
    check(
      "R-B4 the correction is carried inline, so a percentage cannot be read without it",
      typeof liveBody.method?.correction === "string" &&
        liveBody.method.correction.includes("Benjamini-Hochberg"),
      `correction="${liveBody.method?.correction}"`,
    );
  }

  // ══ D. DEPTH — one reader, so two surfaces cannot publish different n ═════
  //
  // Static, deliberately: the drift was two call sites each holding their own
  // literal, which no runtime assertion catches until both are wired to the
  // same fixture. The invariant is "there is exactly one analysis call site",
  // and that is a property of the source, not of a run.
  console.log("\nD. DEPTH — a single analysis call site");
  {
    const SRC = path.resolve(path.dirname(path.resolve(process.argv[1])), "..", "src");
    const callers = [
      "app/api/hood/cohorts/route.ts",
      "app/track/page.tsx",
      "lib/blue-hood/cohort-read.ts",
    ].map((rel) => ({ rel, src: stripComments(readFileSync(path.join(SRC, rel), "utf8")) }));

    const analysers = callers.filter((c) => /\banalyzeCohorts\s*\(/.test(c.src));
    check(
      "D-1 exactly ONE module calls analyzeCohorts (the shared reader)",
      analysers.length === 1 && analysers[0].rel === "lib/blue-hood/cohort-read.ts",
      `callers=[${analysers.map((a) => a.rel).join(", ") || "none"}]`,
    );

    const publishers = callers.filter((c) => c.rel !== "lib/blue-hood/cohort-read.ts");
    for (const p of publishers) {
      check(
        `D-2 ${p.rel} goes through readCohortAnalysis`,
        /readCohortAnalysis\s*\(/.test(p.src),
        "no private feed read of its own",
      );
      check(
        `D-3 ${p.rel} declares no depth literal of its own`,
        !/FEED_DEPTH\s*=/.test(p.src),
        `depth lives only in COHORT_FEED_DEPTH (${COHORT_FEED_DEPTH})`,
      );
    }
  }

  // ══ E. WINDOW — "all time" was never all time ════════════════════════════
  //
  // MEASURED 2026-09-17 in production: the arrow index held 532 arrows, this
  // analysis saw 250, and `window_basis` said "all_time" anyway — because that
  // field describes the analysis function (it applied no time filter), not the
  // input it was handed. The cap also slides, so three reads that day returned
  // `graded` 240, 238, 234. A public record that SHRINKS while you refresh
  // discredits every other number beside it.
  //
  // The fix is not to read deeper (that restores the ~600-command fan-out) but
  // to measure the window and force every surface to state it. These checks
  // pin that: the measurement must be right in both directions, and it must
  // travel with the claim.
  console.log("\nE. WINDOW — a capped read may not call itself the full record");
  {
    // E-1 — the fixture is 40 arrows, far under the cap: an honest "not capped".
    // Without this, "always report capped" would pass every check below.
    await seedFeed();
    const small = await readCohortAnalysis();
    check(
      "E-1 a short feed reports feed_capped=false and its real size",
      small.status === "ok" && small.feed_capped === false && small.analyzed === FIXTURE.length,
      small.status === "ok"
        ? `analyzed=${small.analyzed}, capped=${small.feed_capped}`
        : "read failed",
    );

    // E-2 — the production condition: a blob AT the cap. Older arrows exist in
    // the index and were never handed to the analysis.
    await kvSet(KV_ARROW_HYDRATED, {
      v: HYDRATED_VERSION,
      built_at: new Date(NOW).toISOString(),
      arrows: Array.from({ length: ARROW_HYDRATED_MAX }, (_, i) => makeArrow(i, i % 10 < 7)),
    } satisfies HydratedFeed);

    const full = await readCohortAnalysis();
    check(
      "E-2 a feed AT the cap reports feed_capped=true (older arrows were excluded)",
      full.status === "ok" && full.feed_capped === true && full.analyzed === ARROW_HYDRATED_MAX,
      full.status === "ok"
        ? `analyzed=${full.analyzed}, capped=${full.feed_capped}, cap=${ARROW_HYDRATED_MAX}`
        : "read failed",
    );

    const res = await cohortsRoute.GET(
      new Request("https://blueagent.dev/api/hood/cohorts") as never,
    );
    const body = await res.json();

    check(
      "E-3 the route publishes the measured window, not just the basis",
      body.analyzed === ARROW_HYDRATED_MAX && body.feed_capped === true,
      `analyzed=${body.analyzed}, feed_capped=${body.feed_capped}`,
    );
    check(
      "E-4 a capped response says so IN WORDS, contradicting 'all_time' in place",
      typeof body.window_note === "string" &&
        /longer/i.test(body.window_note) &&
        /all_time/.test(body.window_note),
      `window_note="${String(body.window_note).slice(0, 60)}…"`,
    );
    // The invariant that actually protects a reader: the overclaiming field may
    // exist, but never alone. Same shape as `survives_correction` sitting
    // inline on every cohort — you cannot get the number without the caveat.
    check(
      "E-5 window_basis='all_time' never ships without the window beside it",
      body.window_basis !== "all_time" ||
        (typeof body.feed_capped === "boolean" && typeof body.analyzed === "number"),
      `window_basis=${body.window_basis}, feed_capped=${body.feed_capped}`,
    );

    // E-6 — static, because the regression is a copywriting one: someone
    // reinstates the tidier phrase and the page silently overclaims again.
    const trackSrc = stripComments(
      readFileSync(
        path.join(path.resolve(path.dirname(path.resolve(process.argv[1])), "..", "src"), "app/track/TrackView.tsx"),
        "utf8",
      ),
    );
    check(
      "E-6 /track renders no hardcoded 'all time' label",
      !/all[- ]time/i.test(trackSrc),
      "the basis string is derived from feed_capped, not written in",
    );

    // E-7 — the slide reaches the CORRECTION, which is the part that bites.
    // MEASURED in production 2026-09-17: `tests_run` was 25 on one read and 24
    // on a later one, because a cohort fell under `min_sample` and left the
    // family. BH's ceiling is FDR×rank/family_size, so a shrinking family moves
    // the bar for every cohort — `survives_correction` can flip with nothing
    // about the signal having changed. An endpoint whose entire promise is
    // "a percentage never travels without its correction" has to disclose that
    // the correction is itself window-dependent, or the promise is hollow.
    check(
      "E-7 the capped note discloses that the CORRECTION slides too, not just `graded`",
      typeof body.window_note === "string" &&
        /tests_run/.test(body.window_note) &&
        /survives_correction/.test(body.window_note),
      "a flipped survives_correction must be attributable to the window, not read as news",
    );
  }

  await kvDel(KV_ARROW_HYDRATED);

  console.log(
    `\n${failures === 0 ? "ALL GREEN" : `${failures} FAILURE(S)`} — cohort-read\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("  ✗ suite crashed:", e);
  process.exit(1);
});
