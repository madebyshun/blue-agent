// Pins lib/hub/exchange foldChunk: only EIP-3009 settlements count, team wallets split out, payers deduped.
import assert from "node:assert/strict";
import * as M0 from "../src/lib/hub/exchange";
import * as R0 from "../src/lib/mcp-receipts";
const M: typeof M0 = (M0 as unknown as { default?: typeof M0 }).default ?? M0;
const R: typeof R0 = (R0 as unknown as { default?: typeof R0 }).default ?? R0;

const seller = "0x1111111111111111111111111111111111111111";
const buyer = "0x2222222222222222222222222222222222222222";
const team = [...R.TEAM_WALLETS][0];
const blob = M.foldChunk({ p: {}, from: "0", to: "0" }, [
  { tx: "0xA", from: buyer, to: seller, value: 10_000n },
  { tx: "0xB", from: buyer, to: seller, value: 20_000n },
  { tx: "0xC", from: buyer, to: seller, value: 99_000_000n },   // plain transfer: no AuthorizationUsed
  { tx: "0xD", from: team, to: seller, value: 5_000n },
], new Set([`0xa:${buyer}`, `0xb:${buyer}`, `0xd:${team}`]));
const c = blob.p[seller];
assert.equal(c.n, 2, "only authorized transfers count");
assert.equal(c.u, 30_000);
assert.equal(c.pay.length, 1, "payer deduped");
assert.equal(c.tn, 1, "team call split out");
assert.equal(c.tu, 5_000);
console.log("hub-exchange-test: ok");
