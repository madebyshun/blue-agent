/**
 * `b20_encode_payment` — the amount it encodes is the amount the caller signs.
 *
 * WHY THIS EXISTS
 * ---------------
 * The tool's `decimals` parameter defaulted to 6 until 2026-09-26. Omit it on
 * an 18-decimal token and `amount: "1"` encoded as `1000000` base units — one
 * millionth of a millionth of a token — and came back as perfectly well-formed
 * calldata with no warning, no error and no hint that a number had been
 * guessed. There is nothing downstream to catch it: the caller signs the
 * calldata we hand back, and `transferWithMemo` moves exactly what the bytes
 * say. A wrong exponent here is a wrong transfer, off by 10^12.
 *
 * The fix is not a better default. It is that there is no default: the token
 * contract is the only authority on its own decimals and we already have its
 * address, so `readTokenMeta` reads `decimals()` on-chain, the same reader
 * `blue_send_tx` uses. A caller-supplied `decimals` became a CLAIM to verify
 * rather than an override, because silently preferring either side hides a
 * real disagreement about the size of a payment.
 *
 * WHAT WOULD ROT SILENTLY, AND WHY EACH IS ASSERTED
 * -------------------------------------------------
 *  1. `decimals ?? 6` is a one-token edit that restores the bug with zero
 *     visible symptoms — the tool still answers 200 with valid-looking
 *     calldata. So cases 1 and 2 assert the encoded BYTES against an
 *     independently-built expectation, not merely that `meta.decimals` reads
 *     18. A `meta` block can be right while the calldata is wrong.
 *  2. Reading the chain but then trusting the caller anyway. Case 3 passes a
 *     wrong `decimals` and requires a refusal: accepting it would make the
 *     on-chain read decorative, which is indistinguishable from not doing it.
 *  3. Byte-vs-character memo length. `orderMemo` fills one bytes32 slot, so the
 *     limit is 32 UTF-8 BYTES; the old message said "1-31 characters", which
 *     was wrong in both directions and rejected a single-emoji memo that fits.
 *     Note what case 5 asserts and what it deliberately does not: a 36-byte
 *     emoji memo is rejected EITHER WAY, because `stringToHex(…, { size: 32 })`
 *     throws on its own. Measuring characters costs the diagnosis, not the
 *     rejection — viem answers `Size cannot exceed 32 bytes` and names no
 *     field, on a tool that takes four. So the assertion is on who caught it.
 *
 * NEGATIVE CONTROLS — measured 2026-09-26, revert the line and this suite goes
 * red by the stated count:
 *   a. `route.ts` `readTokenMeta(…)` → `Number(args.decimals ?? 6)` .. 12 ❌ (1,2,3)
 *   b. `route.ts` the `decimals mismatch` throw, disabled ............. 3 ❌ (3)
 *   c. `route.ts` the `isValidMemo(memo)` check, disabled ............. 2 ❌ (5)
 *   d. `encode.ts` `isValidMemo` byte length → `t.length` ............. 1 ❌ (5)
 *   e. `mcp-tools.ts` decimals doc → "Default 6 (USDC-style)" ........ 2 ❌ (8)
 *
 * Hermetic: `globalThis.fetch` is replaced for the whole run, so the `decimals()`
 * and `symbol()` reads are answered from the table below and no request — RPC,
 * KV metering or otherwise — leaves the process.
 */
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/mcp/route";
import { encodeFunctionData, parseUnits, stringToHex, encodeAbiParameters } from "viem";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✅ ${name}`); return; }
  failures++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

// ── the "chain" ─────────────────────────────────────────────────────────────
// Distinct addresses per token because `readTokenMeta` caches by chain+address
// for 5 minutes; reusing one address would serve case 1's answer to case 2 and
// the suite would pass without ever reading anything.
const TOKEN18 = "0xf895783b2931c919955e18b5e3343e7c7c456ba3"; // 18 decimals
const TOKEN6  = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // 6 decimals
const TOKEN8  = "0x1111111111111111111111111111111111111118"; // 8 decimals (a B20 share)

const DECIMALS: Record<string, number> = {
  [TOKEN18]: 18,
  [TOKEN6]:  6,
  [TOKEN8]:  8,
};
const SYMBOLS: Record<string, string> = {
  [TOKEN18]: "BLUE",
  [TOKEN6]:  "USDC",
  [TOKEN8]:  "NVDAc",
};

const SEL_DECIMALS = "0x313ce567"; // decimals()
const SEL_SYMBOL   = "0x95d89b41"; // symbol()

const realFetch = globalThis.fetch;

interface JsonRpcReq { id?: number; method?: string; params?: unknown[] }

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let rpc: JsonRpcReq | null = null;
  try { rpc = JSON.parse(String(init?.body ?? "")) as JsonRpcReq; } catch {}

  if (rpc?.method === "eth_call") {
    const call = (rpc.params?.[0] ?? {}) as { to?: string; data?: string };
    const to = (call.to ?? "").toLowerCase();
    const sel = (call.data ?? "").slice(0, 10);
    const dec = DECIMALS[to];
    if (dec === undefined) {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, error: { code: -32000, message: `no stub for token ${to}` } }), { status: 200 });
    }
    const result =
      sel === SEL_DECIMALS ? encodeAbiParameters([{ type: "uint8" }],  [dec]) :
      sel === SEL_SYMBOL   ? encodeAbiParameters([{ type: "string" }], [SYMBOLS[to]]) :
      null;
    if (result === null) {
      return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, error: { code: -32601, message: `unstubbed selector ${sel}` } }), { status: 200 });
    }
    return new Response(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  // Everything else — KV metering included — is unreachable. `recordCall` and
  // `rateLimit` both degrade silently, which is what makes this suite hermetic
  // even on a machine that happens to have Upstash credentials exported.
  return new Response(JSON.stringify({ error: "not stubbed in test" }), { status: 502 });
}) as typeof fetch;

// ── driving the real MCP dispatch ───────────────────────────────────────────
const TO = "0x02950ad38ada1d599375bd447e080cd404809205";

interface Called { text: string; isError: boolean; json: Record<string, unknown> | null }

async function callTool(args: Record<string, unknown>): Promise<Called> {
  const req = new NextRequest("https://blueagent.dev/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "tools/call",
      params: { name: "b20_encode_payment", arguments: args },
    }),
  });
  const res = await POST(req);
  const env = (await res.json()) as { result?: { content?: { text?: string }[]; isError?: boolean } };
  const text = env.result?.content?.[0]?.text ?? "";
  let json: Record<string, unknown> | null = null;
  try { json = JSON.parse(text) as Record<string, unknown>; } catch {}
  return { text, isError: env.result?.isError === true, json };
}

/** What the calldata MUST be, built here rather than read back from the tool. */
function expectedCalldata(to: string, amount: string, decimals: number, memo: string) {
  return encodeFunctionData({
    abi: [{
      type: "function", name: "transferWithMemo", stateMutability: "nonpayable",
      inputs: [{ name: "to", type: "address" }, { name: "amount", type: "uint256" }, { name: "memo", type: "bytes32" }],
      outputs: [{ name: "", type: "bool" }],
    }],
    functionName: "transferWithMemo",
    args: [to as `0x${string}`, parseUnits(amount, decimals), stringToHex(memo, { size: 32 })],
  });
}

(async () => {
  console.log("b20_encode_payment decimals suite\n");

  // ── 1. 18-decimal token, `decimals` omitted ──────────────────────────────
  console.log("1. an 18-decimal token with no `decimals` argument");
  {
    const { isError, json } = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: "ord-1" });
    const meta = (json?.meta ?? {}) as Record<string, unknown>;
    check("succeeds", !isError && json !== null);
    check("reads 18 from the token, not the old default of 6", meta.decimals === 18, JSON.stringify(meta.decimals));
    check("says where the number came from", meta.decimalsSource === "onchain", String(meta.decimalsSource));
    check("carries the token's symbol", meta.symbol === "BLUE", String(meta.symbol));
    check("amountWei is 1e18", meta.amountWei === "1000000000000000000", String(meta.amountWei));
    check("calldata encodes 1e18", json?.data === expectedCalldata(TO, "1", 18, "ord-1"), String(json?.data));
    // The whole point: the bug produced valid calldata for the wrong amount.
    check("calldata is NOT the 1e6 the old default produced",
      json?.data !== expectedCalldata(TO, "1", 6, "ord-1"));
    check("targets the token contract on Base", json?.to === TOKEN18 && json?.chainId === 8453);
  }

  // ── 2. a 6-decimal and an 8-decimal token, same request shape ────────────
  // Hardcoding 18 would pass case 1 and fail here, which is why both exist.
  console.log("\n2. the same call against 6- and 8-decimal tokens");
  {
    const six = await callTool({ tokenAddress: TOKEN6, to: TO, amount: "1", memo: "ord-2" });
    const m6 = (six.json?.meta ?? {}) as Record<string, unknown>;
    check("USDC reads 6", m6.decimals === 6, JSON.stringify(m6.decimals));
    check("USDC amountWei is 1e6", m6.amountWei === "1000000", String(m6.amountWei));
    check("USDC calldata encodes 1e6", six.json?.data === expectedCalldata(TO, "1", 6, "ord-2"));

    const eight = await callTool({ tokenAddress: TOKEN8, to: TO, amount: "2.5", memo: "ord-3" });
    const m8 = (eight.json?.meta ?? {}) as Record<string, unknown>;
    check("a B20 share reads 8", m8.decimals === 8, JSON.stringify(m8.decimals));
    check("2.5 shares is 250000000 base units", m8.amountWei === "250000000", String(m8.amountWei));
    check("share calldata encodes at 8 decimals", eight.json?.data === expectedCalldata(TO, "2.5", 8, "ord-3"));
  }

  // ── 3. a caller-supplied `decimals` that disagrees with the chain ────────
  console.log("\n3. caller passes decimals: 6 for an 18-decimal token");
  {
    const { isError, text, json } = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: "ord-4", decimals: 6 });
    check("refuses rather than picking a side", isError, text.slice(0, 120));
    check("returns no calldata at all", json === null || json.data === undefined);
    check("names the disagreement", /decimals mismatch/i.test(text), text.slice(0, 160));
    check("quotes both numbers", text.includes("6") && text.includes("18"), text.slice(0, 160));
    check("names the token", text.includes("BLUE"), text.slice(0, 160));
  }

  // ── 4. a caller-supplied `decimals` that agrees ──────────────────────────
  console.log("\n4. caller passes the correct decimals");
  {
    const { isError, json } = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: "ord-5", decimals: 18 });
    check("accepted", !isError && json !== null);
    check("still sourced from the chain, not from the argument",
      ((json?.meta ?? {}) as Record<string, unknown>).decimalsSource === "onchain");
    check("encodes 1e18", json?.data === expectedCalldata(TO, "1", 18, "ord-5"));
  }

  // ── 5. the memo fills one bytes32 slot — 32 BYTES, not 32 characters ─────
  console.log("\n5. memo length is measured in UTF-8 bytes");
  {
    const tooLong = "x".repeat(33);
    const a = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: tooLong });
    check("33 bytes is rejected", a.isError, a.text.slice(0, 120));
    check("the rejection says BYTES, not characters", /byte/i.test(a.text), a.text.slice(0, 160));

    const b = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: "x".repeat(32) });
    check("exactly 32 bytes is accepted", !b.isError, b.text.slice(0, 120));

    // 9 four-byte emoji = 36 bytes but only 18 JS chars, so a `.length` check
    // waves it through. It still fails — `stringToHex(…, { size: 32 })` throws
    // — which is why "is it rejected?" is the WRONG assertion here: it passes
    // either way. What a character count actually costs is the diagnosis. viem
    // reports `Size cannot exceed 32 bytes. Given size: 36 bytes.` plus a
    // version banner, naming no field at all, and this tool takes four inputs.
    // So the assertion is that OUR validator caught it and said which one.
    const c = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: "🔵".repeat(9) });
    check("9 emoji (36 bytes) is rejected even though it is 18 JS chars", c.isError, c.text.slice(0, 120));
    check("and it is our validator, naming the memo, not a viem stack trace",
      /memo/i.test(c.text) && !/viem@/.test(c.text), c.text.replace(/\n/g, " ").slice(0, 160));

    const d = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: "🔵".repeat(8) });
    check("8 emoji (exactly 32 bytes) is accepted", !d.isError, d.text.slice(0, 120));

    const e = await callTool({ tokenAddress: TOKEN18, to: TO, amount: "1", memo: "" });
    check("an empty memo is rejected — the slot is what reconciles the payment", e.isError);
  }

  // ── 6. amounts are whole units, never base units ─────────────────────────
  // An agent that has already done the 10^n math itself is the failure this
  // guards: passing wei here would be silently re-scaled by another 10^18.
  console.log("\n6. amount must be a positive decimal in whole units");
  {
    for (const bad of ["1000000000000000000000000000000000000", "1e18", "-1", "0", "abc", ""]) {
      const { isError } = await callTool({ tokenAddress: TOKEN18, to: TO, amount: bad, memo: "ord-6" });
      // The huge literal is a legal decimal, so it is accepted by design —
      // it is only "wrong" if the caller meant wei, which we cannot know.
      if (bad.startsWith("1000000")) { check(`"${bad.slice(0, 12)}…" is a legal amount`, !isError); continue; }
      check(`"${bad}" is rejected`, isError, `accepted`);
    }
  }

  // ── 7. address validation ────────────────────────────────────────────────
  console.log("\n7. both addresses are validated before anything is read");
  {
    const a = await callTool({ tokenAddress: "not-an-address", to: TO, amount: "1", memo: "ord-7" });
    check("a bad tokenAddress is rejected", a.isError && /tokenAddress/.test(a.text), a.text.slice(0, 120));
    const b = await callTool({ tokenAddress: TOKEN18, to: "0x123", amount: "1", memo: "ord-7" });
    check("a bad recipient is rejected", b.isError && /\bto\b/.test(b.text), b.text.slice(0, 120));
  }

  // ── 8. the advertised schema is what an agent actually reads ─────────────
  // The manifest told callers "Default 6 (USDC-style). Pass the real value
  // when you know it." — an instruction to guess, on the one field where a
  // guess is a wrong transfer amount. Fixing the handler while leaving that
  // sentence up would keep producing the mismatch error it now throws.
  console.log("\n8. the tool's own schema does not invite a guess");
  {
    const { MCP_TOOLS } = await import("../src/lib/mcp-tools");
    const tool = MCP_TOOLS.find((t) => t.name === "b20_encode_payment");
    const props = (tool?.inputSchema?.properties ?? {}) as Record<string, { description?: string }>;
    const decimalsDoc = props.decimals?.description ?? "";
    const memoDoc = props.memo?.description ?? "";

    check("the tool is still advertised", tool !== undefined);
    check("decimals is not advertised as defaulting to anything",
      !/default\s*6|default\b/i.test(decimalsDoc), decimalsDoc);
    check("decimals says it is read from the chain",
      /on-chain|on chain/i.test(decimalsDoc), decimalsDoc);
    check("decimals is still optional in the schema",
      !(tool?.inputSchema?.required ?? []).includes("decimals"));
    check("memo is documented in bytes, not characters",
      /byte/i.test(memoDoc) && !/31/.test(memoDoc), memoDoc);
    check("the description no longer claims a 31-character cap",
      !/31 characters/i.test(tool?.description ?? ""), (tool?.description ?? "").slice(-90));
  }

  globalThis.fetch = realFetch;
  console.log(failures === 0 ? "\nPASS — the token decides its own decimals, and a disagreement is an error" : `\nFAIL — ${failures} assertion(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
