/**
 * Hermetic unit tests for src/lib/venice-vvv.ts (Step 2).
 * Run: TMPDIR=/tmp node --import tsx scripts/venice-vvv-test.ts
 */
import assert from "node:assert/strict";
import { getAddress } from "viem";
import {
  VENICE_BASE_TOKENS,
  VVV_PERK_THRESHOLDS,
  evaluateVeniceHolderPerk,
  isPresetFreeForVeniceHolder,
  readVeniceOnchainBalances,
} from "../src/lib/venice-vvv";

let passed = 0;
function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(() => {
    passed++;
  });
}

async function main() {
  await test("1. Base 8453 VVV/sVVV/DIEM addresses are valid checksummed EVM addresses", () => {
    assert.equal(getAddress(VENICE_BASE_TOKENS.vvv), VENICE_BASE_TOKENS.vvv);
    assert.equal(getAddress(VENICE_BASE_TOKENS.svvv), VENICE_BASE_TOKENS.svvv);
    assert.equal(getAddress(VENICE_BASE_TOKENS.diem), VENICE_BASE_TOKENS.diem);
    assert.notEqual(VENICE_BASE_TOKENS.vvv, VENICE_BASE_TOKENS.svvv);
    assert.notEqual(VENICE_BASE_TOKENS.diem, VENICE_BASE_TOKENS.svvv);
  });

  await test("2. DIEM >= 0.1 unlocks Private TEE perk", () => {
    const perk = evaluateVeniceHolderPerk({ vvv: 0, svvv: 0, diem: VVV_PERK_THRESHOLDS.minDiem });
    assert.equal(perk.eligible, true);
    assert.equal(perk.tier, "diem");
    assert.equal(isPresetFreeForVeniceHolder("tee", perk), true);
    assert.equal(isPresetFreeForVeniceHolder("deep", perk), false);
  });

  await test("3. sVVV >= 100 unlocks Private TEE perk", () => {
    const perk = evaluateVeniceHolderPerk({ vvv: 0, svvv: 100, diem: 0 });
    assert.equal(perk.eligible, true);
    assert.equal(perk.tier, "svvv");
    assert.equal(isPresetFreeForVeniceHolder("tee", perk), true);
  });

  await test("4. Unstaked VVV alone or sub-threshold DIEM/sVVV does not qualify", () => {
    assert.equal(evaluateVeniceHolderPerk({ vvv: 500, svvv: 99.9, diem: 0.09 }).eligible, false);
    assert.equal(evaluateVeniceHolderPerk(null).eligible, false);
    assert.equal(isPresetFreeForVeniceHolder("tee", evaluateVeniceHolderPerk(null)), false);
  });

  await test("5. readVeniceOnchainBalances rejects invalid addresses without network call", async () => {
    const res = await readVeniceOnchainBalances("not-an-address");
    assert.equal(res, null);
  });

  console.log(`venice-vvv-test: PASS (${passed}/5)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
