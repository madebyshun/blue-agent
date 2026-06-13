/**
 * Self-hosted x402 endpoint (Base mainnet, Coinbase CDP facilitator).
 *
 *   no X-Payment  → 402 with our requirements (payTo = Club wallet 0xb058)
 *   X-Payment     → settle USDC via CDP (charges user → 0xb058) → run handler
 *
 * No Bankr dependency. Tool compute runs locally via the self-contained
 * handlers copied into _handlers/ (registry). Only tools in HANDLERS are live.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildRequirements, cdpVerify, cdpSettle } from "@/app/api/_lib/x402-cdp";
import { HANDLERS } from "@/app/api/x402/_handlers";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { kv } from "@/lib/kv";

export const runtime = "nodejs";
export const maxDuration = 120;

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

// tool id → price in USDC micro-units (6 decimals), parsed from "$0.20"
function priceToUnits(price?: string): number | null {
  if (!price) return null;
  const n = parseFloat(price.replace("$", "").trim());
  return Number.isNaN(n) ? null : Math.round(n * 1_000_000);
}
const PRICE_UNITS = new Map<string, number>(
  AGENT_TOOLS
    .map(t => [t.id, priceToUnits(t.price)] as const)
    .filter((e): e is readonly [string, number] => e[1] !== null)
);

/**
 * Build the Bazaar extension object for a tool.
 * Format confirmed from x402station.io (indexed in discovery/resources):
 *   - NO discoverable, NO routeTemplate, NO schema
 *   - Just info.input + info.output, matches exact CDP resource format
 */
function buildBazaarExtension(meta: typeof AGENT_TOOLS[number] | undefined) {
  // Example body: required inputs get placeholder, optionals get empty string
  const bodyExample = meta
    ? Object.fromEntries(meta.inputs.map(i => [i.key, i.required ? `<${i.key}>` : ""]))
    : {};

  return {
    info: {
      input: {
        type: "http",
        method: "POST",
        bodyType: "json",
        body: bodyExample,
      },
      output: {
        example: {
          tool: meta?.id ?? "tool",
          result: "AI-generated analysis",
          _settle: { ok: true, status: 200, tx: "0x..." },
        },
      },
    },
  };
}

/** Build the full payment-required payload (used in header + body) */
function buildPaymentRequired(
  tool: string,
  requirements: ReturnType<typeof buildRequirements>,
  meta: typeof AGENT_TOOLS[number] | undefined,
) {
  const endpointUrl = `https://blueagent.dev/api/x402/${tool}`;
  return {
    x402Version: 2,
    accepts: [requirements],
    resource: {
      url: endpointUrl,
      description: meta?.description ?? `Blue Hub tool: ${tool}`,
      mimeType: "application/json",
      serviceName: "Blue Hub",
      tags: ["base", "ai", "defi", "agents"],
      iconUrl: "https://blueagent.dev/icon.png",
    },
    extensions: {
      bazaar: buildBazaarExtension(meta),
    },
  };
}

// GET with no X-Payment → 402 (Bazaar discovery + browser preview)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;
  const handler = HANDLERS[tool];
  const priceUnits = PRICE_UNITS.get(tool);

  if (!handler || !priceUnits) {
    return NextResponse.json({ error: "Tool not available", tool }, { status: 503 });
  }

  const requirements = buildRequirements(String(priceUnits));
  const meta = AGENT_TOOLS.find(t => t.id === tool);
  const paymentRequired = buildPaymentRequired(tool, requirements, meta);
  const inputSchema = meta ? {
    type: "object",
    properties: Object.fromEntries(meta.inputs.map(i => [i.key, { type: "string", description: i.label }])),
    required: meta.inputs.filter(i => i.required).map(i => i.key),
  } : undefined;

  const paymentRequiredHeader = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
  return NextResponse.json(
    {
      x402Version: 2,
      error: "Payment Required",
      resource: paymentRequired.resource,
      accepts: [requirements],
      tool: meta ? {
        id: meta.id,
        name: meta.name,
        description: meta.description,
        price: meta.price,
        input: inputSchema,
      } : undefined,
    },
    {
      status: 402,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "payment-required": paymentRequiredHeader,
      },
    }
  );
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  try {
    return await handle(req, params);
  } catch (e) {
    return NextResponse.json(
      { error: "Route crashed", message: (e as Error).message, stack: (e as Error).stack?.slice(0, 400) },
      { status: 500 }
    );
  }
}

async function handle(
  req: NextRequest,
  params: Promise<{ tool: string }>
): Promise<NextResponse> {
  const { tool } = await params;
  const handler = HANDLERS[tool];
  const priceUnits = PRICE_UNITS.get(tool);

  // Guard: checked BEFORE internal bypass to prevent calling undefined handler
  if (!handler || !priceUnits) {
    return NextResponse.json(
      { error: "Tool not available", tool },
      { status: 503 }
    );
  }

  const requirements = buildRequirements(String(priceUnits));
  const xPayment    = req.headers.get("x-payment") ?? req.headers.get("X-Payment");
  const xInternal   = req.headers.get("x-blue-internal") ?? req.headers.get("X-Blue-Internal");
  // X-Blue-User pairs with X-Blue-Internal to flip the bypass from
  // free-for-server into "debit the user's credit ledger". This is how
  // chat-originated tool calls now bill the user instead of the dev's
  // pocket. Must be a checksum-or-lowercase 0x address.
  const xBlueUser   = req.headers.get("x-blue-user") ?? req.headers.get("X-Blue-User");

  // ── Internal bypass — skip x402 payment for server-to-server calls ────────
  // Two flavours depending on whether X-Blue-User is provided:
  //   no user  → free bypass (server jobs, cron, internal callers)
  //   w/ user  → debit credits from that user's ledger; on insufficient
  //              balance return 402 INSUFFICIENT_CREDITS so the chat UI
  //              can surface a top-up CTA.
  if (INTERNAL_KEY && xInternal === INTERNAL_KEY) {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch {}

    // Credit-debit path (chat user calling a tool). Tracks the actually-
    // debited amount so we can echo it back in an X-Credits-Debited header
    // — the chat backend reads that header to populate the in-message
    // credit chip with the real spend, not just the chat-message cost.
    let creditsDebited = 0;
    if (xBlueUser && /^0x[a-fA-F0-9]{40}$/.test(xBlueUser)) {
      const { fetchBlueBalance, getTierInfo } = await import("@/lib/credits");
      const { toolCreditCost }                = await import("@/lib/credit-pricing");
      const { spend }                         = await import("@/lib/credit-ledger");

      const blueBalance = await fetchBlueBalance(xBlueUser);
      const holderTier  = getTierInfo(blueBalance);
      const cost        = toolCreditCost(tool, holderTier);

      if (cost > 0) {
        try {
          await spend(xBlueUser, cost, `tool:${tool}`);
          creditsDebited = cost;
        } catch (e) {
          const err = e as Error & { code?: string };
          if (err.code === "INSUFFICIENT_CREDITS") {
            return NextResponse.json(
              {
                error:  "Insufficient credits to call this tool",
                code:   "INSUFFICIENT_CREDITS",
                tool,
                needed: cost,
                hint:   "Top up credits or stake more BLUE for a bigger daily accrual.",
              },
              { status: 402 },
            );
          }
          // Non-payment error during spend — log + degrade to free bypass
          // rather than block the chat experience.
          console.error("[x402] credit debit failed:", err.message);
        }
      }
    } else {
      // No user attached → free utility tools ($0) still run for anyone, but
      // PAID tools require a connected wallet. Closes the guest free-tool
      // loophole; cron supplies CRON_WALLET so it bills through the path above.
      const { toolCreditCostFor } = await import("@/lib/credit-pricing");
      if (toolCreditCostFor(tool, 0) > 0) {
        return NextResponse.json(
          { error: "This tool requires a connected wallet.", code: "WALLET_REQUIRED", tool },
          { status: 402 },
        );
      }
    }

    const innerReq = new Request(`https://blueagent.dev/api/x402/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    try {
      const resp = await handler(innerReq);
      const data = await resp.json().catch(() => ({}));
      return NextResponse.json(data, {
        status:  resp.ok ? 200 : resp.status,
        headers: { "X-Credits-Debited": String(creditsDebited) },
      });
    } catch (e) {
      return NextResponse.json(
        { error: "Tool failed", message: (e as Error).message },
        { status: 502 }
      );
    }
  }

  // No payment → 402 with self-describing metadata (name, description, inputs)
  if (!xPayment) {
    const meta = AGENT_TOOLS.find(t => t.id === tool);
    const paymentRequired = buildPaymentRequired(tool, requirements, meta);
    const inputSchema = meta ? {
      type: "object",
      properties: Object.fromEntries(meta.inputs.map(i => [i.key, { type: "string", description: i.label }])),
      required: meta.inputs.filter(i => i.required).map(i => i.key),
    } : undefined;
    const paymentRequiredHeader = Buffer.from(JSON.stringify(paymentRequired)).toString("base64");
    return NextResponse.json(
      {
        x402Version: 2,
        error: "Payment Required",
        resource: paymentRequired.resource,
        accepts: [requirements],
        tool: meta ? {
          id: meta.id,
          name: meta.name,
          description: meta.description,
          price: meta.price,
          input: inputSchema,
        } : undefined,
      },
      {
        status: 402,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "payment-required": paymentRequiredHeader,
        },
      }
    );
  }

  // Decode payment
  let paymentPayload: unknown;
  try {
    paymentPayload = JSON.parse(Buffer.from(xPayment, "base64").toString("utf-8"));
  } catch {
    return NextResponse.json({ error: "Invalid X-Payment header" }, { status: 400 });
  }

  // Read tool params
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch {}

  // 1. VERIFY the payment is valid (signature + funds) — no charge yet
  // Pass resource + Bazaar extension so CDP catalogs this service in its discovery index.
  // resource.url uses :tool template → all 35 tools share one catalog entry on agentic.market.
  const meta = AGENT_TOOLS.find(t => t.id === tool);
  const bazaarExt = buildBazaarExtension(meta);
  const resourceInfo = {
    url: `https://blueagent.dev/api/x402/${tool}`,
    description: meta?.description ?? `Blue Hub tool: ${tool}`,
    mimeType: "application/json",
    serviceName: "Blue Hub",
    tags: ["base", "ai", "defi", "agents", "builder"],
    iconUrl: "https://blueagent.dev/icon.png",
  };
  const verify = await cdpVerify(paymentPayload, requirements, resourceInfo, { bazaar: bazaarExt });
  if (!verify.ok) {
    return NextResponse.json(
      { error: "Payment verification failed", status: verify.status, detail: verify.detail },
      { status: 402 }
    );
  }

  // 2. RUN the tool handler (self-contained Request → Response)
  let data: Record<string, unknown>;
  let resp: Response;
  try {
    const innerReq = new Request(`https://blueagent.dev/api/x402/${tool}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    resp = await handler(innerReq);
    data = await resp.json().catch(() => ({}));
  } catch (e) {
    // Tool crashed — user is NOT charged (we never settled)
    return NextResponse.json(
      { error: "Tool failed — you were not charged", message: (e as Error).message },
      { status: 502 }
    );
  }

  // If the handler itself returned an error, do NOT charge
  if (!resp.ok || (typeof data.error === "string")) {
    return NextResponse.json(
      { error: "Tool failed — you were not charged", detail: data.error ?? `status ${resp.status}` },
      { status: 502 }
    );
  }

  // 3. SETTLE (charge) only after a successful run
  // Forward Bazaar extension so CDP can catalog via the settle call
  // (the official x402 middleware sends extensions at settle time via processSettlement)
  const settle = await cdpSettle(paymentPayload, requirements, resourceInfo, { bazaar: bazaarExt });
  try { await kv.incr(`usage:${tool}`); } catch {}
  return NextResponse.json({ ...data, _settle: { ok: settle.ok, status: settle.status, tx: settle.tx } });
}
