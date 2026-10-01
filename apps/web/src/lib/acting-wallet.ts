/**
 * Who is this request acting for? (server side)
 *
 * Plan §2 (W0-6), 2026-09-30: every route that CHARGES a wallet or WRITES a
 * wallet's private state must learn the wallet from a proof, never from a body
 * field or query param. Until then chat, cron/run, credits/claim, the Hood
 * alert/watchlist/Telegram-link routes and the spend readers all took
 * `address` from the client — so anyone could chat on a stranger's credits, or
 * read and rewrite their alert settings, by typing their address.
 *
 * Two proofs are accepted, in this order:
 *   1. INTERNAL — `x-blue-internal: <INTERNAL_SERVICE_KEY>` plus
 *      `x-blue-user: <0x…>`. Only our own server holds that key; it is how a
 *      background job (the user-tasks cron → cron/run → chat) acts for the
 *      owner it already verified when the task was saved.
 *   2. SESSION — the SIWE cookie (`lib/session.ts`), or the same token in
 *      `x-blue-session` inside the embedded mini-app, where the Lax cookie
 *      cannot reach us (see that file's header for why that is not CSRF).
 *
 * `claimed` is what the client SAYS it is connected as. It is never trusted,
 * only compared: a session for a different wallet is `mismatch`, so a user who
 * switched wallets is asked to sign in again instead of being billed as the
 * wallet they signed in with earlier.
 *
 * `unavailable` (KV could not be read) is kept apart from `anonymous` on
 * purpose, as in readSession: "we could not check" is not "you are signed out".
 */
import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/session";

const ADDR = /^0x[a-fA-F0-9]{40}$/;

export type ActingWallet =
  | { status: "ok"; wallet: string; via: "session" | "internal" }
  | { status: "anonymous" }
  | { status: "mismatch"; sessionWallet: string }
  | { status: "unavailable"; message: string };

export function normalizeWallet(v: unknown): string | undefined {
  return typeof v === "string" && ADDR.test(v.trim()) ? v.trim().toLowerCase() : undefined;
}

export function internalActingWallet(req: NextRequest | Request): string | undefined {
  const key = process.env.INTERNAL_SERVICE_KEY ?? "";
  if (!key || req.headers.get("x-blue-internal") !== key) return undefined;
  return normalizeWallet(req.headers.get("x-blue-user"));
}

export async function resolveActingWallet(
  req: NextRequest,
  claimed?: string | null,
): Promise<ActingWallet> {
  const internal = internalActingWallet(req);
  if (internal) return { status: "ok", wallet: internal, via: "internal" };

  const session = await readSession(req);
  if (session.status === "unavailable") return { status: "unavailable", message: session.message };
  if (session.status === "anonymous") return { status: "anonymous" };

  const want = normalizeWallet(claimed);
  if (want && want !== session.wallet) return { status: "mismatch", sessionWallet: session.wallet };
  return { status: "ok", wallet: session.wallet, via: "session" };
}

/** The JSON refusal for a non-ok resolution. `code: "AUTH_REQUIRED"` is what
 *  the client's session helper keys on to sign in and retry once. */
export function actingWalletRefusal(a: Exclude<ActingWallet, { status: "ok" }>): NextResponse {
  if (a.status === "unavailable") {
    return NextResponse.json(
      { error: "Could not verify your sign-in right now — nothing was changed. Try again shortly.", code: "SESSION_UNAVAILABLE" },
      { status: 503 },
    );
  }
  if (a.status === "mismatch") {
    return NextResponse.json(
      { error: "You are signed in with a different wallet than the one connected. Sign in again with this wallet.", code: "AUTH_REQUIRED", reason: "wallet_mismatch" },
      { status: 401 },
    );
  }
  return NextResponse.json(
    { error: "Sign in with your wallet first (one signature, no transaction).", code: "AUTH_REQUIRED", reason: "sign_in_required" },
    { status: 401 },
  );
}
