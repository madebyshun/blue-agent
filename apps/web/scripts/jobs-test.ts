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
