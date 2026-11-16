import assert from "node:assert/strict";
import { requireFreshStockSnapshot, stockOracleState, lastClosedHourlyCandle } from "../../../packages/core/src/stock-observations";
import { buildDraftSnapshot, validSnapshotId, saveDraftSnapshot } from "../src/lib/xdrafts/snapshots";
import { GET } from "../src/app/api/stocks/drafts/[id]/route";
import { kv, isKVEnabled } from "../src/lib/kv";

const now = new Date("2026-11-16T00:00:00Z");
requireFreshStockSnapshot("2026-11-15T23:55:00Z", now);
for (const at of ["", "bad", "2026-11-15T22:00:00Z", "2026-11-16T00:05:00Z"]) {
  assert.throws(() => requireFreshStockSnapshot(at, now));
}
assert.equal(stockOracleState(Date.parse("2026-11-13T23:00:00Z") / 1000, now.toISOString()), "pre_weekend_reference");
assert.equal(stockOracleState(Date.parse("2026-11-16T01:00:00Z") / 1000, "2026-11-16T01:05:00Z"), "updated_since_weekend");
assert.equal(stockOracleState(null, now.toISOString()), "unavailable");
assert.equal(stockOracleState(NaN, now.toISOString()), "unavailable");
const hour = Date.parse("2026-11-15T23:00:00Z") / 1000;
const candles = [[hour, 0, 0, 0, 100], [hour + 3600, 0, 0, 0, 999]];
assert.deepEqual(lastClosedHourlyCandle(candles, "2026-11-16T00:34:00Z"), { close: 100, closed_at: "2026-11-16T00:00:00.000Z" });
assert.equal(lastClosedHourlyCandle(candles, "2026-11-16T04:34:00Z"), null);
const d = { kind: "weekend", text: "measured text", shot: "/markets/weekend", tag: "none", problems: [] as string[],
  evidence: { source: "fixture", as_of: now.toISOString(), inputs: { oracle: 100, dex: 103 }, method: "dex / oracle - 1" } };
const a = buildDraftSnapshot(d, now);
assert(validSnapshotId(a.id));
assert.equal(buildDraftSnapshot(d, now).id, a.id);
assert.notEqual(buildDraftSnapshot({ ...d, evidence: { ...d.evidence, inputs: { oracle: 100, dex: 104 } } }, now).id, a.id);
assert.notEqual(buildDraftSnapshot({ ...d, text: "changed claim" }, now).id, a.id);
assert.throws(() => buildDraftSnapshot({ ...d, evidence: undefined }, now));
assert.throws(() => buildDraftSnapshot({ ...d, problems: ["bad copy"] }, now));
assert.equal(validSnapshotId("../secrets"), false);
console.log("stock observation freshness, oracle resumption, candle look-ahead and evidence integrity checks passed");

async function storageContract() {
  // Only touch the hermetic in-memory adapter, never a configured remote KV.
  if (isKVEnabled()) throw new Error("this test requires the local in-memory KV");
  const id = await saveDraftSnapshot(d, now);
  const request = new Request("http://localhost/api/stocks/drafts/" + id);
  const response = await GET(request, { params: Promise.resolve({ id }) });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.text, d.text);
  assert.deepEqual(body.evidence.inputs, d.evidence.inputs);
  assert.equal((await GET(request, { params: Promise.resolve({ id: "bad" }) })).status, 400);
  assert.equal((await GET(request, { params: Promise.resolve({ id: "0".repeat(64) }) })).status, 404);
  const get = kv.get, set = kv.set;
  try {
    kv.get = async () => { throw new Error("simulated read outage"); };
    assert.equal((await GET(request, { params: Promise.resolve({ id }) })).status, 503);
    kv.set = async () => { throw new Error("simulated write outage"); };
    await assert.rejects(saveDraftSnapshot(d, now), /write outage/);
  } finally { kv.get = get; kv.set = set; }
  console.log("evidence save/read, invalid id, missing record, read outage and durable-write failure checks passed");
}
storageContract().catch((e) => { console.error(e); process.exitCode = 1; });
