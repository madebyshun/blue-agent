// Pins lib/base-stocks/corporate-actions: id parsing from the on-chain
// announcement, the contract guard on Coinbase's record, and the seed's shape.
import assert from "node:assert/strict";
import { toHex } from "viem";
import { actionIdFromLog, normalizeAction, SEED } from "../src/lib/base-stocks/corporate-actions";
import { COINBASE_BASE_STOCKS } from "../src/lib/base-stocks/coinbase-list";

const PM = "0xB2000000000000000000008FC2A8C23cf5937b66";
const ID = "e4071568-89ad-4f41-9a31-565225066857";
// The announcement's data as seen on chain: id, type, record URL in ABI strings.
const data = toHex(`\0\0\0${ID}\0\0Cash Dividend\0https://api.coinbase.com/v1/tokenized-stocks/corporate-actions/${ID}`);
assert.equal(actionIdFromLog(data), ID);
assert.equal(actionIdFromLog("0x00"), null);

const applied = { id: ID, contract_address: PM, description: "Cash Dividend", status: "CORPORATE_ACTION_STATUS_APPLIED", announced_at: "2026-10-02T15:48:45Z", applied_at: "2026-10-26T13:30:15Z", multiplier_before: 1, multiplier_after: 1.558821201905387 };
const a = normalizeAction(ID, PM.toLowerCase(), applied)!;
assert.equal(a.status, "applied");
assert.equal(a.multiplier_change_pct, 55.8821);
// A record for ANOTHER contract, or another id, is dropped, never attached.
assert.equal(normalizeAction(ID, "0xb20000000000000000000078ee7ce2fE4908108C", applied), null);
assert.equal(normalizeAction("00000000-0000-0000-0000-000000000000", PM, applied), null);
assert.equal(normalizeAction(ID, PM, null), null);
// Announced: no multiplier yet, so no change is claimed.
const ann = normalizeAction(ID, PM, { ...applied, status: "CORPORATE_ACTION_STATUS_ANNOUNCED", applied_at: undefined, multiplier_before: undefined, multiplier_after: undefined })!;
assert.equal(ann.status, "announced");
assert.equal(ann.multiplier_change_pct, null);

// Seed: unique ids, every token a listed Coinbase stock on Base.
assert.equal(new Set(SEED.map((x) => x.id)).size, SEED.length, "duplicate id in SEED");
const listed = new Set(COINBASE_BASE_STOCKS.map((s) => s.token.toLowerCase()));
for (const x of SEED) assert.ok(listed.has(x.token.toLowerCase()), `SEED token ${x.token} is not in coinbase-list`);
console.log("corporate-actions-test: ok");
