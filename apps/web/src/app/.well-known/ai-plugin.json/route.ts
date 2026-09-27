/**
 * OpenAI Plugin Manifest — /.well-known/ai-plugin.json
 *
 * Standard format consumed by:
 *   - OpenAI / ChatGPT plugin loader
 *   - agentic.market
 *   - Claude, Cursor, and other AI agents that discover tools via this spec
 *   - Any agent following the OpenAI plugin discovery standard
 *
 * Points to /.well-known/openapi.json for the full per-tool API spec.
 */
import { NextResponse } from "next/server";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { HANDLERS } from "@/app/api/x402/_handlers";
import { X402_PAY_TO } from "@/lib/x402-payee";

export const runtime = "nodejs";
export const revalidate = 3600;

const BASE_URL = "https://blueagent.dev";

export async function GET() {
  const live = AGENT_TOOLS.filter(t => HANDLERS[t.id] && t.price);
  const liveCount = live.length;
  /**
   * 🔴 The count here was always right — this filter tests `t.price`, the
   * truthy string "$0.00", so free tools were never dropped. The COPY was
   * wrong, which is worse, because a number that is correct makes the sentence
   * around it look checked: `description_for_model` told every agent that
   * "Each tool is a paid API endpoint using the x402 micropayment protocol",
   * for all 115, including the six that answer 200 without payment.
   *
   * `description_for_model` is not marketing. It is the instruction an LLM
   * follows when it decides how to call us, and the six free tools are the
   * SAFETY checks — the ones it should reach for before it signs anything. Told
   * they are paid, an agent builds an EIP-3009 authorization for zero USDC and
   * (measured 2026-09-26) usually stops at the signature prompt instead.
   *
   * So the split is counted from the price, not asserted in a sentence.
   */
  const freeIds   = live.filter(t => (t.priceUSDC ?? -1) === 0).map(t => t.id);
  const paidCount = liveCount - freeIds.length;

  const manifest = {
    schema_version: "v1",
    name_for_human: "Blue Hub",
    name_for_model: "blue_hub",
    description_for_human: `${liveCount} AI tools for Base builders — ${paidCount} pay-per-use and ${freeIds.length} free: idea briefs, market fit, token signals, smart contract audit, pitch decks, and more. No API keys. Pay per call in USDC on Base via x402.`,
    description_for_model: `Blue Hub is a collection of ${liveCount} AI tools for Base blockchain builders and investors. ${paidCount} of them are paid API endpoints using the x402 micropayment protocol (USDC on Base mainnet, eip155:8453). To call a paid tool: (1) GET /api/x402/{tool} to receive payment requirements, (2) sign an EIP-3009 USDC TransferWithAuthorization, (3) POST with X-Payment header. The remaining ${freeIds.length} are FREE, priced $0.00: ${freeIds.join(", ")}. They never return 402 and never ask for a signature — POST them directly and do not build an authorization, there is nothing to sign and no transfer to make. Key tools: blue-idea ($0.05) for startup idea briefs, blue-build ($0.50) for architecture plans, blue-audit ($1.00) for smart contract security review, blue-raise ($0.20) for pitch narratives, token-pick-signal ($0.20) for asymmetric token setups on Base, market-fit ($0.25) for PMF scoring, ecosystem-digest ($0.20) for Base ecosystem intelligence. See the OpenAPI spec for all ${liveCount} tools with full input schemas; the free ones carry no x-x402 block.`,
    auth: {
      type: "none",
    },
    api: {
      type: "openapi",
      url: `${BASE_URL}/.well-known/openapi.json`,
      is_user_authenticated: false,
    },
    logo_url: `${BASE_URL}/icon.png`,
    contact_email: "contact@blueagent.dev",
    legal_info_url: BASE_URL,
    // x402 extension — non-standard but picked up by x402-aware agents
    "x-x402": {
      payTo:    X402_PAY_TO,
      network:  "eip155:8453",
      asset:    "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      catalog:  "https://agentic.market/services/blueagent-dev",
      tools:    liveCount,
      // `payTo` above applies to the paid tools only. An x402-aware agent that
      // reads this block and nothing else would otherwise assume all of them.
      paidTools: paidCount,
      freeTools: freeIds,
    },
  };

  return NextResponse.json(manifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600",
      "Content-Type": "application/json",
    },
  });
}
