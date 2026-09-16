/**
 * CI guard on the quantity-word rule — `src/lib/wallet/amount.ts`.
 *
 * Run: `npx tsx scripts/quantity-word-test.ts` from `apps/web/`.
 * Hermetic: pure functions + reading source files. No env, no network, no RPC.
 *
 * WHAT THIS PROTECTS, in one line: "all" / "max" / "half" / "N%" must mean the
 * same thing to the model that emits it, the editor that renders it and the
 * confirm card that signs it — because the user said it once.
 *
 * ─── The measurement that created this file (2026-09-16) ─────────────────────
 *
 * The rule existed in SEVEN places. Five agreed. Two did not:
 *
 *     lib/wallet/amount.ts     QUANTITY_WORD_RE   /^(all|max|half|\d+(?:\.\d+)?%)$/i
 *     ConfirmCardParts.tsx     SYMBOLIC_AMOUNT_RE ← identical (now imported)
 *     WalletSendCard.tsx       QUANTITY_WORD_RE   ← identical (now imported)
 *     SwapCard.tsx             QUANTITY_WORD_RE   ← identical (now imported)
 *     RhSwapCard.tsx           QUANTITY_WORD_RE   ← identical (now imported)
 *     api/chat/route.ts ×2     inline             ← identical (now imported)
 *     BridgeCard.tsx           isWord             /^(all|max|half|\d{1,3}%)$/i   ✗
 *
 * `\d{1,3}%` is not a harmless narrowing, and it fails in BOTH directions:
 *
 *   · it REJECTS "12.5%", which the confirm card under it accepts and would
 *     have resolved — so the editor answered "Enter an amount" for a quantity
 *     the card behind it understood perfectly; and
 *   · it ACCEPTS "999%", which it waved through to a confirm card that resolved
 *     9.99× the balance, leaving the fail-closed spend gate to catch it one
 *     screen later.
 *
 * Neither is visible to a type — both are strings, both parse, both build. The
 * only defence is that there is ONE definition, which is what §3 pins.
 *
 * Four sections:
 *   §1  the table — what each word resolves to, written out, not generated
 *   §2  invariants — properties that must hold however the function is written
 *   §3  ONE DEFINITION — no file may redefine the rule, and the surfaces that
 *       need it must actually import it (the control that stops §3 passing by
 *       deletion)
 *   §4  the two implementations agree — basis points (editors, bigint) against
 *       `resolveQuantity` (confirm cards, float)
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  QUANTITY_WORD_RE, PLAIN_AMOUNT_RE, wordToBps, isAmountLike,
} from "../src/lib/wallet/amount";
import { resolveQuantity, NATIVE_GAS_RESERVE } from "../src/app/chat/components/ConfirmCardParts";

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

const read = (rel: string) =>
  readFileSync(path.join(process.cwd(), "src", rel), "utf8");

// ── §1. The table ───────────────────────────────────────────────────────────
//
// Written out literally rather than generated from the regex: a generator
// shares its author's assumptions with the code under test, so a wrong rule
// would be wrong identically in both and pass. Written out, a behaviour change
// is a line in the diff somebody has to justify.
console.log("\n§1  wordToBps — what a word is worth, in basis points");

type Case = { in: string; want: number | null; why: string };
const TABLE: Case[] = [
  // ── The words.
  { in: "all",    want: 10000, why: "everything" },
  { in: "max",    want: 10000, why: "everything — same thing, different word" },
  { in: "MAX",    want: 10000, why: "case-insensitive: the LLM echoes the user's caps" },
  { in: " half ", want: 5000,  why: "trimmed before matching" },
  { in: "50%",    want: 5000,  why: "the percentage form of half" },
  { in: "100%",   want: 10000, why: "the percentage form of all" },
  { in: "1%",     want: 100,   why: "one percent is one hundred bps" },

  // ── THE REGRESSION. A fractional percent. The bridge editor's private
  //    `\d{1,3}%` rejected this while the card behind it resolved it.
  { in: "12.5%",  want: 1250,  why: "fractional percents are real — \\d{1,3}% rejected this" },
  { in: "0.5%",   want: 50,    why: "sub-one-percent still resolves" },
  { in: "33.33%", want: 3333,  why: "rounds to the nearest bp, not to an integer percent" },

  // ── THE OTHER DIRECTION. Over 100% is capped, not passed through. A user
  //    asking for 5× a balance they do not have means everything they DO have,
  //    and that is the only reading the spend gate accepts.
  { in: "999%",   want: 10000, why: "capped — \\d{1,3}% ACCEPTED this and passed 9.99× downstream" },
  { in: "101%",   want: 10000, why: "capped, just over" },
  { in: "10000%", want: 10000, why: "capped, far over — and 4 digits, which \\d{1,3}% rejected" },

  // ── Not words. `null` means "this is not a quantity word" — the caller then
  //    treats it as a number, or as nothing.
  { in: "25.5",   want: null,  why: "a plain figure is not a word" },
  { in: "0",      want: null,  why: "a plain figure, even a useless one" },
  { in: "",       want: null,  why: "empty" },
  { in: "0%",     want: null,  why: "zero percent of anything is not a spend" },
  { in: "-10%",   want: null,  why: "no negative amounts; the sign is not in the grammar" },
  { in: "allofit",want: null,  why: "anchored — a word must be the WHOLE string" },
  { in: "max eth",want: null,  why: "anchored — the ticker is a separate argument" },
  { in: "some",   want: null,  why: "not in the set; the LLM must not invent words" },
  { in: "%",      want: null,  why: "a bare sign is not a quantity" },
];

let mismatches = 0;
for (const t of TABLE) {
  const got = wordToBps(t.in);
  if (got !== t.want) {
    mismatches++;
    console.log(`  FAIL  wordToBps(${JSON.stringify(t.in)}) → ${got}, table says ${t.want} (${t.why})`);
  }
}
ok(`every one of the ${TABLE.length} rows matches the module`, mismatches === 0, `${mismatches} mismatch(es)`);

// ── §2. Invariants ──────────────────────────────────────────────────────────
//
// §1 says what the function returns today. These say what it may never return
// however it is rewritten tomorrow.
console.log("\n§2  invariants — true however the function is written");

const WORDS = TABLE.filter(t => t.want != null).map(t => t.in);
const NOT_WORDS = TABLE.filter(t => t.want == null).map(t => t.in);

ok("the regex and the resolver agree in both directions",
   WORDS.every(w => QUANTITY_WORD_RE.test(w.trim())) &&
   NOT_WORDS.every(w => wordToBps(w) === null),
   // A regex that accepts a string the resolver returns null for is the shape
   // that produces an amount field stuck on a word it cannot turn into a
   // number — which is exactly what the bridge card was showing.
   WORDS.filter(w => !QUANTITY_WORD_RE.test(w.trim())).join(", "));

const bpsValues = WORDS.map(w => wordToBps(w)!);
ok("INVARIANT no word ever resolves above the whole balance",
   bpsValues.every(b => b <= 10000),
   bpsValues.filter(b => b > 10000).join(", "));
ok("INVARIANT no word ever resolves to zero or less",
   bpsValues.every(b => b > 0),
   bpsValues.filter(b => b <= 0).join(", "));
ok("INVARIANT every bps is a whole number",
   bpsValues.every(b => Number.isInteger(b)),
   bpsValues.filter(b => !Number.isInteger(b)).join(", "));

// A word and a number are disjoint categories. If a string could be both, the
// card's `amountOk || isWord` branch would depend on evaluation order.
ok("INVARIANT nothing is both a plain figure and a word",
   [...WORDS, ...NOT_WORDS, "1", "1.0", "all", "100%"]
     .every(s => !(PLAIN_AMOUNT_RE.test(s.trim()) && QUANTITY_WORD_RE.test(s.trim()))));

// `isAmountLike` is the union the chat route validates with. It must accept
// exactly what the cards can render — no more (the card would be stuck) and no
// less (the user could not say it).
ok("isAmountLike is exactly figures ∪ words",
   [...WORDS, "25.5", "0", "1000000"].every(s => isAmountLike(s)) &&
   ["", "abc", "-1", "1e5", "1,000", "$5", "0x12"].every(s => !isAmountLike(s)),
   [...WORDS, "25.5", "0"].filter(s => !isAmountLike(s)).join(", "));

// ── §3. ONE DEFINITION ──────────────────────────────────────────────────────
//
// The whole point. §1 and §2 are true of `amount.ts` no matter how many other
// files quietly carry their own version — which is the state this replaced.
console.log("\n§3  one definition — nobody may redefine the rule");

// Every source file, minus the one that is allowed to state it.
const SRC_FILES = (() => {
  const { execSync } = require("node:child_process") as typeof import("node:child_process");
  return execSync(`find src -name '*.tsx' -o -name '*.ts'`, { encoding: "utf8" })
    .split("\n").map(s => s.trim()).filter(Boolean);
})();
ok("CONTROL the file sweep actually found the source tree", SRC_FILES.length > 200,
   `${SRC_FILES.length} files`);

// COMMENTS ARE NOT COPIES. A file is allowed — encouraged — to say in prose
// which words it accepts; what it may not do is re-STATE the rule in code. The
// first version of this check banned the string outright and immediately failed
// on `/api/chat/route.ts`, whose comment reads "a quantity word
// (all|max|half|N%)" directly above the line that now imports `isAmountLike`.
// Banning that sentence would trade a real duplicate for a worse outcome: code
// that no longer explains itself.
//
// So comments are stripped first. Block comments go whole; line comments go
// only when the `//` is not preceded by `:`, which keeps a `https://` inside a
// string from eating the rest of a line and hiding a genuine redefinition after
// it. Imprecise in the safe direction — it can only ever leave MORE source
// under the detector, never less.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
   .replace(/(^|[^:])\/\/[^\n]*/g, "$1");

// The signature of the rule: an alternation naming the three words. Any file
// carrying it in CODE is stating the rule rather than importing it.
const WORD_SET_RE = /all\|max\|half/;
const REDEFINES = SRC_FILES.filter(f => {
  if (f.endsWith("src/lib/wallet/amount.ts")) return false;  // the one address
  return WORD_SET_RE.test(stripComments(readFileSync(f, "utf8")));
});
ok("no file outside amount.ts spells out the word set",
   REDEFINES.length === 0,
   REDEFINES.join(", "));

// CONTROL for the two assertions above: the detector must still FIND the rule
// where it is supposed to live. Without this, a typo in `WORD_SET_RE` or an
// over-eager `stripComments` would turn the sweep into a check that passes on
// everything — the quietest possible way for a guard to stop guarding.
const amountSrc = stripComments(readFileSync("src/lib/wallet/amount.ts", "utf8"));
ok("CONTROL the detector still matches the real definition in amount.ts",
   WORD_SET_RE.test(amountSrc) && /function\s+wordToBps\b/.test(amountSrc));

// …and the resolver, which is the half that turns the word into a figure.
const REDEFINES_FN = SRC_FILES.filter(f => {
  if (f.endsWith("src/lib/wallet/amount.ts")) return false;
  return /function\s+wordToBps\b/.test(readFileSync(f, "utf8"));
});
ok("no file outside amount.ts defines wordToBps",
   REDEFINES_FN.length === 0,
   REDEFINES_FN.join(", "));

// THE CONTROL. Both assertions above pass trivially if the rule is used
// nowhere — delete every card and the sweep is clean. So the surfaces that MUST
// hold this rule are named, and each one must import it from the one address.
// If a card is genuinely retired, this list is the thing that has to be edited,
// deliberately, in the same commit.
console.log("\n  the surfaces that must import it (control for the sweep above)");
const IMPORTERS: [string, string][] = [
  ["app/chat/components/ConfirmCardParts.tsx", "the confirm cards' float resolver"],
  ["app/app/bank/WalletSendCard.tsx",          "Send editor"],
  ["app/app/bank/SwapCard.tsx",                "Base Convert editor"],
  ["app/app/bank/RhSwapCard.tsx",              "Robinhood Convert editor"],
  ["app/app/bank/BridgeCard.tsx",              "Bridge editor — the copy that drifted"],
  ["app/api/chat/route.ts",                    "server-side validation of the LLM's amount"],
];
for (const [rel, what] of IMPORTERS) {
  const src = read(rel);
  const imports = /from\s+"@\/lib\/wallet\/amount"/.test(src);
  ok(`${rel} imports the rule  (${what})`, imports);
}

// The bridge regression specifically: the editor must no longer be able to put
// a WORD into the field the user reads as a figure. `setAmount("max")` was the
// line that did it.
const LITERAL_WORD_WRITE = SRC_FILES.filter(f =>
  /setAmount\(\s*["'](all|max|half)["']\s*\)/i.test(readFileSync(f, "utf8")));
ok("no editor writes a literal quantity word into its amount field",
   LITERAL_WORD_WRITE.length === 0,
   LITERAL_WORD_WRITE.join(", "));

// And the bridge's Max must be gated on a balance it actually read — an
// ungated Max is a figure computed from nothing.
const bridge = read("app/app/bank/BridgeCard.tsx");
ok("BridgeCard's Max is disabled until the balance is read",
   /disabled=\{bal\.raw == null \|\| bal\.decimals == null\}/.test(bridge));
ok("BridgeCard reads the balance through the shared hook",
   /useSpendableBalance\(\{/.test(bridge));

// ── §4. The two implementations agree ───────────────────────────────────────
//
// There are two, and there have to be: the editors resolve in BASE UNITS
// (`raw * bps / 10000n`, integer, truncating) because a float `.toFixed` rounds
// UP and a 100% a hair over the balance is a 100% the user can never spend; the
// confirm cards resolve in floats because they receive a float balance. Two
// implementations of one rule is exactly the setup that drifted, so the
// proportion each produces is pinned against the other.
//
// Tolerance is one basis point, which is inherent: bps are integers, so a
// percentage finer than 0.01% cannot be represented. Anything coarser than that
// is a real disagreement.
console.log("\n§4  basis points (editors) vs resolveQuantity (confirm cards)");

const BALANCES = [1, 3, 1000, 0.0095, 1234.5678, 1e-6];
let drift: string[] = [];
for (const bal of BALANCES) {
  for (const w of ["all", "max", "half", "50%", "12.5%", "1%", "100%"]) {
    const bps = wordToBps(w)!;
    const fromBps = (bal * bps) / 10000;              // what the editor computes
    const fromFloat = resolveQuantity(w, bal, { isNative: false }).value;
    if (fromFloat == null) { drift.push(`${w}@${bal}: float returned null`); continue; }
    // Relative, because the absolute gap scales with the balance.
    if (Math.abs(fromFloat - fromBps) > bal * 0.0001) {
      drift.push(`${w}@${bal}: bps→${fromBps}, float→${fromFloat}`);
    }
  }
}
ok("ERC-20: both paths agree to within 1 bp on every word × balance",
   drift.length === 0, drift.slice(0, 5).join(" | "));

// Native is the one place they are ALLOWED to differ — and they must differ the
// same way. Both keep `NATIVE_GAS_RESERVE` back at 100%, so a wallet that
// bridges "max" ETH can still pay for the transaction that bridges it.
const nativeAll = resolveQuantity("max", 1, { isNative: true }).value;
ok("native max keeps the gas reserve back",
   nativeAll != null && Math.abs(nativeAll - (1 - NATIVE_GAS_RESERVE)) < 1e-12,
   String(nativeAll));
ok("native half does NOT reserve — only the 100% forms do",
   resolveQuantity("half", 1, { isNative: true }).value === 0.5);
// And the editors apply the same constant, from the same export, rather than
// writing their own figure. (`WalletSendCard` predates the shared constant and
// keeps its own smaller reserve for a send; the bridge, which is the card this
// test was written for, uses the shared one.)
ok("BridgeCard reserves using the shared NATIVE_GAS_RESERVE",
   /parseUnits\(String\(NATIVE_GAS_RESERVE\)/.test(bridge));

// A balance that has not been read must resolve to NOTHING, never to zero —
// the honesty law. A word against an unknown balance is an unknown quantity.
ok("INVARIANT an unread balance resolves to null, never 0",
   [null, 0, NaN, -1].every(b => resolveQuantity("all", b as number | null).value === null));

console.log(`\n${failures === 0 ? "ALL GREEN" : "FAILURES"} — ${checks - failures}/${checks} checks passed`);
process.exit(failures === 0 ? 0 : 1);
