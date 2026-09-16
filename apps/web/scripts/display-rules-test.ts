/**
 * CI guard on the two view-only switches — `src/lib/wallet/display.ts`.
 *
 * Run: `npx tsx scripts/display-rules-test.ts` from `apps/web/`.
 * Hermetic: pure functions + reading four source files. No env, no network.
 *
 * WHAT THIS PROTECTS, in one line: a filter the user turned on to reduce
 * SCROLLING must never be able to change what the wallet says it is worth.
 *
 * `read-state-test.ts` guards the layer below — "how complete is this read?".
 * This is the layer above: "what do we SHOW of what we read?". Same failure mode
 * waiting to happen (four surfaces, one question), so it gets the same
 * treatment. Three claims are worth a test rather than a comment:
 *
 *   1. UNPRICED IS NOT DUST. `isDust(null)` is false, by contract. On Robinhood
 *      Chain most RWA tokens have no price feed at all, so a threshold applied
 *      to a missing number would delete real positions behind a switch the user
 *      believes only removes sub-dollar noise. The module's own header calls
 *      this "the single most important line in the file" — which is exactly the
 *      kind of line that gets "simplified" into `(usd ?? 0) < 1` by someone
 *      tidying up. That refactor passes typecheck, passes the build, and hides
 *      every unpriced holding on the chain where most holdings are unpriced.
 *
 *      As of 2026-09-13 the switch DOES hide unpriced rows, at ShunTr's ask, and
 *      claim 1 is what makes that safe rather than what it contradicts: they are
 *      removed by a SECOND predicate (`isUnpriced`), returned as a SECOND count
 *      (`HideSplit.unpriced`), and described in a SECOND clause that never says
 *      "$1". The merge — one predicate, one count, one sentence — is the exact
 *      failure this file exists to block, so §3 pins the separation in the
 *      logic and §4 pins it in the copy the three tables actually render.
 *
 *   2. NO TOTAL IS SUMMED OVER THE FILTERED LIST. A filter that quietly shrinks
 *      a total is indistinguishable, from the user's chair, from a wallet that
 *      lost money. Each of the three tables keeps this a different way (hand-sum
 *      over the unfiltered array / a server-side total / a pre-filter reduce),
 *      so the property is asserted against the SOURCE, where `shown.reduce(` is
 *      the one-character-class mistake that would do it.
 *
 *   3. THE MASK STOPS AT THE SCREEN. It wraps figures we would have rendered,
 *      never an absence ("—"), and never `balanceForPrompt` — the chat model is
 *      the one reader that would try to do arithmetic with "••••".
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  DUST_USD, MASK, isDust, maskFigure,
  isUnpriced, splitByValue, hiddenNote, sumIsFloor,
} from "../src/lib/wallet/display";

let failures = 0;
let checks = 0;

function ok(label: string, pass: boolean, detail = "") {
  checks++;
  if (pass) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.log(`  FAIL  ${label}${detail ? `: ${detail}` : ""}`);
  }
}

// ── 1. isDust — the table ───────────────────────────────────────────────────
//
// Written out literally, not generated: a generator shares its author's
// assumptions with the code under test, so a wrong rule would be wrong
// identically in both places and pass. Written out, a behaviour change is a
// visible line in the diff that someone has to justify.
console.log("\nisDust — what counts as a row worth hiding");

type DustCase = { in: number | null | undefined; want: boolean; why: string };
const DUST_TABLE: DustCase[] = [
  // ── The absences. THE rule. Every one of these is a row whose value we do
  //    not know, and "unknown" must never be swept into "worth less than $1".
  { in: null,       want: false, why: "unpriced — no feed, not small" },
  { in: undefined,  want: false, why: "field absent — same thing" },
  { in: NaN,        want: false, why: "a failed computation is not a small number" },
  { in: Infinity,   want: false, why: "not finite, so not a figure at all" },
  { in: -Infinity,  want: false, why: "< 1 arithmetically, but still not a figure" },

  // ── The figures. A number we actually have, compared to the threshold.
  { in: 0,          want: true,  why: "a priced zero IS dust — we read it, it's nothing" },
  { in: 0.004,      want: true,  why: "sub-cent" },
  { in: 0.99,       want: true,  why: "just under" },
  { in: 0.999999,   want: true,  why: "just under, closer" },
  { in: 1,          want: false, why: "the threshold is exclusive — $1 stays" },
  { in: 1.01,       want: false, why: "just over" },
  { in: 4200,       want: false, why: "a position" },
  { in: -3,         want: true,  why: "negative is below the threshold; not reachable today, pinned so a future signed value can't surprise us" },
];

let dustMismatches = 0;
for (const t of DUST_TABLE) {
  const got = isDust(t.in);
  if (got !== t.want) {
    dustMismatches++;
    console.log(`  FAIL  isDust(${String(t.in)}) → ${got}, table says ${t.want} (${t.why})`);
  }
}
ok("every row matches the module", dustMismatches === 0, `${dustMismatches} mismatch(es)`);

// Restated over the inputs, so it survives a rewrite of the function. The table
// says what `isDust` returns today; this says what it may never return however
// it is written tomorrow.
const ABSENT: (number | null | undefined)[] = [null, undefined, NaN, Infinity, -Infinity];
ok("INVARIANT no absent or non-finite value is ever dust",
   ABSENT.every(v => isDust(v) === false),
   ABSENT.filter(v => isDust(v)).map(String).join(", "));
ok("INVARIANT the threshold is exclusive at DUST_USD",
   isDust(DUST_USD) === false && isDust(DUST_USD - 0.0001) === true);
ok("INVARIANT dust implies a real, finite number came in",
   DUST_TABLE.every(t => !isDust(t.in) || (typeof t.in === "number" && Number.isFinite(t.in))));

// CONTROL. Every invariant above is satisfied by `isDust = () => false`, which
// would silently turn the toggle into a no-op — the filter would look broken
// rather than dishonest, but it would still be a lie about what the switch does.
ok("CONTROL isDust still says yes to something", DUST_TABLE.some(t => isDust(t.in)));
ok("CONTROL isDust still says no to something", DUST_TABLE.some(t => !isDust(t.in)));

// ── 2. maskFigure + MASK ────────────────────────────────────────────────────
console.log("\nmaskFigure — the eye toggle");
ok("hidden → the mask", maskFigure("$1,234.56", true) === MASK, maskFigure("$1,234.56", true));
ok("not hidden → the figure, untouched", maskFigure("$1,234.56", false) === "$1,234.56");
ok("undefined behaves as not hidden",
   maskFigure("$1,234.56", undefined) === "$1,234.56" && maskFigure("$1,234.56") === "$1,234.56");
// `MASK.length > 0` rather than `MASK !== ""`: MASK is a const with a literal
// type, so TS rejects the comparison as provably-false rather than checking it.
// The assertion still has to exist — an empty mask hides the figure and leaves
// nothing in its place, which reads as a missing value, not a hidden one.
ok("masking is total — the figure cannot be recovered from the output",
   !MASK.includes("1") && !MASK.includes("2") && MASK.length > 0);
// The currency sign is part of the figure. "$••••" would still assert a
// denomination — and on a wallet spanning USDC and USDG that is a claim, not
// decoration. Two different shaped holdings must mask to the same string.
ok("the mask asserts nothing — no currency sign, no digits",
   !/[$\d]/.test(MASK), MASK);
ok("different figures mask identically",
   maskFigure("$0.01", true) === maskFigure("$918,000.00", true));

// ── 3. THE SECOND PREDICATE ─────────────────────────────────────────────────
//
// One switch, two reasons a row leaves the screen. Everything here exists to
// keep those two reasons from becoming one, because the collapsed version is
// not a wording problem — "12 tokens under $1 hidden" over rows we never priced
// states a valuation we do not have, which is the fabrication CLAUDE.md rules
// out in the same words it rules out a made-up score.
console.log("\nisUnpriced — the row we could not value at all");

type UnpricedCase = { in: number | null | undefined; want: boolean; why: string };
const UNPRICED_TABLE: UnpricedCase[] = [
  { in: null,       want: true,  why: "no feed quoted it" },
  { in: undefined,  want: true,  why: "the field never arrived" },
  { in: NaN,        want: true,  why: "a failed computation is not a value" },
  { in: Infinity,   want: true,  why: "not finite, so not a price" },
  { in: -Infinity,  want: true,  why: "same" },
  { in: 0,          want: false, why: "a priced zero IS a price — worth nothing, not unknown" },
  { in: 0.004,      want: false, why: "priced, tiny" },
  { in: 1,          want: false, why: "priced" },
  { in: 4200,       want: false, why: "priced" },
  { in: -3,         want: false, why: "priced, and negative is still a number we read" },
];

let unpricedMismatches = 0;
for (const t of UNPRICED_TABLE) {
  const got = isUnpriced(t.in);
  if (got !== t.want) {
    unpricedMismatches++;
    console.log(`  FAIL  isUnpriced(${String(t.in)}) → ${got}, table says ${t.want} (${t.why})`);
  }
}
ok("every row matches the module", unpricedMismatches === 0, `${unpricedMismatches} mismatch(es)`);

// The pair, pinned against each other. These two are the whole contract: a row
// is small, or unknown, or kept — never two of those at once.
const ALL_INPUTS = [...DUST_TABLE.map(t => t.in), ...UNPRICED_TABLE.map(t => t.in)];
const bothTrue = ALL_INPUTS.filter(v => isDust(v) && isUnpriced(v));
ok("INVARIANT no value is both dust and unpriced", bothTrue.length === 0, bothTrue.map(String).join(", "));
// The complement that makes claim 1 survivable: `isDust` refuses to judge the
// absences, and `isUnpriced` is exactly what picks them up. If someone widens
// `isDust` to swallow them, this fails on the FIRST clause, not the second.
ok("INVARIANT isUnpriced covers precisely what isDust refuses to judge",
   ABSENT.every(v => isDust(v) === false && isUnpriced(v) === true));
// CONTROL. Both predicates false for something, or the switch hides the wallet.
ok("CONTROL some rows are neither — the switch keeps something",
   DUST_TABLE.some(t => !isDust(t.in) && !isUnpriced(t.in)));

console.log("\nsplitByValue — one filter, two counts");

type Row = { id: string; v: number | null | undefined; junk?: boolean };
// Deliberately NOT named `usdValue`: the accessor is passed in because the
// three tables call the field three different things (`usdValue`, `valueUsd`).
// A helper that reached for a field name would work in two files and silently
// hide nothing in the third.
const ROWS: Row[] = [
  { id: "big",    v: 4200 },
  { id: "edge",   v: 1 },          // exactly DUST_USD — exclusive threshold, stays
  { id: "small",  v: 0.42 },       // dust
  { id: "zero",   v: 0 },          // dust — priced, and the price is nothing
  { id: "rwa",    v: null },       // unpriced
  { id: "absent", v: undefined },  // unpriced
  { id: "broken", v: NaN, junk: true }, // unpriced
];

const off = splitByValue(ROWS, r => r.v, false);
ok("switch off → the very same array, not a copy", Object.is(off.shown, ROWS));
ok("switch off → no counts, because nothing was filtered",
   off.dust === 0 && off.unpriced === 0 && off.hidden === 0);

const on = splitByValue(ROWS, r => r.v, true);
ok("switch on → keeps exactly the priced rows at or above the threshold",
   on.shown.map(r => r.id).join(",") === "big,edge", on.shown.map(r => r.id).join(","));
ok("switch on → the two reasons are counted apart",
   on.dust === 2 && on.unpriced === 3, `dust=${on.dust} unpriced=${on.unpriced}`);
// The fixture uses 2 and 3 on purpose: if one count were assigned from the
// other, or both from `hidden`, the numbers would collide and pass.
ok("CONTROL the two counts are different numbers in this fixture", on.dust !== on.unpriced);
ok("INVARIANT hidden is the sum of the two, never a third tally",
   on.hidden === on.dust + on.unpriced);
ok("INVARIANT every row is shown or hidden — none lost, none double-counted",
   on.shown.length + on.hidden === ROWS.length);
ok("order is preserved — the filter is not a re-sort",
   on.shown.map(r => r.id).join(",") === ROWS.filter(r => on.shown.includes(r)).map(r => r.id).join(","));
const empty = splitByValue([] as Row[], r => r.v, true);
ok("an empty table splits into nothing, not into a crash",
   empty.shown.length === 0 && empty.hidden === 0);

console.log("\nhiddenNote — the two clauses");
ok("nothing hidden → no sentence at all", hiddenNote({ dust: 0, unpriced: 0 }) === null);

const dOnly = hiddenNote({ dust: 3, unpriced: 0 })!;
ok("dust only → names the threshold and claims the total is intact",
   dOnly.includes(`$${DUST_USD}`) && dOnly.includes("still counted"), dOnly);
ok("dust only → says nothing about prices we do not have",
   !dOnly.includes("no price") && !dOnly.includes("unknown"), dOnly);

const uOnly = hiddenNote({ dust: 0, unpriced: 4 })!;
// THE line. A threshold in this clause would be a price for rows we could not
// price — which is the whole reason the predicates are separate.
ok("unpriced only → never states a dollar threshold",
   !uOnly.includes("$"), uOnly);
ok("unpriced only → says the value is unknown and was never in the total",
   uOnly.includes("unknown") && uOnly.includes("never in the total"), uOnly);

const both = hiddenNote({ dust: 2, unpriced: 3 })!;
ok("both → both counts appear, and their sum does not",
   both.includes("2") && both.includes("3") && !/\b5\b/.test(both), both);
// Positional, because "both sentences are present" is also true of a string
// that attaches the wrong claim to the wrong count.
const [firstClause, ...rest] = both.split(". ");
const secondClause = rest.join(". ");
ok("both → the 'still counted' promise sits with the DUST count only",
   firstClause!.includes("2") && firstClause!.includes("still counted") &&
   !secondClause.includes("still counted"), both);
ok("both → the threshold never travels into the unpriced clause",
   firstClause!.includes(`$${DUST_USD}`) && !secondClause.includes("$"), both);

console.log("\nsumIsFloor — when the total understates the wallet");
ok("every row priced → a plain total", sumIsFloor(ROWS.filter(r => r.v === 4200 || r.v === 1), r => r.v) === false);
ok("one unpriced row → the total is a floor", sumIsFloor(ROWS, r => r.v) === true);
ok("nothing to sum → not a floor, just empty", sumIsFloor([] as Row[], r => r.v) === false);
// `counted` is how TokenTable keeps impostor tokens out of both the sum and the
// caveat about the sum: a row that is not in the total cannot make it short.
ok("a row excluded from the total cannot make the total a floor",
   sumIsFloor(ROWS, r => r.v, r => !isUnpriced(r.v)) === false);
ok("the exclusion is honoured per-row, not all-or-nothing",
   sumIsFloor(ROWS, r => r.v, r => r.id !== "rwa") === true);
// THE mistake this function is aimed at, written as a test rather than a
// comment: hiding the unpriced rows removes the last visible evidence that the
// sum is short, so a caller that passes `shown` prints a confident figure over
// a wallet it could not value. Same shape as summing the filtered list.
ok("INVARIANT computed over the FILTERED list, the floor would vanish",
   sumIsFloor(ROWS, r => r.v) === true && sumIsFloor(on.shown, r => r.v) === false);

// ── 4. THE SCREENS OBEY THE CONTRACT ────────────────────────────────────────
//
// Limits, stated so nobody trusts this further than it goes: matching source
// text catches the mistakes that are written the way these files are written,
// and misses one written differently. The unit tables above are the real guard
// on the logic; this is the guard on the four call sites.
console.log("\nthe four surfaces consume the module");
const BANK = path.resolve(path.dirname(path.resolve(process.argv[1])), "../src/app/app/bank");
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

const TABLES = ["TokenTable.tsx", "RhTokenTable.tsx", "StockTable.tsx"];
const src: Record<string, string> = {};
for (const f of [...TABLES, "BankClient.tsx"]) {
  src[f] = stripComments(readFileSync(path.join(BANK, f), "utf8"));
  ok(`${f} imports the shared rules`, /from\s+"@\/lib\/wallet\/display"/.test(src[f]!));
}

for (const f of TABLES) {
  const s = src[f]!;
  // ONE call decides what the switch removes, and it hands back the two counts
  // already separated. A table that called `isDust` and then `isUnpriced`
  // itself would be a second arithmetic over the same list — free to drift from
  // the sentence printed underneath it. That is the `read-state.ts` lesson one
  // surface over: three tables answering the same question locally, two of them
  // wrong.
  ok(`${f} filters through splitByValue, not a hand-rolled comparison`,
     /splitByValue\(/.test(s));
  // The refactor claim 1 warns about, spelled the way it actually gets written:
  // `(usd ?? 0) < 1` coerces "no price" into "$0" and the threshold does the
  // rest. It typechecks, it builds, and on RH Chain it deletes real positions.
  const coerced = /\(\s*[\w.]*[uU]sd\w*\s*\?\?\s*0\s*\)\s*</.exec(s);
  ok(`${f} never coerces an absent price to 0 before comparing`, coerced === null, coerced?.[0]);

  // RULE 1 — the one that makes the total trustworthy. `shown` is the filtered
  // array in all three files; summing it is the mistake this whole guard exists
  // to catch, and it is a two-word diff away at all times.
  const summedFiltered = /\bshown\b[^\n]{0,60}\.reduce\(/.exec(s);
  ok(`${f} never sums the FILTERED list`, summedFiltered === null, summedFiltered?.[0]);

  // A hidden row the user cannot account for is indistinguishable from a
  // missing one — "my token is gone" is the same experience as a bug. So each
  // table owes a count and a way back.
  ok(`${f} reports how many rows it hid, in the module's words`, /hiddenNote\(/.test(s));
  // …and reports them as TWO things. The whole point of the 2026-09-13 change
  // is that one switch removes two different kinds of row: rows we priced and
  // found small (already inside the total) and rows we could not price at all
  // (never inside it, and on RH Chain frequently the user's actual position).
  // Printing the COMBINED count under the threshold label is the merge this
  // file exists to block — "12 tokens under $1 hidden" when nine of them have
  // no price is a fabricated valuation, not a rounding of the copy.
  const merged = /hid\.hidden[^\n]{0,60}DUST_USD|DUST_USD[^\n]{0,60}hid\.hidden/.exec(s);
  ok(`${f} never prints the combined count under the $ threshold`, merged === null, merged?.[0]);
  ok(`${f} offers a way to show them again`, /onShowDust/.test(s));
  // The filter hiding everything is a statement about the FILTER. The empty
  // branch is a statement about the WALLET. On a chain where a real holder can
  // be entirely sub-dollar, letting the first render as the second is the #421
  // bug wearing a different hat.
  ok(`${f} distinguishes "the filter hid them all" from "you hold nothing"`,
     /shown\.length === 0/.test(s));

  // RULE 3 — amounts are masked as well as dollars. A token quantity beside a
  // public market price is the same disclosure with one extra step, so hiding
  // only the money column hides nothing.
  ok(`${f} masks the amount column too, not just the value`,
     /maskFigure\(fmtAmount\(/.test(s));
  // …and never masks an absence. "—" means "we have no price"; a masked dash
  // would turn that ignorance into a secret the user thinks they are keeping.
  const maskedDash = /maskFigure\(\s*["'—]/.exec(s);
  ok(`${f} never masks an absence`, maskedDash === null, maskedDash?.[0]);

  // One threshold, printed from the constant. A hardcoded "$1" in the copy is
  // how the label and the filter start disagreeing.
  const hardcoded = /under \$\d/.exec(s);
  ok(`${f} prints the threshold from DUST_USD`,
     hardcoded === null && /\$\{DUST_USD\}/.test(s), hardcoded?.[0]);
}

// ── BankClient: the mask stops at the screen ────────────────────────────────
//
// The chat prompt is the one consumer that is not a pair of eyes. Handing it
// "••••" where a number belongs does not protect anything — the model will
// either repeat the mask as if it were an amount or reason around it — and the
// user's own screen is not a threat model the assistant needs to respect.
console.log("\nthe mask does not reach the chat model");
const bank = src["BankClient.tsx"]!;
const promptStart = bank.indexOf("const balanceForPrompt");
ok("BankClient still builds a balance prompt", promptStart !== -1);
if (promptStart !== -1) {
  // To the end of the statement: the assignment is one chained ternary.
  const promptEnd = bank.indexOf("\n\n", promptStart);
  const prompt = bank.slice(promptStart, promptEnd === -1 ? promptStart + 1200 : promptEnd);
  const leaked = /\b(priv|maskFigure)\s*\(/.exec(prompt);
  ok("balanceForPrompt is never masked", leaked === null, leaked?.[0]);
  // CONTROL: the slice must actually contain the figures, or the assertion
  // above is passing on an empty string.
  ok("CONTROL the prompt slice contains the balance figures", /usd\(total\)/.test(prompt));
}
// And the toggle is still wired to something on the screen, or "it never
// reaches the prompt" would be true of a mask that reaches nothing at all.
ok("CONTROL the eye toggle still masks figures on screen", /maskFigure\(s, hideBal\)/.test(bank));
ok("CONTROL the dust toggle is still pushed into the tables",
   (bank.match(/hideDust=\{hideDust\}/g) ?? []).length >= 4);

// ── §6  the "≥" survives the tidy-up ────────────────────────────────────────
//
// ShunTr asked, 2026-09-16, for the paragraph under the headline total to go —
// "Holds at least this much — Found on-chain without Moralis … · some tokens
// have no price". Fair: it is indexer plumbing sitting where a balance belongs.
// It was removed, and the reasons moved into the element's `title`.
//
// This section exists because of what was ADJACENT to it. The sentence and the
// "≥" are two halves of one claim, they render three lines apart, and only the
// sentence was asked for. The next person tidying this card sees a lone "≥"
// with no visible explanation left and reads it as leftover punctuation — and
// deleting it is invisible to every other gate here: it typechecks, it builds,
// the page renders, and the wallet quietly starts asserting a number it could
// not fully measure. That is the #211/#212/#213 shape exactly — an incomplete
// read rendered as a complete one — and no test in this repo watched for it.
//
// So: the prefix is pinned to the SERVER's verdict, the reasons are pinned to
// having a reader, and the two are pinned to the same element, because reasons
// attached to nothing are reasons nobody will ever see.
console.log("\nthe cross-chain total still admits when it is a floor");

// Every render of the cross-chain total, not just today's one. A second one
// added later is the realistic way this breaks — the first was written when the
// caveat was loud, the copy would be written when it is silent.
const TOTAL_SITE = /netWorth\.data\.total\.usd/g;
const totalSites = [...bank.matchAll(TOTAL_SITE)];
ok("CONTROL the cross-chain total is rendered somewhere", totalSites.length > 0);
const flat = totalSites.filter(m => {
  const around = bank.slice(Math.max(0, m.index! - 140), m.index! + 60);
  return !/total\.isFloor/.test(around);
});
ok("no render of the cross-chain total drops the floor prefix",
   flat.length === 0,
   flat.map(m => bank.slice(m.index! - 60, m.index! + 30)).join(" | "));

// The verdict is the SERVER's — `net-worth.ts` decides, this file reports. A
// hard-coded "$" here would be the same bug wearing a passing test.
ok("the prefix is the server's isFloor, not a local guess",
   /total\.isFloor\s*\?\s*"≥ "/.test(bank));

// The reasons did not leave with the sentence; they moved. If `floorReasons`
// ever loses its last reader, the memo becomes dead code someone deletes, and
// then "≥" really is unexplained everywhere.
ok("the reasons behind the floor still have a reader", /floorReasons\.join\(/.test(bank));

// And they must hang off the figure itself. A `title` on a neighbouring div
// would pass the check above while being unhoverable from the number it
// explains, so assert both land inside one element's attribute list.
const headline = /<div\b[^>]*font-mono text-\[28px\][\s\S]{0,400}?>/.exec(bank)?.[0] ?? "";
ok("CONTROL the headline element was located", headline.length > 0);
ok("the reasons hang off the figure they explain",
   /title=/.test(headline) && /floorReasons/.test(headline));

// Touch has no hover. That is a known, accepted cost of the removal — but it is
// only acceptable while the per-chain rows still name a chain that went unread,
// which is the reason a phone most needs. This is that fallback, pinned.
ok("a chain that could not be read is still named outside the tooltip",
   /could not be read/.test(bank));

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
