/**
 * Short-lived sponsorship tokens for `/api/paymaster` (server side).
 *
 * WHY A TOKEN AND NOT THE SESSION COOKIE. The wallet — not our page — calls the
 * paymaster URL we hand it in the EIP-5792 `paymasterService` capability, from
 * its own origin, so our httpOnly SIWE cookie never arrives there. The page
 * therefore asks `/api/paymaster/token` (same origin, cookie present) for a
 * token bound to the signed-in wallet, and puts it in the URL. Before this the
 * paymaster had no gate at all: anyone could spend the project's sponsorship
 * budget on any smart account (plan §1 fix 3, ShunTr chose "gate" 2026-09-30).
 *
 * What the token binds: the SIWE wallet, the network, and an expiry. The
 * paymaster route then checks that every user operation it is asked to sponsor
 * has that wallet as its `sender` — a leaked URL sponsors nobody else.
 *
 * Stateless (HMAC), so a KV outage at signing time cannot turn a send into a
 * failure. The key is derived from INTERNAL_SERVICE_KEY with a fixed label, so
 * no new env var is needed and the raw service key is never what signs. No key
 * → no token → the client sends without sponsorship (user-paid gas), the same
 * fallback as a wallet with no paymaster capability.
 */
import { createHmac, timingSafeEqual } from "crypto";

export type PaymasterNetwork = "base" | "baseSepolia";

export const PAYMASTER_TOKEN_TTL_MS = 15 * 60 * 1000;

/** chainId each network's user operations must carry (EIP-7677 params[2]). */
export const PAYMASTER_CHAIN_ID: Record<PaymasterNetwork, number> = {
  base: 8453,
  baseSepolia: 84532,
};

/** The CDP Paymaster & Bundler endpoint for a network, or undefined when unset.
 *  Server-only: the URL embeds the CDP endpoint token. */
export function paymasterUpstream(network: PaymasterNetwork): string | undefined {
  return network === "base"
    ? process.env.CDP_PAYMASTER_URL_BASE
    : process.env.CDP_PAYMASTER_URL_BASE_SEPOLIA;
}

interface Payload { w: string; n: PaymasterNetwork; e: number }

function signingKey(): Buffer | null {
  const master = process.env.INTERNAL_SERVICE_KEY;
  if (!master) return null;
  return createHmac("sha256", master).update("blueagent:paymaster-token:v1").digest();
}

const b64url = (b: Buffer) => b.toString("base64url");

export function mintPaymasterToken(
  wallet: string,
  network: PaymasterNetwork,
  now: number = Date.now(),
): string | null {
  const key = signingKey();
  if (!key) return null;
  const payload: Payload = { w: wallet.toLowerCase(), n: network, e: now + PAYMASTER_TOKEN_TTL_MS };
  const body = b64url(Buffer.from(JSON.stringify(payload)));
  const sig = b64url(createHmac("sha256", key).update(body).digest());
  return `${body}.${sig}`;
}

export type PaymasterTokenCheck =
  | { ok: true; wallet: string }
  | { ok: false; reason: "missing" | "unconfigured" | "malformed" | "bad_signature" | "expired" | "wrong_network" };

export function verifyPaymasterToken(
  token: string | null | undefined,
  network: PaymasterNetwork,
  now: number = Date.now(),
): PaymasterTokenCheck {
  if (!token) return { ok: false, reason: "missing" };
  const key = signingKey();
  if (!key) return { ok: false, reason: "unconfigured" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };

  const want = createHmac("sha256", key).update(body).digest();
  let got: Buffer;
  try { got = Buffer.from(sig, "base64url"); } catch { return { ok: false, reason: "malformed" }; }
  if (got.length !== want.length || !timingSafeEqual(got, want)) return { ok: false, reason: "bad_signature" };

  let p: Payload;
  try { p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload; }
  catch { return { ok: false, reason: "malformed" }; }
  if (typeof p?.w !== "string" || !/^0x[0-9a-f]{40}$/.test(p.w) || typeof p.e !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (now > p.e) return { ok: false, reason: "expired" };
  if (p.n !== network) return { ok: false, reason: "wrong_network" };
  return { ok: true, wallet: p.w };
}
