/**
 * `honeypot-check` may only claim high confidence about a tax it actually read,
 * and a Base-only tool may not answer "not a token" about a token on 4663.
 *
 * WHY THIS EXISTS
 * ---------------
 * MEASURED 2026-09-26 across the 18 tools on /api/mcp: 12 of 12 tokens came
 * back `tax: "unknown"` and every one was still `verdict: SAFE` at
 * `confidence: 90-99`. Both numbers came from the model — the tax because the
 * prompt asked for one, the confidence because the prompt asked it to "reflect
 * evidence strength". A reader parses "SAFE, 95%" as a verification that
 * happened. Nothing had been read.
 *
 * In the same run, `0x8Ff92566f2e81BDd68EDfAa8cde73942A723796b` (VEX, live on
 * Robinhood Chain 4663) was told it was "an externally-owned account, not a
 * token contract" by `honeypot-check` and "no pair found" by `token-price` —
 * both true of Base, both phrased as facts about the token, and neither naming
 * the chain it had searched.
 *
 * WHAT WOULD ROT SILENTLY, AND WHY EACH IS ASSERTED
 * -------------------------------------------------
 *  1. The clamp is one `Math.min`. Deleting it restores the exact measured bug
 *     with ZERO visible symptoms — still 200, still SAFE, and the only thing
 *     that changed is a number nobody downstream can check. So case 2 asserts
 *     the cap bites AND case 1 asserts it does NOT bite on a real read: a clamp
 *     that always fires is just a constant, and would pass a one-sided test
 *     while silently capping honest answers.
 *  2. A model told "do not invent a tax" will still invent one. Case 1 supplies
 *     a completion containing a WRONG tax figure in its prose and requires the
 *     emitted `buy_tax` / `sell_tax` to be the SELECTOR's numbers, proving the
 *     fields are code-derived rather than parsed back out of the model.
 *  3. `"unknown"` → `null` is a breaking change that a consumer renders as the
 *     literal string "null" if it is missed. Case 2 asserts the JSON value is
 *     `null` and not any string.
 *  4. A hint that fires on every miss is a chain scan wearing a pointer's
 *     clothes. Case 5 requires the `hint` KEY to be ABSENT — not null, not
 *     empty — when RH has no code, because absence of a hint must never be
 *     readable as evidence about RH.
 *
 * NEGATIVE CONTROLS — each was applied, RUN, and reverted on 2026-09-27. These
 * are measured counts, not predictions. Make the edit and this suite goes red by
 * exactly the stated number in the stated cases:
 *   a. `honeypot-check` `clampConfidence` → `return bounded;` ............. 2 ❌ (2)
 *   b. `honeypot-check` `honeypotAction`, drop the `taxRead` guard ........ 1 ❌ (2)
 *   c. `honeypot-check` `isHoneypot`, drop `|| measuredHoneypot` .......... 2 ❌ (3)
 *   d. `honeypot-check` `sell_tax_estimate: tax.sell_tax_pct ?? "unknown"`  2 ❌ (2)
 *   e. `token-tax` `buy_tax/sell_tax: read ? … : 0` (the 0 that lies) ..... 3 ❌ (2,7)
 *   f. `token-tax` `has_blacklist: blacklisted` (2-valued, inferred false)  2 ❌ (2,7)
 *   g. `cross-chain-hint` `if (!found) return null;` removed ............. 4 ❌ (5,6)
 *
 * Hermetic: `globalThis.fetch` is replaced for the whole run. Base RPC, RH RPC,
 * multicall3, Basescan, DexScreener and the Virtuals gateway are all answered
 * from the tables below, so no request leaves the process and CI does not
 * depend on any upstream being up.
 */
process.env.VIRTUALS_API_KEY ??= "test-key-not-a-secret";

import { decodeFunctionData, encodeAbiParameters, parseAbi, toFunctionSelector } from "viem";
import { interpretTaxProbes } from "../src/lib/token-tax";
import { robinhoodCodeHint } from "../src/lib/cross-chain-hint";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✅ ${name}`); return; }
  failures++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── the "chains" ────────────────────────────────────────────────────────────
// Real addresses from the 2026-09-26 run, so a reader can re-measure against
// production. The BEHAVIOUR attached to each below is the fixture, not a claim
// about what these contracts do today.
const TIBBIR = "0xa4a2e2ca3fbfe21aed83471d28b6f65a233c6e00"; // AgentToken, taxes, no blacklist
const V4TOK  = "0x1111111111111111111111111111111111111114"; // AgentTokenV4, has blacklists()
const PLAIN  = "0x2222222222222222222222222222222222222222"; // plain ERC-20, no tax selectors
const VEX    = "0x8ff92566f2e81bdd68edfaa8cde73942a723796b"; // no Base code; HAS code on RH 4663
const NOWHERE = "0x3333333333333333333333333333333333333333"; // no code on either chain

const SEL_BUY   = toFunctionSelector("totalBuyTaxBasisPoints()");
const SEL_SELL  = toFunctionSelector("totalSellTaxBasisPoints()");
const SEL_BLACK = toFunctionSelector("blacklists(address)");
const SEL_NAME     = toFunctionSelector("name()");
const SEL_SYMBOL   = toFunctionSelector("symbol()");
const SEL_DECIMALS = toFunctionSelector("decimals()");
const SEL_SUPPLY   = toFunctionSelector("totalSupply()");

const MULTICALL3 = "0xca11bde05977b3631167028862be2a173976ca11";

/** bps the selector answers with, per fixture. `null` = selector not present. */
const TAXES: Record<string, { buy: number; sell: number } | null> = {
  [TIBBIR]: { buy: 100, sell: 100 },   // 1% / 1%
  [V4TOK]:  { buy: 0,   sell: 9_000 }, // 0% / 90% — a measured honeypot
  [PLAIN]:  null,
};
const HAS_BLACKLIST: Record<string, boolean> = { [V4TOK]: true };
const META: Record<string, { name: string; symbol: string; decimals: number }> = {
  [TIBBIR]: { name: "tibbir",  symbol: "TIBBIR", decimals: 18 },
  [V4TOK]:  { name: "V Four",  symbol: "V4",     decimals: 18 },
  [PLAIN]:  { name: "Plain",   symbol: "PLAIN",  decimals: 18 },
};
/** Base bytecode presence. VEX and NOWHERE deliberately have none. */
const BASE_CODE = new Set([TIBBIR, V4TOK, PLAIN]);
/** RH 4663 bytecode presence — the only thing the hint is allowed to read. */
const RH_CODE = new Set([VEX]);

const WORD = (n: bigint) => encodeAbiParameters([{ type: "uint256" }], [n]);

/** What the model says. Mutated per case; the point is that it cannot win. */
let llmConfidence = 97;
let llmIsHoneypot = false;
/** A tax figure the model invented. Must never reach the response's tax fields. */
const LLM_INVENTED_TAX = "buy/sell tax is approximately 4%";

function ethCallResult(to: string, data: string): string | null {
  const sel = data.slice(0, 10);
  const tax = TAXES[to];
  if (sel === SEL_BUY)  return tax ? WORD(BigInt(tax.buy)) : null;
  if (sel === SEL_SELL) return tax ? WORD(BigInt(tax.sell)) : null;
  if (sel === SEL_BLACK) return HAS_BLACKLIST[to] ? WORD(0n) : null;
  const m = META[to];
  if (!m) return null;
  if (sel === SEL_NAME)     return encodeAbiParameters([{ type: "string" }], [m.name]);
  if (sel === SEL_SYMBOL)   return encodeAbiParameters([{ type: "string" }], [m.symbol]);
  if (sel === SEL_DECIMALS) return encodeAbiParameters([{ type: "uint8" }], [m.decimals]);
  if (sel === SEL_SUPPLY)   return WORD(1_000_000n * 10n ** 18n);
  return null;
}

const AGGREGATE3 = parseAbi([
  "function aggregate3((address target, bool allowFailure, bytes callData)[] calls) returns ((bool success, bytes returnData)[])",
]);

function multicall3Result(data: string): string {
  const { args } = decodeFunctionData({ abi: AGGREGATE3, data: data as `0x${string}` });
  const calls = args[0] as readonly { target: string; allowFailure: boolean; callData: string }[];
  const out = calls.map((c) => {
    const r = ethCallResult(c.target.toLowerCase(), c.callData);
    return { success: r !== null, returnData: (r ?? "0x") as `0x${string}` };
  });
  return encodeAbiParameters(
    [{ type: "tuple[]", components: [{ name: "success", type: "bool" }, { name: "returnData", type: "bytes" }] }],
    [out],
  );
}

interface JsonRpcReq { id?: number; method?: string; params?: unknown[] }

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

  // ── Robinhood Chain 4663. eth_getCode and NOTHING else is permitted here;
  //    a hint that reads state is no longer a hint. ──────────────────────────
  if (url.includes("chain.robinhood.com")) {
    let rpc: JsonRpcReq | null = null;
    try { rpc = JSON.parse(String(init?.body ?? "")) as JsonRpcReq; } catch {}
    if (rpc?.method !== "eth_getCode") {
      return json({ jsonrpc: "2.0", id: rpc?.id, error: { code: -32601, message: `RH: only eth_getCode may be called from a hint, got ${rpc?.method}` } });
    }
    const addr = String((rpc.params ?? [])[0] ?? "").toLowerCase();
    return json({ jsonrpc: "2.0", id: rpc.id, result: RH_CODE.has(addr) ? "0x60806040" : "0x" });
  }

  // ── Base 8453 RPC ─────────────────────────────────────────────────────────
  if (url.includes("base.org") || url.includes("/base")) {
    let rpc: JsonRpcReq | null = null;
    try { rpc = JSON.parse(String(init?.body ?? "")) as JsonRpcReq; } catch {}
    if (rpc?.method === "eth_getCode") {
      const addr = String((rpc.params ?? [])[0] ?? "").toLowerCase();
      return json({ jsonrpc: "2.0", id: rpc.id, result: BASE_CODE.has(addr) ? "0x60806040" : "0x" });
    }
    if (rpc?.method === "eth_call") {
      const call = (rpc.params?.[0] ?? {}) as { to?: string; data?: string };
      const to = (call.to ?? "").toLowerCase();
      const data = call.data ?? "0x";
      if (to === MULTICALL3) return json({ jsonrpc: "2.0", id: rpc.id, result: multicall3Result(data) });
      const r = ethCallResult(to, data);
      return r === null
        ? json({ jsonrpc: "2.0", id: rpc.id, error: { code: 3, message: "execution reverted" } })
        : json({ jsonrpc: "2.0", id: rpc.id, result: r });
    }
    if (rpc?.method === "eth_chainId") return json({ jsonrpc: "2.0", id: rpc.id, result: "0x2105" });
    return json({ jsonrpc: "2.0", id: rpc?.id, error: { code: -32601, message: `unstubbed ${rpc?.method}` } });
  }

  // ── Virtuals. /v1/models is answered non-ok on purpose so
  //    `getVirtualsCatalog()` returns null and model validation is skipped —
  //    this suite is about the clamp, not the catalog. ────────────────────────
  if (url.includes("compute.virtuals.io")) {
    if (url.includes("/models")) return new Response("catalog not stubbed", { status: 503 });
    // No `usage` key: `recordLlmTokens(0)` early-returns, so no KV call.
    return json({
      choices: [{
        finish_reason: "stop",
        message: {
          content: JSON.stringify({
            is_honeypot: llmIsHoneypot,
            confidence: llmConfidence,
            red_flags: [],
            green_flags: ["active DEX liquidity on Base"],
            honeypot_patterns: [],
            // Deliberately contains a fabricated tax. Nothing in the response's
            // tax fields may come from here.
            assessment: `Looks tradeable. ${LLM_INVENTED_TAX}.`,
            community_alert: "none",
            known_rug: false,
            rug_patterns: [],
            community_signal: "No community data available.",
          }),
        },
      }],
    });
  }

  // ── Basescan (Etherscan v2) ───────────────────────────────────────────────
  if (url.includes("etherscan.io")) {
    if (url.includes("action=tokeninfo")) return json({ status: "0", result: [] });
    // Verified source, and the ContractName is a LIE on purpose: the whole
    // point of probing selectors is that this string is deployer-chosen.
    return json({ status: "1", result: [{ ContractName: "AgentTokenV4", SourceCode: "contract X {}" }] });
  }

  // ── DexScreener ───────────────────────────────────────────────────────────
  if (url.includes("dexscreener.com")) {
    const addr = (url.split("/tokens/")[1] ?? "").toLowerCase();
    if (!BASE_CODE.has(addr)) return json({ pairs: [] });
    return json({
      pairs: [{
        chainId: "base",
        baseToken: { address: addr, symbol: META[addr]?.symbol ?? "?", name: META[addr]?.name ?? "?" },
        quoteToken: { address: "0x4200000000000000000000000000000000000006", symbol: "WETH" },
        priceUsd: "0.01", liquidity: { usd: 250_000 }, volume: { h24: 90_000 },
        priceChange: { h1: 0, h6: 0, h24: 0 }, dexId: "aerodrome",
        url: `https://dexscreener.com/base/${addr}`,
      }],
    });
  }

  return new Response(JSON.stringify({ error: `not stubbed: ${url}` }), { status: 502 });
}) as typeof fetch;

// ── driving the real handlers, through the real registry ────────────────────
// Per CLAUDE.md: import via index.ts and call through HANDLERS, never a file's
// default export — tsx wraps named exports under `.default`.
type Json = Record<string, unknown>;

async function callTool(id: string, body: Json): Promise<Json> {
  const { HANDLERS } = await import("../src/app/api/x402/_handlers/index");
  const h = HANDLERS[id];
  if (!h) throw new Error(`no handler registered for "${id}" — check _handlers/index.ts`);
  const res = await h(new Request(`https://blueagent.dev/api/x402/${id}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  return (await res.json()) as Json;
}

(async () => {
  console.log("honeypot tax-read + cross-chain hint suite\n");

  // ── 1. tax READ succeeds → measured bps, and 90+ stays reachable ─────────
  console.log("1. AgentToken whose tax selectors answer");
  llmConfidence = 97; llmIsHoneypot = false;
  {
    const r = await callTool("honeypot-check", { token: TIBBIR });
    check("tax_read is \"template\"", r.tax_read === "template", `got ${JSON.stringify(r.tax_read)}`);
    check("buy_tax is the measured 100 bps", r.buy_tax === 100, `got ${JSON.stringify(r.buy_tax)}`);
    check("sell_tax is the measured 100 bps", r.sell_tax === 100, `got ${JSON.stringify(r.sell_tax)}`);
    check("tax_units names the unit", r.tax_units === "basis_points", `got ${JSON.stringify(r.tax_units)}`);
    check("display strings are formatted in code", r.buy_tax_estimate === "1%" && r.sell_tax_estimate === "1%",
      `got ${JSON.stringify(r.buy_tax_estimate)} / ${JSON.stringify(r.sell_tax_estimate)}`);
    // THE point of case 1: a real read must NOT be capped.
    check("confidence 97 survives — the clamp is not a constant", r.confidence === 97, `got ${JSON.stringify(r.confidence)}`);
    check("confidence_capped is false", r.confidence_capped === false, `got ${JSON.stringify(r.confidence_capped)}`);
    check("action is SAFE_TO_TRADE", r.action === "SAFE_TO_TRADE", `got ${JSON.stringify(r.action)}`);
    check("template identified by selector, not by ContractName",
      r.token_template === "AgentToken", `got ${JSON.stringify(r.token_template)} (Basescan claimed "AgentTokenV4")`);
    check("no blacklist lever on this template", r.has_blacklist === false, `got ${JSON.stringify(r.has_blacklist)}`);
    check("tax_source names the selectors", typeof r.tax_source === "string" && (r.tax_source as string).includes("totalBuyTaxBasisPoints"),
      `got ${JSON.stringify(r.tax_source)}`);
    // The model's invented "approximately 4%" may survive in its own prose, but
    // must not have become a tax field.
    check("the model's invented tax did NOT reach the tax fields",
      r.buy_tax !== 400 && r.sell_tax !== 400 && r.buy_tax_estimate !== "4%");
  }

  // ── 2. tax read FAILS → null, capped, and it says so ──────────────────────
  console.log("\n2. plain ERC-20 with no tax selectors (the measured 12-of-12 case)");
  llmConfidence = 97; llmIsHoneypot = false;
  {
    const r = await callTool("honeypot-check", { token: PLAIN });
    check("tax_read is \"failed\"", r.tax_read === "failed", `got ${JSON.stringify(r.tax_read)}`);
    check("buy_tax is null — not 0, not \"unknown\"", r.buy_tax === null, `got ${JSON.stringify(r.buy_tax)}`);
    check("sell_tax is null — not 0, not \"unknown\"", r.sell_tax === null, `got ${JSON.stringify(r.sell_tax)}`);
    check("buy_tax_estimate is null, not the string \"unknown\"", r.buy_tax_estimate === null, `got ${JSON.stringify(r.buy_tax_estimate)}`);
    check("sell_tax_estimate is null, not the string \"unknown\"", r.sell_tax_estimate === null, `got ${JSON.stringify(r.sell_tax_estimate)}`);
    check("has_blacklist is null — nothing answered, so nothing is known",
      r.has_blacklist === null, `got ${JSON.stringify(r.has_blacklist)}`);
    check("tax_source is null", r.tax_source === null, `got ${JSON.stringify(r.tax_source)}`);
    // THE clamp.
    check("confidence is capped at 70 despite the model saying 97",
      r.confidence === 70, `got ${JSON.stringify(r.confidence)}`);
    check("confidence_capped flags that it bit", r.confidence_capped === true, `got ${JSON.stringify(r.confidence_capped)}`);
    check("action is TRADEABLE_TAX_UNVERIFIED, not SAFE_TO_TRADE",
      r.action === "TRADEABLE_TAX_UNVERIFIED", `got ${JSON.stringify(r.action)}`);
    check("the assessment says the tax could not be read",
      typeof r.assessment === "string" && /could NOT be read/i.test(r.assessment as string),
      `got ${JSON.stringify(r.assessment)}`);
    check("an unread tax is NOT treated as a honeypot", r.is_honeypot === false, `got ${JSON.stringify(r.is_honeypot)}`);
  }

  // ── 3. AgentTokenV4 → blacklist present, and a 90% sell tax is a verdict ──
  console.log("\n3. AgentTokenV4 with blacklists() and a measured 90% sell tax");
  llmConfidence = 95; llmIsHoneypot = false; // the model says it is fine
  {
    const r = await callTool("honeypot-check", { token: V4TOK });
    check("has_blacklist is true", r.has_blacklist === true, `got ${JSON.stringify(r.has_blacklist)}`);
    check("template is AgentTokenV4", r.token_template === "AgentTokenV4", `got ${JSON.stringify(r.token_template)}`);
    check("sell_tax is the measured 9000 bps", r.sell_tax === 9_000, `got ${JSON.stringify(r.sell_tax)}`);
    check("buy_tax 0 is reported as measured, not as unread", r.buy_tax === 0, `got ${JSON.stringify(r.buy_tax)}`);
    // A measured 90% sell tax overrides a model that said is_honeypot:false.
    check("a measured >=50% sell tax forces HONEYPOT over the model's opinion",
      r.verdict === "HONEYPOT" && r.is_honeypot === true, `got ${JSON.stringify(r.verdict)}`);
    check("action is DO_NOT_BUY", r.action === "DO_NOT_BUY", `got ${JSON.stringify(r.action)}`);
    const reds = (r.red_flags ?? []) as string[];
    check("the blacklist lever is a code-written red flag",
      reds.some((f) => /blacklists\(address\)/.test(f)), `got ${JSON.stringify(reds)}`);
    check("the measured sell tax is a code-written red flag",
      reds.some((f) => /90%/.test(f)), `got ${JSON.stringify(reds)}`);
  }

  // ── 4. Base miss + code on RH 4663 → a hint, and only a hint ─────────────
  console.log("\n4. VEX — no Base code, live on Robinhood Chain 4663");
  {
    const r = await callTool("honeypot-check", { token: VEX });
    check("the Base answer is unchanged: NOT_A_TOKEN", r.verdict === "NOT_A_TOKEN", `got ${JSON.stringify(r.verdict)}`);
    check("the Base answer still declares chain 8453", r.chainId === 8453, `got ${JSON.stringify(r.chainId)}`);
    const hint = r.hint as Json | undefined;
    check("hint.found_on_chain is 4663", hint?.found_on_chain === 4663, `got ${JSON.stringify(hint)}`);
    check("hint links RH's own explorer, not Basescan",
      typeof hint?.explorer === "string" && (hint.explorer as string).startsWith("https://robinhoodchain.blockscout.com/address/"),
      `got ${JSON.stringify(hint?.explorer)}`);
    check("the assessment names Base before answering about it",
      typeof r.assessment === "string" && /Base \(chain 8453\)/.test(r.assessment as string),
      `got ${JSON.stringify(r.assessment)}`);
    check("no RH price/tax data leaked into the Base answer",
      r.buy_tax === null && r.sell_tax === null && r.tax_read === "not_applicable",
      `got tax_read=${JSON.stringify(r.tax_read)}`);

    const p = await callTool("token-price", { token: VEX });
    check("token-price: price stays null (no Base pair)", p.price_usd === null, `got ${JSON.stringify(p.price_usd)}`);
    check("token-price: the error names Base", typeof p.error === "string" && /Base \(chain 8453\)/.test(p.error as string),
      `got ${JSON.stringify(p.error)}`);
    check("token-price: hint.found_on_chain is 4663",
      (p.hint as Json | undefined)?.found_on_chain === 4663, `got ${JSON.stringify(p.hint)}`);

    const l = await callTool("liquidity-depth", { token: VEX });
    check("liquidity-depth: liquidity stays null", l.total_liquidity_usd === null, `got ${JSON.stringify(l.total_liquidity_usd)}`);
    check("liquidity-depth: hint.found_on_chain is 4663",
      (l.hint as Json | undefined)?.found_on_chain === 4663, `got ${JSON.stringify(l.hint)}`);
  }

  // ── 5. Base miss + no code anywhere → the hint KEY must be absent ────────
  console.log("\n5. an address with no code on either chain");
  {
    const r = await callTool("honeypot-check", { token: NOWHERE });
    check("honeypot-check: verdict is NOT_A_TOKEN", r.verdict === "NOT_A_TOKEN", `got ${JSON.stringify(r.verdict)}`);
    check("honeypot-check: the `hint` key is ABSENT, not null",
      !("hint" in r), `got ${JSON.stringify(r.hint)}`);

    const p = await callTool("token-price", { token: NOWHERE });
    check("token-price: the `hint` key is ABSENT", !("hint" in p), `got ${JSON.stringify(p.hint)}`);

    const l = await callTool("liquidity-depth", { token: NOWHERE });
    check("liquidity-depth: the `hint` key is ABSENT", !("hint" in l), `got ${JSON.stringify(l.hint)}`);
  }

  // ── 6. the hint builder in isolation, including the RPC-failure branch ───
  console.log("\n6. robinhoodCodeHint — the branches the handlers cannot reach");
  {
    check("a ticker gets no hint (a ticker has no address on any chain)",
      (await robinhoodCodeHint("VEX")) === null);
    check("a malformed address gets no hint",
      (await robinhoodCodeHint("0xnothex")) === null);
    // An RPC that throws must yield null, NOT a hint and NOT an exception: the
    // hint is a side quest on a paid call and may not fail the call.
    check("an RPC failure yields null, never a hint",
      (await robinhoodCodeHint(VEX, async () => { throw new Error("RPC down"); })) === null);
    check("a negative read yields null",
      (await robinhoodCodeHint(VEX, async () => false)) === null);
    const ok = await robinhoodCodeHint(VEX, async () => true);
    check("a positive read yields chain 4663 by NUMBER", ok?.found_on_chain === 4663, `got ${JSON.stringify(ok)}`);
    check("the note says the Base answer is unchanged",
      !!ok && /unchanged/.test(ok.note) && /8453/.test(ok.note), `got ${JSON.stringify(ok?.note)}`);
  }

  // ── 7. interpretTaxProbes — the pure decoder's own edges ────────────────
  console.log("\n7. interpretTaxProbes decoding edges");
  {
    const w = (n: bigint) => ({ ok: true as const, data: WORD(n) });
    const bad = { ok: false as const };

    const halfRead = interpretTaxProbes(w(100n), bad, bad);
    check("one selector answering is NOT a read — both or nothing",
      halfRead.tax_read === "failed" && halfRead.buy_tax === null, JSON.stringify(halfRead));

    const garbage = interpretTaxProbes({ ok: true, data: "0x" }, { ok: true, data: "0x" }, bad);
    check("a fallback() answering `0x` is not an implementation",
      garbage.tax_read === "failed", JSON.stringify(garbage));

    const absurd = interpretTaxProbes(w(40_000n), w(40_000n), bad);
    check("a decode above 100% is a selector collision, degraded to unread",
      absurd.tax_read === "failed", JSON.stringify(absurd));

    // The honeypot this tool is NAMED after must survive to the verdict.
    const total = interpretTaxProbes(w(0n), w(10_000n), bad);
    check("exactly 10000 bps (100%) is KEPT, not discarded as implausible",
      total.tax_read === "template" && total.sell_tax === 10_000, JSON.stringify(total));

    const zero = interpretTaxProbes(w(0n), w(0n), bad);
    check("a measured 0% is a real reading, not an unread",
      zero.tax_read === "template" && zero.buy_tax === 0 && zero.buy_tax_pct === "0%", JSON.stringify(zero));
    check("a token whose tax selectors answer but blacklists() does not is a real `false`",
      zero.has_blacklist === false, JSON.stringify(zero.has_blacklist));

    const nothing = interpretTaxProbes(bad, bad, bad);
    check("nothing answering gives has_blacklist null, never an inferred false",
      nothing.has_blacklist === null, JSON.stringify(nothing.has_blacklist));
  }

  globalThis.fetch = realFetch;
  console.log(`\n${failures === 0 ? "✅ all green" : `❌ ${failures} failure(s)`}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error("suite threw:", e);
  process.exit(1);
});
