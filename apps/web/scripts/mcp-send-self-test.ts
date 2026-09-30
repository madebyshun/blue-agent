/**
 * mcp-send-self-test — blue_send_tx refuses a send from a wallet to itself
 * (plan §1 fix 5, 2026-09-30).
 *
 * On one chain that transfer moves nothing and still costs gas, and when an
 * agent builds it, two swapped fields are far likelier than an intent. The
 * refusal happens before any network I/O, so this needs no stubs beyond a
 * fetch that fails loudly if anything is attempted.
 */
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/mcp/route";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

let outbound = 0;
globalThis.fetch = (async () => {
  outbound++;
  return new Response(JSON.stringify({ error: "not stubbed in test" }), { status: 502 });
}) as typeof fetch;

async function send(args: Record<string, unknown>) {
  const res = await POST(new NextRequest("https://blueagent.dev/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "blue_send_tx", arguments: args } }),
  }));
  const env = (await res.json()) as { result?: { content?: { text?: string }[]; isError?: boolean } };
  return { text: env.result?.content?.[0]?.text ?? "", isError: env.result?.isError === true };
}

(async () => {
  const W = "0x1111111111111111111111111111111111111111";
  const before = outbound;
  const r = await send({ chain: "base", fromAddress: W, toAddress: W.toUpperCase().replace("0X", "0x"), token: "ETH", amount: "0.01" });
  check("a send from a wallet to itself is refused (any letter case)", r.isError && /same wallet/.test(r.text), r.text.slice(0, 140));
  check("…before any network request", outbound === before, `${outbound - before} request(s)`);
  console.log(failures === 0 ? "\nmcp-send-self-test: PASS" : `\nmcp-send-self-test: FAIL — ${failures}`);
  process.exit(failures === 0 ? 0 : 1);
})();
