/**
 * `/api/x402/[tool]` — nobody signs for a free tool, and nobody is quoted a
 * price for a request that cannot succeed.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two findings from the 2026-09-26 live pass over the MCP/x402 surface:
 *
 *  1. `rh-rwa-verify` is priced `$0.00` and its own catalog description ends
 *     "Free — safety checks should never be gated". It answered 402 with
 *     `maxAmountRequired: "0"`. An agent that honours 402 therefore had to
 *     build, sign and submit an EIP-3009 authorization for ZERO USDC before it
 *     could run a safety check — a signature request, a wallet prompt and a
 *     CDP round-trip, to transfer nothing. Most agents simply stopped there.
 *
 *  2. A call carrying the WRONG input shape (`{address}` where the tool takes
 *     `{contract}`) was quoted a price anyway. The caller could pay in full and
 *     only then learn the request was malformed — and because settlement
 *     happens after a 2xx, a handler that 400s post-payment still costs the
 *     caller the round-trip while a handler that 200s with an error message
 *     costs them the money. Validating after quoting puts the cost of a typo
 *     on whoever made it last.
 *
 * WHAT WOULD ROT SILENTLY
 * -----------------------
 *  - `priceUnits === 0` is one `if`. Any refactor that folds the free case back
 *     into the generic "does this request carry X-Payment?" branch restores the
 *     402 and nothing fails to compile. Case 1 pins the status code AND the
 *     absence of the `payment-required` header, because a 200 that still ships
 *     the header would keep a compliant client paying.
 *  - The pre-quote validation must stay scoped to NON-EMPTY bodies. An empty
 *     `{}` POST is how every client — including the Hub's own UI — asks "what
 *     does this cost?", so validating it would turn price discovery into a 400
 *     for every paid tool in the catalog. Case 3 exists solely to stop a later
 *     tightening from breaking that, and it is the assertion most likely to be
 *     "fixed" by someone who has not read this paragraph.
 *
 * NEGATIVE CONTROLS — revert the line, this suite must go red:
 *   a. delete the `if (priceUnits === 0)` block ......................... case 1, 2
 *   b. drop the `Object.keys(probeBody).length > 0` condition ........... case 3
 *   c. delete the MISSING_REQUIRED_INPUT block .......................... case 4
 *
 * Hermetic: `globalThis.fetch` is stubbed, so a free tool that reaches its
 * handler fails there rather than calling out. That failure is still a pass —
 * what is being asserted is that the caller was never asked to sign.
 */
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/x402/[tool]/route";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✅ ${name}`); return; }
  failures++;
  console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
}

// Every outbound call fails. A free tool is allowed to fail in its handler;
// it is not allowed to demand payment first.
globalThis.fetch = (async () =>
  new Response(JSON.stringify({ error: "network disabled in test" }), { status: 502 })) as typeof fetch;

const ADDR = "0x8ff92566f2e81bdd68edfaa8cde73942a723796b";

async function call(tool: string, body: unknown) {
  const req = new NextRequest(`https://blueagent.dev/api/x402/${tool}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const res = await POST(req, { params: Promise.resolve({ tool }) });
  let parsed: Record<string, unknown> = {};
  try { parsed = (await res.clone().json()) as Record<string, unknown>; } catch {}
  return { status: res.status, body: parsed, paymentHeader: res.headers.get("payment-required") };
}

(async () => {
  console.log("x402 free-tool + pre-quote validation suite\n");

  // ── 1. A $0.00 tool with no inputs ───────────────────────────────────────
  console.log("1. picks-check ($0.00) called with no payment header");
  {
    const { status, paymentHeader, body } = await call("picks-check", {});
    check("does not answer 402", status !== 402, `got ${status}`);
    check("does not ship a payment-required header", paymentHeader === null, String(paymentHeader));
    check("does not quote an amount", body.accepts === undefined);
  }

  // ── 2. A $0.00 tool that takes inputs ────────────────────────────────────
  console.log("\n2. rh-rwa-verify ($0.00) called with its real input");
  {
    const { status, paymentHeader } = await call("rh-rwa-verify", { contract: ADDR });
    check("does not answer 402", status !== 402, `got ${status}`);
    check("does not ship a payment-required header", paymentHeader === null, String(paymentHeader));
  }

  // ── 3. Price discovery on a paid tool must still work ────────────────────
  console.log("\n3. wallet-risk ($0.15) probed with an empty body");
  {
    const { status, paymentHeader, body } = await call("wallet-risk", {});
    check("still answers 402 — this is how clients ask the price", status === 402, `got ${status}`);
    check("ships the payment-required header", typeof paymentHeader === "string" && paymentHeader.length > 0);
    check("quotes the tool", Array.isArray(body.accepts));
  }

  // ── 4. A malformed paid call is rejected before it is priced ─────────────
  console.log("\n4. wallet-risk called with the wrong field name");
  {
    const { status, body, paymentHeader } = await call("wallet-risk", { addr: ADDR });
    check("rejects with 400, not 402", status === 400, `got ${status}`);
    check("no price is quoted for a request that cannot succeed", paymentHeader === null);
    check("says why", body.code === "MISSING_REQUIRED_INPUT", String(body.code));
    check("names the missing field", Array.isArray(body.missing) && (body.missing as string[]).includes("address"), JSON.stringify(body.missing));
    check("names the field the caller sent instead", Array.isArray(body.unrecognized) && (body.unrecognized as string[]).includes("addr"), JSON.stringify(body.unrecognized));
    check("states the caller was not charged", typeof body.error === "string" && (body.error as string).includes("not charged"), String(body.error));
  }

  // ── 5. A well-formed paid call gets its quote ────────────────────────────
  console.log("\n5. wallet-risk called correctly, still unpaid");
  {
    const { status, paymentHeader } = await call("wallet-risk", { address: ADDR });
    check("answers 402 with a quote", status === 402, `got ${status}`);
    check("ships the payment-required header", typeof paymentHeader === "string" && paymentHeader.length > 0);
  }

  console.log(failures === 0 ? "\nPASS — free means free, and a quote implies a runnable request" : `\nFAIL — ${failures} assertion(s)`);
  process.exit(failures === 0 ? 0 : 1);
})();
