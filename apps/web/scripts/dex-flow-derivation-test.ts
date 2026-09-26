/**
 * CI guard on x402/dex-flow's flow derivation.
 *
 * Run: `npx tsx scripts/dex-flow-derivation-test.ts` from `apps/web/`.
 * Hermetic: one pure function plus a read of the handler source. No env, no
 * network, no LLM.
 *
 * WHY THIS EXISTS. Until 2026-09-26 the handler handed five nested DexScreener
 * pair objects to a reasoning model and asked it to derive pressureScore, the
 * buy/sell ratios and the formatted volumes itself. That arithmetic request made
 * the model's hidden reasoning phase expand to fill any budget offered
 * (measured: 1657 tokens at a 2000 budget, 8099 at 12000 — it tracked the budget
 * instead of converging), so it starved its own answer and the paid $0.15 tool
 * returned HTTP 500 on every real call. No `maxTokens` value fixed it; moving
 * the arithmetic into code did.
 *
 * The regression this blocks is therefore not "the numbers are wrong" — it is
 * someone moving a derivation back into the prompt, which typechecks, builds,
 * and fails only in production against a live gateway. §1–§3 pin the arithmetic
 * as a pure function; §4 asserts the prompt never asks for it again; §5 pins the
 * PAIR SIDE RULE, which used to be a paragraph of prompt text and is now
 * arithmetic (a quote-side pool's buys count the OTHER token's trades, so they
 * must not reach pressureScore — that is how this once reported AERO's buy
 * pressure as USDC's).
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { deriveFlow, type DexPair } from "../src/app/api/x402/_handlers/dex-flow";

let failures = 0, checks = 0;
function ok(label: string, cond: boolean) {
  checks++;
  if (!cond) { failures++; console.error(`  FAIL  ${label}`); }
  else console.log(`  ok    ${label}`);
}

const pair = (p: Partial<DexPair> = {}): DexPair => ({
  dex: "aerodrome", pair: "TKN/WETH", price: "1.00",
  queried_token: "TKN", queried_token_side: "base", flow_measured_in: "TKN",
  priceChange1h: 0, priceChange24h: 0,
  volume24h: 0, liquidity: 0, buys24h: 0, sells24h: 0,
  ...p,
});

/** The USDC shape: the queried token is the QUOTE, so the counts are AERO's. */
const quoteSide = (p: Partial<DexPair> = {}): DexPair => pair({
  pair: "AERO/USDC", queried_token: "USDC", queried_token_side: "quote",
  flow_measured_in: "AERO", price: null, priceChange1h: null, priceChange24h: null,
  ...p,
});

console.log("\n§1 the verdict word is a pure function of the score");
// CLAUDE.md: verdicts hard-map from the numeric score in code, never chosen by
// the LLM — otherwise the same input flips between runs.
const band = (buys: number, sells: number) => deriveFlow([pair({ buys24h: buys, sells24h: sells })]);
ok("80/20 → STRONG_BUY",        band(80, 20).pressure === "STRONG_BUY");
ok("60/40 → BUY",               band(60, 40).pressure === "BUY");
ok("50/50 → NEUTRAL",           band(50, 50).pressure === "NEUTRAL");
ok("40/60 → SELL",              band(40, 60).pressure === "SELL");
ok("20/80 → STRONG_SELL",       band(20, 80).pressure === "STRONG_SELL");
ok("score is the buy share",    band(65, 35).pressureScore === 65);
ok("same input, same verdict",  band(65, 35).pressure === band(65, 35).pressure);

console.log("\n§2 absent data stays absent");
// CLAUDE.md: missing data → unknown. A zero-trade pool must NOT collapse to a
// neutral 50 — that publishes a measured-looking score derived from nothing.
const dead = deriveFlow([pair({ liquidity: 5_000_000, volume24h: 0 })]);
ok("no trades → pressureScore null",   dead.pressureScore === null);
ok("no trades → pressure UNKNOWN",     dead.pressure === "UNKNOWN");
ok("no trades → ratio says so",        /no trades/.test(dead.buySellRatio));
ok("no trades never reads as 50",      dead.pressureScore !== 50);
const noPairs = deriveFlow([]);
ok("no pairs → score null",            noPairs.pressureScore === null);
ok("no pairs → liquidity UNKNOWN",     noPairs.liquidityHealth === "UNKNOWN");

console.log("\n§3 totals are summed across pairs, not taken from one");
const multi = deriveFlow([
  pair({ buys24h: 30, sells24h: 10, volume24h: 1_500_000, liquidity: 900_000 }),
  pair({ buys24h: 10, sells24h: 50, volume24h:   500_000, liquidity: 200_000 }),
]);
ok("buys summed",              multi.totalBuys === 40);
ok("sells summed",             multi.totalSells === 60);
ok("score from the totals",    multi.pressureScore === 40);
ok("volume summed + formatted", multi.volume24h === "$2.00M");
ok("liquidity band from total", multi.liquidityHealth === "DEEP");
ok("one topPairs row per pair", multi.topPairs.length === 2);
ok("per-pair ratio derived",    multi.topPairs[0].buySellRatio === "75% buys / 25% sells");

console.log("\n§4 the prompt still asks for prose only");
const src = readFileSync(
  path.join(path.dirname(path.resolve(process.argv[1])), "..", "src/app/api/x402/_handlers/dex-flow.ts"),
  "utf8",
);
const system = /const SYSTEM = `([\s\S]*?)`;/.exec(src)?.[1] ?? "";
ok("CONTROL the SYSTEM prompt was located", system.length > 0);
// The four fields whose in-prompt derivation caused the 500. If one reappears in
// the schema the model is being asked to compute it again.
for (const field of ["pressureScore", "buySellRatio", "liquidityHealth", "topPairs"]) {
  ok(`SYSTEM does not ask the model for ${field}`, !system.includes(field));
}
ok("SYSTEM tells the model the figures are already computed", /ALREADY been computed/i.test(system));
// The degrade path is what turns a gateway outage into null prose instead of a
// 500. A throw here would restore the original bug.
ok("synthesis failure degrades rather than throws",
   /catch \(e\) \{[\s\S]{0,200}?synthesis unavailable/.test(src));

console.log("\n§5 quote-side pools never contribute someone else's direction");
// A DexScreener "buy" is a buy OF THE BASE TOKEN. On AERO/USDC the counts are
// AERO's, so folding them into a USDC answer inverts them — the bug that made
// this tool report AERO's buy pressure as USDC's.
const usdcShape = deriveFlow([
  quoteSide({ buys24h: 900, sells24h: 100, volume24h: 20_000_000, liquidity: 39_000_000 }),
  quoteSide({ buys24h: 400, sells24h: 600, volume24h:  4_000_000, liquidity:  8_000_000 }),
]);
ok("quote-only → pressure UNKNOWN",      usdcShape.pressure === "UNKNOWN");
ok("quote-only → score null",            usdcShape.pressureScore === null);
ok("quote-only → not 90 (the base's)",   usdcShape.pressureScore !== 90);
ok("quote-only → flagged",               usdcShape.quoteSideOnly === true);
ok("quote-only ratio names the reason",  /quote-side/.test(usdcShape.buySellRatio));
// Whole-pool figures are side-agnostic and MUST survive: dropping quote-side
// pairs would report USDC's depth as its $144k base-side pool, not $47M.
ok("quote-only keeps real volume",       usdcShape.volume24h === "$24.00M");
ok("quote-only keeps real liquidity",    usdcShape.liquidityHealth === "DEEP");
ok("quote-only still lists its pairs",   usdcShape.topPairs.length === 2);
ok("per-pair ratio says whose it is",    usdcShape.topPairs[0].flowMeasuredIn === "AERO");

// Mixed: only the base-side row may steer the verdict.
const mixed = deriveFlow([
  quoteSide({ buys24h: 900, sells24h: 100, volume24h: 9_000_000, liquidity: 9_000_000 }),
  pair({ buys24h: 20, sells24h: 80, volume24h: 1_000_000, liquidity: 1_000_000 }),
]);
ok("mixed → score from base side only", mixed.pressureScore === 20);
ok("mixed → verdict from that score",   mixed.pressure === "STRONG_SELL");
ok("mixed → not quoteSideOnly",         mixed.quoteSideOnly === false);
ok("mixed → volume still whole-pool",   mixed.volume24h === "$10.00M");
// An empty input is not "quote-side only" — that would claim a measurement.
ok("no pairs → quoteSideOnly false",    deriveFlow([]).quoteSideOnly === false);
// The side rule is arithmetic now, so the prompt must not be re-asked for it.
for (const field of ["queried_token_side", "flow_measured_in"]) {
  ok(`SYSTEM does not delegate ${field}`, !system.includes(field));
}

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
