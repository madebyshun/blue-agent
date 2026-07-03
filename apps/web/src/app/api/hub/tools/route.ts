/**
 * /api/hub/tools — Builder Registry
 *
 * GET  → list all registered tools (community-submitted)
 * POST → submit a new tool (requires SIWE signature)
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import {
  listRegisteredTools,
  getRegisteredTool,
  putTool,
  isValidSlug,
  siweMessage,
  probeEndpoint,
  sanitizeLogoUrl,
  type RegisteredTool,
} from "@/lib/hub-registry";

export const runtime = "nodejs";

// ─── GET — list ───────────────────────────────────────────────────────────────

export async function GET() {
  const tools = await listRegisteredTools();
  return NextResponse.json({ tools, count: tools.length }, {
    headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
  });
}

// ─── POST — submit ────────────────────────────────────────────────────────────

interface SubmitBody {
  id:             string;
  name:           string;
  description:    string;
  category:       string;
  endpoint:       string;
  inputs:         { key: string; label: string; placeholder: string; required?: boolean }[];
  price:          string;
  priceUSDC:      number;
  builderAddress: `0x${string}`;
  signature:      `0x${string}`;
  nonce:          string;
  agentName?:     string;
  iconUrl?:       string;
  logoUrl?:       string;
  tags?:          string[];
}

export async function POST(req: NextRequest) {
  // Rate limit: 5 submits per identifier per minute
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let body: SubmitBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── 1. Field validation ───────────────────────────────────────────────────
  const required: (keyof SubmitBody)[] = [
    "id", "name", "description", "category", "endpoint", "inputs",
    "price", "priceUSDC", "builderAddress", "signature", "nonce",
  ];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || body[k] === "") {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  if (!isValidSlug(body.id)) {
    return NextResponse.json({
      error: "Invalid id — must be lowercase letters, digits, hyphens; 3–41 chars; starts with a letter.",
    }, { status: 400 });
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(body.builderAddress)) {
    return NextResponse.json({ error: "Invalid builderAddress" }, { status: 400 });
  }

  try { new URL(body.endpoint); }
  catch { return NextResponse.json({ error: "Invalid endpoint URL" }, { status: 400 }); }

  if (!body.endpoint.startsWith("https://")) {
    return NextResponse.json({ error: "Endpoint must use https://" }, { status: 400 });
  }

  if (typeof body.priceUSDC !== "number" || body.priceUSDC < 0 || body.priceUSDC > 100_000_000) {
    return NextResponse.json({ error: "priceUSDC must be 0..100000000 (cap: $100)" }, { status: 400 });
  }

  if (!Array.isArray(body.inputs) || body.inputs.length === 0 || body.inputs.length > 12) {
    return NextResponse.json({ error: "inputs must be a 1..12 array" }, { status: 400 });
  }

  // ── 2. Uniqueness ─────────────────────────────────────────────────────────
  const existing = await getRegisteredTool(body.id);
  if (existing) {
    return NextResponse.json({ error: `Tool id "${body.id}" already registered.` }, { status: 409 });
  }

  // ── 3. SIWE signature ─────────────────────────────────────────────────────
  const message = siweMessage(body, body.nonce);
  let valid = false;
  try {
    valid = await verifyMessage({
      address:   body.builderAddress,
      message,
      signature: body.signature,
    });
  } catch (e) {
    return NextResponse.json({ error: `Signature verification failed: ${(e as Error).message}` }, { status: 400 });
  }
  if (!valid) {
    return NextResponse.json({ error: "Invalid signature — does not match builderAddress." }, { status: 401 });
  }

  // ── 4. Endpoint probe (lenient — don't block on failure, but report) ──────
  const probe = await probeEndpoint(body.endpoint);

  // ── 5. Save ───────────────────────────────────────────────────────────────
  const tool: RegisteredTool = {
    id:             body.id,
    name:           body.name.trim().slice(0, 80),
    description:    body.description.trim().slice(0, 280),
    category:       body.category.trim().slice(0, 40),
    endpoint:       body.endpoint,
    inputs:         body.inputs.map(i => ({
      key:         i.key.slice(0, 32),
      label:       i.label.slice(0, 60),
      placeholder: (i.placeholder ?? "").slice(0, 120),
      required:    !!i.required,
    })),
    price:          body.price.slice(0, 16),
    priceUSDC:      body.priceUSDC,
    builderAddress: body.builderAddress.toLowerCase() as `0x${string}`,
    submittedAt:    Date.now(),
    signature:      body.signature,
    verified:       false,                                  // Blue Agent manual review
    aiReady:        probe.aiReady,
    agentName:      body.agentName?.slice(0, 40),
    iconUrl:        body.iconUrl?.slice(0, 200),
    logoUrl:        sanitizeLogoUrl(body.logoUrl),
    tags:           body.tags?.slice(0, 8).map(t => t.slice(0, 20)),
  };

  await putTool(tool);

  return NextResponse.json({ ok: true, tool, probe }, { status: 201 });
}
