/**
 * rh-spot-price-test — the Robinhood Chain swap quote's on-chain price
 * (lib/robinhood/pool.ts wethPerTokenFromSqrtPrice). Pure: no RPC.
 *
 * Why it exists: the quote's only price used to be GeckoTerminal, which a
 * shared Vercel IP reached only some of the time, so `blue_swap_tx` refused
 * real swaps as NO_QUOTE (8 errors in 11 MCP builds). The pool's slot0 is now
 * the primary price; a decimals or orientation slip here would turn a refused
 * swap into a swap with a wrong slippage floor, which is worse.
 *
 * Fixture: the live TSLA/WETH 0.3% pool on Robinhood Chain 4663 (0xA953…dA07),
 * read 2026-10-22: WETH is token0, TSLA is token1, both 18 decimals; slot0 gave
 * 0.151830808… WETH per TSLA ≈ $368.31 at ETH $2,425.79, against
 * GeckoTerminal's $368.53 the same minute.
 */
import { wethPerTokenFromSqrtPrice } from "../src/lib/robinhood/pool";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
const near = (a: number | null, b: number, rel = 1e-9) => a !== null && Math.abs(a - b) <= Math.abs(b) * rel;
// sqrtPriceX96 for a given raw token1-per-token0 ratio.
const sqrtOf = (raw1per0: number) => BigInt(Math.round(Math.sqrt(raw1per0) * 2 ** 96));

// WETH token0, token 1 (the live TSLA pool): raw1per0 = TSLA per WETH = 1 / 0.15183…
{
  const wethPerTsla = 0.15183080872290786;
  const got = wethPerTokenFromSqrtPrice(sqrtOf(1 / wethPerTsla), false, 18);
  ok("token as token1, 18/18 decimals: WETH per token round-trips", near(got, wethPerTsla, 1e-9), String(got));
}

// Token token0 with 6 decimals (USDC-like), WETH token1: 1 token = 0.0004 WETH.
{
  const human1per0 = 0.0004;                       // WETH per token, human units
  const raw1per0 = human1per0 * 10 ** (18 - 6);    // raw WETH units per raw token unit
  const got = wethPerTokenFromSqrtPrice(sqrtOf(raw1per0), true, 6);
  ok("token as token0, 6 decimals: decimals applied in the right direction", near(got, 0.0004, 1e-9), String(got));
}

// Token token1 with 8 decimals (B20-style), WETH token0: 1 token = 0.15 WETH.
{
  const tokenPerWeth = 1 / 0.15;                   // human token1 per token0
  const raw1per0 = tokenPerWeth * 10 ** (8 - 18);
  const got = wethPerTokenFromSqrtPrice(sqrtOf(raw1per0), false, 8);
  ok("token as token1, 8 decimals: inverted and rescaled", near(got, 0.15, 1e-9), String(got));
}

ok("a zero sqrtPrice is no price, never 0", wethPerTokenFromSqrtPrice(0n, true, 18) === null);

console.log(`\n${failures === 0 ? "rh-spot-price-test: all passed" : `rh-spot-price-test: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
