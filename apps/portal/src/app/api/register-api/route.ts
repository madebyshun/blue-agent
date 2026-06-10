/**
 * POST /api/register-api
 *
 * Builder registration endpoint. Validates the submitted manifest,
 * probes the endpoint, and persists to KV. Signature verification
 * (SIWE / personal_sign) lands once portal wires wagmi — for now we
 * accept submissions and record the wallet address; reviews remain
 * non-verified until on-chain signature + manual approval.
 */

import { NextRequest, NextResponse } from "next/server";
import { verifyMessage } from "viem";
import {
  putAPI,
  getRegisteredAPI,
  isValidSlug,
  isValidAddress,
  probeEndpoint,
  siweMessage,
  type RegisteredAPI,
} from "@/lib/registry";

export const runtime = "nodejs";

interface SubmitBody {
  id:             string;
  name:           string;
  provider:       string;
  description:    string;
  category:       string;
  endpoint:       string;
  inputs?:        { key: string; label: string; placeholder: string; required?: boolean }[];
  priceUSDC:      number;
  builderAddress: `0x${string}`;
  agentName?:     string;
  signature?:     `0x${string}`;
  nonce?:         string;
}

export async function POST(req: NextRequest) {
  let body: SubmitBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  // ── Validation ─────────────────────────────────────────────────────────────
  const required: (keyof SubmitBody)[] = [
    "id", "name", "provider", "description", "category", "endpoint",
    "priceUSDC", "builderAddress",
  ];
  for (const k of required) {
    if (body[k] === undefined || body[k] === null || body[k] === "") {
      return NextResponse.json({ error: `Missing field: ${k}` }, { status: 400 });
    }
  }

  if (!isValidSlug(body.id)) {
    return NextResponse.json({
      error: "Invalid id — lowercase letters, digits, hyphens; 3–41 chars; starts with a letter.",
    }, { status: 400 });
  }

  if (!isValidAddress(body.builderAddress)) {
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

  // ── Uniqueness ────────────────────────────────────────────────────────────
  const existing = await getRegisteredAPI(body.id);
  if (existing) {
    return NextResponse.json({ error: `id "${body.id}" already registered.` }, { status: 409 });
  }

  // ── SIWE signature ─────────────────────────────────────────────────────────
  // If a signature is supplied it MUST verify against builderAddress (rejects
  // spoofed wallets). Once the portal wires wagmi, make this mandatory by
  // requiring body.signature + body.nonce up front. Until then, unsigned
  // submissions are still accepted but stay verified:false (manual review),
  // and a present-but-invalid signature is always rejected.
  let signed = false;
  if (body.signature) {
    if (!body.nonce) {
      return NextResponse.json({ error: "nonce is required when a signature is provided." }, { status: 400 });
    }
    const message = siweMessage(body, body.nonce);
    let valid = false;
    try {
      valid = await verifyMessage({ address: body.builderAddress, message, signature: body.signature });
    } catch (e) {
      return NextResponse.json({ error: `Signature verification failed: ${(e as Error).message}` }, { status: 400 });
    }
    if (!valid) {
      return NextResponse.json({ error: "Invalid signature — does not match builderAddress." }, { status: 401 });
    }
    signed = true;
  }

  // ── Lenient probe (don't block on failure) ────────────────────────────────
  const probe = await probeEndpoint(body.endpoint);

  // ── Persist ───────────────────────────────────────────────────────────────
  const api: RegisteredAPI = {
    id:             body.id,
    name:           body.name.trim().slice(0, 80),
    provider:       body.provider.trim().slice(0, 40),
    description:    body.description.trim().slice(0, 280),
    category:       body.category.trim().slice(0, 40),
    endpoint:       body.endpoint,
    inputs:         (body.inputs ?? []).slice(0, 12).map(i => ({
      key:         i.key.slice(0, 32),
      label:       i.label.slice(0, 60),
      placeholder: (i.placeholder ?? "").slice(0, 120),
      required:    !!i.required,
    })),
    price:          `$${(body.priceUSDC / 1_000_000).toFixed(2)}`,
    priceUSDC:      body.priceUSDC,
    builderAddress: body.builderAddress.toLowerCase() as `0x${string}`,
    submittedAt:    Date.now(),
    signature:      body.signature,
    verified:       false,                            // manual review
    aiReady:        probe.aiReady,
    agentName:      body.agentName?.slice(0, 40),
  };

  await putAPI(api);

  return NextResponse.json({ ok: true, api, probe, signed }, {
    status:  201,
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}
