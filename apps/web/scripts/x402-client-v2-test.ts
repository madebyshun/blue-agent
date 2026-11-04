/**
 * packages/x402-client X402Client.call against a v2-only and a v1-only seller
 * (issue #446). Before: it read only X-Payment-Requirements and
 * accepts[0].maxAmountRequired, so a canonical v2 seller (PAYMENT-REQUIRED,
 * accepts[].amount, PAYMENT-SIGNATURE, PAYMENT-RESPONSE) failed before signing.
 *
 * Hermetic: two local HTTP servers, a throwaway key generated here (it holds
 * nothing and signs only for these mocks). Auto-discovered by `npm test`.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { generatePrivateKey } from "viem/accounts";
import { X402Client } from "../../../packages/x402-client/src/client";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO = "0x0000000000000000000000000000000000000abc";
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64");
let failed = 0;
const ok = (name: string, cond: boolean) => { console.log(`${cond ? "✓" : "✗"} ${name}`); if (!cond) failed++; };

function serve(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<{ url: string; close: () => void }> {
  return new Promise((resolve) => {
    const s = createServer(handler).listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      resolve({ url: `http://127.0.0.1:${port}/tool`, close: () => s.close() });
    });
  });
}

(async () => {
  const seen: Record<string, unknown> = {};

  // A canonical v2 seller: GET-only, PAYMENT-REQUIRED header, `amount`, reads PAYMENT-SIGNATURE only.
  const v2 = await serve((req, res) => {
    if (req.method !== "GET") { res.writeHead(405).end(); return; }
    const sig = req.headers["payment-signature"];
    if (!sig) {
      res.writeHead(402, { "PAYMENT-REQUIRED": b64({ x402Version: 2, resource: { url: "x" }, accepts: [
        { scheme: "exact", network: "eip155:1", asset: USDC, amount: "1", payTo: PAY_TO, maxTimeoutSeconds: 60 },
        { scheme: "exact", network: "eip155:8453", asset: USDC, amount: "20000", payTo: PAY_TO, maxTimeoutSeconds: 60, extra: { name: "USD Coin", version: "2" } },
      ] }) }).end("{}");
      return;
    }
    seen.v2 = JSON.parse(Buffer.from(String(sig), "base64").toString());
    res.writeHead(200, { "content-type": "application/json", "PAYMENT-RESPONSE": b64({ success: true, transaction: "0xv2tx" }) }).end('{"ok":true}');
  });

  // A v1 seller: requirements in the body only, `maxAmountRequired`, reads X-PAYMENT only.
  const v1 = await serve((req, res) => {
    const pay = req.headers["x-payment"];
    if (!pay) {
      res.writeHead(402, { "content-type": "application/json" }).end(JSON.stringify({ x402Version: 1, accepts: [
        { scheme: "exact", network: "base", asset: USDC, maxAmountRequired: "30000", payTo: PAY_TO },
      ] }));
      return;
    }
    seen.v1 = JSON.parse(Buffer.from(String(pay), "base64").toString());
    res.writeHead(200, { "content-type": "application/json", "X-Payment-Response": b64({ txHash: "0xv1tx" }) }).end('{"ok":true}');
  });

  const client = new X402Client({ privateKey: generatePrivateKey() });
  try {
    const r2 = await client.call(v2.url, { method: "GET" });
    const p2 = seen.v2 as { x402Version?: number; accepted?: { amount?: string; network?: string }; payload?: { authorization?: { value?: string; to?: string } } };
    ok("v2: pays a PAYMENT-REQUIRED-only seller", (r2.data as { ok?: boolean }).ok === true);
    ok("v2: picks the Base option, not accepts[0]", p2?.accepted?.network === "eip155:8453");
    ok("v2: signs `amount` (20000)", p2?.payload?.authorization?.value === "20000" && r2.amountPaid === "20000");
    ok("v2: payload is x402Version 2 with `accepted`", p2?.x402Version === 2 && !!p2.accepted);
    ok("v2: reads PAYMENT-RESPONSE.transaction", r2.txSettled === "0xv2tx");

    const r1 = await client.call(v1.url);
    const p1 = seen.v1 as { x402Version?: number; network?: string; payload?: { authorization?: { value?: string } } };
    ok("v1: pays a body-only, X-PAYMENT-only seller", (r1.data as { ok?: boolean }).ok === true);
    ok("v1: signs maxAmountRequired (30000)", p1?.payload?.authorization?.value === "30000" && r1.pricePaid === "$0.03");
    ok("v1: payload is x402Version 1", p1?.x402Version === 1);
    ok("v1: reads X-Payment-Response.txHash", r1.txSettled === "0xv1tx");

    const capped = new X402Client({ privateKey: generatePrivateKey(), maxPerCallAtomic: 10_000n });
    seen.v2 = undefined;
    let refused = "";
    try { await capped.call(v2.url, { method: "GET" }); } catch (e) { refused = (e as Error).message; }
    ok("cap: a 402 above maxPerCallAtomic is refused before signing", /nothing was paid/.test(refused) && seen.v2 === undefined);
  } finally { v2.close(); v1.close(); }

  if (failed) { console.error(`${failed} failed`); process.exit(1); }
  console.log("x402-client-v2-test: all passed");
})().catch((e) => { console.error(e); process.exit(1); });
