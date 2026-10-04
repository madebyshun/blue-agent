/**
 * Linked devices — a READ-ONLY token for BlueBot (the macOS notch app, and
 * later the physical BlueBot) and BlueCube (the ESP32 desk screen, kind
 * "cube", 2026-10-04), issued by a device-code flow (RFC 8628 shape).
 * ShunTr approved the route 2026-10-02.
 *
 *   1. The device asks for a code:      POST /api/devices/code   (no auth)
 *      → user_code "BCDF-GH23" to show, device_code (secret) to poll with.
 *   2. The person approves it on the web: app.blueagent.dev/link — signs in
 *      with the wallet (SIWE), types or follows the code, sees the device's
 *      name, presses Approve.                POST /api/devices/approve (SIWE)
 *   3. The device polls with its secret:  POST /api/devices/token
 *      → once approved, a token `bbt_…`, handed out exactly ONCE.
 *   4. The device reads:                  GET /api/devices/feed  (Bearer)
 *
 * WHAT THE TOKEN CAN DO — chosen by the person on the approve screen
 * (scopes, 2026-10-02; ShunTr: "link, don't make a new wallet"):
 *   • `read`   (always) — the wallet's timeline, its watches and alerts;
 *   • `chat`   — chat as the wallet through /api/devices/chat, on the
 *              wallet's credits. No per-device cap (ShunTr 2026-10-02: "trong
 *              ví có bao nhiêu sử dụng bấy nhiêu, hết thì mua thêm") — the
 *              wallet's own balance is the limit, enforced by /api/chat's debit;
 *   • `alerts` — create, pause and delete watches in /api/watches.
 * And the line that must not move: it is NOT a session. `readSession` never
 * accepts it, it can never sign or move funds, and every route that honours
 * it checks the specific scope. A token minted before scopes existed is
 * `read` only.
 *
 * Storage: only the SHA-256 of a token or device_code is ever written — a KV
 * read leaks no usable credential. Tokens expire after TOKEN_TTL_S; a wallet
 * holds at most MAX_DEVICES; any of them is revocable from /link, and a
 * device can revoke its own token.
 *
 * Phishing note (accepted, by design of the flow): someone could show a victim
 * a code of THEIR device. Approving it would hand the attacker read access to
 * the victim's timeline — never funds. The approve screen names the device and
 * says to approve only a code shown on your own screen.
 */
import { createHash, randomBytes } from "node:crypto";
import { kv, kvDel, kvDelOrThrow, kvGetProbe, kvSetNX, kvSetOrThrow } from "@/lib/kv";

export const CODE_TTL_S = 10 * 60;
export const TOKEN_TTL_S = 180 * 24 * 60 * 60;
export const MAX_DEVICES = 5;
/** How often a device should poll the feed. Watches are evaluated every 5
 *  minutes, so polling faster buys nothing but KV commands (#148). */
export const FEED_POLL_S = 180;
export const TOKEN_POLL_S = 5;

export type DeviceKind = "mac" | "bot" | "cube";

export type DeviceScope = "read" | "chat" | "alerts";
export const OPTIONAL_SCOPES: readonly DeviceScope[] = ["chat", "alerts"];
/** What the approve screen sent → a clean grant. `read` is always in it; an
 *  unknown scope is dropped, never widened. */
export function cleanGrant(scopes: unknown): { scopes: DeviceScope[] } {
  const asked = Array.isArray(scopes) ? scopes : [];
  return { scopes: ["read", ...OPTIONAL_SCOPES.filter((s) => asked.includes(s))] };
}

/** Pre-scope tokens carry no `scopes` field: they are read-only. */
export function deviceScopes(d: { scopes?: DeviceScope[] }): DeviceScope[] {
  return Array.isArray(d.scopes) && d.scopes.length ? d.scopes : ["read"];
}
export const hasScope = (d: { scopes?: DeviceScope[] }, s: DeviceScope) => deviceScopes(d).includes(s);
export const DEVICE_KINDS: readonly DeviceKind[] = ["mac", "bot", "cube"];

/**
 * Scopes a kind of device may hold at most. A BlueCube is a screen: it only
 * ever reads the timeline and the agent state, so it is capped at `read` no
 * matter what the approve screen sends. A `chat` token stored on a desk
 * gadget would spend the wallet's credits for a capability it never uses.
 */
export const KIND_MAX_SCOPES: Record<DeviceKind, readonly DeviceScope[]> = {
  mac: ["read", "chat", "alerts"],
  bot: ["read", "chat", "alerts"],
  cube: ["read"],
};
export function grantForKind(kind: DeviceKind, grant: { scopes: DeviceScope[] }): { scopes: DeviceScope[] } {
  const allowed = KIND_MAX_SCOPES[kind] ?? ["read"];
  return { scopes: grant.scopes.filter((s) => allowed.includes(s)) };
}

/** No vowels (no accidental words), no 0/O/1/I/U/Y look-alikes. */
const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";
const CODE_RE = /^[BCDFGHJKLMNPQRSTVWXZ2-9]{4}-[BCDFGHJKLMNPQRSTVWXZ2-9]{4}$/;
const TOKEN_RE = /^bbt_[0-9a-f]{64}$/;
const DEVICE_CODE_RE = /^[0-9a-f]{64}$/;

const kCode = (code: string) => `dev:code:${code}`;
const kPoll = (hash: string) => `dev:dc:${hash}`;
const kClaim = (hash: string) => `dev:claim:${hash}`;
const kTok = (hash: string) => `dev:tok:${hash}`;
const kList = (wallet: string) => `dev:list:${wallet.toLowerCase()}`;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** "bcdf gh23", "BCDFGH23", "bcdf-gh23" → "BCDF-GH23"; anything else → null. */
export function normalizeUserCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.length !== 8) return null;
  const code = `${s.slice(0, 4)}-${s.slice(4)}`;
  return CODE_RE.test(code) ? code : null;
}

export function newUserCode(rand: (n: number) => Buffer = randomBytes): string {
  // Rejection sampling keeps every character equally likely.
  const out: string[] = [];
  while (out.length < 8) {
    for (const b of rand(16)) {
      const limit = 256 - (256 % CODE_ALPHABET.length);
      if (b < limit) out.push(CODE_ALPHABET[b % CODE_ALPHABET.length]);
      if (out.length === 8) break;
    }
  }
  return `${out.slice(0, 4).join("")}-${out.slice(4).join("")}`;
}

/** A device-supplied label, made safe to show: printable, short, never empty. */
export function cleanDeviceName(raw: unknown, kind: DeviceKind): string {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 40) : "";
  return s || (kind === "mac" ? "BlueBot for Mac" : kind === "cube" ? "BlueCube" : "BlueBot");
}

export const isTokenShaped = (t: string) => TOKEN_RE.test(t);

interface CodeRecord { dcHash: string; name: string; kind: DeviceKind; createdAt: number; wallet?: string; approvedAt?: number; scopes?: DeviceScope[] }
export interface DeviceRecord { id: string; wallet: string; name: string; kind: DeviceKind; createdAt: number; expiresAt: number; scopes?: DeviceScope[] }
export interface DeviceListEntry { id: string; hash: string; name: string; kind: DeviceKind; createdAt: number; expiresAt: number; scopes?: DeviceScope[] }

export type Failure = { error: string; status: number };

/* ─── 1. device asks for a code ─────────────────────────────────────────── */

export async function startDeviceLink(name: string, kind: DeviceKind):
  Promise<{ userCode: string; deviceCode: string } | Failure> {
  const deviceCode = randomBytes(32).toString("hex");
  const dcHash = sha256(deviceCode);
  for (let i = 0; i < 4; i++) {
    const userCode = newUserCode();
    const rec: CodeRecord = { dcHash, name, kind, createdAt: Date.now() };
    // NX: a code already in flight is never overwritten.
    if (!(await kvSetNX(kCode(userCode), rec, CODE_TTL_S))) continue;
    try { await kvSetOrThrow(kPoll(dcHash), userCode, CODE_TTL_S); }
    catch { await kvDel(kCode(userCode)); return { error: "Could not start linking. Try again.", status: 503 }; }
    return { userCode, deviceCode };
  }
  return { error: "Could not start linking. Try again.", status: 503 };
}

/* ─── 2. the person sees and approves it ─────────────────────────────────── */

export async function lookupCode(userCode: string):
  Promise<{ name: string; kind: DeviceKind; createdAt: number; approved: boolean } | Failure> {
  const p = await kvGetProbe<CodeRecord>(kCode(userCode));
  if (p.status === "error") return { error: "Could not read the code right now.", status: 503 };
  if (p.status === "miss") return { error: "That code is unknown or expired. Get a new one on your device.", status: 404 };
  return { name: p.value.name, kind: p.value.kind, createdAt: p.value.createdAt, approved: !!p.value.wallet };
}

export async function approveCode(
  userCode: string,
  wallet: string,
  grant: { scopes: DeviceScope[] } = { scopes: ["read"] },
): Promise<{ ok: true; name: string } | Failure> {
  const p = await kvGetProbe<CodeRecord>(kCode(userCode));
  if (p.status === "error") return { error: "Could not read the code right now.", status: 503 };
  if (p.status === "miss") return { error: "That code is unknown or expired. Get a new one on your device.", status: 404 };
  const rec = p.value;
  if (rec.wallet && rec.wallet !== wallet.toLowerCase()) return { error: "That code was already approved by another wallet.", status: 409 };
  const list = await listDevices(wallet);
  if (list == null) return { error: "Could not read your linked devices right now.", status: 503 };
  if (list.length >= MAX_DEVICES) return { error: `You already have ${MAX_DEVICES} linked devices. Unlink one first.`, status: 409 };
  const left = Math.max(1, Math.ceil((rec.createdAt + CODE_TTL_S * 1000 - Date.now()) / 1000));
  const scopes = grantForKind(rec.kind, grant).scopes;
  try { await kvSetOrThrow(kCode(userCode), { ...rec, wallet: wallet.toLowerCase(), approvedAt: Date.now(), scopes }, left); }
  catch { return { error: "Could not approve right now. Try again.", status: 503 }; }
  return { ok: true, name: rec.name };
}

/* ─── 3. the device collects its token, once ─────────────────────────────── */

export type TokenPoll =
  | { status: "pending" }
  | { status: "issued"; token: string; device: DeviceRecord }
  | { status: "expired" }
  | Failure;

export async function pollForToken(deviceCode: string): Promise<TokenPoll> {
  if (!DEVICE_CODE_RE.test(deviceCode)) return { status: "expired" };
  const dcHash = sha256(deviceCode);
  const c = await kvGetProbe<string>(kPoll(dcHash));
  if (c.status === "error") return { error: "Try again shortly.", status: 503 };
  if (c.status === "miss") return { status: "expired" };
  const p = await kvGetProbe<CodeRecord>(kCode(c.value));
  if (p.status === "error") return { error: "Try again shortly.", status: 503 };
  if (p.status === "miss" || p.value.dcHash !== dcHash) return { status: "expired" };
  const rec = p.value;
  if (!rec.wallet) return { status: "pending" };

  // Exactly one poll mints: a duplicate (retry, two windows) loses the NX race.
  if (!(await kvSetNX(kClaim(dcHash), 1, CODE_TTL_S))) return { status: "expired" };

  const token = `bbt_${randomBytes(32).toString("hex")}`;
  const hash = sha256(token);
  const now = Date.now();
  const device: DeviceRecord = {
    id: hash.slice(0, 16), wallet: rec.wallet, name: rec.name, kind: rec.kind, createdAt: now, expiresAt: now + TOKEN_TTL_S * 1000,
    scopes: deviceScopes(rec),
  };
  try {
    await kvSetOrThrow(kTok(hash), device, TOKEN_TTL_S);
    const list = (await listDevices(rec.wallet)) ?? [];
    const next: DeviceListEntry[] = [{ id: device.id, hash, name: device.name, kind: device.kind, createdAt: now, expiresAt: device.expiresAt, scopes: device.scopes }, ...list].slice(0, MAX_DEVICES);
    await kvSetOrThrow(kList(rec.wallet), next, TOKEN_TTL_S);
  } catch {
    await kvDel(kTok(hash));
    return { error: "Could not finish linking. Get a new code on your device.", status: 503 };
  }
  await kvDel(kCode(c.value), kPoll(dcHash));
  return { status: "issued", token, device };
}

/* ─── 4. reading with the token ──────────────────────────────────────────── */

export type TokenRead = { status: "ok"; device: DeviceRecord } | { status: "invalid" } | { status: "unavailable" };

export async function readDeviceToken(authorization: string | null): Promise<TokenRead> {
  const m = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!m || !TOKEN_RE.test(m[1])) return { status: "invalid" };
  const p = await kvGetProbe<DeviceRecord>(kTok(sha256(m[1])));
  if (p.status === "error") return { status: "unavailable" };
  if (p.status === "miss" || !p.value?.wallet || Date.now() > p.value.expiresAt) return { status: "invalid" };
  return { status: "ok", device: p.value };
}

/* ─── listing and revoking ───────────────────────────────────────────────── */

/** null ⟹ unreadable (never shown as "no devices"). Expired entries dropped. */
export async function listDevices(wallet: string): Promise<DeviceListEntry[] | null> {
  const p = await kvGetProbe<DeviceListEntry[]>(kList(wallet));
  if (p.status === "error") return null;
  const now = Date.now();
  return p.status === "hit" && Array.isArray(p.value) ? p.value.filter((d) => d.expiresAt > now) : [];
}

/**
 * Does this wallet have any live linked device? Read by /api/chat on every
 * tool turn to decide whether to write agent activity at all, so a wallet
 * with no device costs one KV read per turn and never a write. Memoized 60s
 * per instance: linking is rare, chat turns are not (#148).
 */
const linkedMemo = new Map<string, { at: number; v: boolean }>();
export async function hasLinkedDevices(wallet: string): Promise<boolean> {
  const w = wallet.toLowerCase();
  const hit = linkedMemo.get(w);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  const list = await listDevices(w);
  const v = !!list && list.length > 0;
  linkedMemo.set(w, { at: Date.now(), v });
  return v;
}

export async function revokeDevice(wallet: string, id: string): Promise<"ok" | "not_found" | "unavailable"> {
  const list = await listDevices(wallet);
  if (list == null) return "unavailable";
  const hit = list.find((d) => d.id === id);
  if (!hit) return "not_found";
  try {
    await kvDelOrThrow(kTok(hit.hash));
    await kv.set(kList(wallet), list.filter((d) => d.id !== id), { ex: TOKEN_TTL_S });
  } catch { return "unavailable"; }
  return "ok";
}

/** A device unlinking itself: deletes the token it presented (by its hash, so
 *  it works even if the wallet's list lost the entry), then the list entry. */
export async function revokePresentedToken(authorization: string | null): Promise<"ok" | "invalid" | "unavailable"> {
  const t = await readDeviceToken(authorization);
  if (t.status !== "ok") return t.status;
  const token = authorization!.match(/^Bearer\s+(\S+)$/i)![1];
  try { await kvDelOrThrow(kTok(sha256(token))); } catch { return "unavailable"; }
  await revokeDevice(t.device.wallet, t.device.id); // list tidy-up; the token is already dead
  return "ok";
}
