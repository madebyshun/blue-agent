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

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const CREATOR_ADDRESS = "0x62b45ff0ff8620d36a48dd981614fd27fa52a8a2"; // Blue Hub deployer wallet (signs ERC-8257 registrations)

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

  if (!meta || !hasHandler || !meta.price || !meta.priceUSDC) {
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
    pricing: [
      {
        amount: String(meta.priceUSDC),
        asset: `eip155:8453/erc20:${USDC_BASE}`,
        recipient: `eip155:8453:${CREATOR_ADDRESS}`,
        protocol: "x402",
      },
    ],
    tags,
  };

  return NextResponse.json(manifest, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600",
    },
  });
}
