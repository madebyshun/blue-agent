/**
 * ERC-8257 Tool Manifest endpoint
 *
 * Serves tool manifests at:
 *   GET /.well-known/ai-tool/{tool}.json
 *
 * Required by @opensea/tool-sdk for onchain registration via ToolRegistry
 * (0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1 on Base).
 *
 * Manifest type: https://eips.ethereum.org/EIPS/eip-XXXX#tool-manifest-v1
 */
import { NextRequest, NextResponse } from "next/server";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { HANDLERS } from "@/app/api/x402/_handlers";
import { X402_PAY_TO } from "@/lib/x402-payee";

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

/** Who REGISTERED the tool on ToolRegistry. Not who gets paid — see below. */
const CREATOR_ADDRESS = "0x62b45ff0ff8620d36a48dd981614fd27fa52a8a2"; // Blue Hub deployer wallet (signs ERC-8257 registrations)

/**
 * 🔴 `pricing[].recipient` MUST be the x402 payee, never `CREATOR_ADDRESS`.
 *
 * It was the creator until 2026-09-27, and that is a payment outage wearing a
 * 200. The endpoint's own 402 quotes `X402_PAY_TO`; the CDP facilitator settles
 * only when the signed `authorization.to` equals it. An agent that trusted this
 * manifest signed to the deployer wallet and got refused — in ITS logs, not
 * ours, because the Hub UI reads the constant and kept working. That is the
 * precise failure `lib/x402-payee.ts` was written to make impossible.
 *
 * It survived the sweep that exists to catch it because of how that sweep is
 * built: `x402-payee-check.ts` looks for the CORRECT literal turning up outside
 * its allowlist, so a file publishing a DIFFERENT hardcoded address is exactly
 * the shape it cannot see. Group 3b there is the inverse sweep: every 40-hex
 * literal in a published manifest must be a NAMED exception, whatever its
 * value. Two roles, two fields, two different addresses — keep them apart.
 */
const PAY_TO = X402_PAY_TO;

// Category → tags mapping
const CATEGORY_TAGS: Record<string, string[]> = {
  intelligence: ["base", "defi", "token", "trading"],
  security:     ["base", "security", "audit", "contract"],
  founder:      ["base", "founder", "builder", "startup"],
  investor:     ["base", "investor", "dd", "analysis"],
  agent:        ["base", "agent", "automation"],
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  // Next.js dynamic routes match "token-pick-signal.json" → tool = "token-pick-signal.json"
  const { tool: toolParam } = await params;
  const toolId = toolParam.replace(/\.json$/, "");

  const meta = AGENT_TOOLS.find(t => t.id === toolId);
  const hasHandler = !!HANDLERS[toolId];

  /**
   * 🔴 This was `!meta || !hasHandler || !meta.price || !meta.priceUSDC`, and
   * `priceUSDC` is USDC MICRO-units, so a free tool holds `0` — falsy. All six
   * $0.00 tools got `404 {"error":"Tool not found"}` from a manifest endpoint
   * for tools that exist, are registered, and answer 200 when POSTed.
   *
   * A 404 saying "not found" about something that IS found is worse than a bare
   * failure: the reader is a machine that will conclude the id is wrong and stop
   * asking. And the six are precisely blue-doctor, hood-live, hood-track-record,
   * picks-check, rh-rwa-verify and rh-token-scan — the safety checks and our own
   * track record. Discovery could see nothing that costs nothing.
   *
   * "Not found" now means not found. Price only decides what `pricing` says.
   */
  if (!meta || !hasHandler || !meta.price || meta.priceUSDC === undefined) {
    return NextResponse.json({ error: "Tool not found", tool: toolId }, { status: 404 });
  }

  const endpoint = `https://blueagent.dev/api/x402/${toolId}`;

  // Build input schema from meta.inputs
  const inputProperties: Record<string, { type: string; description: string }> = {};
  const required: string[] = [];
  for (const input of meta.inputs) {
    inputProperties[input.key] = { type: "string", description: input.label };
    if (input.required) required.push(input.key);
  }

  // Tags: base tags from category + generic blue-hub
  const tags = [
    "blue-hub",
    "blueagent",
    ...(CATEGORY_TAGS[meta.category] ?? ["base", "ai"]),
  ];

  const manifest = {
    type: "https://eips.ethereum.org/EIPS/eip-XXXX#tool-manifest-v1",
    name: toolId,
    description: meta.description,
    endpoint,
    inputs: {
      type: "object",
      properties: inputProperties,
      ...(required.length > 0 ? { required } : {}),
    },
    // outputs is required by @opensea/tool-sdk validation
    outputs: {
      result: { type: "string", description: "AI-generated output" },
      command: { type: "string", description: "Tool identifier" },
    },
    creatorAddress: CREATOR_ADDRESS,
    // A free tool gets an EMPTY pricing array, not a $0 x402 entry. An entry
    // naming a protocol, an asset and a recipient is an instruction to pay; one
    // that says to pay zero USDC to a real address is a contradiction an agent
    // resolves by signing anyway. No entries = nothing to settle, which is the
    // truth. `x402Free` states it positively for readers that treat an empty
    // array as "pricing unknown" rather than "pricing none".
    pricing: meta.priceUSDC === 0 ? [] : [
      {
        amount: String(meta.priceUSDC),
        asset: `eip155:8453/erc20:${USDC_BASE}`,
        recipient: `eip155:8453:${PAY_TO}`,
        protocol: "x402",
      },
    ],
    ...(meta.priceUSDC === 0 ? { x402Free: true } : {}),
    tags,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600",
    },
  });
}
