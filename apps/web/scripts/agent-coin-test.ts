// Pins lib/agent-coin: validation, ERC-7572 data URI with the ERC-8004 pointer, Quadra's split constants.
import assert from "node:assert/strict";
import * as M0 from "../src/lib/agent-coin";
const M: typeof M0 = (M0 as unknown as { default?: typeof M0 }).default ?? M0;

const d = { name: "Blue Agent", symbol: "BLUEA", description: "Onchain tools — ü", image: "", agentId: "1137821" };
assert.equal(M.coinProblem(d), null);
assert.match(M.coinProblem({ ...d, symbol: "TWO WORDS" })!, /Symbol/);
assert.match(M.coinProblem({ ...d, image: "http://x" })!, /https/);
const uri = M.coinContractUri(d);
const j = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
assert.equal(j.description, "Onchain tools — ü");
assert.equal(j.erc8004.agentId, 1137821);
assert.ok(!("erc8004" in JSON.parse(Buffer.from(M.coinContractUri({ ...d, agentId: "" }).split(",")[1], "base64").toString())));
assert.equal(M.QUADRA_V3_EXPECTS.creatorShareBps + M.QUADRA_V3_EXPECTS.referrerShareBps, 8_500);
assert.equal(M.newSalt().length, 66);
console.log("agent-coin-test: ok");

// RevenueShare wording never promises a return.
const w = M.stakerWording("AGENT", "ETH");
for (const banned of [/yield/i, /\bAPY\b/i, /\bAPR\b/i, /dividend/i, /passive income/i, /profit/i]) assert.ok(!banned.test(w), `banned word ${banned}`);
assert.match(w, /may be zero/);
assert.equal(M.MAX_AGENT_BPS, 9_000);
console.log("agent-coin-test: revenue share ok");
