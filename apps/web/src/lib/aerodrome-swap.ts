/**
 * Aerodrome Slipstream route for Base B20 tokenized stocks (plan 2026-10-06
 * task 2.2).
 *
 * WHY. Base swaps go through 0x, and 0x refuses the B20 stock tokens: buying
 * NVDAc answered "The buy token is not authorized for trade due to legal
 * restrictions" (measured 2026-10-03). The tokens trade on Aerodrome, which is
 * also where Blue Hood measures them, so a Base stock buy or sell had no route
 * at all inside Blue Agent.
 *
 * ADDRESSES — verified on-chain 2026-10-07, not from memory:
 *   • the NVDAc/USDC pool 0x853F…7ab9 (deepest, per DexScreener) reports
 *     factory() = CL_FACTORY below, tickSpacing 10;
 *   • SWAP_ROUTER.factory() and QUOTER.factory() both return CL_FACTORY;
 *   • Blockscout names them CLFactory / SwapRouter / QuoterV2, all verified,
 *     all created by the same deployer (0x2BbFA3f3…1624);
 *   • aerodrome-finance/slipstream README lists this trio as the
 *     "Gauges V3" deployment. The older Slipstream SwapRouter (factory
 *     0x5e7B…809A) does NOT route these pools.
 *   • eth_simulateV1 from wallet 0x0295…9205: approve 1 USDC + exactInputSingle
 *     → status 1, 0.00415935 NVDAc received. B20 holder policy did not block it.
 *
 * SCOPE, on purpose: USDC ↔ a REGISTERED Base stock (BASE_STOCKS), one hop.
 * The registry's admission gate already requires a USD-anchored pool. ETH and
 * other legs are refused with a message (swap to USDC first) rather than
 * routed through a pool nobody vetted. The pool is found on-chain via
 * CL_FACTORY.getPool across the factory's own tick spacings, never by name.
 *
 * Output mirrors the 0x quote shape SwapCard and blue_swap_tx already read
 * (buyAmount, minBuyAmount, transaction, issues.allowance.spender), plus
 * `venue: "aerodrome"`. Non-custodial: calldata only; the user signs.
 */
import { encodeFunctionData, parseAbi, type Address } from "viem";
import { clientFor } from "@/lib/tx-chains";
import { BASE_STOCKS } from "@/lib/base-stocks/registry";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";

export const CL_FACTORY = "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef" as const;
export const SWAP_ROUTER = "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F" as const;
export const QUOTER = "0x514c8B5f54112481E28028F1166Bd78501089259" as const;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;

const FACTORY_ABI = parseAbi([
  "function getPool(address,address,int24) view returns (address)",
  "function tickSpacings() view returns (int24[])",
]);
const POOL_ABI = parseAbi(["function liquidity() view returns (uint128)", "function factory() view returns (address)"]);
const QUOTER_ABI = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96)) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const ROUTER_ABI = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)",
]);

const lc = (a: string) => a.toLowerCase();
/**
 * The Base stock token at this address, or null. Matched by ADDRESS only, never
 * a name: first Blue Hood's registry, then every Coinbase Tokenized Stock Base
 * publishes (lib/base-stocks/coinbase-list, each checked on chain: isB20,
 * 8 decimals, exact symbol).
 *
 * It was the 9-token registry only until 2026-11-05. 0x refuses every B20 stock
 * ("not authorized for trade due to legal restrictions"), so a verified stock
 * outside the registry (LIc, measured that day) fell through to 0x and could
 * not be swapped at all.
 */
export function baseStockByToken(addr: string): { symbol: string; token: string } | null {
  const hood = BASE_STOCKS.find((s) => lc(s.token) === lc(addr));
  if (hood) return { symbol: hood.symbol, token: hood.token };
  const cb = COINBASE_BASE_STOCKS.find((s) => lc(s.token) === lc(addr));
  return cb ? { symbol: cb.symbol, token: cb.token } : null;
}

export type AeroQuote =
  | {
      venue: "aerodrome";
      sellToken: string; buyToken: string; sellAmount: string;
      buyAmount: string; minBuyAmount: string;
      pool: string; tickSpacing: number; slippageBps: number;
      transaction: { to: string; data: string; value: "0" };
      issues: { allowance: { spender: string } };
    }
  | { error: string; venue: "aerodrome" };

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

/**
 * Deepest USDC pool for `stock` in CL_FACTORY, read in two Multicall3 calls
 * (getPool for every tick spacing, then liquidity). Single eth_calls to the
 * public Base RPC are rate-limited (see lib/wallet/base-token-discovery.ts);
 * the first version of this function made 13 of them and found nothing.
 */
async function poolCandidates(stock: Address): Promise<{ pool: Address; tickSpacing: number }[]> {
  const c = clientFor("base");
  let spacings: number[] = [1, 10, 50, 100, 200, 2000];
  try { spacings = (await c.readContract({ address: CL_FACTORY, abi: FACTORY_ABI, functionName: "tickSpacings" })).map(Number); } catch { /* fallback list */ }
  const pools = await c.multicall({
    allowFailure: true, multicallAddress: MULTICALL3, batchSize: 0,
    contracts: spacings.map((ts) => ({ address: CL_FACTORY, abi: FACTORY_ABI, functionName: "getPool" as const, args: [USDC_BASE, stock, ts] as const })),
  });
  const cands = pools
    .map((r, i) => ({ pool: r.status === "success" ? (r.result as Address) : null, tickSpacing: spacings[i] }))
    .filter((x): x is { pool: Address; tickSpacing: number } => !!x.pool && !/^0x0{40}$/i.test(x.pool));
  if (!cands.length) return [];
  const liq = await c.multicall({
    allowFailure: true, multicallAddress: MULTICALL3, batchSize: 0,
    contracts: cands.map((x) => ({ address: x.pool, abi: POOL_ABI, functionName: "liquidity" as const })),
  });
  // Every pool with liquidity in range. Unread pools are skipped, never ranked as empty.
  return cands.filter((_, i) => liq[i].status === "success" && (liq[i].result as bigint) > 0n);
}

// Uniswap-v3 sqrt-price bounds. The Quoter does NOT revert when a pool runs out
// of liquidity: the simulated swap stops at the bound and reports what it got,
// as if all of amountIn had been spent. Such a quote is a partial fill.
const MIN_SQRT = 4295128739n, MAX_SQRT = 1461446703485210103287273052203988822378723970342n;

/** A swap that moves the price more than this, against a 1%-size reference, is refused. */
export const MAX_IMPACT_PCT = 5;

export type PoolQuote = { pool: Address; tickSpacing: number; out: bigint; full: boolean };

/**
 * The pool to trade on for THIS size: the most output among quotes that fill
 * in full. Pure, so it is tested without a chain (aero-best-quote-test.ts).
 */
export function pickBestQuote(quotes: (PoolQuote | null)[]): PoolQuote | null {
  let best: PoolQuote | null = null;
  for (const q of quotes) if (q && q.full && q.out > 0n && (!best || q.out > best.out)) best = q;
  return best;
}

/**
 * Quote `amountIn` on every candidate pool and keep the best.
 *
 * Until 2026-11-05 the pool was picked BEFORE quoting, by in-range liquidity()
 * alone. On LIc / INFYc / HSAIc that sometimes chose a pool whose liquidity sat
 * in a sliver of range: every size bought what $100 did (read as "+900%"), and
 * swap_prepare would have built the trade on that pool, its slippage floor
 * computed from the same bad quote. Liquidity is not depth; the quote is.
 */
async function bestQuote(tokenIn: Address, tokenOut: Address, amountIn: bigint, cands: { pool: Address; tickSpacing: number }[]): Promise<PoolQuote | null> {
  const c = clientFor("base");
  const quotes = await Promise.all(cands.map(async (x) => {
    try {
      const { result } = await c.simulateContract({
        address: QUOTER, abi: QUOTER_ABI, functionName: "quoteExactInputSingle",
        args: [{ tokenIn, tokenOut, amountIn, tickSpacing: x.tickSpacing, sqrtPriceLimitX96: 0n }],
      });
      const after = result[1];
      return { ...x, out: result[0], full: after > MIN_SQRT + 1n && after < MAX_SQRT - 1n };
    } catch { return null; }
  }));
  return pickBestQuote(quotes);
}

/**
 * Quote + unsigned calldata for USDC ↔ a registered Base stock, or an error the
 * caller shows as-is. `taker` receives the output.
 */
export async function aerodromeQuote(p: { sellToken: string; buyToken: string; sellAmount: string; taker: string; slippageBps: number | null }): Promise<AeroQuote> {
  const sellStock = baseStockByToken(p.sellToken), buyStock = baseStockByToken(p.buyToken);
  const stock = sellStock ?? buyStock;
  if (!stock) return { venue: "aerodrome", error: "Not a registered Base stock token." };
  const other = sellStock ? p.buyToken : p.sellToken;
  if (lc(other) !== lc(USDC_BASE)) {
    return { venue: "aerodrome", error: `${stock.symbol} trades against USDC on Aerodrome. Swap to USDC first, then ${sellStock ? "sell" : "buy"} ${stock.symbol} with USDC.` };
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(p.taker)) return { venue: "aerodrome", error: "A taker wallet is required to build the swap." };
  if (!/^\d+$/.test(p.sellAmount) || BigInt(p.sellAmount) === 0n) return { venue: "aerodrome", error: "bad sellAmount" };

  const cands = await poolCandidates(stock.token as Address);
  if (!cands.length) return { venue: "aerodrome", error: `No Aerodrome ${stock.symbol}/USDC pool with liquidity was found on Base.` };

  const amountIn = BigInt(p.sellAmount);
  const found = await bestQuote(p.sellToken as Address, p.buyToken as Address, amountIn, cands);
  if (!found) return { venue: "aerodrome", error: `No Aerodrome ${stock.symbol}/USDC pool can fill this size in full; try a smaller amount.` };
  const out = found.out;

  // Impact guard. Slippage is measured from the quote, so a quote that is itself
  // far off the market passes it: on 2026-11-05 a $1k MSFTc buy quoted
  // $947.68/token against a ~$512 market (+69%), and this would have built it.
  // Compare against a 1%-size reference on the same candidates; refuse past
  // MAX_IMPACT_PCT with the numbers, so the caller can size down.
  const refIn = amountIn / 100n;
  if (refIn > 0n) {
    const ref = await bestQuote(p.sellToken as Address, p.buyToken as Address, refIn, cands);
    if (ref && ref.out > 0n) {
      // price = in/out; impact = (in/out) / (refIn/refOut) - 1
      const impact = (Number(amountIn) / Number(out)) / (Number(refIn) / Number(ref.out)) - 1;
      if (impact > MAX_IMPACT_PCT / 100) {
        return { venue: "aerodrome", error: `This size would move ${stock.symbol}'s price ${(impact * 100).toFixed(1)}% on Aerodrome (limit ${MAX_IMPACT_PCT}%). The pool is too thin for it; try a smaller amount.` };
      }
    }
  }
  const bps = p.slippageBps ?? 100;
  const minOut = (out * BigInt(10_000 - bps)) / 10_000n;
  const data = encodeFunctionData({
    abi: ROUTER_ABI, functionName: "exactInputSingle",
    args: [{
      tokenIn: p.sellToken as Address, tokenOut: p.buyToken as Address, tickSpacing: found.tickSpacing,
      recipient: p.taker as Address, deadline: BigInt(Math.floor(Date.now() / 1000) + 20 * 60),
      amountIn, amountOutMinimum: minOut, sqrtPriceLimitX96: 0n,
    }],
  });
  return {
    venue: "aerodrome",
    sellToken: p.sellToken, buyToken: p.buyToken, sellAmount: p.sellAmount,
    buyAmount: out.toString(), minBuyAmount: minOut.toString(),
    pool: found.pool, tickSpacing: found.tickSpacing, slippageBps: bps,
    transaction: { to: SWAP_ROUTER, data, value: "0" },
    issues: { allowance: { spender: SWAP_ROUTER } },
  };
}

/**
 * Price impact of BUYING `token` with USDC on Aerodrome CL, at
 * a few order sizes, against a $100 reference quote. Read with the Quoter (a
 * simulated call: nothing is signed or sent). Works for any Base token with a
 * USDC pool, not only the Blue Hood registry.
 *
 * Why it exists (measured 2026-11-05): pool TVL misleads on Base stock tokens.
 * AAPLc showed ~$0.5M TVL yet a $10k buy quoted +380%; MSFTc moved +31% on
 * $1k; NVDAc moved +0.32% on $10k. Concentrated liquidity out of range is
 * counted in TVL but not available to a trade.
 *
 * Each size is quoted on EVERY USDC pool and the best full fill wins (per-size
 * `pool`); no split across pools, so a router may still do better. null = no
 * pool, or $100 cannot fill. `fills: false` = no pool fills that size in full.
 */
export async function quoteBuyImpact(token: Address, tokenDecimals: number, sizesUsd: number[] = [1_000, 10_000]): Promise<
  { pool: string; tickSpacing: number; reference_usd: number; buys: { usd: number; impact_pct: number | null; fills: boolean; pool: string | null }[] } | null
> {
  const cands = await poolCandidates(token);
  if (!cands.length) return null;
  const REF = 100;
  const ref = await bestQuote(USDC_BASE, token, BigInt(REF * 1e6), cands);
  if (!ref) return null;
  const refPrice = REF / (Number(ref.out) / 10 ** tokenDecimals);
  const buys = [];
  for (const usd of sizesUsd) {
    const q = await bestQuote(USDC_BASE, token, BigInt(Math.round(usd * 1e6)), cands);
    if (!q) { buys.push({ usd, impact_pct: null, fills: false, pool: null }); continue; }
    const px = usd / (Number(q.out) / 10 ** tokenDecimals);
    buys.push({ usd, impact_pct: Math.round((px / refPrice - 1) * 10_000) / 100, fills: true, pool: q.pool });
  }
  return { pool: ref.pool, tickSpacing: ref.tickSpacing, reference_usd: REF, buys };
}
