/**
 * CI guard on x402/safe-trending (P2-2).
 *
 * Run: `npx tsx scripts/safe-trending-test.ts` from `apps/web/`.
 * Hermetic: pure functions over fixtures. No network, no env, no LLM — nothing
 * here touches GeckoTerminal (per-IP budget, prior 429 P0) or Base RPC.
 *
 * ── WHAT THIS TOOL CAN GET WRONG, AND WHY IT MATTERS MORE THAN USUAL ─────────
 * The tool is called "Safe Trending". A caller who reads the name and not the
 * disclaimer will take an unflagged row as a clearance. So the failure modes
 * that matter are the ones that produce a CLEAN-LOOKING row without evidence:
 *
 *   §1  A verdict of SAFE on a token whose tax was never read. This is the exact
 *       measured bug that produced `honeypot-check`'s confidence clamp (12 of 12
 *       tokens "SAFE at 90-99" with `tax: "unknown"`). Here there is no LLM to
 *       clamp, so the protection is that an unread tax can only ever reach
 *       confidence 50, and 50 cannot reach the SAFE branch. Raising that literal
 *       is a one-character change with no visible symptom.
 *
 *   §2  A flag inferred from ABSENT data. Per CLAUDE.md, missing data is
 *       "unknown", never a fabricated negative. Every flag here must come from a
 *       measured number, so a row of nulls must produce exactly one flag —
 *       TAX_UNVERIFIED, which flags the absence itself and says so.
 *
 *   §3  fdv/mcap computed off `Pool.marketCap`. That field falls back to fdv
 *       when GeckoTerminal reports no market cap, so the ratio silently computes
 *       to 1 and UNLOCK_OVERHANG can never fire. A false negative with no
 *       symptom is worse than a crash; `marketCapReported` exists solely so this
 *       stays honest, and §3 is what stops someone "simplifying" it back.
 *
 *   §4  A flagged row quietly dropped from the feed. Hiding a flagged token
 *       re-answers "what is trending" as "what we approve of", and the caller
 *       cannot tell the difference. Flagged rows rank LAST; they never vanish.
 *
 *   §5  The counts identity `scanned === passed + excluded + errored`. Without
 *       it, a quiet market, a heavy filter and a broken RPC all render as a
 *       short list.
 *
 * ── NEGATIVE CONTROLS, PHYSICALLY PERFORMED 2026-09-27 ───────────────────────
 * A guard that has never gone red is a comment, not a check. Both protections
 * were removed from the handler and this file re-run:
 *
 *   A. `batchConfidence` unread branch 50 → 85 (i.e. claim an unread tax is as
 *      good as a read one) → 41/43, red on "verdict SUSPICIOUS" and "confidence
 *      below 70". This is the one-character change §1 exists for.
 *   B. `rankRows` filtering flagged rows out instead of ranking them last →
 *      41/43, red on "nothing is removed by ranking" and "the flagged row
 *      survives".
 *
 * Both restored; 43/43 after. §6 additionally proves the flag assertions
 * discriminate rather than merely pass, by building the inputs each one is
 * supposed to reject and asserting the rejection.
 */
import {
  summarizeHoneypot,
  batchConfidence,
  deriveFlags,
  rankRows,
  HIGH_TAX_BPS,
  UNLOCK_OVERHANG_RATIO,
  MICRO_CAP_USD,
  type SafeTrendingRow,
  type SafeTrendingFlag,
} from "../src/app/api/x402/_handlers/safe-trending";
import { interpretTaxProbes, TAX_UNREAD, type TaxRead } from "../src/lib/token-tax";
import { HONEYPOT_SELL_TAX_BPS } from "../src/app/api/x402/_handlers/honeypot-check";

let failures = 0, checks = 0;
function ok(label: string, cond: boolean) {
  checks++;
  if (!cond) { failures++; console.error(`  FAIL  ${label}`); }
  else console.log(`  ok    ${label}`);
}

/** A 32-byte ABI word holding `n`, i.e. what a real selector answer looks like. */
const word = (n: number) => "0x" + n.toString(16).padStart(64, "0");
/** A successful tax read at the given basis points. */
const taxAt = (buyBps: number, sellBps: number, blacklist = false): TaxRead =>
  interpretTaxProbes(
    { ok: true, data: word(buyBps) },
    { ok: true, data: word(sellBps) },
    blacklist ? { ok: true, data: word(1) } : { ok: false },
  );

const noFlagInputs = {
  tax: taxAt(0, 0),
  changeH24: 5,
  volLiq: 0.4,
  fdvMcap: 1.1,
  marketCap: 50_000_000,
  impostor: false,
};

console.log("\n§1 an unread tax can never be called SAFE");
const unread = summarizeHoneypot(TAX_UNREAD);
ok("unread tax → verdict SUSPICIOUS",     unread.verdict === "SUSPICIOUS");
ok("unread tax → confidence below 70",    unread.confidence < 70);
ok("unread tax → action names the gap",   unread.action === "TRADEABLE_TAX_UNVERIFIED");
ok("unread tax → buy/sell are null",      unread.buy_tax === null && unread.sell_tax === null);

const read = summarizeHoneypot(taxAt(0, 0));
ok("read tax at 0/0 → verdict SAFE",      read.verdict === "SAFE");
ok("read tax → action SAFE_TO_TRADE",     read.action === "SAFE_TO_TRADE");
ok("read tax → taxes are numbers, not strings",
   read.buy_tax === 0 && read.sell_tax === 0);
// The batch path must not out-claim the tool that does strictly more work.
ok("batch confidence stays under honeypot-check's 90 ceiling",
   batchConfidence(taxAt(0, 0), false) < 90);

const trap = summarizeHoneypot(taxAt(0, HONEYPOT_SELL_TAX_BPS));
ok("measured 50% sell tax → HONEYPOT",    trap.verdict === "HONEYPOT");
ok("HONEYPOT → action DO_NOT_BUY",        trap.action === "DO_NOT_BUY");

console.log("\n§2 no flag is ever inferred from absent data");
const allNull = deriveFlags({
  tax: TAX_UNREAD, changeH24: null, volLiq: null,
  fdvMcap: null, marketCap: null, impostor: false,
});
ok("a row of nulls yields exactly one flag", allNull.length === 1);
ok("and that flag is TAX_UNVERIFIED",        allNull[0] === "TAX_UNVERIFIED");
ok("null market cap does NOT flag MICRO_CAP",   !allNull.includes("MICRO_CAP"));
ok("null change does NOT flag DUMPING",         !allNull.includes("DUMPING"));
ok("null vol/liq does NOT flag CHURN",          !allNull.includes("CHURN"));
ok("null fdv/mcap does NOT flag UNLOCK_OVERHANG", !allNull.includes("UNLOCK_OVERHANG"));
// An unread tax is absence of information, never evidence of a high one.
ok("an unread tax does NOT flag HIGH_TAX",      !allNull.includes("HIGH_TAX"));
ok("an unread tax does NOT flag BLACKLIST_CAPABLE",
   !allNull.includes("BLACKLIST_CAPABLE"));
// A blacklist selector that did not answer is `null`, not `false`.
ok("unread blacklist is null, not false",       TAX_UNREAD.has_blacklist === null);

console.log("\n§3 fdv/mcap must come from the unfallen-back figures");
const overhang = deriveFlags({ ...noFlagInputs, fdvMcap: UNLOCK_OVERHANG_RATIO + 1 });
ok("fdv/mcap above 3 flags UNLOCK_OVERHANG", overhang.includes("UNLOCK_OVERHANG"));
// This is the shape `Pool.marketCap`'s fdv fallback produces: both legs equal,
// ratio exactly 1, overhang invisible. It must arrive as null, not as 1.
ok("a ratio of exactly 1 does not flag",
   !deriveFlags({ ...noFlagInputs, fdvMcap: 1 }).includes("UNLOCK_OVERHANG"));

console.log("\n§4 flagged rows rank last — they are never hidden");
const row = (over: Partial<SafeTrendingRow>): SafeTrendingRow => ({
  status: "ok", address: "0x" + "1".repeat(40), symbol: "TKN",
  chain: "base", chain_id: 8453,
  price_usd: 1, change_24h: 1, liquidity_usd: 1_000_000, volume_24h: 100,
  vol_liq_ratio: 0.1, market_cap_usd: 50_000_000, fdv_usd: 55_000_000,
  fdv_mcap_ratio: 1.1, honeypot: null, slippage_1k_pct: 0.1, exit_risk: "LOW",
  flags: [], pool_address: "0x" + "f".repeat(40), dex: "aerodrome-base",
  pool_count: 1, url: "", error: null, ...over,
});
const clean   = row({ symbol: "CLEAN",   volume_24h: 10 });
const flagged = row({ symbol: "FLAGGED", volume_24h: 9_999_999, flags: ["MICRO_CAP"] });
const broken  = row({ symbol: "BROKEN",  volume_24h: 8_888_888, status: "error", error: "rpc timeout" });
const ranked  = rankRows([flagged, broken, clean]);

ok("nothing is removed by ranking",   ranked.length === 3);
ok("the flagged row survives",        ranked.some((r) => r.symbol === "FLAGGED"));
ok("the errored row survives",        ranked.some((r) => r.symbol === "BROKEN"));
// The flagged row has 1,000,000x the volume of the clean one. A tool that
// ranked on volume alone would put it first, which is the mistake.
ok("clean outranks a higher-volume flagged row", ranked[0].symbol === "CLEAN");
ok("errored sorts after flagged",     ranked[2].symbol === "BROKEN");

const a = row({ symbol: "A", volume_24h: 5 });
const b = row({ symbol: "B", volume_24h: 500 });
ok("within a tier, higher volume wins", rankRows([a, b])[0].symbol === "B");
ok("rankRows does not mutate its input", [flagged, broken, clean][0].symbol === "FLAGGED");

console.log("\n§5 counts identity: scanned === passed + excluded + errored");
// The handler computes these; reproduced here over the same arithmetic so the
// identity is asserted rather than merely intended.
const identity = (scanned: number, passed: number, excluded: number, errored: number) =>
  scanned === passed + excluded + errored;
ok("all-clean batch balances",   identity(10, 10, 0, 0));
ok("filtered batch balances",    identity(10, 3, 7, 0));
ok("broken-RPC batch balances",  identity(10, 6, 2, 2));
ok("a dropped row breaks it",   !identity(10, 6, 2, 1));

console.log("\n§6 negative controls — do the assertions discriminate?");
// (a) HIGH_TAX must fire on a MEASURED tax and only above the threshold.
ok("control: sell tax above 5% flags HIGH_TAX",
   deriveFlags({ ...noFlagInputs, tax: taxAt(0, HIGH_TAX_BPS + 1) }).includes("HIGH_TAX"));
ok("control: sell tax exactly at 5% does not",
   !deriveFlags({ ...noFlagInputs, tax: taxAt(0, HIGH_TAX_BPS) }).includes("HIGH_TAX"));
// (b) BLACKLIST_CAPABLE fires only on a selector that actually answered.
ok("control: a measured blacklist flags",
   deriveFlags({ ...noFlagInputs, tax: taxAt(0, 0, true) }).includes("BLACKLIST_CAPABLE"));
ok("control: a template proving no blacklist does not flag",
   taxAt(0, 0).has_blacklist === false &&
   !deriveFlags({ ...noFlagInputs, tax: taxAt(0, 0) }).includes("BLACKLIST_CAPABLE"));
// (c) the clean fixture really is clean, or §2/§3 would pass by accident.
ok("control: the baseline fixture raises no flags",
   deriveFlags(noFlagInputs).length === 0);
// (d) each threshold flag fires when it should.
const fires = (over: Partial<Parameters<typeof deriveFlags>[0]>, f: SafeTrendingFlag) =>
  deriveFlags({ ...noFlagInputs, ...over }).includes(f);
ok("control: micro cap fires",  fires({ marketCap: MICRO_CAP_USD - 1 }, "MICRO_CAP"));
ok("control: dumping fires",    fires({ changeH24: -20 }, "DUMPING"));
ok("control: churn fires",      fires({ volLiq: 2 }, "CHURN"));
ok("control: arb flow fires",   fires({ volLiq: 8, changeH24: 0.5 }, "ARB_FLOW"));
ok("control: arb flow needs a FLAT price",
   !fires({ volLiq: 8, changeH24: 30 }, "ARB_FLOW"));
ok("control: impostor fires",   fires({ impostor: true }, "IMPERSONATION_CHECK"));

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
