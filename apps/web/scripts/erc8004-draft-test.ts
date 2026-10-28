// Pins lib/erc8004 drafts: validation, data: URI round-trip, no empty services.
import assert from "node:assert/strict";
import * as M0 from "../src/lib/erc8004-draft";
const M: typeof M0 = (M0 as unknown as { default?: typeof M0 }).default ?? M0;

assert.equal(M.draftProblem({ name: "", description: "", x402: false }), "Name is required.");
assert.match(M.draftProblem({ name: "a", description: "", mcp: "http://x", x402: false })!, /https/);
const d = { name: " Tester ", description: "Does things — ünïcode", mcp: "https://x.dev/mcp", x402: true };
assert.equal(M.draftProblem(d), null);
const uri = M.draftDataUri(d);
assert.ok(uri.startsWith("data:application/json;base64,"));
const back = JSON.parse(Buffer.from(uri.split(",")[1], "base64").toString("utf8"));
assert.equal(back.name, "Tester");
assert.equal(back.description, "Does things — ünïcode");
assert.deepEqual(back.services, [{ name: "MCP", endpoint: "https://x.dev/mcp" }]);
assert.equal(back.x402Support, true);
console.log("erc8004-draft-test: ok");
