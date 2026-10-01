/**
 * Blue Agent — how the browser CARRIES the SIWE session (client side).
 *
 * Normally it does not: the session is an httpOnly `blue_session` cookie
 * (lib/session.ts) and every same-origin fetch sends it without any help from
 * this file. That stops working in exactly one place — the Farcaster / Base App
 * mini-app, which renders us inside a CROSS-SITE iframe. The cookie is
 * `SameSite=Lax`, so the browser drops it when the frame's POST
 * /api/auth/session sets it and never attaches it to the frame's fetches. Since
 * 2026-09-30 paid chat, Run now, the credit claim, Hood watchlist/Telegram link
 * and /api/actions all need the session (lib/acting-wallet.ts), so in the
 * mini-app every send asked for a signature, the signature "succeeded", and the
 * next send asked again — forever.
 *
 * The fix is NOT `SameSite=None`: that would make the cookie ambient on
 * cross-site requests and reopen CSRF on every route that charges a wallet.
 * Instead, in an embedded frame only, the sign-in asks for the same opaque
 * token in the response body and this module holds it IN MEMORY (never
 * localStorage / sessionStorage — a reload means one more signature, which is
 * the price of not persisting a bearer token where any script can read it
 * later) and attaches it as the `x-blue-session` header to our own `/api/*`
 * calls. A custom header is not ambient: a cross-site page cannot make the
 * browser send it, and setting it at all forces a CORS preflight, which none of
 * the session routes answer. siwe-gate-test group 7 pins both halves.
 *
 * Header mode is chosen by MEASUREMENT, not by guessing from the frame:
 * `settleSessionTransport` asks whoami cookie-only first, and only if the cookie
 * did not stick does it switch to the header. A same-site embed where the
 * cookie works stays in cookie mode and the token is dropped on the spot.
 *
 * Keep this file free of server imports — lib/session.ts imports
 * `SESSION_HEADER` from here so the two sides cannot spell it differently.
 */

/** The header that carries the session token when the cookie cannot. */
export const SESSION_HEADER = "x-blue-session";

const TOKEN_RE = /^[0-9a-f]{64}$/;

// The ONLY copy of the token on the client. Module memory: gone on reload.
let headerToken: string | null = null;

/** True when this page is rendered inside another page (mini-app host). */
export function inEmbeddedFrame(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    // Some hosts throw on touching `window.top` at all — that only happens
    // when there IS a cross-origin parent.
    return true;
  }
}

/** Set (or with null, drop) the header-carried token. A malformed value is
 *  dropped rather than sent: the server would ignore it anyway. */
export function setHeaderSessionToken(token: string | null): void {
  headerToken = token && TOKEN_RE.test(token) ? token : null;
}

export function usingHeaderSession(): boolean {
  return headerToken !== null;
}

/**
 * `fetch` for our own session-gated routes. Identical to `fetch` in cookie
 * mode. In header mode it adds `x-blue-session` — and only to a RELATIVE
 * `/api/…` path, so the token can never be attached to a request that leaves
 * this origin, whatever URL a caller passes.
 *
 * Every client call to a route that reads the session goes through here;
 * siwe-gate-test discovers those routes and fails on a bare `fetch(` to one.
 */
export function sessionFetch(input: string, init?: RequestInit): Promise<Response> {
  if (!headerToken || !input.startsWith("/api/")) return fetch(input, init);
  const headers = new Headers(init?.headers);
  headers.set(SESSION_HEADER, headerToken);
  return fetch(input, { ...init, headers });
}

type Who = { s: "active"; wallet: string } | { s: "anonymous" } | { s: "unknown" };

/** whoami over exactly ONE transport: the cookie alone (token null), or the
 *  given token alone. Never `sessionFetch`, so the answer says which works. */
async function whoamiVia(token: string | null): Promise<Who> {
  try {
    const r = await fetch("/api/auth/session", {
      cache: "no-store",
      ...(token ? { headers: { [SESSION_HEADER]: token } } : {}),
    });
    if (!r.ok) return { s: "unknown" }; // 503: could not check — not "signed out"
    const j = (await r.json().catch(() => ({}))) as { status?: string; wallet?: string };
    if (j.status === "active" && typeof j.wallet === "string") return { s: "active", wallet: j.wallet.toLowerCase() };
    return j.status === "anonymous" ? { s: "anonymous" } : { s: "unknown" };
  } catch {
    return { s: "unknown" };
  }
}

/** Shown instead of a fresh signature prompt when no transport keeps the
 *  session — asking again would only loop. */
export const SESSION_NOT_KEPT =
  "you signed, but this view did not keep the sign-in. Open blueagent.dev in your browser to use credits";

/**
 * Right after a successful POST /api/auth/session: decide how this page will
 * carry the new session, and PROVE it before anyone caches "signed in".
 *
 *   • the cookie answers for this wallet → cookie mode; the token, if the
 *     server sent one, is discarded unused.
 *   • it does not, and we hold a token that does → header mode.
 *   • neither → throw SESSION_NOT_KEPT. Before this check the caller cached
 *     "signed in" on the POST's 200 alone, which is what made the mini-app
 *     loop: every send re-signed and every send was refused.
 *   • whoami could not answer (KV blip, 503) → no verdict. Keep what the
 *     server just issued and let the route's own AUTH_REQUIRED retry decide;
 *     a store outage is not evidence the cookie was dropped.
 */
export async function settleSessionTransport(wallet: string, token: string | null): Promise<void> {
  const w = wallet.toLowerCase();
  const viaCookie = await whoamiVia(null);
  if (viaCookie.s === "active" && viaCookie.wallet === w) {
    headerToken = null;
    return;
  }
  if (token && TOKEN_RE.test(token)) {
    const viaHeader = await whoamiVia(token);
    if ((viaHeader.s === "active" && viaHeader.wallet === w) || viaHeader.s === "unknown") {
      headerToken = token;
      return;
    }
  }
  // Never keep a token this sign-in did not just prove — an older one (say,
  // from before a wallet switch) would otherwise ride along on every call.
  headerToken = null;
  if (viaCookie.s === "unknown") return;
  throw new Error(SESSION_NOT_KEPT);
}
