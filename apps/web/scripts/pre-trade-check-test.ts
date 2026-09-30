/**
 * pre-trade-check-test — G2 (2026-09-30): one check, decided in code, asked by
 * every execution door before a user signs.
 *
 *   §1  asset types come from the registries, never from a name
 *   §2  BLOCK only on evidence — impostor, measured honeypot, bridge cost
 *   §3  WARN for measured risk or an unmeasured gap (weekend, F6, unread tax)
 *   §4  no reason is ever about a country
 *   §5  the MCP builders: BLOCK refuses before any calldata, WARN rides along
 *   §6  every card gates its sign button on the check (source)
 *
 * Hermetic: KV env cleared (in-memory), and every JSON-RPC request answered by
 * a stub that serves fixture contracts on either chain.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}

import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import { encodeAbiParameters } from "viem";
import { preTradeCheck, BRIDGE_BLOCK_COST_PERCENT, type PreTradeCheck } from "../src/lib/pre-trade-check";
import { SEL_BUY_TAX, SEL_SELL_TAX, SEL_BLACKLISTS } from "../src/lib/token-tax";
import { BASE_STOCKS } from "../src/lib/base-stocks/registry";
import { RWA_TOKENS } from "../src/lib/robinhood/rwa-registry";
import { kvSet, kvDel } from "../src/lib/kv";
import { KV_BASE_ROWS_LATEST, KV_SNAPSHOT_LATEST } from "../src/lib/blue-hood/kv-keys";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

// ── Fixture contracts ─────────────────────────────────────────────────────────
const A = (n: number) => `0x${n.toString(16).padStart(40, "0")}`;
const IMPOSTOR_USDC = A(0x1001);     // Base: calls itself USDC
const IMPOSTOR_B20 = A(0x1002);      // Base: wears a registered B20 symbol
const HONEYPOT = A(0x1003);          // Base: sell tax 60%
const SUSPICIOUS = A(0x1004);        // Base: sell tax 15%
const CLEAN = A(0x1005);             // Base: 0/0, no blacklist
const UNREAD = A(0x1006);            // Base: no tax selectors at all
const RH_IMPOSTOR = A(0x2001);       // RH: wears a registered RHJ ticker
const RH_UNLISTED = A(0x2002);       // RH: an ordinary unregistered token

const NVDA = BASE_STOCKS[0];
const RH_STOCK = RWA_TOKENS.find((t) => t.kind === "stock" && t.chainlinkFeed)!;
const RH_STOCK_NO_FEED = RWA_TOKENS.find((t) => t.kind === "stock" && !t.chainlinkFeed)!;

type Fixture = { symbol: string; decimals: number; buyTax?: number; sellTax?: number; blacklist?: boolean };
const CONTRACTS: Record<string, Fixture> = {
  [IMPOSTOR_USDC]: { symbol: "USDC", decimals: 6 },
  [IMPOSTOR_B20]: { symbol: NVDA.symbol, decimals: 8 },
  [HONEYPOT]: { symbol: "PUMP", decimals: 18, buyTax: 100, sellTax: 6000 },
  [SUSPICIOUS]: { symbol: "MEH", decimals: 18, buyTax: 0, sellTax: 1500 },
  [CLEAN]: { symbol: "FINE", decimals: 18, buyTax: 0, sellTax: 0 },
  [UNREAD]: { symbol: "WHO", decimals: 18 },
  [RH_IMPOSTOR]: { symbol: RH_STOCK.ticker, decimals: 18 },
  [RH_UNLISTED]: { symbol: "NEWT", decimals: 18 },
};

const word = (n: number) => encodeAbiParameters([{ type: "uint256" }], [BigInt(n)]);
const outbound: string[] = [];
let bridgeCost = 1;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  let req: { id: number; method: string; params: unknown[] } | null = null;
  try { req = JSON.parse(String(init?.body ?? "")); } catch { req = null; }
  const rpc = (result: unknown, error?: unknown) =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: req?.id ?? 1, ...(error ? { error } : { result }) }), { status: 200, headers: { "Content-Type": "application/json" } });
  if (req && typeof req.method === "string") {
    if (req.method !== "eth_call") return rpc(null);
    const call = req.params[0] as { to: string; data?: string; input?: string };
    const fx = CONTRACTS[call.to.toLowerCase()];
    const data = String(call.data ?? call.input ?? "");
    const revert = () => rpc(null, { code: 3, message: "execution reverted" });
    if (!fx) return revert();
    if (data.startsWith("0x313ce567")) return rpc(encodeAbiParameters([{ type: "uint8" }], [fx.decimals]));
    if (data.startsWith("0x95d89b41")) return rpc(encodeAbiParameters([{ type: "string" }], [fx.symbol]));
    if (data.startsWith(SEL_BUY_TAX) && fx.buyTax != null) return rpc(word(fx.buyTax));
    if (data.startsWith(SEL_SELL_TAX) && fx.sellTax != null) return rpc(word(fx.sellTax));
    if (data.startsWith(SEL_BLACKLISTS) && fx.blacklist) return rpc(word(0));
    return revert();
  }
  outbound.push(url);
  if (url.includes("/bridge-prepare")) {
    return Response.json({ tx: { to: A(0x9), data: "0x", value: "0" }, meta: { totalCostPercent: bridgeCost, totalCostUsd: 1 } });
  }
  if (url.includes("/send-prepare")) {
    return Response.json({ tx: { to: IMPOSTOR_USDC, data: "0xa9059cbb", value: "0" }, meta: {} });
  }
  return new Response(JSON.stringify({ error: "not stubbed in test" }), { status: 502 });
}) as typeof fetch;

const WEEKDAY = new Date("2026-09-30T15:00:00Z"); // Wednesday, NYSE open
const SATURDAY = new Date("2026-10-03T15:00:00Z");
const texts = (c: PreTradeCheck) => c.reasons.map((r) => `${r.level}:${r.text}`).join(" | ");
const all: PreTradeCheck[] = [];
async function run(input: Parameters<typeof preTradeCheck>[0]) {
  const c = await preTradeCheck(input);
  all.push(c);
  return c;
}

(async () => {
  console.log("\n1. asset types come from the registries");
  let c = await run({ chain: "base", kind: "swap", token: "ETH", now: WEEKDAY });
  ok("ETH → native, PASS", c.asset_type === "native" && c.verdict === "PASS");
  c = await run({ chain: "robinhood", kind: "swap", token: RH_STOCK.contract, now: WEEKDAY });
  ok("an RHJ registry token → rh_stock_token, labelled as the issuer's instrument",
    c.asset_type === "rh_stock_token" && /Robinhood, Jersey/.test(c.label) && c.label.includes(RH_STOCK.ticker) && !/share/i.test(c.label), c.label);
  c = await run({ chain: "base", kind: "swap", token: NVDA.token, now: WEEKDAY });
  ok("a BASE_STOCKS token → b20_stock_token (Coinbase)", c.asset_type === "b20_stock_token" && /B20 tokenized stock \(Coinbase\)/.test(c.label), c.label);
  c = await run({ chain: "base", kind: "swap", token: CLEAN, now: WEEKDAY });
  ok("an unregistered Base token → crypto", c.asset_type === "crypto");
  c = await run({ chain: "robinhood", kind: "swap", token: RH_UNLISTED, now: WEEKDAY });
  ok("an unregistered RH token → crypto", c.asset_type === "crypto");

  console.log("\n2. BLOCK only on evidence");
  c = await run({ chain: "base", kind: "swap", token: "NVDA", now: WEEKDAY });
  ok("a ticker instead of an address → BLOCK (a ticker does not identify a token)", c.verdict === "BLOCK", texts(c));
  c = await run({ chain: "base", kind: "swap", token: IMPOSTOR_USDC, now: WEEKDAY });
  ok("buying a Base contract that calls itself USDC → BLOCK", c.verdict === "BLOCK" && /impersonator/.test(texts(c)), texts(c));
  c = await run({ chain: "base", kind: "swap", token: IMPOSTOR_B20, now: WEEKDAY });
  ok(`buying a contract wearing ${NVDA.symbol} from another address → BLOCK`, c.verdict === "BLOCK", texts(c));
  c = await run({ chain: "robinhood", kind: "swap", token: RH_IMPOSTOR, now: WEEKDAY });
  ok(`buying an RH contract wearing ${RH_STOCK.ticker} that the factory never deployed → BLOCK`, c.verdict === "BLOCK", texts(c));
  c = await run({ chain: "base", kind: "swap", token: HONEYPOT, now: WEEKDAY });
  ok("a MEASURED 60% sell tax → BLOCK", c.verdict === "BLOCK" && /cannot be sold/.test(texts(c)), texts(c));
  c = await run({ chain: "base", kind: "send", token: IMPOSTOR_USDC, now: WEEKDAY });
  ok("SENDING an impostor you hold → WARN, not BLOCK (moving it harms no one)", c.verdict === "WARN", texts(c));
  c = await run({ chain: "base", kind: "bridge", token: "ETH", bridgeCostPercent: BRIDGE_BLOCK_COST_PERCENT + 5 });
  ok(`a bridge costing over ${BRIDGE_BLOCK_COST_PERCENT}% → BLOCK`, c.verdict === "BLOCK", texts(c));
  c = await run({ chain: "base", kind: "bridge", token: "ETH", bridgeCostPercent: 8 });
  ok("a bridge costing 8% → WARN", c.verdict === "WARN", texts(c));
  c = await run({ chain: "base", kind: "bridge", token: "ETH", bridgeCostPercent: 0.4 });
  ok("a bridge costing 0.4% → PASS", c.verdict === "PASS", texts(c));
  c = await run({ chain: "base", kind: "swap", token: UNREAD, now: WEEKDAY });
  ok("an UNREAD tax is not evidence → WARN, never BLOCK", c.verdict === "WARN" && /could not be read/.test(texts(c)), texts(c));

  console.log("\n3. WARN on measured risk or an unmeasured gap");
  c = await run({ chain: "base", kind: "swap", token: SUSPICIOUS, now: WEEKDAY });
  ok("a measured 15% sell tax → WARN", c.verdict === "WARN", texts(c));
  c = await run({ chain: "base", kind: "swap", token: CLEAN, now: WEEKDAY });
  ok("a measured clean tax → PASS with an INFO receipt", c.verdict === "PASS" && /read on-chain: clean/.test(texts(c)), texts(c));
  c = await run({ chain: "robinhood", kind: "swap", token: RH_STOCK.contract, now: WEEKDAY });
  ok("an RH stock token on a weekday → WARN: the oracle-vs-DEX desk data is paused (F6), said as a gap",
    c.verdict === "WARN" && /paused/.test(texts(c)) && !/weekend/.test(texts(c)), texts(c));
  c = await run({ chain: "robinhood", kind: "swap", token: RH_STOCK.contract, now: SATURDAY });
  ok("…and on a Saturday the weekend WARN joins it", /weekend/.test(texts(c)), texts(c));
  c = await run({ chain: "robinhood", kind: "swap", token: RH_STOCK_NO_FEED.contract, now: WEEKDAY });
  ok("an RH stock token with no Chainlink feed says there is no oracle", /No Chainlink feed/.test(texts(c)), texts(c));
  c = await run({ chain: "robinhood", kind: "send", token: RH_STOCK.contract, now: SATURDAY });
  ok("SENDING a stock token has no market reasons → PASS", c.verdict === "PASS", texts(c));
  c = await run({ chain: "robinhood", kind: "swap", token: RH_UNLISTED, now: WEEKDAY });
  ok("an unregistered RH token → WARN (its tax cannot be read on RH)", c.verdict === "WARN", texts(c));

  await kvDel(KV_BASE_ROWS_LATEST);
  c = await run({ chain: "base", kind: "swap", token: NVDA.token, now: WEEKDAY });
  ok("a B20 stock with no Base desk rows → WARN: the reading is unavailable (never a guessed drift)", c.verdict === "WARN" && /unavailable/.test(texts(c)), texts(c));
  // The Robinhood desk's snapshot is NOT where Base rows live — a Base row
  // planted there must not be read (this test once passed against that key).
  await kvSet(KV_SNAPSHOT_LATEST, { tickers: [{ chain: "base", contract: NVDA.token, drift_pct: 9.9 }] });
  c = await run({ chain: "base", kind: "swap", token: NVDA.token, now: WEEKDAY });
  ok("…a Base-looking row in the RH desk's snapshot is ignored", /unavailable/.test(texts(c)) && !/9\.90%/.test(texts(c)), texts(c));
  await kvSet(KV_BASE_ROWS_LATEST, { started_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), rows: [{ chain: "base", contract: NVDA.token, drift_pct: 3.1 }] });
  c = await run({ chain: "base", kind: "swap", token: NVDA.token, now: WEEKDAY });
  ok("an hour-old Base desk → unavailable, not a stale drift", /unavailable/.test(texts(c)) && !/3\.10%/.test(texts(c)), texts(c));
  await kvSet(KV_BASE_ROWS_LATEST, { started_at: new Date().toISOString(), rows: [{ chain: "base", contract: NVDA.token, drift_pct: 3.1 }] });
  c = await run({ chain: "base", kind: "swap", token: NVDA.token, now: WEEKDAY });
  ok("a measured +3.10% drift → WARN naming the number and its source", c.verdict === "WARN" && /\+3\.10%/.test(texts(c)) && /Blue Hood/.test(texts(c)), texts(c));
  await kvSet(KV_BASE_ROWS_LATEST, { started_at: new Date().toISOString(), rows: [{ chain: "base", contract: NVDA.token, drift_pct: 0.4 }] });
  c = await run({ chain: "base", kind: "swap", token: NVDA.token, now: WEEKDAY });
  ok("a 0.4% drift on a weekday → PASS (the issuer-policy line is INFO)", c.verdict === "PASS" && /INFO:B20 tokens can carry issuer transfer policies/.test(texts(c)), texts(c));
  c = await run({ chain: "base", kind: "swap", token: NVDA.token, now: SATURDAY });
  ok("…the same token on a Saturday → WARN", c.verdict === "WARN" && /weekend/.test(texts(c)), texts(c));

  console.log("\n4. no reason is ever about a country (§7 #1: tokenized assets, not US shares)");
  const geo = all.flatMap((x) => x.reasons).filter((r) => /countr|jurisdiction|geo|US person|sanction|region|resident/i.test(r.text));
  ok(`none of ${all.length} checks gave a geographic reason`, geo.length === 0, geo.map((r) => r.text).join(" | "));

  console.log("\n5. the MCP builders");
  const { POST } = await import("../src/app/api/mcp/route");
  const call = async (name: string, args: Record<string, unknown>) => {
    const res = await POST(new NextRequest("https://blueagent.dev/api/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    }));
    const env = (await res.json()) as { result?: { content?: { text?: string }[]; isError?: boolean } };
    return { text: env.result?.content?.[0]?.text ?? "", isError: env.result?.isError === true };
  };
  const W = "0x1111111111111111111111111111111111111111";
  const R = "0x2222222222222222222222222222222222222222";
  let before = outbound.length;
  let r = await call("blue_swap_tx", { chain: "base", fromAddress: W, tokenIn: "ETH", tokenOut: HONEYPOT, amountIn: "0.01" });
  ok("blue_swap_tx into a measured honeypot → [PRE_TRADE_BLOCK]", r.isError && r.text.startsWith("[PRE_TRADE_BLOCK]"), r.text.slice(0, 160));
  ok("…refused before any quote or calldata was requested", outbound.length === before, outbound.slice(before).join(", "));

  before = outbound.length;
  r = await call("blue_send_tx", { chain: "base", fromAddress: W, toAddress: R, token: IMPOSTOR_USDC, amount: "1" });
  let body: { check?: { verdict?: string; instruction?: string }; action?: { id?: string } } = {};
  try { body = JSON.parse(r.text); } catch { /* shown below */ }
  ok("blue_send_tx of an impostor → built, with check.verdict WARN", !r.isError && body.check?.verdict === "WARN", r.text.slice(0, 160));
  ok("…and the WARN carries the instruction to ask the user", /explicit yes/.test(body.check?.instruction ?? ""));
  ok("…and it became an action record", typeof body.action?.id === "string");
  if (body.action?.id) {
    const { readAction } = await import("../src/lib/actions");
    const rec = await readAction(body.action.id);
    ok("…whose record keeps what the check said", rec.status === "found" && rec.record.check?.verdict === "WARN" && (rec.record.check?.reasons.length ?? 0) > 0);
  }

  bridgeCost = BRIDGE_BLOCK_COST_PERCENT + 10;
  r = await call("blue_bridge_tx", { fromChain: "base", toChain: "robinhood", fromAddress: W, token: "ETH", amount: "0.001" });
  ok("blue_bridge_tx whose measured cost is over the limit → [PRE_TRADE_BLOCK], no tx in the reply",
    r.isError && r.text.startsWith("[PRE_TRADE_BLOCK]") && !r.text.includes('"tx"'), r.text.slice(0, 160));
  bridgeCost = 0.3;
  r = await call("blue_bridge_tx", { fromChain: "base", toChain: "robinhood", fromAddress: W, token: "ETH", amount: "0.5" });
  try { body = JSON.parse(r.text); } catch { body = {}; }
  ok("a cheap bridge → built, check.verdict PASS", !r.isError && body.check?.verdict === "PASS", r.text.slice(0, 160));

  console.log("\n6. every door asks (source)");
  const web = path.resolve(__dirname, "..");
  const read = (p: string) => fs.readFileSync(path.join(web, p), "utf8");
  const CARDS: [string, RegExp][] = [
    ["src/app/app/bank/SwapCard.tsx", /canSwap[\s\S]{0,400}pt\.cleared && !pt\.blocked/],
    ["src/app/app/bank/RhSwapCard.tsx", /const valid = [^;]*pt\.cleared && !pt\.blocked/],
    ["src/app/app/bank/WalletSendCard.tsx", /const valid = [^;]*pt\.cleared && !pt\.blocked/],
    ["src/app/chat/components/RobinhoodSwapCard.tsx", /pt\.cleared && !pt\.blocked/],
    ["src/app/chat/components/RobinhoodBridgeCard.tsx", /const canSign = [^;]*pt\.cleared && !pt\.blocked/],
  ];
  for (const [file, gate] of CARDS) {
    const src = read(file);
    ok(`${path.basename(file)}: runs the check, shows the banner, and gates signing on it`,
      /usePreTradeCheck\(/.test(src) && /<PreTradeBanner pt=\{pt\} \/>/.test(src) && gate.test(src));
  }
  const hook = read("src/components/wallet/PreTradeBanner.tsx");
  ok("the hook holds signing while the CURRENT input's answer is loading", /const cleared = state !== "loading"/.test(hook));
  ok("…and a result or a tick only counts for the input it was given", /res\?\.key === key/.test(hook) && /ackKey === key/.test(hook));
  const mcp = read("src/app/api/mcp/route.ts");
  for (const [tool, fn] of [["swap", "callSwapTx"], ["send", "callSendTx"], ["bridge", "callBridgeTx"]]) {
    ok(`MCP ${tool} builds only through the check`, new RegExp(`withPreTradeCheck\\("${tool}", args, \\(\\) => ${fn}\\(args\\)\\)`).test(mcp));
  }
  const prep = read("src/app/api/x402/_handlers/rh-stock-swap-prepare.ts");
  ok("x402 rh-stock-swap-prepare: a BLOCK is a non-2xx (so it is never charged) and the check rides in the reply",
    /check\.verdict === "BLOCK"[\s\S]{0,400}status: 409/.test(prep) && /warnings,\s*\n\s*check,/.test(prep));
  ok("x402 rh-stock-swap-quote carries the same check", /check: await checkP/.test(read("src/app/api/x402/_handlers/rh-stock-swap-quote.ts")));

  console.log(failures === 0 ? "\npre-trade-check-test: PASS" : `\npre-trade-check-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
