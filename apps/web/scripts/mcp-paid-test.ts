/**
 * mcp-paid-test — Blue Agent MCP v2 (2026-10-22): the manifest, the x402 MCP
 * payment transport for the five paid tools (lib/mcp-paid.ts), and the v1
 * names kept as aliases. Calls the real route's POST in-process.
 *
 * Hermetic for the paths it asserts: unpaid calls and bad input never reach
 * the network, and a payment with no CDP credentials in the environment is
 * refused by cdpVerify before any request (the same refusal production gives a
 * forged payload, minus the round trip).
 */
import { NextRequest } from "next/server";
import { POST } from "../src/app/api/mcp/route";
import { MCP_TOOLS, MCP_LEGACY } from "../src/lib/mcp-tools";
import { MCP_PRICES, MCP_PAYMENT_META_KEY } from "../src/lib/mcp-paid";
import { X402_PAY_TO } from "../src/lib/x402-payee";
import { extractDiscoveryInfo } from "@x402/extensions/bazaar";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

type Result = { content?: { text: string }[]; isError?: boolean; structuredContent?: Record<string, unknown>; _meta?: Record<string, unknown> };
async function rpc(method: string, params: Record<string, unknown> = {}): Promise<Result & { tools?: { name: string }[] }> {
  const res = await POST(new NextRequest("https://blueagent.dev/api/mcp", {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }));
  const j = (await res.json()) as { result?: Result & { tools?: { name: string }[] } };
  return j.result ?? {};
}

(async () => {
  delete process.env.CDP_API_KEY_ID;
  delete process.env.CDP_API_KEY_SECRET;

  console.log("1. manifest");
  const listed = (await rpc("tools/list")).tools?.map((t) => t.name) ?? [];
  const expected = ["swap_prepare", "token_verdict", "stock_signal", "trending_safe", "wallet_risk", "token_price", "send_prepare", "bridge_prepare", "sign_check", "approvals_audit", "blue_registry", "blue_call", "blue_doctor"];
  ok("tools/list serves exactly the v2 set", JSON.stringify(listed) === JSON.stringify(expected), listed.join(","));
  ok("no tool name carries a dot (the Claude API rejects them)", MCP_TOOLS.every((t) => /^[a-zA-Z0-9_-]{1,64}$/.test(t.name)));
  ok("every paid tool is in the manifest, and says its price", Object.keys(MCP_PRICES).every((n) => MCP_TOOLS.find((t) => t.name === n)?.description.includes("PAID:")));
  ok("no free tool claims a price", MCP_TOOLS.filter((t) => !(t.name in MCP_PRICES)).every((t) => !t.description.includes("PAID:")));

  console.log("2. unpaid call → PaymentRequired as a tool result");
  const unpaid = await rpc("tools/call", { name: "stock_signal", arguments: { ticker: "NVDA" } });
  const pr = unpaid.structuredContent as { x402Version?: number; accepts?: Record<string, unknown>[]; resource?: { url?: string }; extensions?: Record<string, unknown> } | undefined;
  ok("isError + structuredContent", unpaid.isError === true && !!pr);
  ok("the same object is JSON in content[0].text", !!pr && unpaid.content?.[0]?.text === JSON.stringify(pr));
  ok("x402 v2, one Base USDC requirement at the table price", pr?.x402Version === 2 && pr?.accepts?.length === 1 && pr.accepts[0].amount === String(MCP_PRICES.stock_signal) && pr.accepts[0].network === "eip155:8453");
  ok("payTo is the one treasury every path pays", pr?.accepts?.[0]?.payTo === X402_PAY_TO);
  ok("resource names the tool", pr?.resource?.url === "mcp://tool/stock_signal");
  // CDP rejects the whole payload as schema-invalid past some length between
  // 500 and 823 characters (measured 2026-10-23 on stock_signal's description).
  ok("resource.description stays short enough for CDP (<= 300)", String((pr?.resource as { description?: string } | undefined)?.description ?? "").length <= 300);
  const disc = extractDiscoveryInfo(
    { x402Version: 2, resource: pr?.resource, extensions: pr?.extensions, accepted: pr?.accepts?.[0], payload: {} } as never,
    pr?.accepts?.[0] as never, true,
  ) as { discoveryInfo?: { input?: { type?: string; toolName?: string } } } | null;
  ok("the Bazaar MCP extension survives the facilitator's extractor", disc?.discoveryInfo?.input?.type === "mcp" && disc.discoveryInfo.input.toolName === "stock_signal");
  ok("trending_safe quotes $0.05", (await rpc("tools/call", { name: "trending_safe", arguments: {} })).structuredContent?.accepts !== undefined
    && ((await rpc("tools/call", { name: "trending_safe", arguments: {} })).structuredContent as { accepts: { amount: string }[] }).accepts[0].amount === "50000");

  console.log("3. bad input is refused BEFORE any price");
  const bad = await rpc("tools/call", { name: "token_verdict", arguments: { token: "PEPE", chain: "base" } });
  ok("a ticker is refused, with no PaymentRequired", bad.isError === true && !bad.structuredContent && /BAD_INPUT/.test(bad.content?.[0]?.text ?? ""));
  const noChain = await rpc("tools/call", { name: "swap_prepare", arguments: { fromAddress: X402_PAY_TO, tokenIn: "ETH", tokenOut: "ETH", amountIn: "1" } });
  ok("swap_prepare without a chain is refused, not quoted", noChain.isError === true && !noChain.structuredContent);

  console.log("4. a payment that does not verify is not run");
  const forged = await rpc("tools/call", { name: "wallet_risk", arguments: { address: X402_PAY_TO }, _meta: { [MCP_PAYMENT_META_KEY]: { x402Version: 2, payload: {} } } });
  ok("→ PaymentRequired again, with the failure stated", forged.isError === true && /verification failed/i.test(String((forged.structuredContent as { error?: string } | undefined)?.error ?? "")));

  console.log("5. v1 names");
  const arrow = await rpc("tools/call", { name: "hub_hood_arrow", arguments: { ticker: "NVDA" } });
  ok("hub_hood_arrow answers with where to go, not an error", arrow.isError !== true && /stock_signal/.test(arrow.content?.[0]?.text ?? ""));
  const legacyList = (await rpc("tools/list")).tools?.some((t) => t.name in MCP_LEGACY) ?? true;
  ok("no v1 name is listed", !legacyList);

  console.log(`\n${failures === 0 ? "mcp-paid-test: all passed" : `mcp-paid-test: ${failures} FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
