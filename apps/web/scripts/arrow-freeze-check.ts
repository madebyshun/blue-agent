/**
 * arrow-freeze-check — the arrow freeze (ShunTr, 2026-09-30) holds everywhere
 * it has to, and stays reversible.
 *
 * Two switches live in `src/lib/blue-hood/arrow-freeze.ts`:
 *   ARROWS_FROZEN        — the rule engine publishes no new arrow.
 *   ARROW_TRADE_ENABLED  — the Review & Sign panel (a real trade opened straight
 *                          from a signal) and the three routes that exist only
 *                          for it.
 *
 * A freeze that is honoured in one place and not another is the failure this
 * file exists for: the panel was rendered from THREE components (board, inbox,
 * chat card) and hiding the first two would have left the chat card opening a
 * live Robinhood Chain trade. So the render checks are a property over every
 * file under src/, not a list of the files known today.
 *
 * Part 1 runs the REAL engine against the in-memory KV (no env → lib/kv falls
 * back to a Map), on a fixture that is proved to fire before it is proved not
 * to — otherwise "fired 0 while frozen" would pass on a fixture that never
 * fires at all.
 *
 * Part 4 covers what the freeze left SAYING the opposite. Commit d1573777 fixed
 * the board's metric strip ("stops presenting frozen arrows as live") and left
 * the alert sign-ups in the same header, the watch star on every row, a Telegram
 * /start that enrolled users in a broadcast that cannot flow ("you'll now get
 * every tradable signal as it fires"), and a chat instruction to close every
 * arrow answer with "Signals fire…" — and the next fix left the inbox's empty
 * state ("First delivery when NYSE opens Monday") under the header it had just
 * changed to "alerts paused" (4.4). An alert is only ever made from a new
 * arrow, so none of those can deliver; each is checked here as a property or
 * by running the real handler.
 */
// Hermetic: this suite writes to KV (the rule engine, the Telegram broadcast
// set). Clear the credentials so lib/kv can only ever reach its in-memory Map.
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { kvGet, kvSet } from "../src/lib/kv";
import { runRuleEngine } from "../src/lib/blue-hood/rule-engine";
import { ARROWS_FROZEN, ARROWS_FROZEN_SINCE, ARROW_TRADE_ENABLED, arrowAnswerCloser } from "../src/lib/blue-hood/arrow-freeze";
import { isQuarantinedRow } from "../src/lib/blue-hood/quarantine";
import type { HoodSnapshot, TickerSnapshot } from "../src/lib/blue-hood/types";

let failures = 0;
let passes = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
/** Comments talk about the panel at length; only code counts as evidence. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/^\s*\/\/.*$/gm, "");

// ── fixture (same shape blue-hood-smoke uses) ────────────────────────────────
const mk = (
  ticker: string,
  verdict: TickerSnapshot["verdict"],
  isOpen: boolean,
  driftPct: number,
  volume24h: number | null = 1_000,
): TickerSnapshot => ({
  ticker,
  name: ticker,
  contract: `0x${ticker}`,
  verdict,
  oracle_usd: 100,
  dex_usd: 100 * (1 + driftPct / 100),
  tvl_usd: 10_000,
  total_tvl_usd: 10_000,
  volume_24h_usd: volume24h,
  drift_pct: driftPct,
  pool_ref: "0xpool",
  is_v4_pool_id: false,
  market: {
    is_open: isOpen,
    session: isOpen ? "regular" : "afterhours",
    ny_time_iso: new Date().toISOString(),
  },
  warnings: [],
  polled_at_ms: 0,
  data_age_s: null,
  sparkline: null,
  no_data_reason: null,
});

const snap: HoodSnapshot = {
  cycle_id: Date.now(),
  started_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
  duration_ms: 0,
  tickers: [
    mk("TSLA", "LONG_DEX", true, 1.5),           // arb
    mk("AAPL", "AFTERHOURS_DRIFT", false, 3),    // drift
    mk("COIN", "AFTERHOURS_DRIFT", false, 4, null), // drift, liveness gate fails open
    mk("MSFT", "ALIGNED", true, 0.1),            // below threshold
  ],
  metrics: {
    registry_total: 4,
    tokens_watched: 4,
    tokens_no_feed: 0,
    tokens_errored: 0,
    tvl_scanned_usd: 40_000,
    market_is_open: true,
    market_session: "regular",
  },
};

async function resetArrows() {
  await kvSet("bh:arrow:feed", []);
  await kvSet("bh:arrow:serial", 0);
}

(async () => {
  console.log("\n1. The engine really stops firing — and only because of the switch");

  await resetArrows();
  const live = await runRuleEngine(snap, { frozen: false });
  check("1.1 the fixture fires when NOT frozen (so a 0 below means something)",
    live.fired === 3, `fired=${live.fired}`);

  await resetArrows();
  const frozen = await runRuleEngine(snap, { frozen: true });
  check("1.2 frozen: nothing fires", frozen.fired === 0, `fired=${frozen.fired}`);
  check("1.3 frozen: every would-be arrow is counted as skipped_frozen",
    frozen.skipped_frozen === 3, `skipped_frozen=${frozen.skipped_frozen}`);
  const feed = (await kvGet<string[]>("bh:arrow:feed")) ?? [];
  check("1.4 frozen: the arrow index is untouched", feed.length === 0, `feed=${feed.length}`);
  const serial = (await kvGet<number>("bh:arrow:serial")) ?? 0;
  check("1.5 frozen: no serial is consumed", serial === 0, `serial=${serial}`);
  const sum = frozen.skipped_dust + frozen.skipped_no_executable_pool + frozen.skipped_dead_pool
    + frozen.skipped_feed_stale + frozen.skipped_frozen + frozen.deduped + frozen.fired;
  check("1.6 conservation identity still closes with the frozen gate in it",
    sum === frozen.candidates_over_threshold, `${sum} vs ${frozen.candidates_over_threshold}`);

  await resetArrows();
  const byDefault = await runRuleEngine(snap);
  check("1.7 the default follows ARROWS_FROZEN",
    ARROWS_FROZEN ? byDefault.fired === 0 : byDefault.fired === 3,
    `ARROWS_FROZEN=${ARROWS_FROZEN} fired=${byDefault.fired}`);

  const engine = stripComments(read("src/lib/blue-hood/rule-engine.ts"));
  const gateAt = engine.indexOf("if (frozen)");
  const fireAt = engine.indexOf("await fireArrow(");
  check("1.8 the frozen gate sits before the only fireArrow call",
    gateAt > 0 && fireAt > gateAt, `gate@${gateAt} fire@${fireAt}`);

  console.log("\n2. No surface opens a trade from a signal while ARROW_TRADE_ENABLED is off");

  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(name)) files.push(p);
    }
  };
  walk(join(ROOT, "src"));

  const renderers = files.filter((f) => /<ReviewSignPanel\b/.test(stripComments(readFileSync(f, "utf8"))));
  check("2.1 the panel is still rendered somewhere (the detector is alive)",
    renderers.length >= 3, `found ${renderers.length}`);
  for (const f of renderers) {
    const code = stripComments(readFileSync(f, "utf8"));
    const lines = code.split("\n");
    const ok = lines.every((line, i) => {
      if (!/<ReviewSignPanel\b/.test(line)) return true;
      const window = `${lines[i - 1] ?? ""}\n${line}`;
      return /ARROW_TRADE_ENABLED\s*&&/.test(window);
    });
    check(`2.2 ${relative(ROOT, f)} renders the panel only under ARROW_TRADE_ENABLED`, ok);
  }

  const panelRoutes = [
    "src/app/api/hood/trade/quote/route.ts",
    "src/app/api/hood/trade/prepare/route.ts",
    "src/app/api/hood/arrows/[id]/user-action/route.ts",
  ];
  for (const r of panelRoutes) {
    const code = stripComments(read(r));
    const post = code.slice(code.indexOf("export async function POST"));
    const gate = post.indexOf("if (!ARROW_TRADE_ENABLED) return arrowTradeDisabledResponse()");
    const limiter = post.indexOf("rateLimit(");
    check(`2.3 ${r} refuses before doing any work`, gate > 0 && (limiter < 0 || gate < limiter),
      `gate@${gate} rateLimit@${limiter}`);
  }
  check("2.4 the trade switch is independent of the freeze (both exported, separately)",
    typeof ARROW_TRADE_ENABLED === "boolean" && typeof ARROWS_FROZEN === "boolean");

  console.log("\n3. Nothing keeps working for arrows that can no longer exist");
  const vercel = JSON.parse(read("vercel.json")) as { crons?: { path: string }[] };
  const scheduled = (name: string) => (vercel.crons ?? []).some((c) => c.path.includes(name));
  check("3.1 while frozen, the brief-worker is not on a timer",
    !ARROWS_FROZEN || !scheduled("brief-worker"), `frozen=${ARROWS_FROZEN} scheduled=${scheduled("brief-worker")}`);
  // alert-drain's queue has exactly one writer (emitAlertsForArrow, inside the
  // brief-worker), so while frozen it could only finish sending pre-freeze
  // arrows — which is what the freeze is meant to stop.
  const alertWriters = files
    .filter((f) => /(?<!function\s+)\bemitAlertsForArrow\s*\(/.test(stripComments(readFileSync(f, "utf8"))))
    .map((f) => relative(ROOT, f));
  check("3.2 the alert queue still has a single writer, and it is the brief-worker",
    alertWriters.length === 1 && alertWriters[0].includes("brief-worker"), alertWriters.join(", "));
  check("3.3 while frozen, alert-drain is not on a timer either",
    !ARROWS_FROZEN || !scheduled("alert-drain"), `frozen=${ARROWS_FROZEN} scheduled=${scheduled("alert-drain")}`);

  console.log("\n4. Nothing invites an alert sign-up — or says signals fire — that the freeze makes undeliverable");

  // 4.1 — every render of an alert opt-in, anywhere under src/, sits under
  // `!ARROWS_FROZEN &&` on its own line or the one before. A property over all
  // files, like 2.2, so a fourth surface cannot be added without it.
  const CTAS = ["EnableAlertsButton", "TelegramLinkButton", "WatchToggle"];
  let ctaRenders = 0;
  for (const f of files) {
    const lines = stripComments(readFileSync(f, "utf8")).split("\n");
    lines.forEach((line, i) => {
      const cta = CTAS.find((c) => new RegExp(`<${c}\\b`).test(line));
      if (!cta) return;
      ctaRenders++;
      const window = `${lines[i - 1] ?? ""}\n${line}`;
      // No line number in the label: comments are stripped first, so it would
      // not match the file.
      check(`4.1 ${relative(ROOT, f)} renders <${cta}> only while not frozen`, /!ARROWS_FROZEN\s*&&/.test(window));
    });
  }
  check("4.1 the alert opt-ins are still rendered somewhere (the detector is alive)", ctaRenders >= 4, `found ${ctaRenders}`);

  // 4.2 — the Telegram bot, run for real. Env first, THEN import: lib/telegram/bot
  // reads the token at module load. sendMessage is captured at the fetch layer,
  // so what is asserted is the exact text Telegram would have been sent.
  process.env.TELEGRAM_BOT_TOKEN = "arrow-freeze-check";
  process.env.TELEGRAM_WEBHOOK_SECRET = "arrow-freeze-check";
  const sent: string[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("api.telegram.org")) {
      try { sent.push(String((JSON.parse(String(init?.body ?? "{}")) as { text?: string }).text ?? "")); } catch { /* not ours */ }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  try {
    const tg = await import("../src/app/api/telegram/webhook/route");
    const { NextRequest } = await import("next/server");
    const { broadcastMembers } = await import("../src/lib/blue-hood/watchlist");
    const say = async (text: string) => {
      sent.length = 0;
      await tg.POST(new NextRequest("https://blueagent.dev/api/telegram/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": "arrow-freeze-check" },
        body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: 4242 }, from: { id: 4242 }, text } }),
      }));
      return sent.join("\n");
    };

    const start = await say("/start");
    check("4.2 the bot answered /start (the capture is alive)", start.length > 0);
    if (ARROWS_FROZEN) {
      check("4.2 frozen /start says signals stopped, and when", start.includes(ARROWS_FROZEN_SINCE) && !/as it fires/i.test(start),
        start.slice(0, 160));
      check("4.2 frozen /start does NOT enrol the user in the broadcast list",
        !(await broadcastMembers()).includes("4242"));
    } else {
      check("4.2 live /start enrols the user in the broadcast list", (await broadcastMembers()).includes("4242"));
    }
    check("4.2 /start points at trading-from-a-signal only while it exists",
      ARROW_TRADE_ENABLED || !/To act on a signal/i.test(start));
    // Since the F6 price-source fix (2026-10-01) the quarantine holds only RH
    // rows recorded before it; a pool-rate reading publishes. The help may
    // advertise the live drift only while that is actually true.
    check("4.2 /start's help advertises a live RH drift only while a pool-rate RH reading publishes",
      !/live oracle vs DEX drift/i.test(start) || !isQuarantinedRow({ chain: "robinhood", dex_source: "pool_rate" }));

    if (ARROWS_FROZEN) {
      const badLink = await say("/start link_NOPE00");
      check("4.2 frozen: a stale deep link is not sent back for a button that is hidden",
        badLink.length > 0 && !/Get alerts on Telegram/i.test(badLink) && badLink.includes(ARROWS_FROZEN_SINCE), badLink.slice(0, 160));
      const mute = await say("/mute");
      check("4.2 frozen /mute promises neither re-enrolment nor linked alerts",
        !/Send \/start any time/i.test(mute) && !/still come through/i.test(mute), mute.slice(0, 160));
    }
  } finally {
    globalThis.fetch = realFetch;
  }

  // 4.3 — Blue Chat's arrow answer is closed by one sentence the model is told
  // to say verbatim. It follows the switch; the route may not inline its own.
  check("4.3 the frozen closer names the stop date and does not say signals fire",
    arrowAnswerCloser(true).includes(ARROWS_FROZEN_SINCE) && !/\bfire/i.test(arrowAnswerCloser(true)));
  check("4.3 the live closer is unchanged (un-freezing restores it)", /^Signals fire from oracle-vs-DEX drift/.test(arrowAnswerCloser(false)));
  const chatRoute = stripComments(read("src/app/api/chat/route.ts"));
  check("4.3 the chat route ends arrow answers with arrowAnswerCloser(), not a literal",
    /arrowAnswerCloser\(\)/.test(chatRoute) && !/Signals fire from oracle-vs-DEX drift/.test(chatRoute));

  // 4.4 — empty states that promise the next delivery ("the moment the engine
  // fires", "first receipts land when NYSE opens"). While frozen nothing fires,
  // so every such sentence must sit in the live arm of a ternary whose frozen arm
  // is ARROWS_FROZEN_NOTE. A property over every file under src/, like 4.1: the
  // inbox's was missed by the commit that changed the header right above it.
  const PROMISE = /engine fires|first (delivery|receipts?)\b/i;
  let promises = 0;
  for (const f of files) {
    const lines = stripComments(readFileSync(f, "utf8")).split("\n");
    lines.forEach((line, i) => {
      if (!PROMISE.test(line)) return;
      promises++;
      const window = lines.slice(Math.max(0, i - 3), i + 1).join("\n");
      check(`4.4 ${relative(ROOT, f)} promises a delivery only in the live arm (frozen arm is ARROWS_FROZEN_NOTE)`,
        /ARROWS_FROZEN\s*\?\s*ARROWS_FROZEN_NOTE\s*:/.test(window), line.trim().slice(0, 90));
    });
  }
  check("4.4 the delivery promises are still found (the detector is alive)", promises >= 3, `found ${promises}`);

  console.log(`\narrow-freeze-check: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
