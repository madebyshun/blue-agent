/**
 * Guard: the free URL and the paid ACP path must read a buyer's requirement
 * identically — same VALUES *and* same KEYS.
 *
 * Run: `npx tsx scripts/acp-requirement-check.ts` (from apps/web). Exit 0 = pass.
 *
 * ── Round 1, measured 2026-09-26 ─────────────────────────────────────────────
 * `/api/acp/execution-plan` did not read `chain` at all and coerced `side` with
 * `(...) === "sell" ? "sell" : "buy"`. So `chain=base` returned a Robinhood plan
 * and `side=short` returned a buy plan, while the paid job path rejected both.
 *
 * That asymmetry points the wrong way. The free URL is the one a buyer
 * self-tests against BEFORE escrowing, so it was teaching buyers a contract the
 * paid path does not honour, and the disagreement only surfaced after money was
 * committed. Worse, both surfaces were individually "correct-looking": neither
 * throws, neither logs, and the free one returns a well-formed plan.
 *
 * ── Round 2, measured the SAME DAY in production ─────────────────────────────
 * 🔴 Round 1 shipped the shared normalisers and this guard passed — and the bug
 * came straight back one layer up, because the guard pinned what a VALUE means
 * and not which KEY carries it. The paid path read `chain ?? chain_id ?? chainId`
 * while the free URL read `chain` alone, so on
 * `/api/acp/execution-plan?ticker=NVDA&size_usd=1000`:
 *
 *   chain=base        400 unsupported_chain   (agrees with the paid path)
 *   chain_id=8453     200 Robinhood plan      (paid path REFUSES)
 *   chainId=8453      200 Robinhood plan      (paid path REFUSES)
 *   side=short        400 unsupported_side    (agrees)
 *   direction=short   200 stamped side:"buy"  (paid path REFUSES)
 *   action=sell       200 priced as a BUY     (paid path prices a SELL)
 *
 * Four of the six cases the round-1 guard reported as fixed were still broken,
 * in the same direction as the original: the FREE surface is the permissive one.
 *
 * So this file pins BOTH halves now: one entry point (`readRequirement`) used by
 * both surfaces, and neither surface allowed to hand-read an input key. A check
 * that covers half a contract reads exactly like a check that covers all of it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  normalizeChain,
  normalizeSide,
  readRequirement,
  REQUIREMENT_KEYS,
} from "../src/lib/blue-hood/acp-requirement";

let pass = 0;
const failures: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const ROOT = process.cwd();
const routeSrc = readFileSync(join(ROOT, "src/app/api/acp/execution-plan/route.ts"), "utf8");
const sellerSrc = readFileSync(join(ROOT, "src/lib/blue-hood/acp-seller.ts"), "utf8");

// ── Group 1: absent means the stated default, not a guess ────────────────────
// `chain` is OPTIONAL and defaults to the only desk this offering serves. This
// is the fact the public listing contradicts by putting `chain` in `required`.

check("1.1 absent chain defaults to robinhood", normalizeChain(undefined) === "robinhood");
check("1.2 blank chain defaults to robinhood", normalizeChain("   ") === "robinhood");
check("1.3 absent side defaults to buy", normalizeSide(undefined) === "buy");
check("1.4 blank side defaults to buy", normalizeSide("") === "buy");

// ── Group 2: aliases a buyer plausibly sends ─────────────────────────────────

for (const v of ["robinhood", "RobinhoodChain", " RH ", "4663"]) {
  check(`2.x "${v}" reads as robinhood`, normalizeChain(v) === "robinhood");
}
check("2.5 numeric 4663 reads as robinhood", normalizeChain(4663) === "robinhood");

// ── Group 3: Base is RECOGNISED so it can be refused by name ─────────────────
// Not folded into "unknown": a Base request is a coherent request this desk
// cannot serve, and the buyer deserves that reason rather than "unparseable".

check("3.1 base is identified, not unknown", normalizeChain("base") === "base");
check("3.2 8453 is identified, not unknown", normalizeChain("8453") === "base");
check("3.3 base is never served as robinhood", normalizeChain("BASE") !== "robinhood");

// ── Group 4: unreadable input is never silently defaulted ────────────────────
// The engine coerces any non-"sell" to a buy, so "unknown" leaking through as a
// default would sell a buy plan to someone who asked to exit.

check("4.1 an unknown chain is unknown", normalizeChain("solana") === "unknown");
check("4.2 'short' is NOT silently a buy", normalizeSide("short") === "unknown");
check("4.3 'long' is NOT silently a buy", normalizeSide("long") === "unknown");
check("4.4 'sell' survives", normalizeSide("SELL") === "sell");

// ── Group 5: which KEY carries the value — the round-2 bug ───────────────────
// Agreeing on what "8453" MEANS is worthless if one surface never looks at the
// key it arrived under. Every alias below was reaching the paid path and being
// dropped on the floor by the free one.

{
  /** Exactly what a caller does: one object, read through the shared table. */
  const via = (o: Record<string, unknown>) => readRequirement((k) => o[k]);

  for (const k of REQUIREMENT_KEYS.chain) {
    check(`5.1 chain alias "${k}" reaches the parser`, via({ [k]: "8453" }).chain === "base");
  }
  for (const k of REQUIREMENT_KEYS.side) {
    check(`5.2 side alias "${k}" reaches the parser`, via({ [k]: "sell" }).side === "sell");
    check(`5.3 side alias "${k}" can be refused`, via({ [k]: "short" }).side === "unknown");
  }
  for (const k of REQUIREMENT_KEYS.ticker) {
    check(`5.4 ticker alias "${k}" reaches the parser`, via({ [k]: " nvda " }).ticker === "nvda");
  }
  for (const k of REQUIREMENT_KEYS.size_usd) {
    check(`5.5 size alias "${k}" reaches the parser`, via({ [k]: "1000" }).size_usd === 1000);
  }

  // Precedence is declaration order, and a BLANK value counts as absent so it
  // cannot shadow a later alias. The Hub-form failure mode: every declared input
  // is posted, including the ones left empty.
  check("5.6 first alias wins", via({ chain: "base", chain_id: "4663" }).chain === "base");
  check("5.7 a blank alias does not shadow the next", via({ chain: "  ", chain_id: "8453" }).chain === "base");
  check("5.8 an absent requirement still defaults", via({}).chain === "robinhood" && via({}).side === "buy");
}

// ── Group 6: one definition, used by both surfaces ───────────────────────────
// The point of the file. Two copies that agree today are exactly what regressed
// — twice, on the same day, once per half of the contract.

{
  const importsShared = (src: string) =>
    /import \{[^}]*readRequirement[^}]*\} from "@\/lib\/blue-hood\/acp-requirement"/.test(
      src.replace(/\n/g, " "),
    );
  check("6.1 the free route imports readRequirement", importsShared(routeSrc));
  check("6.2 the paid seller imports the same one", importsShared(sellerSrc));
  check(
    "6.3 both surfaces actually CALL it",
    /readRequirement\(/.test(routeSrc) && /readRequirement\(/.test(sellerSrc),
  );
  check(
    "6.4 neither surface re-declares its own normaliser",
    !/function normalizeChain/.test(routeSrc) &&
      !/function normalizeChain/.test(sellerSrc) &&
      !/function normalizeSide/.test(routeSrc) &&
      !/function normalizeSide/.test(sellerSrc),
  );
  check(
    "6.5 the free route no longer ternary-coerces side",
    !/=== "sell" \? "sell" : "buy"/.test(routeSrc),
  );
  // 🔴 The round-2 pin. Calling the normalisers DIRECTLY is how a surface ends
  // up choosing its own key — `normalizeChain(url.searchParams.get("chain"))`
  // was the exact line that shipped the second bug while passing round 1.
  check(
    "6.6 neither surface calls a normaliser directly (that is how it picks its own key)",
    !/normalizeChain\(/.test(routeSrc) &&
      !/normalizeChain\(/.test(sellerSrc) &&
      !/normalizeSide\(/.test(routeSrc) &&
      !/normalizeSide\(/.test(sellerSrc),
  );
  // Hand-reading any requirement key re-opens the same gap from the other side.
  // Only the four requirement fields are listed: `chainId` as a SETTLEMENT chain
  // is a different concept and legitimately appears in the seller.
  const HAND_READ = new RegExp(
    `searchParams\\.get\\("(${[
      ...REQUIREMENT_KEYS.ticker,
      ...REQUIREMENT_KEYS.size_usd,
      ...REQUIREMENT_KEYS.chain,
      ...REQUIREMENT_KEYS.side,
    ].join("|")})"\\)`,
  );
  check("6.7 the free route hand-reads no requirement key", !HAND_READ.test(routeSrc));
  check(
    "6.8 the paid seller spells out no alias chain of its own",
    !/obj\.chain\s*\?\?/.test(sellerSrc) && !/obj\.side\s*\?\?/.test(sellerSrc),
  );
}

// ── Group 7: the free route actually refuses, not just parses ────────────────
// Reading `chain` and then ignoring it would pass Groups 5–6 and still ship it.

{
  check("7.1 the free route refuses a non-RH desk", /if \(chain !== "robinhood"\)/.test(routeSrc));
  check("7.2 the free route refuses an unreadable side", /if \(side === "unknown"\)/.test(routeSrc));
  check(
    "7.3 both refusals happen BEFORE the compute",
    routeSrc.indexOf('if (chain !== "robinhood")') < routeSrc.indexOf("computeExecutionPlan(") &&
      routeSrc.indexOf('if (side === "unknown")') < routeSrc.indexOf("computeExecutionPlan("),
  );
  check(
    "7.4 the refusal names the other chain rather than saying 'invalid'",
    /Base \(8453\)/.test(routeSrc) && /Robinhood Chain \(4663\)/.test(routeSrc),
  );
  // A plan is depth + slippage + a route, and none of those mean anything
  // without the desk they were measured on. The paid deliverable stamps it
  // (`buildDeliverable`); the free surface — read FIRST — used to omit it.
  check(
    "7.5 the free 200 names the desk, like the paid deliverable does",
    /chain: "robinhood"/.test(routeSrc) && /chain_id: 4663/.test(routeSrc),
  );
}

// ── report ───────────────────────────────────────────────────────────────────

console.log(`\nacp-requirement guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
