/**
 * Guard: the free URL and the paid ACP path must read `chain`/`side` identically.
 *
 * Run: `npx tsx scripts/acp-requirement-check.ts` (from apps/web). Exit 0 = pass.
 *
 * MEASURED 2026-09-26, before the fix: `/api/acp/execution-plan` did not read
 * `chain` at all and coerced `side` with
 * `(...) === "sell" ? "sell" : "buy"`. So `chain=base` returned a Robinhood plan
 * and `side=short` returned a buy plan, while the paid job path rejected both.
 *
 * That asymmetry points the wrong way. The free URL is the one a buyer
 * self-tests against BEFORE escrowing, so it was teaching buyers a contract the
 * paid path does not honour, and the disagreement only surfaced after money was
 * committed. Worse, both surfaces were individually "correct-looking": neither
 * throws, neither logs, and the free one returns a well-formed plan.
 *
 * Divergence is the failure mode, so what is pinned here is that ONE definition
 * is used twice — not two copies that happen to agree today.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalizeChain, normalizeSide } from "../src/lib/blue-hood/acp-requirement";

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

// ── Group 5: one definition, used by both surfaces ───────────────────────────
// The point of the file. Two copies that agree today are exactly what regressed.

{
  const importsShared = (src: string) =>
    /import \{[^}]*normalizeChain[^}]*normalizeSide[^}]*\} from "@\/lib\/blue-hood\/acp-requirement"/.test(
      src.replace(/\n/g, " "),
    );
  check("5.1 the free route imports the shared normalisers", importsShared(routeSrc));
  check("5.2 the paid seller imports the same ones", importsShared(sellerSrc));
  check(
    "5.3 neither surface re-declares its own copy",
    !/function normalizeChain/.test(routeSrc) &&
      !/function normalizeChain/.test(sellerSrc) &&
      !/function normalizeSide/.test(routeSrc) &&
      !/function normalizeSide/.test(sellerSrc),
  );
  check(
    "5.4 the free route no longer ternary-coerces side",
    !/=== "sell" \? "sell" : "buy"/.test(routeSrc),
  );
}

// ── Group 6: the free route actually refuses, not just parses ────────────────
// Reading `chain` and then ignoring it would pass Group 5 and still ship the bug.

{
  check("6.1 the free route refuses a non-RH desk", /if \(chain !== "robinhood"\)/.test(routeSrc));
  check("6.2 the free route refuses an unreadable side", /if \(side === "unknown"\)/.test(routeSrc));
  check(
    "6.3 both refusals happen BEFORE the compute",
    routeSrc.indexOf('if (chain !== "robinhood")') < routeSrc.indexOf("computeExecutionPlan(") &&
      routeSrc.indexOf('if (side === "unknown")') < routeSrc.indexOf("computeExecutionPlan("),
  );
  check(
    "6.4 the refusal names the other chain rather than saying 'invalid'",
    /Base \(8453\)/.test(routeSrc) && /Robinhood Chain \(4663\)/.test(routeSrc),
  );
}

// ── report ───────────────────────────────────────────────────────────────────

console.log(`\nacp-requirement guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
