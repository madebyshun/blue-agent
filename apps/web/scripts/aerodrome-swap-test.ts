/**
 * aerodrome-swap-test — the Base B20 stock route (lib/aerodrome-swap.ts, plan
 * 2026-10-06 task 2.2). Hermetic: Multicall3, the factory and the quoter are
 * stubs.
 *
 *   1. only a REGISTERED Base stock against USDC is routed; anything else is a
 *      readable refusal, never a guessed route
 *   2. the deepest pool across the factory's tick spacings wins
 *   3. the calldata is exactInputSingle on the verified router, recipient =
 *      taker, minOut = quote × (1 − slippage)
 *   4. /api/swap/quote takes this branch BEFORE the 0x key check, and the MCP
 *      builder labels the venue
 *   5. the three addresses are the ones verified on-chain (pinned)
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "ZEROX_API_KEY"]) delete process.env[k];

import fs from "node:fs";
import path from "node:path";
import { decodeFunctionData, encodeAbiParameters, encodeFunctionResult, multicall3Abi, parseAbi } from "viem";
import { aerodromeQuote, CL_FACTORY, SWAP_ROUTER, QUOTER, USDC_BASE } from "../src/lib/aerodrome-swap";
import { BASE_STOCKS } from "../src/lib/base-stocks/registry";
import { GET as quoteGET } from "../src/app/api/swap/quote/route";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const STOCK = BASE_STOCKS[0].token.toLowerCase();
const TAKER = "0x1111111111111111111111111111111111111111";
const POOL10 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa10";
const POOL100 = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa0100";
const word = (v: bigint) => encodeAbiParameters([{ type: "uint256" }], [v]);
const addrWord = (a: string) => encodeAbiParameters([{ type: "address" }], [a as `0x${string}`]);
let quoted: { tickSpacing: number; amountIn: bigint } | null = null;

const FACT = parseAbi(["function getPool(address,address,int24) view returns (address)"]);
const Q = parseAbi(["function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,int24 tickSpacing,uint160 sqrtPriceLimitX96)) returns (uint256,uint160,uint32,uint256)"]);

function call(to: string, d: string): string | null {
  if (to === CL_FACTORY.toLowerCase() && d.startsWith("0x9cbbbe86")) {                 // tickSpacings()
    return encodeAbiParameters([{ type: "int24[]" }], [[1, 10, 100, 200]]);
  }
  if (to === CL_FACTORY.toLowerCase()) {
    const { args } = decodeFunctionData({ abi: FACT, data: d as `0x${string}` });
    const ts = Number(args[2]);
    return addrWord(ts === 10 ? POOL10 : ts === 100 ? POOL100 : "0x0000000000000000000000000000000000000000");
  }
  if (to === POOL10 && d.startsWith("0x1a686502")) return word(5_000_000n);           // liquidity(): deeper
  if (to === POOL100 && d.startsWith("0x1a686502")) return word(1_000n);
  if (to === QUOTER.toLowerCase()) {
    const { args } = decodeFunctionData({ abi: Q, data: d as `0x${string}` });
    quoted = { tickSpacing: Number(args[0].tickSpacing), amountIn: args[0].amountIn };
    return encodeFunctionResult({ abi: Q, functionName: "quoteExactInputSingle", result: [415_935n, 0n, 1, 200_000n] });
  }
  return null;
}

globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
  let req: { id?: number; method?: string; params?: unknown[] } | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  const reply = (result: unknown) => Response.json({ jsonrpc: "2.0", id: req?.id ?? 1, result });
  if (req?.method === "eth_call") {
    const c = (req.params as { to: string; data?: string; input?: string }[])[0];
    const d = String(c.data ?? c.input ?? ""), to = c.to.toLowerCase();
    if (to === "0xca11bde05977b3631167028862be2a173976ca11") {
      const { args } = decodeFunctionData({ abi: multicall3Abi, data: d as `0x${string}` });
      const inner = (args[0] as readonly { target: string; callData: string }[]).map((x) => {
        const r = call(x.target.toLowerCase(), x.callData);
        return { success: r !== null, returnData: (r ?? "0x") as `0x${string}` };
      });
      return reply(encodeFunctionResult({ abi: multicall3Abi, functionName: "aggregate3", result: inner }));
    }
    const r = call(to, d);
    return r === null ? Response.json({ jsonrpc: "2.0", id: req.id ?? 1, error: { code: 3, message: "execution reverted" } }) : reply(r);
  }
  return new Response("not stubbed", { status: 502 });
}) as typeof fetch;

const ROUTER = parseAbi(["function exactInputSingle((address tokenIn,address tokenOut,int24 tickSpacing,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96)) payable returns (uint256)"]);

(async () => {
  console.log("1. scope");
  let q = await aerodromeQuote({ sellToken: USDC_BASE, buyToken: "0x4200000000000000000000000000000000000006", sellAmount: "1000000", taker: TAKER, slippageBps: 100 });
  ok("a non-stock pair is refused", "error" in q && /registered Base stock/.test(q.error));
  q = await aerodromeQuote({ sellToken: "0x4200000000000000000000000000000000000006", buyToken: STOCK, sellAmount: "1000", taker: TAKER, slippageBps: 100 });
  ok("a stock against anything but USDC says: swap to USDC first", "error" in q && /Swap to USDC first/.test(q.error));
  q = await aerodromeQuote({ sellToken: USDC_BASE, buyToken: STOCK, sellAmount: "1000000", taker: "", slippageBps: 100 });
  ok("no taker → refused (the output needs a recipient)", "error" in q);

  console.log("2. pool choice");
  q = await aerodromeQuote({ sellToken: USDC_BASE, buyToken: STOCK, sellAmount: "1000000", taker: TAKER, slippageBps: 100 });
  ok("the deepest pool (tickSpacing 10) is used, and quoted at that spacing",
    !("error" in q) && q.pool.toLowerCase() === POOL10 && q.tickSpacing === 10 && (quoted as { tickSpacing: number; amountIn: bigint } | null)?.tickSpacing === 10 && (quoted as { tickSpacing: number; amountIn: bigint } | null)?.amountIn === 1_000_000n, JSON.stringify(q));

  console.log("3. calldata");
  if (!("error" in q)) {
    const { functionName, args } = decodeFunctionData({ abi: ROUTER, data: q.transaction.data as `0x${string}` });
    const p = args[0];
    ok("exactInputSingle on the verified router", functionName === "exactInputSingle" && q.transaction.to === SWAP_ROUTER && q.issues.allowance.spender === SWAP_ROUTER);
    ok("recipient is the taker, never anyone else", p.recipient.toLowerCase() === TAKER);
    ok("minOut = quote × (1 − 100 bps)", p.amountOutMinimum === 411_775n && q.minBuyAmount === "411775" && q.buyAmount === "415935");
    ok("value is 0 (USDC in, no ETH)", q.transaction.value === "0");
    ok("a deadline is set, in the future", p.deadline > BigInt(Math.floor(Date.now() / 1000)));
  }

  console.log("4. wiring");
  const res = await quoteGET(new Request(`https://x/api/swap/quote?sellToken=${USDC_BASE}&buyToken=${STOCK}&sellAmount=1000000&taker=${TAKER}`));
  const j = await res.json() as Record<string, unknown>;
  ok("/api/swap/quote routes a stock leg to Aerodrome even with no 0x key", j.venue === "aerodrome" && !j.needsKey && !!j.transaction, JSON.stringify(j).slice(0, 120));
  const res2 = await quoteGET(new Request(`https://x/api/swap/quote?sellToken=${USDC_BASE}&buyToken=0x4200000000000000000000000000000000000006&sellAmount=1000000`));
  ok("a non-stock pair still goes the 0x way (needsKey without a key)", ((await res2.json()) as { needsKey?: boolean }).needsKey === true);
  const mcp = fs.readFileSync(path.resolve(__dirname, "../src/app/api/mcp/route.ts"), "utf8");
  ok("blue_swap_tx labels the venue from the quote", /data\.venue === "aerodrome" \? "Aerodrome Slipstream"/.test(mcp));

  console.log("5. pinned addresses (verified on-chain 2026-10-07)");
  ok("CLFactory / SwapRouter / QuoterV2 are the verified trio",
    CL_FACTORY === "0xf8f2eB4940CFE7d13603DDDD87f123820Fc061Ef" && SWAP_ROUTER === "0x698Cb2b6dd822994581fEa6eA4Fc755d1363A92F" && QUOTER === "0x514c8B5f54112481E28028F1166Bd78501089259");

  console.log(failures === 0 ? "\naerodrome-swap-test: PASS" : `\naerodrome-swap-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
