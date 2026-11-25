import assert from "node:assert/strict";
import { BASE_COLLATERAL_VENUES, computeStockCollateralUsd } from "../src/lib/markets";
import { COINBASE_BASE_STOCKS } from "../src/lib/base-stocks/coinbase-list";

// 1. Verified Base 8453 collateral contract addresses (Aave V4 Equities Hub + Morpho Blue)
assert.equal(BASE_COLLATERAL_VENUES.aaveV4Hub, "0xa4d5947Eb727A052bae69C593FfC84247EC9864E");
assert.equal(BASE_COLLATERAL_VENUES.morphoBlue, "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb");

// 2. Synced 415 Base stock catalog includes ANTc (newly liquid)
assert.ok(COINBASE_BASE_STOCKS.length >= 415, `expected >=415 base stocks, got ${COINBASE_BASE_STOCKS.length}`);
assert.ok(COINBASE_BASE_STOCKS.some((s) => s.symbol === "ANTc"), "expected ANTc in synced COINBASE_BASE_STOCKS");

// 3. Pure USD collateral calculation (Aave V4 + Morpho Blue summation)
{
  const res = computeStockCollateralUsd({ aaveTokens: 30_000, morphoTokens: 500 }, 180);
  assert.equal(res.collateralAaveUsd, 5_400_000);
  assert.equal(res.collateralMorphoUsd, 90_000);
  assert.equal(res.collateralUsd, 5_490_000);
}

// 4. Single-venue collateral keeps the other venue null
{
  const res = computeStockCollateralUsd({ aaveTokens: 0, morphoTokens: 100 }, 200);
  assert.equal(res.collateralAaveUsd, null);
  assert.equal(res.collateralMorphoUsd, 20_000);
  assert.equal(res.collateralUsd, 20_000);
}

// 5. Zero balance, unread raw (null/undefined), or missing price -> null (never silent $0)
for (const [raw, px] of [
  [null, 180],
  [undefined, 180],
  [{ aaveTokens: 0, morphoTokens: 0 }, 180],
  [{ aaveTokens: 100, morphoTokens: 10 }, null],
  [{ aaveTokens: 100, morphoTokens: 10 }, 0],
] as const) {
  const res = computeStockCollateralUsd(raw, px);
  assert.deepEqual(res, { collateralUsd: null, collateralAaveUsd: null, collateralMorphoUsd: null });
}

console.log("markets-collateral-test: PASS (5/5)");
