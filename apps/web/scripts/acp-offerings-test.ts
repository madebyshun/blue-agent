/**
 * acp-offerings-test — Offerings #2–#4 (lib/blue-hood/acp-offerings.ts): which
 * requirements are priced and which are rejected BEFORE a budget is proposed.
 * Pure: `check` never reaches the network, which is the property the seller
 * relies on at `open` (a reject there costs the buyer nothing and cannot hang).
 */
import { ACP_OFFERINGS, findOffering } from "../src/lib/blue-hood/acp-offerings";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const W = "0xd5c1dfc036f9911348ea8065f73c8123f4013fab";
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

// Dispatch by the name createJobFromOffering writes into the job description.
ok("three offerings, unique names", new Set(ACP_OFFERINGS.map((o) => o.name)).size === 3);
ok("lookup is case- and space-insensitive", findOffering("  Swap_Prepare ")?.name === "swap_prepare");
ok("Offering #1 is NOT taken over (execution-plan falls through)", findOffering("execution-plan") === undefined);
ok("…nor under its dashboard spelling", findOffering("executionplan") === undefined);
ok("the dashboard may drop separators: swapprepare still dispatches", findOffering("swapprepare")?.name === "swap_prepare");
ok("…and so do stocksignal / trendingsafe", findOffering("stocksignal")?.name === "stock_signal" && findOffering("trendingsafe")?.name === "trending_safe");
ok("an empty description falls through", findOffering(undefined) === undefined);
ok("every price is a positive USDC amount", ACP_OFFERINGS.every((o) => o.priceUsdc > 0 && o.priceUsdc < 1));

const swap = findOffering("swap_prepare")!;
ok("swap: a complete Base request is priced", swap.check({ chain: "base", from_address: W, token_in: USDC, token_out: "ETH", amount_in: "1" }) === null);
ok("swap: camelCase is accepted too", swap.check({ chain: "base", fromAddress: W, tokenIn: "ETH", tokenOut: USDC, amountIn: "0.01" }) === null);
ok("swap: NO default chain", /chain is required/.test(swap.check({ from_address: W, token_in: USDC, token_out: "ETH", amount_in: "1" }) ?? ""));
ok("swap: a ticker is not a token", /ticker does not identify/.test(swap.check({ chain: "robinhood", from_address: W, token_in: "ETH", token_out: "TSLA", amount_in: "1" }) ?? ""));
ok("swap: base units are refused", /WHOLE units/.test(swap.check({ chain: "base", from_address: W, token_in: USDC, token_out: "ETH", amount_in: "-5" }) ?? ""));
ok("swap: a bad wallet is refused", /from_address/.test(swap.check({ chain: "base", from_address: "0x123", token_in: USDC, token_out: "ETH", amount_in: "1" }) ?? ""));

const stock = findOffering("stock_signal")!;
ok("stock: ticker alone is priced (both chains by default)", stock.check({ ticker: "NVDA" }) === null);
ok("stock: the B20 symbol NVDAc is accepted", stock.check({ ticker: "NVDAc", chain: "base" }) === null);
ok("stock: INTC is Intel, not 'INT' + suffix", stock.check({ ticker: "INTC" }) === null);
ok("stock: an unknown chain is refused, not defaulted", /chain must be/.test(stock.check({ ticker: "NVDA", chain: "ethereum" }) ?? ""));
ok("stock: a missing ticker is refused", /ticker is required/.test(stock.check({}) ?? ""));

const trend = findOffering("trending_safe")!;
ok("trending: no input is fine", trend.check({}) === null);
ok("trending: limit is bounded", /limit must be/.test(trend.check({ limit: 500 }) ?? ""));

console.log(`\n${failures === 0 ? "acp-offerings-test: all passed" : `acp-offerings-test: ${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
