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
 *
 * The snapshot is not the only door, and §1 alone could not see the others —
 * that is how two of them stayed open after F6 shipped. Each has its own group,
 * enumerated by what the code CALLS, not by a list of files known today:
 *   §5  the x402 handlers that read the DEX leg LIVE and never touch the
 *       snapshot. M5 `rh-stock-arb`: HANDLERS publishes through the quarantine
 *       and the paid route is HALTED (its product is the withheld verdict), while
 *       the raw reading reaches the recorder — poller and grader — and nothing
 *       that serves. A4 `rh-stock-agent-brief` (halted too) and A3
 *       `rh-stock-report` withhold the leg before the verdict and before the
 *       prompt — checked on what the model is actually sent. Then EVERY handler
 *       that puts `resolvePrimaryPool` next to `chainlinkLatest` is enumerated by
 *       those calls, and each must be halted, publish through the quarantine, or
 *       be an execution quote whose property is asserted
 *   §6  the permanent RH archive (`readSeriesDays`), served by /api/hood/series
 *       and /api/hood/ticker-series: withheld on the way out, raw in KV
 *   §7  the board: a quarantined row is bucketed by its real liquidity, not as
 *       "NO POOL" — run on the rows /api/hood/snapshot actually publishes
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

  // ── §5 ─────────────────────────────────────────────────────────────────────
  console.log("\n5. the x402 handlers that read the DEX leg live: halted or published through the quarantine; the recorder reads raw");

  // Who may touch the raw reading. Property, not path: any file that names it
  // must be the handler that defines it or the recorder path that runs it, and
  // anything that calls the recorder path must serve nothing (no route verb).
  const all = walk(SRC);
  const rawNamers = all.filter((f) => /\bmeasureRhStockArb\b/.test(code(fs.readFileSync(f, "utf8")))).map(rel).sort();
  ok("the raw M5 reading is named only by its handler file and the recorder path",
    JSON.stringify(rawNamers) === JSON.stringify(["src/app/api/x402/_handlers/rh-stock-arb.ts", "src/lib/blue-hood/tool-caller.ts"]),
    rawNamers.join(", "));
  const recorderCallers = all.filter((f) => /\bcallRecorderTool\s*[<(]/.test(code(fs.readFileSync(f, "utf8"))) && rel(f) !== "src/lib/blue-hood/tool-caller.ts");
  ok(`the recorder path has callers (${recorderCallers.length}) — the detector is alive`, recorderCallers.length >= 2, recorderCallers.map(rel).join(", "));
  for (const f of recorderCallers) {
    ok(`${rel(f)}: calls the recorder path and serves nothing (no GET/POST export)`,
      !/export\s+(async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/.test(fs.readFileSync(f, "utf8")) && !rel(f).endsWith("/route.ts"));
  }
  const handlerSrc = code(fs.readFileSync(path.join(SRC, "app/api/x402/_handlers/rh-stock-arb.ts"), "utf8"));
  ok("the HANDLERS entry is not the raw reading (the default export publishes)",
    /export default async function handler[\s\S]*?publishArbResult\(/.test(handlerSrc) && !/export default async function measureRhStockArb/.test(handlerSrc));

  // Behaviour, on a fabricated upstream: GeckoTerminal serves one USDG-anchored
  // NVDA pool at $237.70, Chainlink answers $230.55 — a +3.10% "drift".
  const NVDA = "0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC".toLowerCase();
  const USDG = "0x5fc5360d0400a0fd4f2af552add042d716f1d168";
  const word = (n: bigint) => n.toString(16).padStart(64, "0");
  const realFetch = globalThis.fetch;
  // Every prompt A3/A4 send to the gateway, verbatim — the model is a door too.
  const prompts: string[] = [];
  process.env.VIRTUALS_API_KEY = "rh-quarantine-check";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.startsWith("https://compute.virtuals.io/")) {
      if (!url.endsWith("/chat/completions")) return new Response("{}", { status: 404 }); // catalog unknown → dispatch anyway
      prompts.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({
        choices: [{ finish_reason: "stop", message: { content: '{"one_line_context":"","risk_flags":[]}' } }],
        usage: { total_tokens: 1 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("geckoterminal.com") && url.includes(`/tokens/${NVDA}/pools`)) {
      return new Response(JSON.stringify({
        data: [{
          attributes: {
            address: `0x${"ab".repeat(32)}`, name: "NVDA / USDG",
            base_token_price_usd: "237.7", quote_token_price_usd: "1.0",
            reserve_in_usd: "5000000", volume_usd: { h24: "900000" },
            price_change_percentage: { h1: "0.4", h24: "1.9" },
          },
          relationships: {
            dex: { data: { id: "uniswap-v4-robinhood" } },
            base_token: { data: { id: `robinhood_${NVDA}` } },
            quote_token: { data: { id: `robinhood_${USDG}` } },
          },
        }],
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    let rpc: { id: number; method: string; params: [{ data?: string; input?: string }] } | null = null;
    try { rpc = JSON.parse(String(init?.body ?? "")); } catch { rpc = null; }
    if (rpc && rpc.method === "eth_call") {
      const data = (rpc.params[0].data ?? rpc.params[0].input ?? "").toLowerCase();
      const now = BigInt(Math.floor(Date.now() / 1000) - 60);
      const result = data.startsWith("0x313ce567") // decimals()
        ? `0x${word(8n)}`
        : data.startsWith("0xfeaf968c") // latestRoundData()
          ? `0x${word(1n)}${word(23_055_000_000n)}${word(now)}${word(now)}${word(1n)}`
          : "0x";
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;

  try {
    type Arb = { verdict?: string; provenance?: string; provenance_note?: string; error?: string;
      delta?: { pct: number | null; abs_usd: number | null } | null;
      dex?: { price_usd?: number | null; change_24h_pct?: number | null; total_tvl_usd?: number; volume_24h_usd?: number | null; pool_ref?: string } | null;
      chainlink?: { price_usd?: number } | null };
    const published = (await (await HANDLERS["rh-stock-arb"](new Request("https://blueagent.dev/api/x402/rh-stock-arb", { method: "POST", body: JSON.stringify({ ticker: "NVDA" }) }))).json()) as Arb;
    ok("HANDLERS[rh-stock-arb]: DEX price, delta and verdict withheld, marked quarantined with the note",
      published.dex?.price_usd === null && published.delta?.pct === null && published.delta?.abs_usd === null &&
        published.dex?.change_24h_pct === null && published.verdict === "INSUFFICIENT_DATA" &&
        published.provenance === "quarantined" && published.provenance_note === RH_DESK_QUARANTINE.note,
      JSON.stringify({ x: published.dex?.price_usd, d: published.delta, v: published.verdict, p: published.provenance }));
    ok("…the reads that are real stay: Chainlink price, the pool, its liquidity and volume",
      published.chainlink?.price_usd === 230.55 && published.dex?.total_tvl_usd === 5_000_000 &&
        published.dex?.volume_24h_usd === 900_000 && typeof published.dex?.pool_ref === "string");

    const { callRecorderTool } = await import("../src/lib/blue-hood/tool-caller");
    const raw = await callRecorderTool<Arb>("rh-stock-arb", { ticker: "NVDA" });
    const rawPct = raw.ok ? raw.data.delta?.pct : undefined;
    ok("the recorder path gets the RAW reading (the archive keeps recording)",
      raw.ok && raw.data.dex?.price_usd === 237.7 && typeof rawPct === "number" && Math.abs(rawPct - 3.1012) < 0.001 &&
        raw.data.verdict !== "INSUFFICIENT_DATA" && raw.data.provenance === undefined,
      JSON.stringify(raw.ok ? { x: raw.data.dex?.price_usd, d: rawPct, v: raw.data.verdict } : raw));

    const bad = (await (await HANDLERS["rh-stock-arb"](new Request("https://blueagent.dev/api/x402/rh-stock-arb", { method: "POST", body: "{}" }))).json()) as Arb;
    ok("an error body carries no reading and passes through unmarked", typeof bad.error === "string" && bad.provenance === undefined);

    // The door itself: the real x402 route, on the internal free-bypass a server
    // job uses (no payment needed to observe what the route serves).
    process.env.INTERNAL_SERVICE_KEY = "rh-quarantine-check";
    const x402 = await import("../src/app/api/x402/[tool]/route");
    const { NextRequest } = await import("next/server");
    // Withholding alone left the door CHARGING for the withheld verdict: the route
    // settles on any 200. So the paid door must refuse before a payment
    // requirement exists — on the POST path and on the GET (402 discovery) path.
    const { haltReason } = await import("../src/lib/tool-halts");
    for (const id of ["rh-stock-arb", "rh-stock-agent-brief"]) {
      ok(`${id} is halted (its product is a direction built on the withheld leg)`, haltReason(id) !== null);
      const post = await x402.POST(
        new NextRequest(`https://blueagent.dev/api/x402/${id}`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-blue-internal": "rh-quarantine-check", "x-blue-service": "internal" },
          body: JSON.stringify({ ticker: "NVDA" }),
        }),
        { params: Promise.resolve({ tool: id }) },
      );
      const postBody = (await post.json()) as { code?: string; verdict?: string };
      ok(`/api/x402/${id} POST refuses (501 TOOL_HALTED) — nothing runs, nothing is charged`,
        post.status === 501 && postBody.code === "TOOL_HALTED" && postBody.verdict === undefined, `${post.status} ${postBody.code}`);
      const get = await x402.GET(new NextRequest(`https://blueagent.dev/api/x402/${id}`), { params: Promise.resolve({ tool: id }) });
      ok(`/api/x402/${id} GET issues no payment requirement`, get.status === 501 && !get.headers.get("payment-required"), String(get.status));
    }

    // A4 — halted at the route, and what still reaches the handler without the
    // route (Blue Hood's brief fetcher calls HANDLERS) gets the published block.
    type Brief = { verdict?: string; verdict_note?: string; provenance?: string; provenance_note?: string; warnings?: string[];
      facts?: { dex_price_usd?: number | null; dex_change_24h_pct?: number | null; chainlink_price_usd?: number | null; dex_tvl_usd?: number | null; dex_volume_24h_usd?: number | null } };
    const callA = async <T,>(id: string) =>
      (await (await HANDLERS[id](new Request(`https://blueagent.dev/api/x402/${id}`, { method: "POST", body: JSON.stringify({ ticker: "NVDA" }) }))).json()) as T;
    prompts.length = 0;
    const brief = await callA<Brief>("rh-stock-agent-brief");
    ok("HANDLERS[rh-stock-agent-brief]: DEX price and its 24h change withheld; verdict INSUFFICIENT_DATA (not WATCH, not a drift), said why",
      brief.facts?.dex_price_usd === null && brief.facts?.dex_change_24h_pct === null && brief.verdict === "INSUFFICIENT_DATA" &&
        brief.verdict_note === RH_DESK_QUARANTINE.note && brief.provenance === "quarantined" &&
        (brief.warnings ?? []).some((w) => w.startsWith(RH_DESK_QUARANTINE.code)),
      JSON.stringify({ x: brief.facts?.dex_price_usd, v: brief.verdict, p: brief.provenance }));
    ok("…the reads that are real stay: Chainlink price, pool depth and volume",
      brief.facts?.chainlink_price_usd === 230.55 && brief.facts?.dex_tvl_usd === 5_000_000 && brief.facts?.dex_volume_24h_usd === 900_000);
    ok("…and the model was never handed the withheld price (checked on the request sent)",
      prompts.length === 1 && !prompts[0].includes("237.7") && prompts[0].includes('\\"dex_price_usd\\": null'),
      `prompts=${prompts.length}`);

    // A3 — not halted (its product is the brief), so it must withhold the leg
    // BEFORE the prompt: a FACTS block the model is told not to contradict.
    type Report = { provenance?: string; warnings?: string[];
      facts?: { dex_price_usd?: number | null; dex_change_24h_pct?: number | null; dex_change_1h_pct?: number | null; chainlink_price_usd?: number | null; dex_tvl_usd?: number | null; dex_price_unavailable_reason?: string | null } };
    prompts.length = 0;
    const report = await callA<Report>("rh-stock-report");
    ok("HANDLERS[rh-stock-report]: DEX price and the changes computed on it withheld, the reason is the quarantine note",
      report.facts?.dex_price_usd === null && report.facts?.dex_change_24h_pct === null && report.facts?.dex_change_1h_pct === null &&
        report.facts?.dex_price_unavailable_reason === RH_DESK_QUARANTINE.note && report.provenance === "quarantined" &&
        (report.warnings ?? []).some((w) => w.startsWith(RH_DESK_QUARANTINE.code)),
      JSON.stringify({ x: report.facts?.dex_price_usd, p: report.provenance }));
    ok("…Chainlink and depth stay", report.facts?.chainlink_price_usd === 230.55 && report.facts?.dex_tvl_usd === 5_000_000);
    ok("…and the model was never handed the withheld price", prompts.length === 1 && !prompts[0].includes("237.7"), `prompts=${prompts.length}`);

    await withQuarantineLiftedForTest(async () => {
      const b = await callA<Brief>("rh-stock-agent-brief");
      ok("lifted (test only), A4 maps the drift again (AFTERHOURS/PREMARKET/ARB…, not INSUFFICIENT_DATA), marked measured",
        b.facts?.dex_price_usd === 237.7 && b.verdict !== "INSUFFICIENT_DATA" && b.provenance === "measured", JSON.stringify({ v: b.verdict, p: b.provenance }));
    });

    await withQuarantineLiftedForTest(async () => {
      const lifted = (await (await HANDLERS["rh-stock-arb"](new Request("https://blueagent.dev/api/x402/rh-stock-arb", { method: "POST", body: JSON.stringify({ ticker: "NVDA" }) }))).json()) as Arb;
      ok("lifted (test only), the paid tool serves the delta again, marked measured",
        lifted.dex?.price_usd === 237.7 && typeof lifted.delta?.pct === "number" && lifted.provenance === "measured",
        JSON.stringify({ x: lifted.dex?.price_usd, d: lifted.delta?.pct, p: lifted.provenance }));
    });
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.VIRTUALS_API_KEY;
  }

  // Every handler that reads the leg LIVE, enumerated by what it calls — the
  // blind spot that let A4 sell the drift at 4× M5's price while a comment here
  // said the class was closed. Each must be halted, publish through the
  // quarantine, or be an execution quote whose property holds.
  const { HALTED_TOOLS } = await import("../src/lib/tool-halts");
  const HANDLERS_DIR = path.join(SRC, "app/api/x402/_handlers");
  const liveLegReaders = all.filter((f) => {
    const c = code(fs.readFileSync(f, "utf8"));
    return /\bresolvePrimaryPool\s*\(/.test(c) && /\bchainlinkLatest\s*\(/.test(c);
  });
  ok(`found the live readers of the DEX leg (${liveLegReaders.length}) — the detector is alive`, liveLegReaders.length >= 6, liveLegReaders.map(rel).join(", "));
  /** Not a direction, a QUOTE: the figure sizes a trade the user signs, and
   *  withholding it removes the quote rather than a claim. Listed with the
   *  property that makes that true, CHECKED; NOT CLOSED — quarantine.ts says
   *  what stays open (the quote basis is the price-source fix's decision). */
  const DIRECTION = /\b(LONG_DEX|SHORT_DEX|ARB_LONG_DEX|ARB_SHORT_DEX|PREMARKET_DRIFT|AFTERHOURS_DRIFT|FROZEN_ALIGNED)\b/;
  const EXECUTION_QUOTE: Record<string, string> = {
    "src/app/api/x402/_handlers/rh-stock-swap-quote.ts": "swap quote — the figure is the min_out basis",
    "src/app/api/x402/_handlers/rh-stock-swap-prepare.ts": "swap calldata — the figure is the min_out basis",
    "src/app/api/x402/_handlers/rh-sector-basket.ts": "buy plan — the figure sizes legs only when the oracle is stale or absent",
  };
  for (const f of liveLegReaders) {
    const r = rel(f);
    const src = fs.readFileSync(f, "utf8");
    const c = code(src);
    const id = path.dirname(f) === HANDLERS_DIR ? path.basename(f, ".ts") : null;
    const halted = id !== null && Object.prototype.hasOwnProperty.call(HALTED_TOOLS, id);
    const publishes = /from "@\/lib\/blue-hood\/quarantine"/.test(src) && /\bpublish(ArbResult|RhFacts)\(/.test(c);
    if (EXECUTION_QUOTE[r]) {
      ok(`${r}: ${EXECUTION_QUOTE[r]} — and it maps no direction from the gap`, !DIRECTION.test(c));
      continue;
    }
    ok(`${r}: halted (${halted}) or publishes through the quarantine (${publishes})`, halted || publishes);
    if (DIRECTION.test(c)) {
      ok(`${r}: maps a direction from the leg, so it publishes through the quarantine even if halted (defence in depth)`, publishes);
      // A4's ARB notes read "real arb: consider buying DEX" until 2026-10-01 —
      // a trade call riding on the leg, live again the day the quarantine lifts.
      ok(`${r}: names the gap, never tells the reader to buy or sell`, !/consider (buying|selling)|real arb:/i.test(c));
    }
  }
  for (const listed of Object.keys(EXECUTION_QUOTE)) {
    ok(`exemption ${listed} still points at a live reader (no stale entry)`, liveLegReaders.map(rel).includes(listed));
  }

  // ── §6 ─────────────────────────────────────────────────────────────────────
  console.log("\n6. the permanent RH archive is withheld on the way out, raw in KV");

  const archiveReaders = all.filter((f) => /\breadSeriesDays?\s*\(/.test(code(fs.readFileSync(f, "utf8"))) && rel(f) !== "src/lib/blue-hood/poller.ts");
  ok(`found the archive's serving routes (${archiveReaders.length})`, archiveReaders.length >= 2, archiveReaders.map(rel).join(", "));
  for (const f of archiveReaders) {
    const src = fs.readFileSync(f, "utf8");
    ok(`${rel(f)}: publishes the RH archive through the quarantine`,
      /from "@\/lib\/blue-hood\/quarantine"/.test(src) && /\bpublishRhArchivePoints\(/.test(code(src)));
  }

  const { persistSeriesPoint, readSeriesDays } = await import("../src/lib/blue-hood/poller");
  const { yyyymmdd } = await import("../src/lib/blue-hood/kv-keys");
  const nowIso = new Date().toISOString();
  await persistSeriesPoint({
    cycle_id: 2, started_at: nowIso, finished_at: nowIso, duration_ms: 1000,
    tickers: [row({ chain: undefined })],
    metrics: { registry_total: 1, tokens_watched: 1, tokens_errored: 0, tvl_scanned_usd: 0, market_is_open: false, market_session: "afterhours" },
  } as never);
  const today = yyyymmdd(new Date());
  const [stored] = await readSeriesDays([today]);
  const storedRow = stored.status === "hit" ? stored.value.points.at(-1)?.rows.find((r) => r.ticker === "NVDA") : undefined;
  ok("the recorder wrote the raw DEX leg to the archive (fixture is live)", storedRow?.dex_usd === 237.7 && storedRow?.drift_pct === 3.1, JSON.stringify(storedRow));

  const { NextRequest: NR } = await import("next/server");
  const seriesRoute = await import("../src/app/api/hood/series/route");
  type SeriesBody = { provenance?: string; provenance_note?: string; days: { status: string; points?: { rows: { ticker: string; oracle_usd: number | null; dex_usd: number | null; drift_pct: number | null; total_tvl_usd: number | null }[] }[] }[] };
  const series = (await (await seriesRoute.GET(new NR(`https://blueagent.dev/api/hood/series?day=${today}`))).json()) as SeriesBody;
  const servedRows = series.days.flatMap((d) => d.points ?? []).flatMap((p) => p.rows).filter((r) => r.ticker === "NVDA");
  ok("/api/hood/series: every served RH row has dex_usd and drift_pct withheld, marked quarantined",
    servedRows.length > 0 && servedRows.every((r) => r.dex_usd === null && r.drift_pct === null) &&
      series.provenance === "quarantined" && series.provenance_note === RH_DESK_QUARANTINE.note,
    JSON.stringify({ n: servedRows.length, first: servedRows[0], p: series.provenance }));
  ok("…the oracle price and liquidity are served as recorded", servedRows.every((r) => r.oracle_usd === 230.55 && r.total_tvl_usd === 6_000_000));

  const tickerSeries = await import("../src/app/api/hood/ticker-series/route");
  type TsBody = { provenance?: string; deadband?: { graded: number }; segments: { kind: string; points?: { dex_usd: number | null; drift_pct: number | null; oracle_usd: number | null }[] }[] };
  const ts = (await (await tickerSeries.GET(new NR("https://blueagent.dev/api/hood/ticker-series?ticker=NVDA&chain=robinhood&days=1"))).json()) as TsBody;
  const tsPoints = ts.segments.flatMap((s) => s.points ?? []);
  ok("/api/hood/ticker-series (robinhood): the chart gets no DEX price and no drift, and grades none",
    tsPoints.length > 0 && tsPoints.every((p) => p.dex_usd === null && p.drift_pct === null && p.oracle_usd === 230.55) &&
      ts.deadband?.graded === 0 && ts.provenance === "quarantined",
    JSON.stringify({ n: tsPoints.length, first: tsPoints[0], graded: ts.deadband?.graded, p: ts.provenance }));

  const [after] = await readSeriesDays([today]);
  const afterRow = after.status === "hit" ? after.value.points.at(-1)?.rows.find((r) => r.ticker === "NVDA") : undefined;
  ok("…serving it did not touch the archive (still raw in KV)", afterRow?.dex_usd === 237.7 && afterRow?.drift_pct === 3.1);

  await withQuarantineLiftedForTest(async () => {
    const lifted = (await (await tickerSeries.GET(new NR("https://blueagent.dev/api/hood/ticker-series?ticker=NVDA&chain=robinhood&days=1"))).json()) as TsBody;
    const pts = lifted.segments.flatMap((s) => s.points ?? []);
    ok("lifted (test only), the RH chart draws the recorded DEX leg again, marked measured",
      pts.some((p) => p.dex_usd === 237.7 && p.drift_pct === 3.1) && lifted.provenance === "measured");
  });

  // ── §7 ─────────────────────────────────────────────────────────────────────
  console.log("\n7. the board buckets a quarantined row by its real liquidity, not as NO POOL");

  const { boardRowState, isWithheld } = await import("../src/lib/blue-hood/board-rows");
  // Re-read the snapshot route: §5/§6 leave KV_SNAPSHOT_LATEST as §3 wrote it.
  const board = (await (await snapRoute.GET()).json()) as typeof snap;
  const boardRh = board.snapshot.tickers.find((t) => t.chain === "robinhood")!;
  const boardBase = board.snapshot.tickers.find((t) => t.chain === "base")!;
  ok("the published RH row (a $6M pool) is TRADABLE and withheld — not no-data",
    boardRowState(boardRh) === "tradable" && isWithheld(boardRh), `${boardRowState(boardRh)} withheld=${isWithheld(boardRh)}`);
  ok("the published Base row is tradable and NOT withheld", boardRowState(boardBase) === "tradable" && !isWithheld(boardBase));
  const { publishDeskRow } = await import("../src/lib/blue-hood/quarantine");
  const thin = publishDeskRow(row({ chain: "robinhood", total_tvl_usd: 1_200, tvl_usd: 1_200 }));
  ok("a withheld RH row on a thin pool is DUST (by its liquidity), still withheld", boardRowState(thin) === "dust" && isWithheld(thin));
  const noPool = publishDeskRow(row({ chain: "robinhood", dex_usd: null, drift_pct: null, verdict: "INSUFFICIENT_DATA", no_data_reason: "no_pool" }));
  ok("an RH row where the poller found NO pool is still no-data (a real absence)", boardRowState(noPool) === "no_data" && !isWithheld(noPool));
  const errored = publishDeskRow(row({ chain: "robinhood", dex_usd: null, drift_pct: null, verdict: "ERROR", no_data_reason: "fetch_failed" }));
  ok("an errored RH row stays no-data (FETCH FAILED), not withheld", boardRowState(errored) === "no_data" && !isWithheld(errored));
  await withQuarantineLiftedForTest(async () => {
    const measured = publishDeskRow(row({ chain: "robinhood" }));
    ok("lifted, the same RH row is tradable and not withheld", boardRowState(measured) === "tradable" && !isWithheld(measured));
  });

  // Both "use client" trees bucket through the one module — a private copy is
  // how the regression happened (two copies, both read withheld as "no pool").
  for (const f of ["src/app/app/hood/HoodClient.tsx", "src/app/app/hood/HoodSidebar.tsx"]) {
    const s = code(fs.readFileSync(path.join(WEB, f), "utf8"));
    ok(`${f}: buckets through blue-hood/board-rows, with no private isNoData/isDust`,
      /from "@\/lib\/blue-hood\/board-rows"/.test(s) && /\bboardRowState\(/.test(s) && !/function\s+(isNoData|isDust)\b/.test(s));
  }
  const client = code(fs.readFileSync(path.join(WEB, "src/app/app/hood/HoodClient.tsx"), "utf8"));
  ok("HoodClient: the NO DATA branch is taken on the shared state, and a withheld row says WITHHELD",
    /const noData = state === "no_data"/.test(client) && /<WithheldBadge\b/.test(client) && /withheld \?/.test(client));

  console.log(failures === 0 ? "\nrh-quarantine-check: PASS" : `\nrh-quarantine-check: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
