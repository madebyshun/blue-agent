/**
 * /api/auth/session — the Blue Chat sign-in session.
 *
 * POST   { address, signature, nonce, embedded? } → verify SIWE, set httpOnly cookie
 * GET                                  → who am I (never 500s on a KV blip)
 * DELETE                               → sign out, drop the server record
 *
 * All three read the session from the cookie or, in the embedded mini-app,
 * from the `x-blue-session` header (lib/session.ts header). POST returns the
 * token in its body ONLY for `embedded: true` — the cross-site iframe where the
 * Lax cookie is dropped — and never otherwise.
 *
 * A session is this wallet's proof for 30 days. It began as access to
 * `workspace:<wallet>` (cross-device sync) and, since 2026-09-30, is also what
 * every route that CHARGES the wallet or WRITES its private state accepts
 * (lib/acting-wallet.ts): spending its prepaid credits on chat and tool runs,
 * running its scheduled tasks, claiming credits, its Hood alerts and Telegram
 * link, its private usage history. It moves no funds on-chain and authorizes
 * no transaction. The signed statement says all of this — see
 * `sessionSiweMessage`, and keep the two in step.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import {
  sessionSiweMessage,
  requestDomain,
  spendNonce,
  verifySiwe,
  createSession,
  readSession,
  destroySession,
  setSessionCookie,
  clearSessionCookie,
} from "@/lib/session";

export const runtime = "nodejs";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

// ─── POST — sign in ──────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const rl = await rateLimit(getIdentifier(req), "console"); // 10/min
  if (!rl.success) {
    return NextResponse.json({ error: "Too many sign-in attempts. Try again shortly." }, { status: 429 });
  }

  let body: { address?: unknown; signature?: unknown; nonce?: unknown; embedded?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const address   = typeof body.address   === "string" ? body.address.trim()   : "";
  const signature = typeof body.signature === "string" ? body.signature.trim() : "";
  const nonce     = typeof body.nonce     === "string" ? body.nonce.trim()     : "";

  if (!ADDRESS_RE.test(address)) return NextResponse.json({ error: "Invalid address." },   { status: 400 });
  if (!signature.startsWith("0x")) return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  if (!nonce)                      return NextResponse.json({ error: "Missing nonce." },    { status: 400 });

  // Spend the nonce BEFORE verifying the signature. Doing it in this order means
  // a captured body cannot be retried even if the signature check is slow or the
  // attacker floods it — the very first attempt burns the nonce for everyone.
  const spend = await spendNonce(nonce);
  if (!spend.ok) return NextResponse.json({ error: spend.reason }, { status: spend.status });

  const message = sessionSiweMessage(requestDomain(req), address, nonce);
  const valid   = await verifySiwe(address, message, signature);
  if (!valid) {
    return NextResponse.json(
      { error: "Signature does not match this address — sign-in refused." },
      { status: 401 },
    );
  }

  const token = await createSession(address);
  // The cookie is always set — a same-site embed keeps it, and the client
  // measures which transport works before using either. The token goes in the
  // body only on an explicit `embedded: true` (strictly the boolean): handing a
  // bearer token to script by default would undo what httpOnly buys every
  // ordinary tab. `no-store` so no cache between us and the frame keeps a copy.
  const embedded = body.embedded === true;
  const res = NextResponse.json(
    embedded ? { wallet: address.toLowerCase(), token } : { wallet: address.toLowerCase() },
    { headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(res, token);
  return res;
}

// ─── GET — whoami ────────────────────────────────────────────────────────────

/**
 * Returns one of three states. `unavailable` is NOT folded into "signed out":
 * the client uses this to decide whether to hydrate its workspace, and reading
 * a KV outage as "signed out" would leave a signed-in user looking at an empty
 * app. 503 is the honest answer to "I could not check".
 */
export async function GET(req: NextRequest) {
  const session = await readSession(req);

  if (session.status === "unavailable") {
    return NextResponse.json(
      { status: "unavailable", error: "Could not read session — store unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (session.status === "anonymous") {
    return NextResponse.json({ status: "anonymous" }, { headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json(
    { status: "active", wallet: session.wallet },
    { headers: { "Cache-Control": "no-store" } },
  );
}

// ─── DELETE — sign out ───────────────────────────────────────────────────────

/**
 * Ends the session only. It does NOT delete `workspace:<wallet>` — signing out
 * on a shared laptop must not wipe your history everywhere else. Deleting the
 * synced copy is a separate, explicit act (`DELETE /api/workspace`).
 */
export async function DELETE(req: NextRequest) {
  await destroySession(req);
  const res = NextResponse.json({ status: "anonymous" });
  clearSessionCookie(res);
  return res;
}
