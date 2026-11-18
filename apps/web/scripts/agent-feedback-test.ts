// ERC-8004 feedback (BaseCity plan item 8): what is queued, what is written, and inert by default.
import { queueable, feedbackFile, runFeedbackQueue, FEEDBACK_MIN_UNITS } from "../src/lib/agent-feedback";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

(async () => {
  const tx = "0x" + "a".repeat(64), payer = "0x" + "1".repeat(40), payTo = "0x" + "2".repeat(40);
  check("paid unlock at $0.05 queues", queueable({ tx, payer, payTo, priceUnits: FEEDBACK_MIN_UNITS }));
  check("under $0.05 does not queue", !queueable({ tx, payer, payTo, priceUnits: FEEDBACK_MIN_UNITS - 1 }));
  check("payer == payTo (self-paid) does not queue", !queueable({ tx, payer, payTo: payer.toUpperCase().replace("0X", "0x"), priceUnits: 1_000_000 }));
  check("no tx does not queue", !queueable({ tx: "", payer, payTo, priceUnits: 1_000_000 }));
  const f = feedbackFile({ agentId: "1205445", jobId: "abcabcabcabc", did: "d", tx, payer, payTo, priceUnits: 500_000, at: "2026-11-18T00:00:00Z" });
  check("file is tagged paid-unlock, not a quality score", f.tag1 === "paid-unlock" && f.tag2 === "blueagent-job");
  check("file carries proof of payment", f.proofOfPayment.txHash === tx && f.proofOfPayment.amountUsdcUnits === 500_000 && f.proofOfPayment.toAddress === payTo);
  delete process.env.AGENT_FEEDBACK_ENABLED;
  const r = await runFeedbackQueue(1).catch((e) => ({ status: `threw ${e}`, outcomes: [] }));
  check("inert unless AGENT_FEEDBACK_ENABLED=1 (no key read, nothing sent)", r.status.startsWith("disabled"));
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
