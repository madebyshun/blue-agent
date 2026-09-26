/**
 * wallet-holdings / wallet-risk — an outage must never be billed as a result.
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-26 against production: every Moralis endpoint returned
 *
 *     HTTP 401 {"message":"Your Moralis Free usage is paused. Upgrade to a
 *     paid plan to resume usage…"}
 *
 * 15/15 probes, 3 wallets × 5 endpoints. A billing failure — not a bad key, a
 * dead endpoint or a wrong chain param. Both handlers caught it and returned
 * `[]` / `null`, which rendered as:
 *
 *     wallet-holdings  →  total_usd: 0.00        HTTP 200
 *     wallet-risk      →  tx_count: 0, verdict: "CLEAN"   HTTP 200
 *
 * for a wallet holding 4.1157 ETH + 188.73 USDC across 24 transactions. The
 * 200 is the expensive part: `api/x402/[tool]/route.ts` settles the USDC only
 * after a 2xx, so every one of those fabrications was a completed sale. A
 * caller paid $0.15 to be told a 59-transaction wallet was CLEAN.
 *
 * WHAT WOULD ROT SILENTLY, AND WHY EACH IS ASSERTED
 * -------------------------------------------------
 *  1. `?? 0` / `?? []` / `.catch(() => [])` are the most natural edit in the
 *     language and each one restores the bug invisibly — the tool keeps
 *     returning 200 with a plausible number. So the assertions below are on
 *     `null` and on the STATUS CODE, not just on the presence of an `error`
 *     key: a 200 carrying `status:"error"` still charges the caller, and would
 *     pass a test that only checked the body.
 *  2. `verdict: "CLEAN"` as the fallthrough. It was written twice in the old
 *     file — once for `tx_count === 0` (its own note conceded the cause might
 *     be "data unavailable") and once for `risk_score == null`. Case 2 below
 *     drives the LLM step to failure precisely to pin the second one: an
 *     unreachable model must produce UNKNOWN, never CLEAN.
 *  3. The indexer disagreeing with the chain. Case 3 is an empty history from
 *     a wallet whose nonce is 73 — not an empty wallet, a bad read. Without
 *     the cross-check this is indistinguishable from case 4, which IS empty.
 *  4. `encodeTransferWithMemo`'s decimals. Case 5 is a pure-function check
 *     that 18-decimal and 6-decimal encodings differ; the old signature
 *     defaulted to 6 and silently encoded 1 token as 1e-12 of one.
 *
 * NEGATIVE CONTROLS — revert the line, this suite must go red:
 *   a. `wallet-holdings.ts` `failLoud(...)` status 502 → 200 ............ case 1
 *   b. `wallet-risk.ts` `if (risk_score == null) verdict = "UNKNOWN"`
 *      → `"CLEAN"` ......................................................  case 2
 *   c. `wallet-risk.ts` the UPSTREAM_INCONSISTENT block, deleted ........  case 3
 *   d. `lib/moralis.ts` legacy wrappers made primary again (`[]` on 401) . cases 1-2
 *   e. `encode.ts` `decimals: number` → `decimals?: number` with `?? 6` .  case 5
 *
 * Hermetic: `globalThis.fetch` is replaced for the whole run, so no Moralis
 * key, no RPC and no DexScreener call ever leaves the process.
 */
import { HANDLERS } from "../src/app/api/x402/_handlers/index";
import { encodeTransferWithMemo } from "../src/lib/b20/encode";
import { parseUnits, encodeFunctionData, stringToHex } from "viem";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✅ ${name}`); return; }
  failures++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── fetch stub ──────────────────────────────────────────────────────────────
// Routed by URL so one scenario object drives Moralis, the Base RPC and
// DexScreener at once. `rpcNonce`/`rpcWei` are what the CHAIN says; the
// `moralis*` fields are what the INDEXER says. The two disagreeing is the
// whole point of case 3, so they are deliberately separate inputs.

interface Scenario {
  moralisStatus: number;
  moralisBody: (path: string) => unknown;
  rpcWei: bigint;
  rpcNonce: number;
  ethPriceUsd: number | null;
}

const PAUSED_BODY = { message: "Your Moralis Free usage is paused. Upgrade to a paid plan to resume usage, or wait until your usage resets." };

let scenario: Scenario;
const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

  if (url.includes("deep-index.moralis.io")) {
    const body = scenario.moralisStatus === 200 ? scenario.moralisBody(url) : PAUSED_BODY;
    return new Response(JSON.stringify(body), {
      status: scenario.moralisStatus,
      headers: { "content-type": "application/json" },
    });
  }

  if (url.includes("base.org") || url.includes("rpc")) {
    const req = JSON.parse(String(init?.body ?? "{}")) as { id?: number; method?: string };
    const result =
      req.method === "eth_getBalance"          ? `0x${scenario.rpcWei.toString(16)}` :
      req.method === "eth_getTransactionCount" ? `0x${scenario.rpcNonce.toString(16)}` :
      null;
    if (result === null) return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, error: { code: -32601, message: "unstubbed" } }), { status: 200 });
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: req.id, result }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  if (url.includes("dexscreener.com")) {
    if (scenario.ethPriceUsd === null) return new Response("upstream down", { status: 503 });
    return new Response(JSON.stringify({
      pairs: [{ chainId: "base", priceUsd: String(scenario.ethPriceUsd), liquidity: { usd: 9_000_000 } }],
    }), { status: 200, headers: { "content-type": "application/json" } });
  }

  // Anything else — notably the LLM gateway — is unreachable in this suite.
  // wallet-risk MUST degrade to UNKNOWN rather than CLEAN when that happens.
  return new Response(JSON.stringify({ error: "not stubbed in test" }), { status: 502 });
}) as typeof fetch;

process.env.MORALIS_API_KEY = "test-key-so-the-http-layer-is-exercised";

const WALLET = "0x8Ff92566f2e81BDd68EDfAa8cde73942A723796b";

function call(tool: "wallet-holdings" | "wallet-risk", address = WALLET) {
  return HANDLERS[tool](new Request(`https://blueagent.dev/api/x402/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address }),
  }));
}

type Body = Record<string, unknown>;
async function run(tool: "wallet-holdings" | "wallet-risk", address = WALLET) {
  const res = await call(tool, address);
  return { status: res.status, body: (await res.json()) as Body };
}
const errCode = (b: Body) => (b.error as { code?: string } | undefined)?.code;

const EMPTY_MORALIS = () => [] as unknown;

(async () => {
  console.log("wallet fail-loud suite\n");

  // ── Case 1: Moralis plan paused — the live 2026-09-26 outage ──────────────
  console.log("1. Moralis 401 'Free usage is paused' (the measured outage)");
  scenario = {
    moralisStatus: 401,
    moralisBody: () => PAUSED_BODY,
    rpcWei: 4_115_700_000_000_000_000n,
    rpcNonce: 0,
    ethPriceUsd: 3000,
  };

  {
    const { status, body } = await run("wallet-holdings");
    check("holdings returns 502 so the x402 route never settles", status === 502, `got ${status}`);
    check("holdings status is 'error'", body.status === "error", String(body.status));
    check("holdings total_usd is null, NOT 0", body.total_usd === null, JSON.stringify(body.total_usd));
    check("holdings tokens is null, NOT []", body.tokens === null, JSON.stringify(body.tokens));
    check("holdings token_count is null, NOT 0", body.token_count === null, JSON.stringify(body.token_count));
    check("holdings names the real cause", errCode(body) === "UPSTREAM_PLAN_PAUSED", String(errCode(body)));
    check("holdings still reports the RPC-read native balance as partial truth",
      body.native_eth === 4.1157, JSON.stringify(body.native_eth));
  }

  {
    const { status, body } = await run("wallet-risk");
    check("risk returns 502 so the x402 route never settles", status === 502, `got ${status}`);
    check("risk verdict is UNKNOWN", body.verdict === "UNKNOWN", String(body.verdict));
    check("risk verdict is NOT CLEAN", body.verdict !== "CLEAN");
    check("risk tx_count is null, NOT 0", body.tx_count === null, JSON.stringify(body.tx_count));
    check("risk risk_score is null", body.risk_score === null, JSON.stringify(body.risk_score));
    check("risk names the real cause", errCode(body) === "UPSTREAM_PLAN_PAUSED", String(errCode(body)));
  }

  // ── Case 2: indexer healthy, LLM unreachable ──────────────────────────────
  // Counts are real and must be reported. The assessment is not, and must not
  // collapse into a clean bill of health.
  console.log("\n2. Moralis healthy, risk-synthesis LLM unreachable");
  scenario = {
    moralisStatus: 200,
    moralisBody: (url) => {
      if (url.includes("/erc20/transfers")) return { result: Array.from({ length: 5 }, (_, i) => ({ from_address: `0x${String(i).repeat(40)}`, to_address: WALLET, token_symbol: "USDC", possible_spam: false })) };
      if (url.includes("/verbose")) return { result: Array.from({ length: 30 }, (_, i) => ({ from_address: WALLET, to_address: `0x${String(i % 10).repeat(40)}`, value: "1000", block_timestamp: "2026-09-01T00:00:00.000Z", receipt_status: "1" })) };
      if (url.includes("/erc20")) return [{ token_address: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", symbol: "USDC", balance: "188730000", decimals: 6, usd_value: 188.73, possible_spam: false }];
      if (url.includes("/balance")) return { balance: "4115700000000000000" };
      return {};
    },
    rpcWei: 4_115_700_000_000_000_000n,
    rpcNonce: 24,
    ethPriceUsd: 3000,
  };

  {
    const { status, body } = await run("wallet-holdings");
    check("holdings succeeds", status === 200 && body.status === "ok", `${status} ${String(body.status)}`);
    check("holdings totals the real positions", body.total_usd === 12535.83, JSON.stringify(body.total_usd));
    check("holdings lists the token", Array.isArray(body.tokens) && (body.tokens as unknown[]).length === 1);
  }

  {
    const { status, body } = await run("wallet-risk");
    check("risk succeeds — the counts were genuinely read", status === 200 && body.status === "ok", `${status} ${String(body.status)}`);
    check("risk reports the real tx_count (30 native + 5 token)", body.tx_count === 35, JSON.stringify(body.tx_count));
    check("risk exposes the chain nonce under its own name", body.outbound_tx_count === 24, JSON.stringify(body.outbound_tx_count));
    check("unassessed is UNKNOWN, never CLEAN", body.verdict === "UNKNOWN", String(body.verdict));
    check("no score was invented", body.risk_score === null, JSON.stringify(body.risk_score));
  }

  // ── Case 3: indexer says nothing happened, the chain says otherwise ───────
  console.log("\n3. Indexer returns no history for a wallet with nonce 73");
  scenario = { moralisStatus: 200, moralisBody: EMPTY_MORALIS, rpcWei: 22_147_000_000_000_000n, rpcNonce: 73, ethPriceUsd: 3000 };

  {
    const { status, body } = await run("wallet-risk");
    check("risk refuses to call a mis-read wallet empty", status === 502, `got ${status}`);
    check("risk flags the disagreement", errCode(body) === "UPSTREAM_INCONSISTENT", String(errCode(body)));
    check("risk verdict is UNKNOWN", body.verdict === "UNKNOWN", String(body.verdict));
  }

  {
    // Same disagreement, different field: Moralis says 0 wei, the chain says 0.022 ETH.
    scenario = {
      moralisStatus: 200,
      moralisBody: (url) => (url.includes("/balance") ? { balance: "0" } : []),
      rpcWei: 22_147_000_000_000_000n, rpcNonce: 73, ethPriceUsd: 3000,
    };
    const { status, body } = await run("wallet-holdings");
    check("holdings refuses when the two sources disagree on zero", status === 502, `got ${status}`);
    check("holdings flags the disagreement", errCode(body) === "UPSTREAM_INCONSISTENT", String(errCode(body)));
  }

  // ── Case 4: genuinely empty, and provably so ─────────────────────────────
  console.log("\n4. A real, verifiably unused wallet");
  scenario = { moralisStatus: 200, moralisBody: EMPTY_MORALIS, rpcWei: 0n, rpcNonce: 0, ethPriceUsd: 3000 };

  {
    const { status, body } = await run("wallet-risk");
    check("risk succeeds", status === 200, `got ${status}`);
    check("risk marks it empty, not error", body.status === "empty", String(body.status));
    check("risk reports a measured zero", body.tx_count === 0, JSON.stringify(body.tx_count));
    check("an unassessed wallet is still not CLEAN", body.verdict === "UNKNOWN", String(body.verdict));
  }

  {
    const { status, body } = await run("wallet-holdings");
    check("holdings succeeds", status === 200, `got ${status}`);
    check("holdings marks it empty", body.status === "empty", String(body.status));
    check("holdings reports a measured $0", body.total_usd === 0, JSON.stringify(body.total_usd));
  }

  // ── Case 5: transferWithMemo decimals are the token's, not a default ─────
  console.log("\n5. encodeTransferWithMemo scales by the token's own decimals");
  {
    const to = "0x02950ad38ada1d599375bd447e080cd404809205";
    const six = encodeTransferWithMemo({ to, amount: "1", decimals: 6, memo: "ord-1" });
    const eighteen = encodeTransferWithMemo({ to, amount: "1", decimals: 18, memo: "ord-1" });
    check("6-decimal and 18-decimal encodings differ", six !== eighteen);

    const expected18 = encodeFunctionData({
      abi: [{
        type: "function", name: "transferWithMemo", stateMutability: "nonpayable",
        inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "memo", type: "bytes32" }],
        outputs: [{ name: "", type: "bool" }],
      }],
      functionName: "transferWithMemo",
      args: [to as `0x${string}`, parseUnits("1", 18), stringToHex("ord-1", { size: 32 })],
    });
    check("18-decimal encoding is 1e18, not 1e6", eighteen === expected18);
    // The old default encoded one whole token as 1e6 — off by 10^12 — and
    // returned it as perfectly valid calldata with no error anywhere.
    check("the old default would have been wrong by 1e12",
      parseUnits("1", 18) / parseUnits("1", 6) === 1_000_000_000_000n);
  }

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nPASS — an unread value is null, and an unbilled failure is non-2xx" : `\nFAIL — ${failures} assertion(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
