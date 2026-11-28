/**
 * GET /api/chat/tee-attestation?model=glm-5-3-flash-e2ee[&nonce=<hex>]
 *
 * Proxies Venice's `/api/v1/tee/attestation` endpoint for TEE/E2EE models so
 * Blue Chat users (and the client-side Strict E2EE handshake) can inspect and
 * independently verify hardware enclave evidence (`intel_quote`,
 * `nvidia_payload`, `signing_key`, `tee_provider`) without exposing the server's
 * Venice API key.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { isVeniceTeeModelId, readVeniceTeeAttestation } from "@/lib/venice-privacy";

export const runtime = "nodejs";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  // Uses Blue's Venice key upstream: rate-limited like chat (review 2026-11-28).
  if (!(await rateLimit(getIdentifier(req), "chat")).success) return NextResponse.json({ ok: false, error: "Too many requests." }, { status: 429 });
  const model = (req.nextUrl.searchParams.get("model") ?? "").trim();
  const nonce = (req.nextUrl.searchParams.get("nonce") ?? "").trim() || undefined;

  if (!model || !isVeniceTeeModelId(model)) {
    return NextResponse.json(
      { ok: false, error: "Query param `model` must be a Venice TEE/E2EE model ID." },
      { status: 400 },
    );
  }
  if (nonce && !/^[a-fA-F0-9]{16,128}$/.test(nonce)) {
    return NextResponse.json(
      { ok: false, error: "Optional `nonce` must be 16–128 hex characters." },
      { status: 400 },
    );
  }

  const evidence = await readVeniceTeeAttestation(model, { nonce });
  return NextResponse.json(evidence, {
    status: evidence.ok ? 200 : 502,
    headers: { "Cache-Control": "no-store" },
  });
}
