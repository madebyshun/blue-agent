/**
 * Blue Agent — SIWE sessions (server side)
 *
 * The first session/cookie code in this repo. Before this, every "prove you own
 * this wallet" flow was per-action: the client built a message, signed it, and
 * posted `{ address, signature, nonce }` — with the NONCE INVENTED BY THE CLIENT.
 * That is replayable: capture one signed body and it verifies forever, because
 * nothing on our side ever recorded that the nonce was spent. This module fixes
 * that by making the server the only issuer of nonces, and by spending each one
 * exactly once.
 *
 * As of 2026-09-05 this is the ONLY nonce mechanism for wallet proofs. The four
 * Hub routes that used to mint their own — submit external, submit hosted,
 * remove external, remove hosted — were retrofitted onto `issueNonce` /
 * `spendNonce` (#172). The one remaining client-supplied nonce is
 * `api/profile/[address]`, which is deliberately left alone: it burns the nonce
 * itself with `kvSetNX` and binds a ±5-minute `issuedAt` into the signed text,
 * so it is single-use by a different but sound route.
 *
 * What a session is here:
 *   • an opaque 256-bit random token, stored in an httpOnly cookie — or, in an
 *     embedded mini-app ONLY, carried in the `x-blue-session` header (below)
 *   • KV `session:<token>` → { wallet, createdAt, expiresAt }
 *
 * The wallet is never in the cookie. A cookie the client can read is a cookie
 * the client can edit, and the whole point of the session is that the server —
 * not a `?wallet=` query param, not a request body — decides whose data a
 * request may touch.
 *
 * What signing does NOT do: it moves no funds, grants no allowance, and
 * authorizes no transaction. It is a proof of key control, nothing else. The
 * message says so, because a wallet prompt the user doesn't understand is a
 * wallet prompt they should refuse.
 *
 * ── The embedded-mode exception (2026-10-01), and its threat model ──────────
 * The Farcaster / Base App mini-app renders us in a CROSS-SITE iframe, where a
 * `SameSite=Lax` cookie is neither stored nor sent, so a user there could sign
 * forever and never hold a session. The cookie stays Lax — `None` would make it
 * ambient on cross-site requests and reopen CSRF on every route that charges a
 * wallet. Instead:
 *   • POST /api/auth/session returns the token in its JSON body ONLY when the
 *     client says it is embedded (`embedded: true`). Never by default.
 *   • `sessionToken` accepts it back from `x-blue-session`. A custom header is
 *     not ambient — a cross-site page cannot make a victim's browser attach it,
 *     and sending it at all needs a CORS preflight that no session route
 *     answers — so the header adds no CSRF surface.
 *   • The client keeps it in memory only (lib/session-client.ts).
 * What this DOES cost: in embedded mode the token is readable by script on our
 * page, so an XSS there could lift it and use it elsewhere for up to 30 days —
 * which the httpOnly cookie prevents. That exposure exists only for a session
 * the client explicitly asked to receive in the body; cookie mode is
 * byte-for-byte unchanged, and a token is never returned to a caller that did
 * not ask. Header beats cookie when both arrive, because the header is the one
 * the page deliberately attached (a stale Lax cookie must not shadow it).
 */

import type { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, verifyMessage } from "viem";
import { base } from "viem/chains";
import { kvGetProbe, kvSet, kvSetNX, kvDel } from "@/lib/kv";
import { SESSION_HEADER } from "@/lib/session-client";

// Re-exported so route handlers have one import, but DEFINED in a dependency-free
// module because the browser has to build the identical string to sign it.
export { sessionSiweMessage } from "@/lib/siwe-session-message";

export const SESSION_COOKIE = "blue_session";
export { SESSION_HEADER };

const SESSION_TTL_S = 30 * 24 * 60 * 60; // 30 days
const NONCE_TTL_S   = 5 * 60;            // 5 minutes to sign
// Must outlive NONCE_TTL_S, and that ordering is the invariant that makes
// single-use work: the spend marker is only ever consulted while the issued key
// is still alive, so if the marker expired first there would be a window where a
// nonce is still valid but no longer remembered as spent.
const SPENT_TTL_S   = 10 * 60;

const nonceKey = (n: string) => `siwe:nonce:${n}`;
const spentKey = (n: string) => `siwe:nonce:spent:${n}`;
const sessKey  = (t: string) => `session:${t}`;

export interface SessionRecord {
  wallet:    string;  // lowercased 0x address
  createdAt: number;
  expiresAt: number;
}

// ─── Random ──────────────────────────────────────────────────────────────────

/** 32 bytes of CSPRNG as lowercase hex. Not `Math.random()`, not a UUID. */
function randomHex32(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── The signed message ──────────────────────────────────────────────────────

/**
 * Host to bind the message to, taken from the request the browser actually
 * sent. Bound per-host rather than hard-coded to blueagent.dev so a signature
 * obtained on a preview deploy is not valid against production. (Replay is
 * already blocked by the single-use nonce; this is the cheap second layer.)
 */
export function requestDomain(req: NextRequest): string {
  const host = req.headers.get("host") ?? "blueagent.dev";
  return host.toLowerCase();
}

// ─── Nonce: issue once, spend once ───────────────────────────────────────────

/**
 * Mint a nonce and record that WE minted it. `kvSetNX` rather than `kvSet` so a
 * (vanishingly unlikely) collision with a live nonce is reported instead of
 * silently overwriting someone mid-signature.
 */
export async function issueNonce(): Promise<string | null> {
  const nonce = randomHex32();
  const ok = await kvSetNX(nonceKey(nonce), { issuedAt: Date.now() }, NONCE_TTL_S);
  return ok ? nonce : null;
}

export type NonceSpend =
  | { ok: true }
  | { ok: false; status: 401 | 503; reason: string };

/**
 * Appended to the spend-failure text on routes an EXTERNAL agent may call.
 *
 * The Hub submit/remove endpoints are a documented public API, and #172 changed
 * their contract: a self-minted nonce used to be accepted and now 401s. A
 * third-party builder whose script breaks has no way to discover the new step
 * from "Nonce unknown or expired" alone, so the error names the endpoint that
 * issues them. Defined once because it must stay identical across four routes
 * and the /docs/list-a-tool page.
 */
export const NONCE_SOURCE_HINT =
  "Nonces are issued by GET /api/auth/nonce and are single-use — a self-generated nonce is no longer accepted.";

/**
 * Spend a nonce. Fails CLOSED on every ambiguity — this is the one place where
 * "we couldn't check" must never degrade into "fine, come in".
 *
 *   • KV read errored  → 503. A throttled Upstash (this project has hit its cap
 *     three times, see #148) must not read as "valid nonce".
 *   • nonce not found  → 401. Either never issued by us, or already expired.
 *   • spend marker lost the race → 401. `kvSetNX` is a real Redis SET NX, so
 *     exactly one concurrent caller can win; the loser is either a genuine
 *     replay or a KV error, and both should be refused.
 */
export async function spendNonce(nonce: string): Promise<NonceSpend> {
  if (!/^[0-9a-f]{64}$/.test(nonce)) {
    return { ok: false, status: 401, reason: "Malformed nonce." };
  }

  const probe = await kvGetProbe<{ issuedAt: number }>(nonceKey(nonce));
  if (probe.status === "error") {
    return { ok: false, status: 503, reason: "Cannot verify nonce right now — store unavailable." };
  }
  if (probe.status === "miss") {
    return { ok: false, status: 401, reason: "Nonce unknown or expired — request a new one." };
  }

  const claimed = await kvSetNX(spentKey(nonce), { at: Date.now() }, SPENT_TTL_S);
  if (!claimed) {
    return { ok: false, status: 401, reason: "Nonce already used — request a new one." };
  }

  // The issued key is deliberately NOT deleted here; it expires on NONCE_TTL_S.
  // Deleting it would make the probe above miss on a replay, so every replay
  // would report "unknown or expired" and the spend marker — the thing that
  // actually detects replay — would never be consulted outside a true race.
  // Measured: with the del in place, replaying a just-used nonce returned
  // "unknown or expired". Letting it live means a replay inside the signing
  // window reports "already used" (accurate and actionable), and only a genuinely
  // stale nonce reports "expired". It is also one fewer KV write per sign-in,
  // which is not nothing on a budget that has been suspended three times (#148).
  return { ok: true };
}

// ─── Signature ───────────────────────────────────────────────────────────────

/**
 * Smart-wallet signatures need a chain to be checked against. Base, because
 * that is where the smart wallets we serve live (Coinbase Smart Wallet — also
 * the only wallets the paymaster sponsors), and because an ERC-6492 signature
 * carries its own factory call, so an account not yet deployed still verifies.
 */
const siweChainClient = createPublicClient({
  chain: base,
  transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org"),
});

/**
 * Wrapped so a malformed signature is a 401, not a 500. viem throws on garbage
 * input rather than returning false.
 *
 * Two checks, cheapest first. The standalone `verifyMessage` util is ecrecover
 * only — it refuses every contract-account signature (ERC-1271, and ERC-6492
 * before deployment), which until 2026-09-30 meant a Coinbase Smart Wallet user
 * could not sign in at all: "Signature does not match this address". The
 * client's `verifyMessage` asks the chain instead, through the ERC-6492
 * universal validator, so it covers deployed and counterfactual accounts. It
 * cannot be talked into accepting a victim's address: a 6492 factory call can
 * only put code at an address that factory derives, and an EOA has no code to
 * ask. It costs one RPC call, and only for signatures ecrecover already
 * rejected.
 */
export async function verifySiwe(
  address: string,
  message: string,
  signature: string,
): Promise<boolean> {
  const args = {
    address:   address as `0x${string}`,
    message,
    signature: signature as `0x${string}`,
  };
  try {
    if (await verifyMessage(args)) return true;
  } catch {
    /* not an EOA signature — fall through to the contract-account check */
  }
  try {
    return await siweChainClient.verifyMessage(args);
  } catch {
    return false;
  }
}

// ─── Session lifecycle ───────────────────────────────────────────────────────

/** Create the KV record and return the opaque token to put in the cookie. */
export async function createSession(wallet: string): Promise<string> {
  const token = randomHex32();
  const now   = Date.now();
  const rec: SessionRecord = {
    wallet:    wallet.toLowerCase(),
    createdAt: now,
    expiresAt: now + SESSION_TTL_S * 1000,
  };
  await kvSet(sessKey(token), rec, SESSION_TTL_S);
  return token;
}

export type SessionRead =
  | { status: "active"; wallet: string }
  | { status: "anonymous" }
  | { status: "unavailable"; message: string };

/**
 * Who is this request? Three outcomes, deliberately not two.
 *
 * "anonymous" and "unavailable" look the same to `kvGet` and that difference
 * matters more here than almost anywhere else in the app: a caller that treats
 * a KV outage as "not signed in" will hand a signed-in user an EMPTY workspace,
 * and if that empty workspace is then mirrored back it has silently deleted
 * their conversations. Callers must branch on all three.
 */
const TOKEN_RE = /^[0-9a-f]{64}$/;

/**
 * The session token this request carries, if any: a well-formed
 * `x-blue-session` header first (embedded mode, see the header of this file),
 * else the cookie. A malformed header is ignored, not an error — it proves
 * nothing, so the request is judged on its cookie alone.
 */
export function sessionToken(req: NextRequest): string | null {
  const header = req.headers.get(SESSION_HEADER)?.trim();
  if (header && TOKEN_RE.test(header)) return header;
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  return cookie && TOKEN_RE.test(cookie) ? cookie : null;
}

export async function readSession(req: NextRequest): Promise<SessionRead> {
  const token = sessionToken(req);
  if (!token) return { status: "anonymous" };

  const probe = await kvGetProbe<SessionRecord>(sessKey(token));
  if (probe.status === "error") return { status: "unavailable", message: probe.message };
  if (probe.status === "miss")  return { status: "anonymous" };

  const rec = probe.value;
  if (!rec?.wallet || typeof rec.expiresAt !== "number" || Date.now() > rec.expiresAt) {
    return { status: "anonymous" };
  }
  return { status: "active", wallet: rec.wallet.toLowerCase() };
}

/** Drop the server record — every one this request names, header AND cookie,
 *  so signing out never leaves the other transport's session alive. The cookie
 *  itself is cleared separately, on the response. */
export async function destroySession(req: NextRequest): Promise<void> {
  const tokens = new Set<string>();
  const header = req.headers.get(SESSION_HEADER)?.trim();
  if (header && TOKEN_RE.test(header)) tokens.add(header);
  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  if (cookie && TOKEN_RE.test(cookie)) tokens.add(cookie);
  for (const t of tokens) await kvDel(sessKey(t));
}

// ─── Cookie ──────────────────────────────────────────────────────────────────

/**
 * `httpOnly` so no script — ours, an injected one, or an extension — can read
 * the token. `sameSite: "lax"` because the session is only ever used by
 * same-origin fetches from our own app; there is no cross-site POST that needs it.
 * The one context Lax shuts out — the cross-site mini-app iframe — is served by
 * the header, never by loosening this (see the header of this file).
 */
export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   SESSION_TTL_S,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    path:     "/",
    maxAge:   0,
  });
}
