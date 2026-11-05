/**
 * An AI hedge fund on Base, in one file: it buys its own market data per call
 * over x402, checks that the pool can take the order, and prepares the trade
 * for YOU to sign. It never signs or sends a trade.
 *
 * One round:
 *   1. stock_movers ($0.03)  today's Base stock-token gainers, then a WATCHLIST
 *   2. stock_quote  ($0.02)  for each candidate: verified contract, price, and
 *                            what a $1k / $10k USDC buy moves the price
 *   3. refuse any order whose price impact is above MAX_IMPACT_PCT
 *   4. swap_prepare ($0.01)  an UNSIGNED USDC -> stock swap for the one that passes
 *
 * Every data call is paid from BUYER_PRIVATE_KEY in USDC on Base, capped per
 * call and per run by @blueagent/x402 before anything is signed.
 *
 *   BUYER_PRIVATE_KEY=0x... npx tsx fund.ts
 *   ORDER_USD=500 MAX_IMPACT_PCT=0.5 BUYER_PRIVATE_KEY=0x... npx tsx fund.ts
 *
 * Without BUYER_PRIVATE_KEY it runs read-only: it shows what each call would
 * cost and stops. The "strategy" (buy today's top gainer that the pool can
 * absorb) is a demo of the plumbing, not investment advice.
 */
import { PaidMcpClient } from "@blueagent/x402";
import { privateKeyToAccount } from "viem/accounts";

const MCP_URL = process.env.MCP_URL ?? "https://blueagent.dev/api/mcp";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const ORDER_USD = Number(process.env.ORDER_USD ?? 1000);
const MAX_IMPACT_PCT = Number(process.env.MAX_IMPACT_PCT ?? 1);
const CANDIDATES = Number(process.env.CANDIDATES ?? 3);
const BUDGET_USD = Number(process.env.BUDGET_USD ?? 0.5);
// Checked after today's gainers. Small caps lead the gainer list and their pools
// are thin, so most get refused; these are the deepest pools measured 2026-11-05.
const WATCHLIST = (process.env.WATCHLIST ?? "NVDA,MSTR").split(",").map((s) => s.trim()).filter(Boolean);

const key = process.env.BUYER_PRIVATE_KEY as `0x${string}` | undefined;
const fund = new PaidMcpClient({
  url: MCP_URL,
  privateKey: key,
  maxPerCallAtomic: 50_000n,                                  // no single call above $0.05
  budgetAtomic: BigInt(Math.round(BUDGET_USD * 1e6)),         // the whole run
});

type Text = { content?: { text?: string }[]; structuredContent?: Record<string, unknown>; isError?: boolean };
const json = (r: Text) => { try { return JSON.parse(r.content?.[0]?.text ?? "null"); } catch { return null; } };
const usd = (atomic: bigint) => `$${(Number(atomic) / 1e6).toFixed(2)}`;

async function call(name: string, args: Record<string, unknown>) {
  const r = (await fund.callTool(name, args)) as Text;
  if (r.isError && Array.isArray((r.structuredContent as { accepts?: unknown[] } | undefined)?.accepts)) {
    const a = (r.structuredContent as { accepts: { amount: string }[] }).accepts[0];
    console.log(`  ${name} costs $${(Number(a.amount) / 1e6).toFixed(2)} in USDC on Base. Set BUYER_PRIVATE_KEY to pay for it.`);
    return null;
  }
  if (r.isError) throw new Error(`${name}: ${r.content?.[0]?.text ?? "failed"}`);
  return json(r);
}

(async () => {
  const wallet = key ? privateKeyToAccount(key).address : null;
  console.log(`AI hedge fund on Base · order $${ORDER_USD} · max impact ${MAX_IMPACT_PCT}% · budget $${BUDGET_USD}`);
  console.log(wallet ? `paying from and trading for ${wallet}` : "read-only: no BUYER_PRIVATE_KEY");
  await fund.initialize();

  // 1. What is moving today.
  const movers = await call("stock_movers", { chain: "base", limit: CANDIDATES });
  if (!movers) return;
  const gainers: { ticker: string; symbol?: string; token?: string; change_24h_pct?: number }[] =
    movers.chains?.base?.gainers ?? [];
  console.log(`\n1. top gainers on Base 8453: ${gainers.map((g) => g.symbol ?? g.ticker).join(", ") || "none"}`);

  // 2-3. Quote each and refuse what the pool cannot absorb.
  const size = ORDER_USD <= 1000 ? 1000 : 10000;   // the impact sizes stock_quote reports
  let pick: { ticker: string; token: string; impact: number } | null = null;
  console.log(`\n2. depth check: what a $${size.toLocaleString()} buy moves the price`);
  const tickers = [...new Set([...gainers.slice(0, CANDIDATES).map((g) => g.ticker), ...WATCHLIST])];
  for (const t of tickers) {
    const g = { ticker: t };
    const q = await call("stock_quote", { ticker: g.ticker, chain: "base" });
    const b = q?.chains?.base;
    const row = b?.buy_impact?.buys?.find((x: { usd: number }) => x.usd === size);
    const impact: number | null = row?.impact_pct ?? null;
    const price = b?.dex?.price_usd;
    if (impact === null) { console.log(`   ${g.ticker}: no depth read, skipped`); continue; }
    const ok = impact <= MAX_IMPACT_PCT;
    console.log(`   ${g.ticker} ${b?.symbol ?? ""} at $${price?.toFixed?.(2) ?? "?"}: +${impact}% ${ok ? "PASS" : `REFUSED (above ${MAX_IMPACT_PCT}%)`}`);
    if (ok && !pick) pick = { ticker: g.ticker, token: b.token, impact };
  }

  // 4. Prepare, never sign.
  if (!pick) { console.log("\n3. no candidate passes the depth check: no trade this round."); }
  else if (!wallet) { console.log(`\n3. would prepare a $${ORDER_USD} buy of ${pick.ticker}; needs a wallet.`); }
  else {
    const tx = await call("swap_prepare", { chain: "base", fromAddress: wallet, tokenIn: USDC_BASE, tokenOut: pick.token, amountIn: String(ORDER_USD), slippageBps: Math.max(50, Math.ceil(pick.impact * 100) + 50) });
    console.log(`\n3. prepared, UNSIGNED: buy ${pick.ticker} with $${ORDER_USD} USDC on Base`);
    console.log(JSON.stringify(tx, null, 2));
    console.log("\nReview it, then sign with your own wallet. This script never sends it.");
  }

  console.log(`\nspent ${usd(fund.spentAtomic)} on data this round`);
})().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
