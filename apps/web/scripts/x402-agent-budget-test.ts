/**
 * packages/x402-client agent budget: total cap, per-agent cap, loop guard, and
 * reservation release on a failed paid call. Every refusal must happen BEFORE
 * signing, so the mock seller counts paid requests and the test asserts it
 * never saw one it should not have.
 *
 * Hermetic: a local HTTP seller and a throwaway key generated here (it holds
 * nothing). Auto-discovered by `npm test`.
 */
import { createServer } from "node:http";
import { generatePrivateKey } from "viem/accounts";
import { X402Client } from "../../../packages/x402-client/src/client";
import { AgentBudget, BudgetError } from "../../../packages/x402-client/src/budget";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x0000000000000000000000000000000000000abc";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
let failed = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) failed++; };
const code = async (p: Promise<unknown>) => { try { await p; return "ok"; } catch (e) { return e instanceof BudgetError ? e.code : `other: ${(e as Error).message}`; } };

(async () => {
  let paidSeen = 0;
  let failNext = false;
  // A v2 seller charging $0.02 (20000) per call; answers 500 to a paid call when failNext.
  const srv = createServer((req, res) => {
    if (!req.headers["payment-signature"]) {
      res.writeHead(402, { "PAYMENT-REQUIRED": b64({ x402Version: 2, resource: { url: "x" }, accepts: [
        { scheme: "exact", network: "eip155:8453", asset: USDC, amount: "20000", payTo: PAY_TO, maxTimeoutSeconds: 60 },
      ] }) }).end("{}");
      return;
    }
    paidSeen++;
    if (failNext) { failNext = false; res.writeHead(500).end("boom"); return; }
    res.writeHead(200, { "content-type": "application/json" }).end('{"ok":true}');
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/tool`;
  const key = generatePrivateKey();

  // 1. Per-agent budget: "scout" may spend $0.04 = two calls.
  const c = new X402Client({ privateKey: key, budget: { totalAtomic: 100_000n, perAgentAtomic: { scout: 40_000n }, loop: false } });
  ok("scout call 1 paid", (await code(c.call(url, { agent: "scout", body: { n: 1 } }))) === "ok");
  ok("scout call 2 paid", (await code(c.call(url, { agent: "scout", body: { n: 2 } }))) === "ok");
  const before = paidSeen;
  ok("scout call 3 refused: AGENT_BUDGET_EXCEEDED", (await code(c.call(url, { agent: "scout", body: { n: 3 } }))) === "AGENT_BUDGET_EXCEEDED");
  ok("refused call never reached the seller paid", paidSeen === before);

  // 2. Total budget: $0.10 total, $0.04 spent → three more $0.02 calls fit, the fourth does not.
  for (let i = 0; i < 3; i++) await c.call(url, { agent: "writer", body: { i } });
  ok("total cap refuses the 6th $0.02 call: BUDGET_EXCEEDED", (await code(c.call(url, { agent: "writer", body: { i: 9 } }))) === "BUDGET_EXCEEDED");
  ok("spent is exactly $0.10", c.budget.spentAtomic === 100_000n);
  const rep = c.budget.report();
  ok("report: writer 3 calls $0.06, scout 2 calls $0.04", rep[0].agent === "writer" && rep[0].calls === 3 && rep[0].spentAtomic === 60_000n && rep[1].agent === "scout" && rep[1].spentAtomic === 40_000n);

  // 3. A failed paid call gives its reservation back.
  const d = new X402Client({ privateKey: key, budget: { totalAtomic: 20_000n, loop: false } });
  failNext = true;
  ok("seller 500 surfaces as an error", (await code(d.call(url, { body: { a: 1 } }))).startsWith("other"));
  ok("…and the reservation is released", d.budget.remainingAtomic() === 20_000n && d.budget.spentAtomic === 0n);
  ok("the budget still allows one call after", (await code(d.call(url, { body: { a: 2 } }))) === "ok");

  // 4. Loop guard (default 5 in 60s): the 6th identical call is stopped before the probe.
  const e = new X402Client({ privateKey: key });
  for (let i = 0; i < 5; i++) await e.call(url, { agent: "bot", body: { same: true } });
  const p = paidSeen;
  ok("6th identical call: LOOP_DETECTED", (await code(e.call(url, { agent: "bot", body: { same: true } }))) === "LOOP_DETECTED");
  ok("…and nothing was paid for it", paidSeen === p);
  ok("a different body is not a loop", (await code(e.call(url, { agent: "bot", body: { same: false } }))) === "ok");
  ok("another agent is not caught by bot's loop", (await code(e.call(url, { agent: "other", body: { same: true } }))) === "ok");

  // 5. The window slides: with a fake clock, repeats outside the window are forgotten.
  let t = 0;
  const g = new AgentBudget({ loop: { maxRepeats: 2, windowSeconds: 10 } }, () => t);
  g.checkLoop("a", "k"); g.checkLoop("a", "k");
  ok("3rd inside 10s is a loop", (() => { try { g.checkLoop("a", "k"); return false; } catch { return true; } })());
  t = 11_000;
  ok("after the window it is allowed again", (() => { try { g.checkLoop("a", "k"); return true; } catch { return false; } })());

  // 6. Concurrency: two parallel calls cannot overshoot a one-call budget.
  const h = new X402Client({ privateKey: key, budget: { totalAtomic: 20_000n, loop: false } });
  const both = await Promise.all([code(h.call(url, { body: { x: 1 } })), code(h.call(url, { body: { x: 2 } }))]);
  ok("parallel: exactly one paid, one BUDGET_EXCEEDED", both.filter((x) => x === "ok").length === 1 && both.includes("BUDGET_EXCEEDED"));

  srv.close();
  if (failed) { console.log(`x402-agent-budget-test: ${failed} FAILED`); process.exit(1); }
  console.log("x402-agent-budget-test: all passed");
})();
