/**
 * spend-summary-refund-test — the spend console nets refunds out of spending.
 *
 * The bug this pins (2026-10-01): /api/x402/[tool] refunds the credit debit
 * when a tool fails, and `refund()` records it as a `kind: "refund"` event —
 * but getSpendSummary counted only `spend` events, so a call that errored and
 * cost nothing still showed as "<tool> · N cr · 1 call" on /app/usage and in
 * the window total and day chart, disagreeing with `paidAllTime` (which the
 * refund does reduce).
 *
 * Hermetic: KV env cleared, so the ledger and spend log run on the in-memory
 * fallback; the real spend()/refund() write the events the summary reads.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}

import { spend, refund, topup } from "../src/lib/credit-ledger";
import { getSpendSummary } from "../src/lib/wallet/spend-summary";
import { kvSet } from "../src/lib/kv";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const WALLET = "0x7777777777777777777777777777777777777777";
const PARTIAL = "0x8888888888888888888888888888888888888888";

(async () => {
  // Same-day debits come out of the daily allowance first and refund in full.
  await topup(WALLET, 10_000, "purchase:usdc", "fixture-topup");

  await spend(WALLET, 40, "tool:honeypot-check", "call-ok");
  await spend(WALLET, 25, "tool:rh-stock-movers", "call-failed");
  const r = await refund(WALLET, "call-failed");
  check("fixture: the failed call was refunded in full", r.status === "refunded" && r.returned === 25, JSON.stringify(r));
  await spend(WALLET, 10, "chat:private", "chat-failed");
  await refund(WALLET, "chat-failed");
  await spend(WALLET, 5, "chat:private", "chat-ok");

  const s = await getSpendSummary(WALLET);
  const row = (id: string) => s.tools.find((t) => t.tool === id);

  console.log("\n1. A refunded tool call is not spending");
  check("1.1 the failed tool has no row (no credits, no call)", row("rh-stock-movers") === undefined,
    JSON.stringify(row("rh-stock-movers")));
  check("1.2 the successful tool is untouched", row("honeypot-check")?.credits === 40 && row("honeypot-check")?.creditCalls === 1,
    JSON.stringify(row("honeypot-check")));

  console.log("\n2. Chat refunds net the same way");
  check("2.1 chat counts only the call that was kept", s.chat.credits === 5 && s.chat.calls === 1, JSON.stringify(s.chat));

  console.log("\n3. Totals agree with what the wallet paid");
  check("3.1 window total = 40 + 5", s.credits.spentInWindow === 45, String(s.credits.spentInWindow));
  check("3.2 window calls = 2", s.credits.callsInWindow === 2, String(s.credits.callsInWindow));
  const chartCredits = s.days.reduce((a, d) => a + d.credits, 0);
  const chartCalls = s.days.reduce((a, d) => a + d.calls, 0);
  check("3.3 the day chart carries no refunded credits or calls", chartCredits === 45 && chartCalls === 2, `${chartCredits} cr · ${chartCalls} calls`);

  console.log("\n4. A partial refund leaves exactly the part that was not returned");
  // refund() returns less than the debit when the daily half had already
  // expired (the day rolled over). Written directly: real refund() cannot be
  // made to cross midnight inside a test.
  const now = Date.now();
  await kvSet(`ledger:${PARTIAL}`, {
    spent: 0, topup: 0, freeSpent: 30,
    history: [
      { ts: now - 2, kind: "spend", amount: 30, reason: "tool:risk-gate", ref: "p1", fromDaily: 20, fromPool: 10, day: "2026-09-30" },
      { ts: now - 1, kind: "refund", amount: 10, reason: "tool:risk-gate", ref: "refund:p1", refundOf: "p1", fromDaily: 0, fromPool: 10, day: "2026-10-01" },
      // A refund whose spend aged out of the capped history: nothing to net.
      { ts: now, kind: "refund", amount: 7, reason: "tool:risk-gate", ref: "refund:gone", refundOf: "gone", fromDaily: 0, fromPool: 7, day: "2026-10-01" },
    ],
  });
  const p = await getSpendSummary(PARTIAL);
  const rg = p.tools.find((t) => t.tool === "risk-gate");
  check("4.1 the call stays, at what it really cost (30 − 10)", rg?.credits === 20 && rg?.creditCalls === 1, JSON.stringify(rg));
  check("4.2 an orphan refund is never negative spending", p.credits.spentInWindow === 20, String(p.credits.spentInWindow));

  console.log(`\nspend-summary-refund-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
