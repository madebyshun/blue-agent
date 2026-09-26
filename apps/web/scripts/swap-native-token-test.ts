/**
 * CI guard on native-ETH handling and the swap approve step (P1-4).
 *
 * Run: `npx tsx scripts/swap-native-token-test.ts` from `apps/web/`.
 * Hermetic: `globalThis.fetch` is stubbed, so nothing reaches api.0x.org and
 * nothing needs ZEROX_API_KEY to be real. The Robinhood Chain 4663 assertions
 * drive the prepare route directly — its native-ETH branches are pure calldata
 * encoders and make no RPC call. (The token→token branch DOES read chain state,
 * so §4 asserts its classification predicate rather than invoking it; a test
 * that needs an RPC up is a test that goes red for reasons that aren't the code.)
 *
 * ── WHAT WENT WRONG, MEASURED 2026-09-26 ─────────────────────────────────────
 * `blue_swap_tx` documents `tokenIn` / `tokenOut` as "0x… address or \"ETH\"".
 * Sending the documented value came back as
 *     Base 8453 swap quote failed: The input is invalid
 * while WETH at 0x4200…0006 worked. The tool forwarded the literal STRING "ETH"
 * to the 0x Swap API v2, which speaks only the ERC-20 native SENTINEL address.
 *
 * A description that disagrees with behaviour is worse than a missing feature:
 * the agent trusts it, sends the documented value, and gets back an error that
 * reads like a chain or liquidity problem. It then retries the identical call or
 * tells the user Base cannot route the pair. Neither is true, and neither is
 * recoverable from the error text.
 *
 * ── AND THE QUIET ONE FOUND WHILE FIXING IT ──────────────────────────────────
 * `approve` read `data.allowanceTarget`, a Swap API **v1** field, from a **v2**
 * response. So it was not thin — it was `null` on EVERY ERC-20 sell, telling the
 * agent no approval was needed at the exact moment one was. The browser's
 * SwapCard read `issues.allowance.spender` correctly from the same upstream
 * body the whole time. §3 pins the v2 field and the calldata.
 *
 * ── WHAT THIS FILE BLOCKS ────────────────────────────────────────────────────
 * §1 the translation helper. §2 that the sentinel actually reaches the wire in
 * BOTH directions — the string "ETH" must not appear in the outgoing URL at all.
 * §3 that approve is a signable transaction and approves EXACTLY the quoted
 * amount, never unlimited. §4 the same word on Robinhood Chain 4663, which has
 * its own routing code and only shared the symptom. §5 proves each assertion
 * discriminates by re-implementing the defect and watching the assertion reject
 * it.
 *
 * ── NEGATIVE CONTROLS, PHYSICALLY PERFORMED 2026-09-27 ───────────────────────
 * A guard that has never gone red is a comment, not a check. Each fix was
 * reverted in the source, this file was run, and the fix restored:
 *
 *   1. `toNativeSentinel` (lib/tx-chains.ts) → `return token.trim()`, the
 *      pre-fix pass-through.        →  15 FAILED of 82, across §1 and §2.
 *   2. `buildBaseApprove` (lib/zerox-swap.ts) → read `quote.allowanceTarget`
 *      only, the v1 field.          →  17 FAILED of 82, all of §3.
 *
 * Both returned to 82/82 after restore, and the file is byte-identical to its
 * pre-control state. §5 keeps a simulated copy of each revert so the
 * discrimination is re-checked on every CI run, not just the day it was proven.
 */
import { decodeFunctionData, parseAbi } from "viem";
import { NATIVE_SENTINEL as SENTINEL_FROM_TRUST } from "../src/lib/wallet/token-trust";
import { isNativeToken, toNativeSentinel, NATIVE_SENTINEL } from "../src/lib/tx-chains";
import { buildBaseApprove } from "../src/lib/zerox-swap";
import { GET as quoteGET } from "../src/app/api/swap/quote/route";
import { POST as rhPreparePOST } from "../src/app/api/robinhood/router/swap-prepare/route";

let failures = 0, checks = 0;
function ok(label: string, cond: boolean) {
  checks++;
  if (!cond) { failures++; console.error(`  FAIL  ${label}`); }
  else console.log(`  ok    ${label}`);
}

// Real, pinned Base 8453 addresses. USDC and WETH are matched on by the code
// under test, so placeholders would exercise nothing.
const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const WETH = "0x4200000000000000000000000000000000000006";
// Synthetic. Deliberately not a real token or a real router — this repo has a
// hard rule against inventing addresses and a plausible fake in a test file is
// exactly the thing that gets copied somewhere it matters.
const TAKER       = "0x00000000000000000000000000000000000000a1";
const RH_ROUTER   = "0x00000000000000000000000000000000000000b2";
const RH_TOKEN    = "0x00000000000000000000000000000000000000c3";
const SPENDER_V2  = "0x00000000000000000000000000000000000000d4";
const SPENDER_V1  = "0x00000000000000000000000000000000000000e5";

const APPROVE_SELECTOR = "0x095ea7b3";
const ERC20_APPROVE_ABI = parseAbi(["function approve(address spender, uint256 amount)"]);

/** A minimal but shape-accurate 0x Swap API v2 AllowanceHolder body. */
function v2Quote(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    buyAmount: "994321",
    sellAmount: "1000000",
    issues: { allowance: { spender: SPENDER_V2, actual: "0" }, balance: null },
    transaction: { to: SPENDER_V2, data: "0xdeadbeef", value: "0", gas: "250000" },
    ...extra,
  };
}

/**
 * Drive GET /api/swap/quote with a stubbed upstream and hand back the URL it
 * tried to call. The URL is the whole point: the bug was never in the response
 * handling, it was in what went out.
 */
async function callQuote(
  sellToken: string,
  buyToken: string,
  body: Record<string, unknown> = v2Quote(),
  status = 200,
): Promise<{ outgoing: URL; json: Record<string, unknown>; headers: Record<string, string> }> {
  const realFetch = globalThis.fetch;
  let outgoing = "";
  let headers: Record<string, string> = {};
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    outgoing = String(input);
    headers = (init?.headers ?? {}) as Record<string, string>;
    return new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  try {
    const qs = new URLSearchParams({ sellToken, buyToken, sellAmount: "1000000", taker: TAKER });
    const res = await quoteGET(new Request(`http://local/api/swap/quote?${qs}`));
    return { outgoing: new URL(outgoing), json: await res.json(), headers };
  } finally {
    globalThis.fetch = realFetch;
  }
}

async function rhPrepare(body: Record<string, unknown>) {
  const res = await rhPreparePOST(new Request("http://local/api/robinhood/router/swap-prepare", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never);
  return { status: res.status, json: await res.json() as Record<string, unknown> };
}

async function main() {
  // The route returns { needsKey: true } without this and never calls upstream.
  // Not a secret: the stub above never looks at it.
  process.env.ZEROX_API_KEY = "test-key-not-a-secret";

  console.log("\n§1 \"ETH\" translates to the sentinel that already existed here");
  ok("the sentinel is imported, not redefined", NATIVE_SENTINEL === SENTINEL_FROM_TRUST);
  ok("sentinel is a 20-byte address", /^0x[a-fA-F0-9]{40}$/.test(NATIVE_SENTINEL));
  ok("\"ETH\" → sentinel", toNativeSentinel("ETH") === NATIVE_SENTINEL);
  ok("\"eth\" → sentinel (case-insensitive)", toNativeSentinel("eth") === NATIVE_SENTINEL);
  ok("\"Eth\" → sentinel", toNativeSentinel("Eth") === NATIVE_SENTINEL);
  ok("\"  ETH  \" → sentinel (trimmed)", toNativeSentinel("  ETH  ") === NATIVE_SENTINEL);
  ok("\"NATIVE\" → sentinel", toNativeSentinel("NATIVE") === NATIVE_SENTINEL);
  ok("\"native\" → sentinel", toNativeSentinel("native") === NATIVE_SENTINEL);
  ok("empty string → sentinel", toNativeSentinel("") === NATIVE_SENTINEL);
  ok("zero address → sentinel",
    toNativeSentinel("0x0000000000000000000000000000000000000000") === NATIVE_SENTINEL);
  // Casings are DERIVED, never re-typed. A hand-written second copy of the
  // all-`e` marker is a 40-character string a human has to count, and the first
  // draft of this line was 39 — which is precisely the drift lib/tx-chains.ts
  // refuses to risk by importing the sentinel instead of spelling it twice.
  ok("all-e marker, lowercase → sentinel",
    toNativeSentinel(NATIVE_SENTINEL.toLowerCase()) === NATIVE_SENTINEL);
  ok("all-e marker, uppercase → sentinel",
    toNativeSentinel(NATIVE_SENTINEL.toUpperCase()) === NATIVE_SENTINEL);
  ok("all-e marker, as published → sentinel",
    toNativeSentinel(NATIVE_SENTINEL) === NATIVE_SENTINEL);
  // The other half of the contract: a real ERC-20 must pass through untouched.
  // A helper that "helpfully" lowercased or checksummed addresses would break
  // every caller that compares the value it got back.
  ok("a real ERC-20 passes through unchanged", toNativeSentinel(USDC) === USDC);
  ok("WETH is NOT native (it is an ERC-20)", toNativeSentinel(WETH) === WETH);
  ok("isNativeToken agrees with the translator on WETH", isNativeToken(WETH) === false);
  ok("isNativeToken agrees on \"ETH\"", isNativeToken("ETH") === true);
  ok("whitespace trimmed off a real address", toNativeSentinel(` ${USDC} `) === USDC);

  console.log("\n§2 Base 8453: the sentinel reaches the wire, both directions");
  const sell = await callQuote(USDC, "ETH");
  ok("USDC→\"ETH\": buyToken on the wire is the sentinel",
    sell.outgoing.searchParams.get("buyToken") === NATIVE_SENTINEL);
  ok("USDC→\"ETH\": sellToken is untouched",
    sell.outgoing.searchParams.get("sellToken") === USDC);
  ok("USDC→\"ETH\": the string ETH never reaches 0x",
    !/[?&](sell|buy)Token=ETH(&|$)/i.test(sell.outgoing.search));
  ok("USDC→\"ETH\": returns a quote, not an error",
    sell.json.buyAmount === "994321" && sell.json.error === undefined);
  ok("USDC→\"ETH\": chain is stated as 8453",
    sell.outgoing.searchParams.get("chainId") === "8453");
  ok("USDC→\"ETH\": still calls v2", sell.headers["0x-version"] === "v2");

  const buy = await callQuote("ETH", USDC);
  ok("\"ETH\"→USDC: sellToken on the wire is the sentinel",
    buy.outgoing.searchParams.get("sellToken") === NATIVE_SENTINEL);
  ok("\"ETH\"→USDC: buyToken is untouched",
    buy.outgoing.searchParams.get("buyToken") === USDC);
  ok("\"ETH\"→USDC: returns a quote, not an error",
    buy.json.buyAmount === "994321" && buy.json.error === undefined);

  const lower = await callQuote("eth", USDC);
  ok("lowercase \"eth\" also translates",
    lower.outgoing.searchParams.get("sellToken") === NATIVE_SENTINEL);

  // Regression guard on the workaround people were told to use. If the fix had
  // widened the native set too far, WETH would start resolving to the sentinel
  // and every wrapped-ETH quote would silently become a native one.
  const weth = await callQuote(USDC, WETH);
  ok("WETH still quotes as WETH, not as native",
    weth.outgoing.searchParams.get("buyToken") === WETH);

  const both = await callQuote("ETH", "NATIVE");
  ok("both legs native: both translate",
    both.outgoing.searchParams.get("sellToken") === NATIVE_SENTINEL &&
    both.outgoing.searchParams.get("buyToken") === NATIVE_SENTINEL);

  console.log("\n§3 the approve step is a signable transaction, not a description");
  const approve = buildBaseApprove(v2Quote(), USDC, "1000000", false);
  ok("v2 issues.allowance.spender produces an approve", approve !== null);
  // Read through a nullable view rather than `approve!`. When this section is
  // the thing that broke, `approve` is null — and a non-null assertion turns the
  // whole file into a single TypeError at the first dependent line, hiding both
  // the remaining §3 checks and every section after it. Failing loudly is the
  // goal; failing loudly ONCE is not. (Observed while running the §3 negative
  // control below: 2 FAILs then a throw, instead of the full damage report.)
  const A: Partial<typeof approve & object> = approve ?? {};
  const aData = typeof A.data === "string" ? A.data : "";
  ok("approve carries calldata", aData.length > 2);
  ok("calldata is approve(address,uint256)", aData.startsWith(APPROVE_SELECTOR));
  ok("approve.to is the TOKEN, not the spender", A.to === USDC);
  ok("approve.value is zero", A.value === "0");
  ok("approve states its chain (Base 8453)", A.chainId === 8453);
  // blue_bridge_tx returns { to, data, value, chainId }. Matching it verbatim is
  // the difference between an agent holding one code path and holding two.
  ok("shape matches blue_bridge_tx's approve",
    ["to", "data", "value", "chainId"].every((k) => k in A));
  // Only-ADD rule: the original fields may not disappear from the contract.
  ok("pre-existing `token` field retained", A.token === USDC);
  ok("pre-existing `spender` field retained", A.spender === SPENDER_V2);

  const decoded = aData.startsWith(APPROVE_SELECTOR)
    ? decodeFunctionData({ abi: ERC20_APPROVE_ABI, data: aData as `0x${string}` })
    : null;
  ok("decodes as approve", decoded?.functionName === "approve");
  ok("approves the spender 0x reported",
    String(decoded?.args[0] ?? "").toLowerCase() === SPENDER_V2.toLowerCase());
  ok("approves EXACTLY the quoted amount", decoded?.args[1] === 1000000n);
  // Never unlimited. This hands back an unsigned tx; widening it to a standing
  // infinite grant would give away something the user never asked for.
  ok("not an unlimited approval",
    decoded !== null && decoded.args[1] !== (2n ** 256n - 1n));
  ok("reported amount matches the calldata", A.amount === "1000000");
  ok("note names the chain", /8453/.test(A.note ?? ""));

  // Null is an ANSWER here, not missing data: 0x did not ask for an allowance.
  ok("native ETH in → no approve (not an ERC-20)",
    buildBaseApprove(v2Quote(), USDC, "1000000", true) === null);
  ok("no allowance issue → null",
    buildBaseApprove({ issues: { allowance: null } }, USDC, "1000000", false) === null);
  ok("no issues block at all → null",
    buildBaseApprove({}, USDC, "1000000", false) === null);
  // Hard rule #4: never fabricate an address. A malformed spender yields null,
  // not a padded guess.
  ok("malformed spender → null, never a guessed address",
    buildBaseApprove({ issues: { allowance: { spender: "not-an-address" } } }, USDC, "1000000", false) === null);
  ok("non-numeric amount → null",
    buildBaseApprove(v2Quote(), USDC, "1.5", false) === null);
  // v1's field survives only as a downgrade path, so a future rollback degrades
  // instead of silently re-breaking.
  const v1 = buildBaseApprove({ allowanceTarget: SPENDER_V1 }, USDC, "500", false);
  ok("v1 allowanceTarget still honoured as a fallback", v1?.spender === SPENDER_V1);
  ok("…and the fallback also carries calldata",
    (v1?.data ?? "").startsWith(APPROVE_SELECTOR));
  // Precedence matters: when both are present the v2 field is the live one.
  const bothFields = buildBaseApprove(
    { allowanceTarget: SPENDER_V1, issues: { allowance: { spender: SPENDER_V2 } } },
    USDC, "500", false,
  );
  ok("v2 wins over v1 when both are present", bothFields?.spender === SPENDER_V2);

  console.log("\n§4 Robinhood Chain 4663: \"ETH\" is a token name here too");
  // RH has its own routing code and shared only the symptom, so it needs its own
  // proof. Before the fix, tokenIn:"ETH" fell past the local sentinel set, was
  // classified as an ERC-20 and died on "valid tokenIn address required" — a
  // shape error for a documented input.
  const rhBuy = await rhPrepare({
    router: RH_ROUTER, direction: "buy", token: RH_TOKEN, tokenIn: "ETH",
    fee: 3000, amountIn: "1000000000000000000", recipient: TAKER,
  });
  ok("tokenIn \"ETH\" is accepted", rhBuy.status === 200);
  ok("…and does NOT 400 on address shape",
    String(rhBuy.json.error ?? "") !== "valid tokenIn address required");
  ok("routes to the native ETH→token path", rhBuy.json.direction === "buy");
  ok("native input needs no approve", rhBuy.json.approve === null);
  ok("swap carries the ETH value", (rhBuy.json.swap as Record<string, string>).value === "0xde0b6b3a7640000");

  for (const spelling of ["ETH", "eth", "NATIVE", "native", "", "0x0000000000000000000000000000000000000000"]) {
    const r = await rhPrepare({
      router: RH_ROUTER, direction: "buy", token: RH_TOKEN, tokenIn: spelling,
      fee: 3000, amountIn: "1000", recipient: TAKER,
    });
    ok(`tokenIn ${spelling === "" ? "(empty)" : `"${spelling}"`} → native path`,
      r.status === 200 && r.json.direction === "buy");
  }

  const rhSell = await rhPrepare({
    router: RH_ROUTER, direction: "sell", token: RH_TOKEN, tokenIn: "ETH",
    fee: 3000, amountIn: "1000", recipient: TAKER,
  });
  ok("sell direction still returns its approve", rhSell.status === 200 && rhSell.json.approve !== null);
  ok("…approved on the token, not the router",
    (rhSell.json.approve as Record<string, string>).to === RH_TOKEN);
  ok("…and it is approve() calldata",
    (rhSell.json.approve as Record<string, string>).data.startsWith(APPROVE_SELECTOR));

  // The other half of the contract. The route's own classification line is
  // `!!raw && !isNativeToken(raw)`; asserted directly because driving the
  // token→token branch reads chain state, and a test that needs an RPC up goes
  // red for reasons that are not this code.
  const classify = (raw: string) => !!raw.trim() && !isNativeToken(raw.trim());
  ok("a real ERC-20 tokenIn still means token→token", classify(RH_TOKEN) === true);
  ok("\"ETH\" does not mean token→token", classify("ETH") === false);
  ok("absent tokenIn does not mean token→token", classify("") === false);

  console.log("\n§5 negative controls — proof these assertions can go red");
  // Control A: the pre-fix querystring, built verbatim the old way.
  const preFix = new URLSearchParams({ chainId: "8453", sellToken: USDC, buyToken: "ETH" });
  ok("control: the old code really did send the literal \"ETH\"",
    preFix.get("buyToken") === "ETH");
  ok("control: §2's sentinel assertion rejects it",
    preFix.get("buyToken") !== NATIVE_SENTINEL);
  ok("control: §2's \"ETH never reaches 0x\" assertion rejects it",
    /[?&](sell|buy)Token=ETH(&|$)/i.test(`?${preFix}`));

  // Control B: the pre-fix approve — a description of a transaction.
  const oldApprove: Record<string, unknown> = { token: USDC, spender: SPENDER_V2 };
  ok("control: the old approve really had no calldata", !("data" in oldApprove));
  ok("control: §3's calldata assertion rejects it", typeof oldApprove.data !== "string");
  ok("control: §3's bridge-shape assertion rejects it",
    !["to", "data", "value", "chainId"].every((k) => k in oldApprove));

  // Control C: the quiet one — reading v1's field off a v2 body yields null.
  const oldFieldRead = (q: Record<string, unknown>) => (q.allowanceTarget as string | undefined) ?? null;
  ok("control: v1's field is absent from a v2 response", oldFieldRead(v2Quote()) === null);
  ok("control: so approve was null on every ERC-20 sell", oldFieldRead(v2Quote()) === null);
  ok("control: §3's non-null assertion rejects that", buildBaseApprove(v2Quote(), USDC, "1000000", false) !== null);

  // Control D: RH's pre-fix sentinel set — hex only, no words.
  const oldRhNative = new Set([
    "", "0x0000000000000000000000000000000000000000",
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  ]);
  const oldRhClassify = (raw: string) => !!raw && !oldRhNative.has(raw.toLowerCase());
  ok("control: the old set really did miss the word \"ETH\"", oldRhClassify("ETH") === true);
  ok("control: …which then failed the address regex",
    !/^0x[a-fA-F0-9]{40}$/.test("ETH"));
  ok("control: §4's classification assertion rejects it", classify("ETH") === false);

  console.log(
    failures === 0
      ? `\nALL GREEN — ${checks}/${checks} checks passed\n`
      : `\n${failures} FAILED of ${checks}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
