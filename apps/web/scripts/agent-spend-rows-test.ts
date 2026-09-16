/**
 * CI guard on agent spending in the Activity timeline —
 * `app/app/bank/TransactionHistory.tsx`.
 *
 * Run: `npx tsx scripts/agent-spend-rows-test.ts` from `apps/web/`.
 * Hermetic: pure functions + one source-text read. No env, no network, no React.
 *
 * WHAT THIS PROTECTS, in one line: a payment the user actually made must not
 * disappear because someone else's index went down.
 *
 * Until `receiptRows` existed, an x402 receipt could only DECORATE a row Moralis
 * had already returned. That quietly made "chi tiêu cho agent" a derivative of
 * Moralis's uptime — and Moralis is 401-paused on the free plan right now
 * (#258), so the Base leg returns zero rows, there is nothing to decorate, and
 * the Agent filter reads "No agent spending on this wallet yet" over a wallet
 * holding our own receipts for those exact payments. Same defect as #211/#212/
 * #213: an absence produced by a broken reader, rendered as a fact about the
 * user. The difference here is that we hold the STRONGER fact and were throwing
 * it away in favour of the weaker one.
 *
 * The licence to synthesize a row, and its limit, both come from one place:
 * `recordToolPayment` is only ever called inside `if (settle.ok)`, with
 * `settle.tx` — so a stored receipt records a settlement that CLEARED, never one
 * that was merely attempted. Task #204 ("chat writes fake tool receipts") is the
 * failure on the other side of that line. Hence the assertions below: a row may
 * be built from a settlement hash and from nothing else.
 */

import {
  receiptRows, classify, headingFor, matches,
  type WalletTx, type Receipt, type Filter,
} from "../src/app/app/bank/TransactionHistory";

let failed = 0;
function ok(what: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✓ ${what}`); return; }
  failed++;
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ""}`);
}

const HASH_A = "0xAAAA000000000000000000000000000000000000000000000000000000000001";
const HASH_B = "0xbbbb000000000000000000000000000000000000000000000000000000000002";

const receipt = (over: Partial<Receipt> = {}): Receipt => ({
  ts: 1_756_000_000_000, tool: "token-price", name: "Token Price",
  units: 10_000, usd: 0.01, tx: HASH_A, ...over,
});

const indexedRow = (over: Partial<WalletTx>): WalletTx => ({
  chain: "base", hash: HASH_A, ts: 1_756_000_000_000, category: "",
  kind: "sent", dir: "out", amount: 0.01, asset: "USDC",
  status: "complete", ...over,
});

// ── 1. The reason this function exists ───────────────────────────────────────
console.log("\nthe outage case — the index is empty, the receipts are not");
{
  const rows = receiptRows([receipt(), receipt({ tx: HASH_B, tool: "honeypot-check", name: "Honeypot Check" })], []);
  ok("both payments become rows when NO index row exists", rows.length === 2, `got ${rows.length}`);

  // The whole user-visible point: the Agent filter must find them.
  const c = classify(rows[0], receipt());
  ok("…and each classifies as agent spending", c.group === "agent", `got group=${c.group}`);
  ok("…named by the receipt, not by hex", headingFor(rows[0], c, "irrelevant") === "Blue Hub · Token Price");
  ok("…and the Agent filter sweeps it up", matches(c, "Agent" as Filter));
}

// ── 2. Never a row we cannot back ────────────────────────────────────────────
//
// A row in this card is a link to a block explorer. A receipt with no settlement
// hash has nothing to link to, so rendering one would put a claim on screen the
// user cannot check — the footnote counts those instead.
console.log("\nno settlement hash → no row (the row IS a link to the settlement)");
{
  ok("a receipt with tx=null is skipped", receiptRows([receipt({ tx: null })], []).length === 0);
  ok("a receipt with tx=empty-string is skipped", receiptRows([receipt({ tx: "" })], []).length === 0);
  ok("mixed: only the one with a hash survives",
    receiptRows([receipt({ tx: null }), receipt({ tx: HASH_B })], []).length === 1);
}

// ── 3. The no-op when the index is healthy ───────────────────────────────────
console.log("\nthe healthy case — a matched receipt must NOT become a second row");
{
  ok("a receipt whose tx is already indexed adds nothing",
    receiptRows([receipt()], [indexedRow({})]).length === 0);

  // Moralis lowercases hashes; CDP has returned mixed case. A case-sensitive
  // compare here would double every payment on the timeline.
  ok("the hash match is case-insensitive (index lowercase, receipt mixed)",
    receiptRows([receipt({ tx: HASH_A })], [indexedRow({ hash: HASH_A.toLowerCase() })]).length === 0);
  ok("…and the other way round",
    receiptRows([receipt({ tx: HASH_A.toLowerCase() })], [indexedRow({ hash: HASH_A.toUpperCase() })]).length === 0);

  ok("two receipts sharing one hash yield ONE row",
    receiptRows([receipt(), receipt()], []).length === 1);
  ok("no receipts → no rows", receiptRows([], [indexedRow({})]).length === 0);
}

// ── 4. The chain is not a guess ──────────────────────────────────────────────
//
// x402 settles USDC on Base 8453 through the CDP facilitator; that is the only
// chain a receipt can be about. It is also the gate `classify` applies to the
// receipt join, so a row stamped anything else would silently lose its tool name
// AND draw a Basescan link for a foreign hash (#219/#230).
console.log("\nthe row's chain is BASE by derivation, not by default");
{
  const [row] = receiptRows([receipt()], []);
  ok("a synthesized row is chain=base", row.chain === "base", `got ${row.chain}`);
  ok("…so classify attaches the receipt", classify(row, receipt()).receipt?.tool === "token-price");

  // Dedup is scoped to Base rows: a 4663 row that happened to share a hash must
  // not suppress a real Base payment.
  ok("a Robinhood row with the same hash does NOT suppress the receipt",
    receiptRows([receipt()], [indexedRow({ chain: "robinhood" })]).length === 1);
}

// ── 5. Every field is something we actually know ─────────────────────────────
console.log("\nthe row asserts only what the receipt contains");
{
  const [row] = receiptRows([receipt({ usd: 1.25, units: 1_250_000, ts: 1_756_123_456_789 })], []);
  ok("amount is the settled USD, not a rounded guess", row.amount === 1.25, `got ${row.amount}`);
  ok("asset is USDC — the token x402 settles in", row.asset === "USDC");
  ok("direction is out (the user paid us)", row.dir === "out" && row.kind === "sent");
  ok("ts is the receipt's own timestamp", row.ts === 1_756_123_456_789);
  ok("status is complete — settle.ok was true or the receipt wouldn't exist", row.status === "complete");
  ok("hash is the settlement hash verbatim", row.hash === HASH_A);

  // The treasury address is the obvious thing to stamp here and we do NOT know
  // it: an older receipt was paid to the retired treasury, a newer one to the
  // current wallet, and the receipt records neither. Nothing renders it, so
  // filling it in would assert something unverified for no benefit.
  ok("counterparty is left UNSET rather than assumed",
    row.counterparty === undefined, `got ${row.counterparty}`);
}

// ── 6. The fix cannot be re-buried by a spinner or an error state ────────────
//
// Source-text assertion, because these are render branches. It is narrow and
// worth pinning: the skeleton and the "couldn't load" state are keyed off the
// INDEX readers, and before this change either of them covered the whole card.
// Letting them do that again would hand agent spending straight back to
// Moralis's uptime — the exact regression this file exists to prevent, and one
// that would typecheck perfectly.
console.log("\nrender gates — a receipt-backed row outlives its indexer");
{
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../src/app/app/bank/TransactionHistory.tsx"), "utf8") as string;

  ok("the skeleton is gated on there being no rows at all",
    /const allPending =[^;]*rows\.length === 0/s.test(src));
  ok("the failure state is gated on there being no rows at all",
    /const noneAnswered =[^;]*rows\.length === 0/s.test(src));
  ok("the component merges receipt rows into the list it renders",
    /receiptRows\(receipts\.all, transactions\)/.test(src));
  ok("`all` is carried on the receipt state, not just the by-hash map",
    /all:\s*Receipt\[\]/.test(src));
  ok("the Agent empty state says UNKNOWN when the receipt store is unreachable",
    /receipts\.status === "unavailable"[\s\S]{0,160}unknown, not zero/.test(src));
}

console.log(failed === 0 ? "\nPASS — agent spending survives a dead index\n" : `\nFAIL — ${failed} check(s)\n`);
process.exit(failed === 0 ? 0 : 1);
