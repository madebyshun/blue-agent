/**
 * Profile schema + helpers — wallet-gated user profiles backed by Upstash KV.
 *
 * Storage layout:
 *   profile:0xabc...  →  UserProfile JSON
 *
 * Edits are authenticated via an EIP-191 signature over `profileSignMessage()`.
 * Anyone can read; only the wallet owner can write.
 */

import { kv } from "./kv";

export interface UserProfile {
  address:     string;             // canonical lowercase 0x… address
  displayName?: string;            // shown instead of truncated address
  bio?:        string;             // 280 chars max
  avatarUrl?:  string;             // image URL (uploads come later)
  x?:          string;             // X/Twitter handle (without @)
  farcaster?:  string;             // Farcaster handle
  github?:     string;             // GitHub username
  website?:    string;             // https://… link
  createdAt:   number;             // ms epoch
  updatedAt:   number;             // ms epoch
}

// ─── Field sanitisation ───────────────────────────────────────────────────────

const MAX = {
  displayName: 40,
  bio:         280,
  avatarUrl:   500,
  handle:      40,                 // x / farcaster / github
  website:     200,
};

function stripCtl(s: string): string {
  // Drop control chars except newline (which we'll still cap below).
  return s.replace(/[\x00-\x09\x0B-\x1F\x7F]/g, "").trim();
}

function clipHandle(h: string): string {
  return stripCtl(h).replace(/^@+/, "").slice(0, MAX.handle);
}

function clipUrl(u: string): string {
  const s = stripCtl(u).slice(0, MAX.website);
  if (!s) return "";
  // Only http(s) — block javascript: + data: schemes.
  if (!/^https?:\/\//i.test(s)) return "";
  return s;
}

export function sanitize(input: Partial<UserProfile>): Partial<UserProfile> {
  const out: Partial<UserProfile> = {};
  if (input.displayName !== undefined) out.displayName = stripCtl(input.displayName).slice(0, MAX.displayName);
  if (input.bio         !== undefined) out.bio         = stripCtl(input.bio).replace(/\n{3,}/g, "\n\n").slice(0, MAX.bio);
  if (input.avatarUrl   !== undefined) out.avatarUrl   = clipUrl(input.avatarUrl);
  if (input.x           !== undefined) out.x           = clipHandle(input.x);
  if (input.farcaster   !== undefined) out.farcaster   = clipHandle(input.farcaster);
  if (input.github      !== undefined) out.github      = clipHandle(input.github);
  if (input.website     !== undefined) out.website     = clipUrl(input.website);
  return out;
}

// ─── Signature message ────────────────────────────────────────────────────────

/**
 * Canonical message the wallet must sign to authorise a profile update.
 * Includes the nonce + timestamp so the server can reject replays.
 */
export function profileSignMessage(
  address: string,
  nonce:   string,
  issuedAt: string,
): string {
  return [
    `Blue Agent — Profile Update`,
    ``,
    `Wallet:    ${address.toLowerCase()}`,
    `Issued at: ${issuedAt}`,
    `Nonce:     ${nonce}`,
    ``,
    `Signing this message authorises a profile update for the wallet`,
    `above. It is not a transaction, has zero gas cost, and only saves`,
    `your bio + social links to Blue Agent's KV store. No wallet action`,
    `is taken.`,
  ].join("\n");
}

// ─── KV helpers ───────────────────────────────────────────────────────────────

const key = (addr: string) => `profile:${addr.toLowerCase()}`;

export async function getProfile(addr: string): Promise<UserProfile | null> {
  const raw = await kv.get(key(addr));
  if (!raw) return null;
  try {
    return typeof raw === "string" ? (JSON.parse(raw) as UserProfile) : (raw as UserProfile);
  } catch { return null; }
}

export async function putProfile(addr: string, fields: Partial<UserProfile>): Promise<UserProfile> {
  const existing = await getProfile(addr);
  const now = Date.now();
  const next: UserProfile = {
    ...(existing ?? { address: addr.toLowerCase(), createdAt: now, updatedAt: now }),
    ...sanitize(fields),
    address:   addr.toLowerCase(),
    updatedAt: now,
  };
  await kv.set(key(addr), JSON.stringify(next));
  return next;
}
