/**
 * Self-hosted x402 endpoint (Base mainnet, Coinbase CDP facilitator).
 *
 *   no X-Payment  → 402 with our requirements (payTo = Blue Agent treasury 0x0295)
 *   X-Payment     → settle USDC via CDP (charges user → 0x0295) → run handler
 *
 * No Bankr dependency. Tool compute runs locally via the self-contained
 * handlers copied into _handlers/ (registry). Only tools in HANDLERS are live.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildRequirements, cdpVerify, cdpSettle } from "@/app/api/_lib/x402-cdp";
import { HANDLERS } from "@/app/api/x402/_handlers";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { wireSchema } from "@/lib/tool-wire-schema";
import { recordCall } from "@/lib/usage-daily";
import { kv } from "@/lib/kv";
import { declareBuilderCodeExtension } from "@x402/extensions/builder-code";
import { haltReason } from "@/lib/tool-halts";
import { PRICE_UNITS, unavailableAnswer, haltedAnswer, runInternalTool } from "@/lib/x402-internal-run";

const BUILDER_CODE_EXT = declareBuilderCodeExtension("bc_2ejr35xc");

export const runtime = "nodejs";
export const maxDuration = 120;

const INTERNAL_KEY = process.env.INTERNAL_SERVICE_KEY ?? "";

// tool id → price in USDC micro-units: PRICE_UNITS, from lib/x402-internal-run.ts
// (shared so the in-process runner refuses exactly the ids this route refuses).

/**
 * Build the Bazaar extension object for a tool.
 * Format confirmed from x402station.io (indexed in discovery/resources):
 *   - NO discoverable, NO routeTemplate, NO schema
 *   - Just info.input + info.output, matches exact CDP resource format
 */
function buildBazaarExtension(meta: typeof AGENT_TOOLS[number] | undefined) {
  // Example body: required fields get a placeholder, optionals get the value
  // the Hub sends (or "" when the caller supplies it).
  //
  // This is the WIRE shape, from wireSchema — NOT `meta.inputs`, which is the
  // /hub FORM. x402Body renames form keys for 17 of the 111 live tools, and
  // this object is the literal template a Bazaar agent copies into its POST,
  // so publishing the form here meant handing the caller a body the handler
  // destructures nothing out of. It would then pay full price for a run with
  // every field at its default. See lib/tool-wire-schema.ts for the
  // measurement and the probe that derives this.
  const bodyExample = meta
    ? Object.fromEntries(
        wireSchema(meta).fields.map(f => [
          f.name,
          f.required ? `<${f.name}>` : f.default ?? "",
        ]),
      )
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
      "builder-code": BUILDER_CODE_EXT,
    },
  };
}

// An id that cannot run: 404 UNKNOWN_TOOL_ID when it is in no catalog, 501
// TOOL_UNAVAILABLE when it is listed with no handler. Both bodies — and the
// measurement behind telling those two apart — live in unavailableAnswer() in
// lib/x402-internal-run.ts, so chat and MCP (which run tools in-process) and
// this door answer an unrunnable id identically. This adds only the CORS header.
function honestUnavailable(tool: string) {
  const { status, body } = unavailableAnswer(tool);
  return NextResponse.json(body, { status, headers: { "Access-Control-Allow-Origin": "*" } });
}

// A listed id that is paused (lib/tool-halts.ts). Answered BEFORE any payment
// requirement is issued and before the chat credit-debit path, so nothing is
// settled and no credit is debited. 501 with an explicit "do not retry" — see
// haltedAnswer() in lib/x402-internal-run.ts for the body.
function haltedResponse(tool: string, reason: string) {
  const { status, body } = haltedAnswer(tool, reason);
  return NextResponse.json(body, { status, headers: { "Access-Control-Allow-Origin": "*" } });
}

// GET with no X-Payment → 402 (Bazaar discovery + browser preview)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;
  const handler = HANDLERS[tool];
  const priceUnits = PRICE_UNITS.get(tool);

  // priceUnits may be 0 for genuinely-free tools (e.g. rh-rwa-verify @ $0.00).
  // Use explicit undefined check — `!priceUnits` incorrectly 503s free tools.
  if (!handler || priceUnits === undefined) {
    return honestUnavailable(tool);
  }
  // A halted id must not advertise payment requirements either.
  const halt = haltReason(tool);
  if (halt) return haltedResponse(tool, halt);

  const meta = AGENT_TOOLS.find(t => t.id === tool);
  // Same reasoning as buildBazaarExtension: this is the schema an agent reads
  // in the 402 immediately BEFORE it decides to pay, so it has to be the wire
  // shape. `fields` is dropped — JSON Schema is what a caller consumes.
  const inputSchema = meta
    ? (({ fields: _fields, ...schema }) => schema)(wireSchema(meta))
    : undefined;

  // ── A $0.00 tool must not answer the DISCOVERY verb with a bill either ────
  //
  // MEASURED 2026-09-27 against production: all six free ids answered 402 here
  // while POST answered 200 for the same id. The `priceUnits === 0` bypass in
  // `handle()` below was added to the POST path only, so GET went on quoting
  // `amount: "0"` — the exact defect the comment above that bypass describes as
  // fixed, on the verb an agent probes FIRST. It stayed green because
  // `x402-free-and-validation-test.ts` imports only `POST`; the suite enumerates
  // every free tool from the catalog but had no idea the route had two doors.
  //
  // GET remains the discovery verb: it answers with the descriptor and input
  // schema, never the tool's output. It just no longer claims a price. No
  // `accepts`, no `payment-required` header — there is nothing to accept and
  // nothing to settle, and an authorization for 0 buys neither side anything.
  if (priceUnits === 0) {
    return NextResponse.json(
      {
        x402Version: 2,
        free: true,
        price: "$0.00",
        hint: "Free — no payment, no wallet, no X-PAYMENT header. POST JSON to this URL to run it.",
        tool: meta ? {
          id: meta.id,
          name: meta.name,
          description: meta.description,
          price: meta.price,
          input: inputSchema,
        } : undefined,
      },
      { status: 200, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }

  const requirements = buildRequirements(String(priceUnits));
  const paymentRequired = buildPaymentRequired(tool, requirements, meta);

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

  // Guard: checked BEFORE internal bypass to prevent calling undefined handler.
  // priceUnits may be 0 for free tools (e.g. rh-rwa-verify @ $0.00) — must use
  // explicit undefined check, not `!priceUnits` which would 503 them.
  if (!handler || priceUnits === undefined) {
    return honestUnavailable(tool);
  }
  // Halted ids stop HERE: before payment verification, the internal bypass and
  // the chat credit-debit path below, so no caller is charged for them.
  const halt = haltReason(tool);
  if (halt) return haltedResponse(tool, halt);

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
  //
  // The branch itself is runInternalTool() in lib/x402-internal-run.ts — the
  // halt check, the ref'd Credit-debit path with its refund on a failed run,
  // the WALLET_REQUIRED guest guard and the free service bypass. Chat and MCP
  // call that function directly instead of fetching this URL (which pointed at
  // PRODUCTION from every preview); this branch stays for network callers that
  // hold the key (the Hood tool-caller's http mode, the semantic and p4 smokes)
  // and only translates headers in and HTTP out. The key check is HERE and not in the function,
  // because only here is the caller a stranger until proven otherwise.
  if (INTERNAL_KEY && xInternal === INTERNAL_KEY) {
    let body: Record<string, unknown> = {};
    try { body = await req.json(); } catch {}

    const r = await runInternalTool({
      tool,
      body,
      user:    xBlueUser,
      service: (req.headers.get("x-blue-service") ?? "") === "internal",
    });
    // X-Credits-Debited only on an answer the handler produced (or failed to),
    // never on a refusal — the shape this branch has always had.
    return NextResponse.json(r.body, {
      status: r.status,
      ...(r.creditsDebited !== undefined
        ? { headers: { "X-Credits-Debited": String(r.creditsDebited) } }
        : {}),
    });
  }

  // ── A tool priced at $0.00 must never ask anyone to sign anything ─────────
  //
  // `rh-rwa-verify` is $0.00 and its own description ends "Free — safety
  // checks should never be gated". It still answered 402 with `amount: "0"`,
  // because the 402 below is chosen by "is there an X-PAYMENT header" and
  // never consulted the price. So the free anti-scam check demanded a wallet
  // signature for zero USDC: the agents least able to pay — the ones checking
  // whether a token is a scam BEFORE their first transaction — were the ones
  // turned away, and an authorization for 0 buys nothing on either side.
  //
  // Handled before the `!xPayment` branch, not inside it, so that a free tool
  // called WITH a payment header is also just run rather than settled. There
  // is no amount to settle and `cdpSettle` should never see a zero.
  if (priceUnits === 0) {
    let freeBody: Record<string, unknown> = {};
    try { freeBody = await req.json(); } catch {}
    try {
      const innerReq = new Request(`https://blueagent.dev/api/x402/${tool}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(freeBody),
      });
      const resp = await handler(innerReq);
      const data = await resp.json().catch(() => ({}));
      await recordCall(tool, "x402", resp.ok ? "ok" : "err");
      return NextResponse.json(data, { status: resp.ok ? 200 : resp.status });
    } catch (e) {
      await recordCall(tool, "x402", "err");
      return NextResponse.json(
        { error: "Tool failed — this tool is free, you were not charged", message: (e as Error).message },
        { status: 502 }
      );
    }
  }

  // No payment → 402 with self-describing metadata (name, description, inputs)
  if (!xPayment) {
    const meta = AGENT_TOOLS.find(t => t.id === tool);

    // ── Reject a malformed call BEFORE quoting it a price ──────────────────
    //
    // Measured 2026-09-26: `rh-rwa-verify` takes `contract`; a call sending
    // `address` got a 402 anyway. The caller then signs, pays, and only THEN
    // reaches the handler that tells it the field name was wrong. Charging
    // for the round trip that discovers a typo is the wrong order of
    // operations — the schema is right here in `meta.inputs`, and it is the
    // same schema the 402 is about to advertise.
    //
    // Only fires on a NON-EMPTY body. An empty `{}` POST is how several
    // clients probe for price, and 400-ing that would break discovery: the
    // distinction is "asked us nothing" (quote it) vs "asked us something
    // malformed" (correct it).
    let probeBody: Record<string, unknown> = {};
    try { probeBody = await req.json(); } catch {}
    if (meta && Object.keys(probeBody).length > 0) {
      const missing = meta.inputs
        .filter(i => i.required)
        .map(i => i.key)
        .filter(k => {
          const v = probeBody[k];
          return v === undefined || v === null || (typeof v === "string" && v.trim() === "");
        });
      if (missing.length > 0) {
        const known = meta.inputs.map(i => i.key);
        const unknown = Object.keys(probeBody).filter(k => !known.includes(k));
        return NextResponse.json(
          {
            error: "Invalid input — you were not charged",
            code: "MISSING_REQUIRED_INPUT",
            tool,
            missing,
            ...(unknown.length ? { unrecognized: unknown } : {}),
            expected: meta.inputs.map(i => ({ key: i.key, required: !!i.required, label: i.label })),
            detail: `Fix the input and call again; a 402 quote is only issued for a well-formed request.`,
          },
          { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
        );
      }
    }

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
  const allExtensions = { bazaar: bazaarExt, "builder-code": BUILDER_CODE_EXT };
  const verify = await cdpVerify(paymentPayload, requirements, resourceInfo, allExtensions);
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
    // A verified payer got this far and the tool broke. No settlement happens,
    // so no counter would otherwise record it — and "paid demand that failed"
    // is the most expensive thing in this file to not know about.
    await recordCall(tool, "x402", "err");
    // Pass the handler's own body through rather than flattening it to a
    // string. The free and internal-bypass paths above already return it
    // verbatim, so collapsing it here would give one failure two different
    // shapes depending on how the caller paid — and the fail-loud handlers
    // put the diagnosis (`error:{source,code,message}`) and the explicit
    // nulls in that body precisely so a caller can act on them.
    return NextResponse.json(
      {
        ...data,
        charged: false,
        error: typeof data.error === "string" || data.error == null
          ? "Tool failed — you were not charged"
          : data.error,
        detail: typeof data.error === "string" ? data.error : `status ${resp.status}`,
      },
      { status: 502 }
    );
  }

  // 3. SETTLE (charge) only after a successful run
  // Forward Bazaar + builder-code extensions so CDP catalogs the call and appends
  // the ERC-8021 suffix with bc_2ejr35xc attribution to the settlement calldata.
  const settle = await cdpSettle(paymentPayload, requirements, resourceInfo, allExtensions);
  try { await kv.incr(`usage:${tool}`); } catch {}
  // Same call, recorded with its SURFACE and DAY. `usage:<tool>` above is shared
  // with the free MCP bypass and the Hub runner, so on its own it cannot say
  // whether a tool's runs were paid. See lib/usage-daily.ts.
  await recordCall(tool, "x402", "ok");
  // Real USDC settled on Base via Coinbase CDP. Two books, written together and
  // only when the settlement actually cleared:
  //
  //   1. the AGGREGATE meter for /stats — count + units + last tx, no wallet.
  //   2. the PAYER'S OWN receipt — the same settlement filed under the wallet
  //      that signed it, so /wallet can say which tool the money bought.
  //
  // (2) is the only place the join {payer, tool, tx} is ever written down. On
  // Base the transfer is just `0xUSER → 0x0295…, 0.05 USDC`; the tool id lives
  // in this request and used to be discarded here, which is why the wallet
  // timeline could not name a single payment the user had made. It records
  // WHAT was bought and nothing about the call: no inputs, no outputs, no
  // result. Both writes are best-effort — the USDC has already moved and the
  // caller already has their answer, so a KV hiccup must not fail the response.
  if (settle.ok) {
    const { recordSettlement } = await import("@/lib/x402-settlements");
    await recordSettlement(priceUnits, settle.tx);
    const { recordToolPayment, payerFromPayload } = await import("@/lib/wallet/spend-log");
    await recordToolPayment(payerFromPayload(paymentPayload), tool, priceUnits, settle.tx);
  }
  return NextResponse.json({ ...data, _settle: { ok: settle.ok, status: settle.status, tx: settle.tx } });
}
