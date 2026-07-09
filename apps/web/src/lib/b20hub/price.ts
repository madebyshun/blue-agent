// B20HUB — client-side math for translating "opening market cap in USD" into
// V4's sqrtPriceX96 format. Non-obvious enough that isolating it in a
// separate file with tests > putting it inline in a card component.
//
// === Concept ===
// Uniswap V4 stores price as sqrt(P) × 2^96 where P = amount1 / amount0 in
// the pool. For a B20/WETH pool with WETH as currency0 (typical on Base since
// 0x4200… < most token addresses):
//
//   P = amountToken / amountWETH
//
// If launching with 100B tokens total, 85B going into Position A's wide range
// and Position B's narrow range, we don't seed any WETH — the pool starts
// with amount0 = 0. But V4 still needs an initial sqrtPrice to know where
// "current tick" is, and this is what determines the OPENING price at which
// the first WETH → token swap executes.
//
// Formula (starting with amount0 = 0):
//   sqrtPriceX96 = sqrt(P) × 2^96
//
// where P is chosen so a hypothetical trader who buys with ε WETH gets a
// price consistent with the user's target opening market cap:
//
//   target market cap USD = tokenSupplyWhole × tokenPriceUSD
//   tokenPriceETH = tokenPriceUSD / ethPriceUSD
//   tokenPriceWETH per token (currency1 per currency0) = 1 / tokenPriceETH
//
//   P (V4 storage sense, amount1/amount0) = 1 / tokenPriceETH
//                                        = ethPriceUSD / tokenPriceUSD
//                                        = ethPriceUSD × tokenSupplyWhole / marketCapUSD
//
// Then sqrtPriceX96 = floor(sqrt(P) × 2^96) as a uint160.
//
// === Sanity check ===
// If market cap = $1,000, supply = 100B, ETH = $3,000:
//   tokenPriceUSD = 1000 / 100B = 1e-8
//   tokenPriceETH = 1e-8 / 3000 ≈ 3.33e-12
//   P = 1 / 3.33e-12 = 3e11 (ratio of WETH-per-token in pool sense)
//   sqrt(P) ≈ 5.48e5
//   × 2^96 ≈ 4.34e34
// V4's MAX_SQRT_PRICE = 1_461_446_703_485_210_103_287_273_052_203_988_822_378_723_970_342 ≈ 1.46e48
// So we're well under the ceiling.
//
// === API ===
// Both functions ONLY handle the token-is-currency1 case (WETH sorted low).
// If token address < WETH address, caller must invert (rare — see
// B20HUBLauncher.poolCurrencies for handling both directions).

const Q96 = 2n ** 96n;

/**
 * Given a target opening market cap (USD), token supply (whole tokens, before
 * decimals), token decimals, and current ETH price (USD), return the V4
 * sqrtPriceX96 to pass into initialize().
 *
 * Uses fixed-point BigInt math (no floating point) to keep the result stable
 * across browser + Node.js.
 */
export function sqrtPriceX96FromMarketCap(params: {
  targetMarketCapUsd: number;
  totalSupplyWhole: bigint;
  decimals: number;
  ethPriceUsd: number;
  /** True if the token is currency0 (WETH > token address). Default false. */
  tokenIsCurrency0?: boolean;
}): bigint {
  const { targetMarketCapUsd, totalSupplyWhole, decimals, ethPriceUsd } = params;

  if (targetMarketCapUsd <= 0) throw new Error("market cap must be > 0");
  if (ethPriceUsd <= 0) throw new Error("ETH price must be > 0");
  if (totalSupplyWhole <= 0n) throw new Error("supply must be > 0");

  // Scale factor so we can use BigInt math throughout: 1e18 precision keeps
  // us well above the smallest meaningful WETH-per-token ratio on Base.
  const SCALE = 10n ** 18n;

  // P = amountToken / amountWETH in RAW UNITS (base units, not decimals).
  // The pool doesn't know about "decimals" — it operates on raw amounts.
  //
  //   tokenPriceInETH_perBase = (marketCapUsd / totalSupplyBase) / ethPriceUsd
  //   where totalSupplyBase = totalSupplyWhole * 10^decimals
  //
  //   P = 1 / tokenPriceInETH_perBase * (ETH_wei_per_ETH / 1)
  //     = ethPriceUsd * totalSupplyBase * 1e18 / marketCapUsd
  //     (where the *1e18 puts price in wei-per-tokenBaseUnit)
  //
  //   BUT the pool math is amount1/amount0 in POOL units, which for WETH is
  //   wei and for token is base units. So P (V4) = wei_per_tokenBaseUnit /
  //   token_per_wei? No, simpler:
  //
  //   V4 P (currency1/currency0) = amount1 / amount0
  //   With WETH = currency0, token = currency1:
  //   P = tokenBaseUnits / wei = (baseUnits_per_ETH * ETH_perWEI)
  //     ≈ price of 1 WETH expressed in token base units
  //     = tokenBaseUnitsPerETH
  //     = tokenBaseUnitsPerUSD × usdPerETH
  //     = (totalSupplyBase / marketCapUsd) × ethPriceUsd

  const totalSupplyBase = totalSupplyWhole * 10n ** BigInt(decimals);

  // Scale USD floats into BigInt "milli-USD" (×1000) for precision.
  const mktCapMilliUsd = BigInt(Math.round(targetMarketCapUsd * 1000));
  const ethPriceMilliUsd = BigInt(Math.round(ethPriceUsd * 1000));

  // P = totalSupplyBase × ethPriceMilliUsd / mktCapMilliUsd
  // (milli-USD cancels out to give a pure ratio)
  let P_scaled = (totalSupplyBase * ethPriceMilliUsd * SCALE) / mktCapMilliUsd;

  // If token is currency0 instead, invert: pool sees amount1/amount0 = WETH/token.
  if (params.tokenIsCurrency0) {
    // P' = 1/P (in scaled math: SCALE^2 / P_scaled)
    P_scaled = (SCALE * SCALE) / P_scaled;
  }

  // sqrtPriceX96 = sqrt(P) × 2^96
  //   In scaled math: sqrt(P_scaled/SCALE) × Q96
  //                 = sqrt(P_scaled × Q96^2 / SCALE)
  //                 = sqrt(P_scaled × Q96 × Q96 / SCALE)
  const inside = (P_scaled * Q96 * Q96) / SCALE;
  return bigintSqrt(inside);
}

/** Newton-Raphson bigint square root. Handles values up to 2^256. */
export function bigintSqrt(n: bigint): bigint {
  if (n < 0n) throw new Error("sqrt of negative");
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) / 2n;
  while (y < x) {
    x = y;
    y = (x + n / x) / 2n;
  }
  return x;
}

/**
 * Reverse of sqrtPriceX96FromMarketCap: given a sqrtPriceX96 back, compute
 * the implied opening market cap in USD. Useful for the launch UI to show a
 * live preview of "at this sqrtPrice, opening market cap is $X".
 */
export function marketCapFromSqrtPriceX96(params: {
  sqrtPriceX96: bigint;
  totalSupplyWhole: bigint;
  decimals: number;
  ethPriceUsd: number;
  tokenIsCurrency0?: boolean;
}): number {
  const { sqrtPriceX96, totalSupplyWhole, decimals, ethPriceUsd } = params;

  // Reverse: P = (sqrtPriceX96 / Q96)^2 = sqrtPriceX96^2 / Q96^2
  const SCALE = 10n ** 18n;
  let P_scaled = (sqrtPriceX96 * sqrtPriceX96 * SCALE) / (Q96 * Q96);
  if (params.tokenIsCurrency0) {
    P_scaled = (SCALE * SCALE) / P_scaled;
  }

  const totalSupplyBase = totalSupplyWhole * 10n ** BigInt(decimals);
  // marketCapMilliUsd = totalSupplyBase * ethPriceMilliUsd * SCALE / P_scaled
  const ethPriceMilliUsd = BigInt(Math.round(ethPriceUsd * 1000));
  const mktCapMilliUsd =
    (totalSupplyBase * ethPriceMilliUsd * SCALE) / P_scaled;

  return Number(mktCapMilliUsd) / 1000;
}
