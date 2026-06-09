/**
 * /api/profile/[address] — Wallet-gated user profile.
 *
 *   GET  → public; returns the saved profile or {} if none yet
 *   PUT  → wallet-gated; verifies an EIP-191 signature recovers to {address},
 *          then persists the bio + social-link fields to KV.
 *
 * Signature payload — see `profileSignMessage()` in src/lib/profile.ts. The
 * client builds the same string and asks wallet.signMessage(); the server
 * verifies via viem's verifyMessage and compares the recovered address.
 *
 * Replay protection: the message includes an `issuedAt` ISO string + a
 * 16-byte hex `nonce`. The server rejects timestamps more than 5 minutes
 * old or in the future, and burns each nonce in KV for the next hour.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, getAddress, isAddress } from "viem";
import { kvSetNX } from "@/lib/kv";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import {
  getProfile,
  putProfile,
  profileSignMessage,
  sanitize,
  type UserProfile,
} from "@/lib/profile";

export const runtime = "nodejs";
// Profile updates are signature-verify + KV write — well under a second.
export const maxDuration = 15;

const NONCE_TTL_SECONDS    = 60 * 60;          // 1h replay window
const MAX_CLOCK_SKEW_MS    = 5 * 60 * 1000;    // 5 min wall-clock skew

// ─── GET — public read ────────────────────────────────────────────────────────

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  const { address } = await params;
  if (!isAddress(address)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const profile = await getProfile(address);
  return NextResponse.json(profile ?? { address: address.toLowerCase() }, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=120" },
  });
}

// ─── PUT — owner-signed write ─────────────────────────────────────────────────

interface PutBody {
  fields:    Partial<UserProfile>;
  nonce:     string;
  issuedAt:  string;                    // ISO timestamp the client built
  signature: `0x${string}`;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ address: string }> },
) {
  // 60 writes/min per IP via the shared "default" bucket — way more than a
  // real user could need, tight enough to make scripted spam expensive.
  const { success } = await rateLimit(getIdentifier(req), "default");
  if (!success) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const { address: rawAddr } = await params;
  if (!isAddress(rawAddr)) {
    return NextResponse.json({ error: "Invalid address" }, { status: 400 });
  }
  const address = getAddress(rawAddr).toLowerCase();

  let body: PutBody;
  try {
    body = (await req.json()) as PutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { fields, nonce, issuedAt, signature } = body;
  if (!fields || typeof fields !== "object") {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }
  if (!nonce || typeof nonce !== "string" || nonce.length < 8 || nonce.length > 64) {
    return NextResponse.json({ error: "Invalid nonce" }, { status: 400 });
  }
  if (!issuedAt || typeof issuedAt !== "string") {
    return NextResponse.json({ error: "Missing issuedAt" }, { status: 400 });
  }
  if (!signature || !signature.startsWith("0x") || signature.length < 132) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // Reject stale / future-dated messages.
  const ts = Date.parse(issuedAt);
  if (Number.isNaN(ts)) {
    return NextResponse.json({ error: "Invalid issuedAt" }, { status: 400 });
  }
  const drift = Math.abs(Date.now() - ts);
  if (drift > MAX_CLOCK_SKEW_MS) {
    return NextResponse.json({ error: "Signed message is expired — sign again" }, { status: 401 });
  }

  // Replay protection: atomically claim the nonce for 1 hour. If another
  // request already used this exact nonce, kvSetNX returns false and we
  // reject the request before touching the signature path.
  const nonceKey = `profile-nonce:${address}:${nonce}`;
  const claimed  = await kvSetNX(nonceKey, "1", NONCE_TTL_SECONDS);
  if (!claimed) {
    return NextResponse.json({ error: "Nonce already used" }, { status: 401 });
  }

  // Verify signature recovers to the URL address.
  const message = profileSignMessage(address, nonce, issuedAt);
  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message,
      signature,
    });
  } catch (e) {
    return NextResponse.json({ error: "Signature verification failed", detail: (e as Error).message.slice(0, 120) }, { status: 401 });
  }
  if (!valid) {
    return NextResponse.json({ error: "Signature does not match address" }, { status: 401 });
  }

  // Persist. The nonce is already claimed (kvSetNX above) so we can't
  // accidentally process the same signature twice if the user clicks twice.
  const sanitized = sanitize(fields);
  const saved     = await putProfile(address, sanitized);

  return NextResponse.json(saved, { status: 200 });
}
