/**
 * The Hub form posts every input as a STRING. Any handler that reads a
 * ticker-list must therefore accept `"AAPL,TSLA,NVDA"` and not just
 * `["AAPL","TSLA","NVDA"]`.
 *
 * WHY THIS TEST EXISTS
 * --------------------
 * Two paid $0.10 tools were 100% unusable from the Hub and nothing caught it,
 * because every existing guard was satisfied:
 *   - the handler was registered in HANDLERS and AGENT_TOOLS (counts matched),
 *   - `tsc` was happy (the body type claimed `string[]`, and JSON.parse returns
 *     `any`, so the string never met the declared type at compile time),
 *   - the tool returned a clean JSON error, so no crash was ever logged,
 *   - and /api/x402 converts that into "Tool failed — you were not charged",
 *     which reads like a flaky upstream rather than a structural break.
 *
 * MEASURED 2026-09-26, before the fix:
 *   rh-stock-correlations  "AAPL,TSLA,NVDA" → 400 "Provide `tickers` — 2 to 10"
 *   rh-sector-basket       "AAPL,TSLA,NVDA" → 500 "tickersRaw.map is not a function"
 *
 * The 400 is the nastier of the two: `tickersRaw.length` on a string is the
 * CHARACTER count, so the arity guard blamed the user's ticker count for a type
 * error. Any message that misattributes a bug to the caller buys silence.
 *
 * It deliberately does NOT test parseTickerList in isolation only — the unit was
 * never the problem, the wiring was — so it also calls the real handlers.
 *
 * 🔴 THE HANDLER CALLS TOUCH THE NETWORK, SO THE ASSERTION IS *DIFFERENTIAL*.
 * These handlers read GeckoTerminal, which rate-limits (observed: repeated 429
 * on the first run of this very test). A naive "string form must return 200"
 * would go red whenever upstream sneezed, and a flaky test inside the mandatory
 * gate is worse than no test — it trains everyone to push past a red gate. So
 * the string form is compared against the ARRAY form in the same run:
 *   - an upstream outage hits BOTH forms equally → not a failure, reported as
 *     an upstream note,
 *   - the wiring bug hits ONLY the string form → failure.
 * Plus two signatures that a 429 can never produce (`is not a function`, and
 * the arity message fired by a character count) are always failures.
 */
import { HANDLERS } from "../src/app/api/x402/_handlers";
import { parseTickerList } from "../src/lib/robinhood/rwa-registry";

type Pair = {
  id: string;
  label: string;
  /** Exactly the shape HubView builds from the form: every value a string. */
  hub: Record<string, unknown>;
  /** The same request an API caller would send, with a real array. */
  api: Record<string, unknown>;
  /**
   * How many tickers the handler says it PARSED OUT OF THE INPUT. Deliberately
   * not "how many legs came back" — the basket legitimately drops legs for thin
   * liquidity or a missing dollar price, so a leg count would go red on a real
   * market condition. Input arity is the only thing this test is about.
   */
  resolved: (p: Record<string, unknown>) => number | null;
};

const PAIRS: Pair[] = [
  {
    id: "rh-stock-correlations",
    label: "tickers (required input, so the Hub form ALWAYS sends a string)",
    hub: { tickers: "AAPL,TSLA,NVDA" },
    api: { tickers: ["AAPL", "TSLA", "NVDA"] },
    resolved: (p) => (Array.isArray(p.tickers) ? p.tickers.length : null),
  },
  {
    id: "rh-sector-basket",
    label: "tickers + total_usd (both strings from the form)",
    hub: { tickers: "AAPL,TSLA,NVDA", total_usd: "100" },
    api: { tickers: ["AAPL", "TSLA", "NVDA"], total_usd: 100 },
    resolved: (p) =>
      typeof p.requested_constituent_count === "number"
        ? p.requested_constituent_count
        : Array.isArray(p.constituents)
          ? p.constituents.length
          : null,
  },
];

/** Failure signatures that CANNOT be caused by a rate limit or an outage. */
const WIRING_BUG = [
  /is not a function/i,           // a string reached array code
  /Provide `tickers` — 2 to 10/,  // arity guard fired on a CHARACTER count
];

let failures = 0;
const notes: string[] = [];

function fail(msg: string) { failures++; console.error(`  FAIL ${msg}`); }

type Outcome = { status: number; error: string | null; resolved: number | null };

async function call(p: Pair, body: Record<string, unknown>): Promise<Outcome | Error> {
  const req = new Request(`https://blueagent.dev/api/x402/${p.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let resp: Response;
  try { resp = await HANDLERS[p.id](req); } catch (e) { return e as Error; }
  let payload: Record<string, unknown> = {};
  try { payload = JSON.parse(await resp.text()); } catch { payload = {}; }
  return {
    status: resp.status,
    // route.ts refuses to charge on EITHER condition, so both collapse to one.
    error: typeof payload.error === "string" ? payload.error : resp.ok ? null : `status ${resp.status}`,
    resolved: p.resolved(payload),
  };
}

async function run() {
  // --- normaliser contract (pure, no network — the real regression lock) ----
  const norm: [unknown, string | null, string[]][] = [
    ["AAPL,TSLA,NVDA", null, ["AAPL", "TSLA", "NVDA"]],
    [" AAPL , TSLA ", null, ["AAPL", "TSLA"]],
    [["AAPL", "TSLA"], null, ["AAPL", "TSLA"]],
    [undefined, "AAPL,TSLA", ["AAPL", "TSLA"]],
    [undefined, null, []],
    // A blank form field must not shadow the query param. The Hub posts every
    // declared input, including the ones the user left empty.
    ["", "AAPL", ["AAPL"]],
    ["   ", "AAPL", ["AAPL"]],
    // Junk separators must not become empty tickers.
    ["AAPL,,TSLA,", null, ["AAPL", "TSLA"]],
    [[" AAPL ", "", "TSLA"], null, ["AAPL", "TSLA"]],
  ];
  for (const [body, query, want] of norm) {
    const got = parseTickerList(body, query);
    if (JSON.stringify(got) !== JSON.stringify(want)) {
      fail(`parseTickerList(${JSON.stringify(body)}, ${JSON.stringify(query)}) → ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
    }
  }

  // --- the wiring, which is what actually broke -----------------------------
  for (const p of PAIRS) {
    if (typeof HANDLERS[p.id] !== "function") { fail(`${p.id}: no handler registered`); continue; }

    const [hub, api] = await Promise.all([call(p, p.hub), call(p, p.api)]);

    for (const [which, out] of [["hub-string", hub], ["api-array", api]] as const) {
      if (out instanceof Error) { fail(`${p.id} [${which}]: threw ${out.message}`); }
    }
    if (hub instanceof Error || api instanceof Error) continue;

    // 1. Signatures no outage can produce. Always a failure.
    for (const re of WIRING_BUG) {
      if (hub.error && re.test(hub.error)) {
        fail(`${p.id} [${p.label}]: string input hit the wiring bug — ${hub.error}`);
      }
    }

    // 2. Differential. Only the string form failing is the bug; both failing is
    //    upstream and must not redden the gate.
    if (hub.error && !api.error) {
      fail(`${p.id} [${p.label}]: string form refused (${hub.error}) while the array form succeeded — a Hub buyer sees "Tool failed", an API caller does not`);
      continue;
    }
    if (hub.error && api.error) {
      notes.push(`${p.id}: both forms refused identically (${hub.error}) — upstream, not wiring`);
      continue;
    }

    // 3. Same product for the same price. Both callers sent the same 3 tickers
    //    and paid the same $0.10, so both must have PARSED 3 — otherwise one of
    //    them is quietly buying a smaller product.
    if (hub.resolved !== api.resolved) {
      fail(`${p.id} [${p.label}]: string form parsed ${hub.resolved} ticker(s), array form parsed ${api.resolved} — same price, different product`);
    } else if (hub.resolved !== 3) {
      fail(`${p.id} [${p.label}]: sent 3 tickers, handler reports ${hub.resolved} parsed`);
    }
  }

  for (const n of notes) console.log(`  note ${n}`);
  if (failures) {
    console.error(`\nticker-list-input-test: ${failures} failure(s)`);
    process.exit(1);
  }
  console.log(`ticker-list-input-test: ${norm.length} normaliser cases + ${PAIRS.length} string-vs-array handler pairs OK`);
}

run().catch((e) => { console.error(e); process.exit(1); });
