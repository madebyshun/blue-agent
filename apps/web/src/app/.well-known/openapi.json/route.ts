/**
 * Dynamic OpenAPI 3.1 spec for all Blue Hub x402 tools.
 *
 * GET /.well-known/openapi.json
 *
 * Consumed by:
 *   - OpenAI / GPT plugin loader (via ai-plugin.json → api.url)
 *   - agentic.market & other AI agent directories
 *   - Any agent that reads OpenAPI specs to discover callable tools
 *
 * Each live tool gets its own POST endpoint with:
 *   - Input schema from AGENT_TOOLS[].inputs
 *   - x-x402 extension: price, network, payTo, asset   (PAID tools only)
 *   - 200 response schema + 402 payment-required schema (402 on PAID tools only)
 *
 * 🔴 The free tools carry `priceUSDC: 0`, and every payment field here is
 * conditional on that being non-zero rather than on the tool being paid. See
 * the filter comment below for what that cost.
 */
import { NextResponse } from "next/server";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { HANDLERS } from "@/app/api/x402/_handlers";
import { X402_PAY_TO } from "@/lib/x402-payee";

export const runtime = "nodejs";
export const revalidate = 3600; // cache 1 hour

const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const PAY_TO    = X402_PAY_TO;
const BASE_URL  = "https://blueagent.dev";

/**
 * Dollars from USDC micro-units, EXACT — never rounded.
 *
 * This was `(priceUSDC / 1e6).toFixed(2)`, which published `b20-inspect` as
 * "$0.01" while the tool charges $0.005: double, in the one field a human
 * skims, sitting beside a machine field that carried the right units all along.
 * A description that disagrees with the amount actually quoted is the same bug
 * class as a manifest naming the wrong payee — smaller blast radius, identical
 * shape. Two decimals when that is exact, otherwise as many as the value needs.
 */
function usd(units: number): string {
  const d   = units / 1_000_000;
  const two = d.toFixed(2);
  return Math.abs(d - Number(two)) < 1e-9 ? two : String(d);
}

export async function GET() {
  /**
   * 🔴 This filter was `HANDLERS[t.id] && t.price && t.priceUSDC`, and
   * `priceUSDC` is in USDC MICRO-units, so a free tool holds `0` — falsy. The
   * six $0.00 tools were therefore absent from the spec that OpenAI's plugin
   * loader and the agent directories read, while `t.price` ("$0.00", a truthy
   * string) made the expression look like it was only testing for presence.
   *
   * That omission is the expensive direction. The six are the SAFETY checks and
   * our own track record — blue-doctor, hood-live, hood-track-record,
   * picks-check, rh-rwa-verify, rh-token-scan — the calls an agent should make
   * BEFORE it signs anything, and they were the only ones discovery could not
   * see. An agent reading this spec learned about 109 tools that all want money
   * and none of the ones that want nothing.
   *
   * Test against `undefined`, never for truth: `0` is a price, not an absence.
   */
  const liveTools = AGENT_TOOLS.filter(
    t => HANDLERS[t.id] && t.price && t.priceUSDC !== undefined,
  );
  const freeTools = liveTools.filter(t => t.priceUSDC === 0);
  const paidCount = liveTools.length - freeTools.length;

  // Build OpenAPI paths — one per tool
  const paths: Record<string, unknown> = {};

  for (const tool of liveTools) {
    const inputProps: Record<string, unknown> = {};
    const required: string[] = [];

    for (const input of tool.inputs) {
      inputProps[input.key] = {
        type: "string",
        description: input.label,
        ...(input.placeholder ? { example: input.placeholder } : {}),
      };
      if (input.required) required.push(input.key);
    }

    // A free tool must not be described as one that can answer 402, and must not
    // carry the `x-x402` extension at all: an x402-aware agent treats that block
    // as an instruction to build an EIP-3009 authorization, and the 2026-09-26
    // live pass recorded that most agents simply STOP when handed a signature
    // prompt for zero USDC. Advertising a payment path that does not exist is a
    // way to make a working free tool uncallable.
    const isFree    = tool.priceUSDC === 0;
    const priceUSDC = usd(tool.priceUSDC!);

    paths[`/api/x402/${tool.id}`] = {
      post: {
        operationId: tool.id.replace(/-/g, "_"),
        summary: tool.name,
        description: isFree
          ? `${tool.description}\n\n**Price:** FREE ($0.00) | **Network:** Base mainnet (eip155:8453)\n\nThis tool never returns 402 and never asks for a signature. POST it directly — do not build an \`X-Payment\` header, there is nothing to sign and no transfer to make.`
          : `${tool.description}\n\n**Price:** $${priceUSDC} USDC | **Network:** Base mainnet (eip155:8453)\n\nPayment via x402 — include \`X-Payment\` header (EIP-3009 USDC transfer). Returns 402 with payment requirements if no valid payment is provided.`,
        tags: [tool.category ?? "tools"],
        requestBody: {
          required: required.length > 0,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: inputProps,
                ...(required.length > 0 ? { required } : {}),
                additionalProperties: false,
              },
            },
          },
        },
        responses: {
          "200": {
            description: isFree
              ? "Tool result (no payment required)"
              : "Tool result (payment verified and settled)",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    result:   { type: "string", description: "AI-generated output" },
                    command:  { type: "string", description: "Tool name" },
                    ...(isFree ? {} : {
                      _settle: {
                        type: "object",
                        description: "x402 settlement receipt",
                        properties: {
                          ok:     { type: "boolean" },
                          status: { type: "integer" },
                          tx:     { type: "string", description: "On-chain tx hash (Base)" },
                        },
                      },
                    }),
                  },
                },
              },
            },
          },
          ...(isFree ? {} : {
            "402": {
              description: "Payment required — see x402 payment requirements in response body",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      x402Version: { type: "integer", example: 2 },
                      error:       { type: "string",  example: "Payment Required" },
                      accepts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            scheme:  { type: "string", example: "exact" },
                            network: { type: "string", example: "eip155:8453" },
                            asset:   { type: "string", example: USDC_BASE },
                            amount:  { type: "string", example: String(tool.priceUSDC) },
                            payTo:   { type: "string", example: PAY_TO },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          }),
        },
        // x402 payment extension — picked up by x402-aware agents. Omitted
        // entirely on free tools: its presence is what tells an agent to sign.
        ...(isFree ? {} : {
          "x-x402": {
            scheme:  "exact",
            network: "eip155:8453",
            asset:   USDC_BASE,
            amount:  String(tool.priceUSDC),
            payTo:   PAY_TO,
            maxTimeoutSeconds: 120,
          },
        }),
      },
    };
  }

  const spec = {
    openapi: "3.1.0",
    info: {
      title:       "Blue Hub",
      // Counted, never adjectival. "Each tool requires a micro-payment" was a
      // claim about all 115 rows hardcoded as a sentence, and it went false the
      // first time a free tool shipped with nothing comparing it to a price.
      description: `${liveTools.length} AI tools for Base builders and investors — ${paidCount} pay-per-use, ${freeTools.length} free. No API keys.\n\nThe ${paidCount} paid tools each require a micro-payment in USDC on Base mainnet via the x402 protocol.\n\nThe ${freeTools.length} free tools never return 402 and never ask for a signature — POST them directly, do not build an authorization: ${freeTools.map(t => `\`${t.id}\``).join(", ")}. They carry no \`x-x402\` block for the same reason.\n\n**Payment:** x402 v2 (EIP-3009 USDC on Base, eip155:8453)\n**payTo:** \`${PAY_TO}\`\n**Asset:** USDC \`${USDC_BASE}\``,
      version:     "1.0.0",
      contact: {
        name: "Blue Hub",
        url:  BASE_URL,
      },
      "x-logo": {
        url: `${BASE_URL}/icon.png`,
      },
    },
    externalDocs: {
      description: "Blue Hub on agentic.market",
      url: "https://agentic.market/services/blueagent-dev",
    },
    servers: [{ url: BASE_URL, description: "Blue Hub (Base mainnet)" }],
    paths,
    components: {
      schemas: {
        X402PaymentRequired: {
          type: "object",
          description: "x402 v2 Payment Required response",
          properties: {
            x402Version: { type: "integer", example: 2 },
            error:       { type: "string",  example: "Payment Required" },
            accepts: {
              type: "array",
              items: { type: "object" },
            },
          },
        },
      },
    },
    // x402 service-level metadata
    "x-x402-service": {
      name:        "Blue Hub",
      description: `${liveTools.length} AI tools for Base builders — ${paidCount} paid, ${freeTools.length} free`,
      payTo:       PAY_TO,
      // Named here too, because an x402-aware agent may read only this block and
      // would otherwise assume every path under `paths` wants a signature.
      freeTools:   freeTools.map(t => t.id),
      network:     "eip155:8453",
      asset:       USDC_BASE,
      catalogUrl:  "https://agentic.market/services/blueagent-dev",
    },
  };

  return NextResponse.json(spec, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, s-maxage=3600",
      "Content-Type": "application/json",
    },
  });
}
