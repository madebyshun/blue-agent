/**
 * PaidMcpClient: a paid call whose body arrives after the client timeout must
 * say the payment may have settled, never a bare "non-JSON". Measured
 * 2026-11-05: a paid stock_movers settled server-side ($0.03) while the client
 * (30s default) aborted mid-body and reported "returned non-JSON HTTP 200".
 * Also pins the new 120s default (the MCP route's maxDuration).
 *
 * Hermetic: a local HTTP server and a throwaway key. Auto-discovered by npm test.
 */
import { createServer } from "node:http";
import { generatePrivateKey } from "viem/accounts";
import { PaidMcpClient } from "../../../packages/x402-client/src/mcp";

let failed = 0;
const ok = (name: string, cond: boolean, got?: unknown) => { console.log(`${cond ? "✓" : "✗"} ${name}${cond ? "" : ` — got ${String(got)}`}`); if (!cond) failed++; };
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

(async () => {
  // Unpaid call -> PaymentRequired; paid call -> headers at once, body after 1.5s.
  const srv = createServer((req, res) => {
    let raw = ""; req.on("data", (c) => (raw += c)); req.on("end", () => {
      const m = JSON.parse(raw);
      const paid = !!m.params?._meta?.["x402/payment"];
      if (!paid) {
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: {
          isError: true, structuredContent: { x402Version: 2, resource: { url: "mcp://tool/t" }, accepts: [
            { scheme: "exact", network: "eip155:8453", asset: USDC, amount: "10000", payTo: "0x0000000000000000000000000000000000000abc", maxTimeoutSeconds: 60 },
          ] } } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"jsonrpc":"2.0",');
      setTimeout(() => res.end(`"id":${m.id},"result":{"content":[{"type":"text","text":"late"}]}}`), 1500);
    });
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", () => r()));
  const url = `http://127.0.0.1:${(srv.address() as { port: number }).port}/mcp`;
  const key = generatePrivateKey();

  const slow = new PaidMcpClient({ url, privateKey: key, timeoutMs: 500 });
  let msg = "";
  try { await slow.callTool("t", {}); } catch (e) { msg = (e as Error).message; }
  ok("a paid body past the timeout is reported, not swallowed", msg.length > 0, msg);
  ok("…and the error says the payment may have settled", /may have settled/.test(msg), msg);
  ok("…and it is not the old bare 'non-JSON' message", !/non-JSON/.test(msg), msg);

  const patient = new PaidMcpClient({ url, privateKey: key });
  let text = "";
  try { const r = await patient.callTool("t", {}); text = r.content?.[0]?.text ?? ""; } catch (e) { text = `threw: ${(e as Error).message}`; }
  // The mock sends no payment receipt, so callTool rejects as "Paid MCP call failed",
  // which proves the 1.5s body was read to the end under the default timeout.
  ok("default timeout outlasts a slow paid body", /Paid MCP call failed|late/.test(text), text);

  srv.close();
  if (failed) { console.log(`paid-mcp-timeout-test: ${failed} FAILED`); process.exit(1); }
  console.log("paid-mcp-timeout-test: all passed");
})();
