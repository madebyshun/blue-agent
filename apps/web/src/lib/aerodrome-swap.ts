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
/** The registered Base stock at this address, or null. Registry only — never a name. */
export function baseStockByToken(addr: string) {
  return BASE_STOCKS.find((s) => lc(s.token) === lc(addr)) ?? null;
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
async function bestPool(stock: Address): Promise<{ pool: Address; tickSpacing: number } | null> {
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
  if (!cands.length) return null;
  const liq = await c.multicall({
    allowFailure: true, multicallAddress: MULTICALL3, batchSize: 0,
    contracts: cands.map((x) => ({ address: x.pool, abi: POOL_ABI, functionName: "liquidity" as const })),
  });
  let best: { pool: Address; tickSpacing: number; liq: bigint } | null = null;
  cands.forEach((x, i) => {
    const r = liq[i];
    if (r.status !== "success") return;          // unread pool: skipped, never ranked as empty
    const l = r.result as bigint;
    if (l > 0n && (!best || l > best.liq)) best = { ...x, liq: l };
  });
  const b = best as { pool: Address; tickSpacing: number; liq: bigint } | null;
  return b ? { pool: b.pool, tickSpacing: b.tickSpacing } : null;
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

  const found = await bestPool(stock.token as Address);
  if (!found) return { venue: "aerodrome", error: `No Aerodrome ${stock.symbol}/USDC pool with liquidity was found on Base.` };

  const c = clientFor("base");
  const amountIn = BigInt(p.sellAmount);
  let out: bigint;
  try {
    const { result } = await c.simulateContract({
      address: QUOTER, abi: QUOTER_ABI, functionName: "quoteExactInputSingle",
      args: [{ tokenIn: p.sellToken as Address, tokenOut: p.buyToken as Address, amountIn, tickSpacing: found.tickSpacing, sqrtPriceLimitX96: 0n }],
    });
    out = result[0];
  } catch (e) {
    return { venue: "aerodrome", error: `Aerodrome could not quote this size: ${(e as Error).message.slice(0, 120)}` };
  }
  if (out === 0n) return { venue: "aerodrome", error: "Aerodrome quotes zero output at this size." };
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
