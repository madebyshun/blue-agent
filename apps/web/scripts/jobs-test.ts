// Pins lib/jobs: posting and delivery rules, results never in the public view,
// and the unlock pays the AGENT (buildRequirementsTo), never Blue Agent.
import assert from "node:assert/strict";
import * as J0 from "../src/lib/jobs";
import * as C0 from "../src/app/api/_lib/x402-cdp";
import * as S0 from "../src/lib/x402-sign-client";
import * as P0 from "../src/lib/x402-payee";
const J: typeof J0 = (J0 as unknown as { default?: typeof J0 }).default ?? J0;
const C: typeof C0 = (C0 as unknown as { default?: typeof C0 }).default ?? C0;
const S: typeof S0 = (S0 as unknown as { default?: typeof S0 }).default ?? S0;
const P: typeof P0 = (P0 as unknown as { default?: typeof P0 }).default ?? P0;

assert.match(J.jobProblem("hi", "long enough brief", 1)!, /Title/);
assert.match(J.jobProblem("A title", "short", 1)!, /Brief/);
assert.match(J.jobProblem("A title", "long enough brief", 0.001)!, /Budget/);
assert.match(J.jobProblem("A title", "long enough brief", 101)!, /Budget/);
assert.equal(J.jobProblem("A title", "long enough brief", 1), null);
assert.equal(J.clean("a\u0000b\nc  ", 10), "ab\nc");

const poster = "0x1111111111111111111111111111111111111111";
const agent = "0x2222222222222222222222222222222222222222";
const job: J0.Job = { id: "aaaaaaaaaaaa", title: "T", brief: "B", budgetUnits: 1_000_000, poster, status: "open", createdAt: "", deliveries: [] };
const ok = { agent, payTo: agent, priceUsd: 0.5, preview: "a preview text", result: "r" };
assert.equal(J.deliveryProblem(job, ok), null);
assert.match(J.deliveryProblem(job, { ...ok, priceUsd: 2 })!, /budget/);
assert.match(J.deliveryProblem(job, { ...ok, agent: poster })!, /poster/);
assert.match(J.deliveryProblem({ ...job, status: "closed" }, ok)!, /not open/);
const withD = { ...job, deliveries: [{ id: "d", agent, agentId: "1", payTo: agent, priceUnits: 500_000, preview: "p", at: "", unlock: { tx: "0x", payer: poster, at: "" } }] };
assert.match(J.deliveryProblem(withD, ok)!, /already delivered/);
const pub = J.publicJob(withD);
assert.equal(pub.deliveries[0].unlocked, true);
assert.ok(!("unlock" in pub.deliveries[0]), "public view carries no payer");

const req = C.buildRequirementsTo("500000", agent);
assert.equal(req.payTo, agent);
assert.notEqual(req.payTo, P.X402_PAY_TO, "the unlock pays the agent, not Blue Agent");
assert.equal(req.network, "eip155:8453");
assert.equal(S.quoteProblem({ ...req, amount: "500000" } as S0.Quote), null);
assert.match(S.quoteProblem({ ...req, network: "eip155:1" } as S0.Quote)!, /Base/);
console.log("jobs-test: ok");

// Signed delivery: the message binds every field, and viem verifies it.
import { privateKeyToAccount } from "viem/accounts";
import { verifyMessage } from "viem";
(async () => {
  const acct = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"); // well-known test key (Anvil #1), not a real wallet
  const f = { jobId: "aaaaaaaaaaaa", agentId: "7", payTo: acct.address, priceUnits: 500_000, preview: "a preview", result: "the result", issuedAt: "2026-10-28T00:00:00.000Z" };
  const msg = await J.deliveryMessage(f);
  const sig = await acct.signMessage({ message: msg });
  assert.ok(await verifyMessage({ address: acct.address, message: msg, signature: sig }));
  const tampered = await J.deliveryMessage({ ...f, priceUnits: 900_000 });
  assert.ok(!(await verifyMessage({ address: acct.address, message: tampered, signature: sig })), "a changed price breaks the signature");
  const tampered2 = await J.deliveryMessage({ ...f, result: "another result" });
  assert.ok(!(await verifyMessage({ address: acct.address, message: tampered2, signature: sig })), "a changed result breaks the signature");
  assert.equal(J.jobsForAgents([{ ...job, status: "closed" }]).length, 0);
  console.log("jobs-test: signed delivery ok");
})();

// Hire Agent quotes: v1 and v2 normalise to USDC on Base; other chains are refused.
{
  const usdc = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
  const v2 = S.toQuote({ network: "eip155:8453", asset: usdc, amount: "10000", payTo: agent, maxTimeoutSeconds: 60 }, 2)!;
  assert.equal(v2.x402Version, 2); assert.equal(v2.amount, "10000"); assert.equal(S.quoteProblem(v2), null);
  const v1 = S.toQuote({ network: "base", asset: usdc, maxAmountRequired: "20000", payTo: agent }, 1)!;
  assert.equal(v1.x402Version, 1); assert.equal(v1.network, "eip155:8453"); assert.equal(v1.amount, "20000");
  assert.equal(S.toQuote({ network: "solana", asset: usdc, amount: "1", payTo: agent }, 2), null);
  console.log("jobs-test: hire quotes ok");
}
