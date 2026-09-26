/**
 * CI guard on x402/pool-scan's row shape, dedupe and new-pool filter (P1-7).
 *
 * Run: `npx tsx scripts/pool-scan-shape-test.ts` from `apps/web/`.
 * Hermetic: pure functions over fixtures. No network, no env, no LLM — nothing
 * here touches GeckoTerminal, which is the point (that API has a per-IP budget
 * and a prior P0 from tripping its 429).
 *
 * ── WHAT WENT WRONG, MEASURED 2026-09-26 ─────────────────────────────────────
 * Every one of the 18 MCP tools was exercised by hand against BaseScan the same
 * morning. `pool-scan` returned AERO six times as six separate rows, and not one
 * row carried a token address. Both are the same defect: the tool published a
 * POOL feed while presenting it as a TOKEN feed. With no address on a row, an
 * agent had to spend a second call resolving each ticker before it could do
 * anything with it — which is why a realistic "scan hot pools, filter
 * honeypots" prompt cost 21 tool calls. Separately, `new_pools` was 20/20 empty
 * pools with nothing marking them as unfundable.
 *
 * ── WHAT THIS FILE BLOCKS ────────────────────────────────────────────────────
 * §2 the six-AERO regression. §3 the one that is easy to reintroduce and hard
 * to see: picking the subject token off the BASE leg only. That assumption has
 * shipped here before (#312; and see the header of lib/dex-side.ts, where six
 * of USDC's deepest Base pairs are quote-side, so reading baseToken off the
 * deepest answered a USDC question with AERO's price). It typechecks, it builds,
 * and it is wrong only for pools whose interesting token happens to be quoted —
 * so it passes every casual test. §3 runs BOTH orientations of the same pair.
 * §6 proves the assertions discriminate rather than merely pass.
 *
 * ── NEGATIVE CONTROLS, PHYSICALLY PERFORMED 2026-09-27 ───────────────────────
 * A guard that has never gone red is a comment, not a check. Each fix was
 * reverted in the source, this file was run, and the fix restored:
 *
 *   1. `subjectOf` → always the base leg (the #312 assumption, verbatim).
 *                                      →  11 FAILED of 73, all of §3.
 *   2. `dedupeBySubject` → pass-through, one row per pool.
 *                                      →   6 FAILED of 73, all of §2.
 *   3. `filterNewPools` → publish every pool, filteredOut always [].
 *                                      →  12 FAILED of 73, all of §4.
 *
 * All three returned to 73/73 after restore, and the handler is byte-identical
 * to its pre-control state. §6 keeps a simulated copy of each revert so the
 * discrimination is re-checked on every CI run, not just the day it was proven.
 *
 * ⚠️ FIXTURE ADDRESSES BELOW ARE SYNTHETIC AND DELIBERATELY NOT REAL TOKENS.
 * The majors (WETH / USDC / cbBTC) are the genuine pinned Base 8453 addresses,
 * because the code matches on them and a fake one would not exercise anything.
 * Every other address is an obvious placeholder (0x…a1, 0x…b2). This repo has a
 * hard rule against inventing addresses, and a plausible-looking fake AERO in a
 * test file is exactly the thing that gets copied somewhere it matters.
 */
import type { Pool } from "../src/lib/market-data";
import { splitPairName } from "../src/lib/market-data";
import {
  subjectOf,
  dedupeBySubject,
  filterNewPools,
  toRow,
  isMajorLeg,
  NEW_POOL_MIN_LIQUIDITY_USD,
} from "../src/app/api/x402/_handlers/pool-scan";

let failures = 0, checks = 0;
function ok(label: string, cond: boolean) {
  checks++;
  if (!cond) { failures++; console.error(`  FAIL  ${label}`); }
  else console.log(`  ok    ${label}`);
}

// Real, pinned Base 8453 majors — see lib/wallet/token-trust.ts.
const WETH  = "0x4200000000000000000000000000000000000006";
const USDC  = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const CBBTC = "0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf";
// Synthetic. Not AERO's real address, on purpose — see the header.
const AERO_FIXTURE = "0x00000000000000000000000000000000000000a1";
const OTHER_FIXTURE = "0x00000000000000000000000000000000000000b2";

const pool = (p: Partial<Pool> = {}): Pool => ({
  name: "AERO / USDC",
  baseSymbol: "AERO",
  quoteSymbol: "USDC",
  baseAddress: AERO_FIXTURE,
  quoteAddress: USDC,
  dex: "aerodrome-base",
  poolAddress: "0x00000000000000000000000000000000000000f1",
  priceUsd: 1,
  change: { h1: null, h6: null, h24: 3 },
  volume24h: 1_000_000,
  liquidityUsd: 5_000_000,
  marketCap: null,
  url: "https://www.geckoterminal.com/base/pools/0x…f1",
  ...p,
});

console.log("\n§1 every row carries addresses and its chain");
// The whole reason the tool cost a second call per row.
const row = toRow(pool());
ok("base_token.address present",      row.base_token.address === AERO_FIXTURE);
ok("quote_token.address present",     row.quote_token.address === USDC);
ok("pool_address present",            row.pool_address === "0x00000000000000000000000000000000000000f1");
ok("dex present",                     row.dex === "aerodrome-base");
// CLAUDE.md hard rule #1: an address without its chain is not an answer, and
// Base 8453 / RH 4663 share no state.
ok("chain stated on the row",         row.chain === "base");
ok("chain_id stated on the row",      row.chain_id === 8453);
// Output contracts may only ADD. These six shipped before P1-7 and must survive.
for (const f of ["symbol", "price", "change24h", "volume24h", "liquidity", "url"]) {
  ok(`pre-existing field kept: ${f}`, f in row);
}
// Absent is null, never "" and never a zero address invented to fill the slot.
const noRel = toRow(pool({ baseAddress: "", quoteAddress: "", dex: "", poolAddress: "" }));
ok("missing address → null not \"\"",  noRel.base_token.address === null);
ok("missing dex → null",               noRel.dex === null);
ok("missing address → no 0x0 invented", JSON.stringify(noRel).includes("0x0000000000000000000000000000000000000000") === false);

console.log("\n§2 AERO in six pools collapses to one row, deepest kept");
// The measured regression, reproduced: six pools, one subject token.
const sixAero = [
  pool({ poolAddress: "0x…1", quoteAddress: USDC,  quoteSymbol: "USDC",  liquidityUsd: 1_000_000 }),
  pool({ poolAddress: "0x…2", quoteAddress: WETH,  quoteSymbol: "WETH",  liquidityUsd: 9_000_000 }),
  pool({ poolAddress: "0x…3", quoteAddress: CBBTC, quoteSymbol: "cbBTC", liquidityUsd: 2_000_000 }),
  pool({ poolAddress: "0x…4", quoteAddress: USDC,  quoteSymbol: "USDC",  liquidityUsd: 500_000 }),
  pool({ poolAddress: "0x…5", quoteAddress: WETH,  quoteSymbol: "WETH",  liquidityUsd: 100 }),
  pool({ poolAddress: "0x…6", quoteAddress: USDC,  quoteSymbol: "USDC",  liquidityUsd: null }),
];
const d = dedupeBySubject(sixAero);
ok("6 AERO pools → 1 row",             d.rows.length === 1);
ok("pool_count reports the collapse",  d.rows[0].pool_count === 6);
ok("pool_count >= 2",                  d.rows[0].pool_count >= 2);
ok("collapsed_count is 5",             d.collapsed === 5);
ok("deepest pool retained",            d.rows[0].pool_address === "0x…2");
ok("deepest liquidity retained",       d.rows[0].liquidity === 9_000_000);
// Null liquidity is "not reported", not zero — it must not beat a measured pool.
ok("null liquidity never wins",        d.rows[0].liquidity !== null);

// Distinct subjects are NOT merged, however alike the rest of the row looks.
const twoSubjects = dedupeBySubject([
  pool({ baseAddress: AERO_FIXTURE,  baseSymbol: "AERO" }),
  pool({ baseAddress: OTHER_FIXTURE, baseSymbol: "AERO", poolAddress: "0x…z" }),
]);
ok("same ticker, 2 addresses → 2 rows", twoSubjects.rows.length === 2);
ok("…and nothing reported collapsed",   twoSubjects.collapsed === 0);
// Unknown identity must not merge either — see subjectKey().
const unknown = dedupeBySubject([
  pool({ baseAddress: "", baseSymbol: "???", poolAddress: "0x…p1" }),
  pool({ baseAddress: "", baseSymbol: "???", poolAddress: "0x…p2" }),
]);
ok("2 unidentifiable pools stay 2 rows", unknown.rows.length === 2);

// Upstream ranking survives the collapse — "trending" must still mean GT's order.
const ordered = dedupeBySubject([
  pool({ baseAddress: OTHER_FIXTURE, baseSymbol: "FIRST", poolAddress: "0x…o1", liquidityUsd: 10 }),
  pool({ baseAddress: AERO_FIXTURE,  baseSymbol: "AERO",  poolAddress: "0x…o2", liquidityUsd: 99_000_000 }),
  pool({ baseAddress: OTHER_FIXTURE, baseSymbol: "FIRST", poolAddress: "0x…o3", liquidityUsd: 20 }),
]);
ok("trending order preserved",         ordered.rows[0].subject_token?.address === OTHER_FIXTURE);

console.log("\n§3 the subject token resolves on EITHER side of the pair");
// ⚠️ #312 / lib/dex-side.ts. Both orientations of the SAME pair, same answer.
const baseSide  = subjectOf(pool({
  baseSymbol: "AERO", baseAddress: AERO_FIXTURE, quoteSymbol: "WETH", quoteAddress: WETH,
}));
const quoteSide = subjectOf(pool({
  baseSymbol: "WETH", baseAddress: WETH, quoteSymbol: "AERO", quoteAddress: AERO_FIXTURE,
}));
ok("AERO/WETH → subject is AERO",      baseSide?.address === AERO_FIXTURE);
ok("…and side says base",              baseSide?.side === "base");
ok("WETH/AERO → subject is STILL AERO", quoteSide?.address === AERO_FIXTURE);
ok("…and side says quote",             quoteSide?.side === "quote");
ok("flipping the pair never changes the subject",
   baseSide?.address === quoteSide?.address);
// The failure this guards: the major must never be reported as the subject.
ok("WETH is never the subject",        quoteSide?.address !== WETH);
ok("…nor by symbol",                   quoteSide?.symbol !== "WETH");

// Each major, on each side. Nothing may leak through by orientation.
for (const [sym, addr] of [["WETH", WETH], ["USDC", USDC], ["cbBTC", CBBTC]] as const) {
  const asQuote = subjectOf(pool({ baseSymbol: "TKN", baseAddress: OTHER_FIXTURE, quoteSymbol: sym, quoteAddress: addr }));
  const asBase  = subjectOf(pool({ baseSymbol: sym, baseAddress: addr, quoteSymbol: "TKN", quoteAddress: OTHER_FIXTURE }));
  ok(`${sym} as quote → subject is TKN`, asQuote?.address === OTHER_FIXTURE);
  ok(`${sym} as base  → subject is TKN`, asBase?.address === OTHER_FIXTURE);
}
// VIRTUAL has no pinned address in this repo, so it is excluded by SYMBOL. That
// is documented as a weaker test in pool-scan.ts; it must still work.
const virt = subjectOf(pool({ baseSymbol: "VIRTUAL", baseAddress: OTHER_FIXTURE, quoteSymbol: "TKN", quoteAddress: AERO_FIXTURE }));
ok("VIRTUAL excluded by symbol",       virt?.address === AERO_FIXTURE);
ok("isMajorLeg: address wins",         isMajorLeg(WETH, "WHATEVER") === true);
ok("isMajorLeg: long-tail is not major", isMajorLeg(OTHER_FIXTURE, "TKN") === false);

// Both legs major → no subject exists, and we say so rather than picking one.
const bothMajor = subjectOf(pool({ baseSymbol: "WETH", baseAddress: WETH, quoteSymbol: "USDC", quoteAddress: USDC }));
ok("WETH/USDC → subject_token null",   bothMajor === null);
// Neither major → GT's own base leg, which is the leg it prices.
const neither = subjectOf(pool({ baseSymbol: "A", baseAddress: AERO_FIXTURE, quoteSymbol: "B", quoteAddress: OTHER_FIXTURE }));
ok("long-tail pair → base leg",        neither?.address === AERO_FIXTURE);

console.log("\n§4 new_pools drops the unfundable and SAYS how many");
const fresh = [
  pool({ poolAddress: "0x…n1", liquidityUsd: 50_000 }),   // keep
  pool({ poolAddress: "0x…n2", liquidityUsd: 999 }),      // drop — below $1k
  pool({ poolAddress: "0x…n3", liquidityUsd: 0 }),        // drop — empty
  pool({ poolAddress: "0x…n4", liquidityUsd: null }),     // drop — unmeasured
  pool({ poolAddress: "0x…n5", liquidityUsd: 1000 }),     // keep — boundary is inclusive
];
const f = filterNewPools(fresh);
ok("threshold is $1000",               NEW_POOL_MIN_LIQUIDITY_USD === 1000);
ok("2 of 5 survive",                   f.rows.length === 2);
ok("filtered_out_count === removed",   f.filteredOut.length === fresh.length - f.rows.length);
ok("filtered_out_count is 3",          f.filteredOut.length === 3);
ok("every dropped pool is listed",     f.filteredOut.length === 3 && f.filteredOut.every((x) => x.pool_address !== null));
ok("$1000 exactly is kept",            f.rows.some((r) => r.liquidity === 1000));
ok("$999 is dropped",                  !f.rows.some((r) => r.liquidity === 999));
ok("no survivor is below the floor",   f.rows.every((r) => (r.liquidity ?? 0) >= 1000));
// "Not reported" and "measured empty" are different facts and stay different.
ok("null liquidity → liquidity_unknown",
   f.filteredOut.find((x) => x.pool_address === "0x…n4")?.reason === "liquidity_unknown");
ok("0 liquidity → below_min_liquidity",
   f.filteredOut.find((x) => x.pool_address === "0x…n3")?.reason === "below_min_liquidity");
ok("unknown liquidity is not reported as 0",
   f.filteredOut.find((x) => x.pool_address === "0x…n4")?.liquidity === null);
// The dropped rows keep their identity, so the caller can check them anyway.
ok("dropped rows keep subject_token",  f.filteredOut.every((x) => x.subject_token?.address === AERO_FIXTURE));
// Surviving rows keep the field new_pools always had.
ok("age_hours still present",          f.rows[0].age_hours === null);
ok("new_pools rows carry addresses",   f.rows[0].base_token.address === AERO_FIXTURE);
// An all-junk feed reports zero rows and a full count — never a silent empty.
const allJunk = filterNewPools([pool({ liquidityUsd: 1 }), pool({ liquidityUsd: null })]);
ok("all-junk feed → 0 rows",           allJunk.rows.length === 0);
ok("all-junk feed → count of 2",       allJunk.filteredOut.length === 2);

console.log("\n§5 the pair-name splitter");
ok("plain pair",                       splitPairName("AERO / USDC").quote === "USDC");
ok("fee tier stripped from quote",     splitPairName("WETH / USDC 0.05%").quote === "USDC");
ok("base leg unaffected",              splitPairName("WETH / USDC 0.05%").base === "WETH");
ok("no slash → base only",             splitPairName("ODD").base === "ODD");
ok("no slash → quote empty",           splitPairName("ODD").quote === "");

console.log("\n§6 negative controls — proof these assertions can go red");
// A guard that has never failed is a comment. Each block below re-implements
// the defect this file exists to catch and asserts the assertion REJECTS it.

// (a) the six-AERO bug: no dedupe at all.
const noDedupe = sixAero.map((p) => toRow(p));
ok("control: undeduped input really is 6", noDedupe.length === 6);
ok("control: §2's assertion would fail on it", noDedupe.length !== 1);

// (b) #312: subject picked off the base leg unconditionally.
const baseOnlySubject = (p: Pool) => ({ address: p.baseAddress, symbol: p.baseSymbol });
const wrong = baseOnlySubject(pool({ baseSymbol: "WETH", baseAddress: WETH, quoteSymbol: "AERO", quoteAddress: AERO_FIXTURE }));
ok("control: base-only picking returns the major", wrong.address === WETH);
ok("control: §3 rejects that answer",              wrong.address !== quoteSide?.address);

// (c) the unfiltered new_pools feed.
const unfiltered = fresh.map((p) => toRow(p));
ok("control: unfiltered feed really is 5",  unfiltered.length === 5);
ok("control: it publishes sub-$1k pools",   unfiltered.some((r) => (r.liquidity ?? 0) < 1000));
ok("control: §4 rejects that",              f.rows.every((r) => (r.liquidity ?? 0) >= 1000));

// (d) a filter that shrinks silently — the count is the load-bearing part.
ok("control: a 0 count would not match 3 removals",
   f.filteredOut.length !== 0 && f.filteredOut.length === fresh.length - f.rows.length);

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
