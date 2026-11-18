/**
 * Webhooks for new jobs (BaseCity plan item 9, ShunTr 2026-11-18).
 *
 * A signed-in wallet subscribes an https URL, optionally to some skills. When a
 * job is posted, each matching subscriber gets one POST with the public job,
 * signed with HMAC-SHA256 under a secret Blue generates and shows ONCE at
 * subscribe time (X-Blue-Signature: sha256=<hex> over the raw body). The
 * subscriber verifies it; Blue keeps the secret only to sign.
 *
 * Bounds: 3 subscriptions per wallet, 200 in all; https only, no internal
 * hosts, redirects not followed (SSRF); 3s per delivery; a subscription that
 * fails 5 times in a row is switched off (it stays listed, `disabled: true`).
 * Delivery is best effort, never retried, and runs after the post's response.
 */
import { assertSafeMcpUrl } from "@/lib/mcp-client";
import { kvGetProbe, kvMutate } from "@/lib/kv";

export interface JobSub { id: string; wallet: string; url: string; skills: string[]; secret: string; createdAt: string; fails: number; disabled?: boolean }

const KEY = "jobs:webhooks:v1";
export const SUB_LIMITS = { perWallet: 3, total: 200, maxFails: 5, timeoutMs: 3000 } as const;

const hex = (b: ArrayBuffer | Uint8Array) => Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, "0")).join("");

/** Why this URL cannot be subscribed, or null. Pure. */
export function webhookUrlProblem(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return "url: an https URL up to 500 characters.";
  try {
    const u = assertSafeMcpUrl(raw);
    if (u.protocol !== "https:") return "url: https only.";
    if (/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) || u.hostname.includes(":")) return "url: use a hostname, not an IP address.";
  } catch (e) { return `url: ${(e as Error).message}.`; }
  return null;
}

/** Does this subscription want a job with this skill? No skills = every job. Pure. */
export const wants = (s: Pick<JobSub, "skills" | "disabled">, skill: string | null | undefined) =>
  !s.disabled && (s.skills.length === 0 || (!!skill && s.skills.includes(skill)));

export async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return `sha256=${hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)))}`;
}

export async function listSubs(): Promise<JobSub[] | null> {
  const p = await kvGetProbe<JobSub[]>(KEY);
  return p.status === "error" ? null : p.status === "hit" ? p.value : [];
}

export async function addSub(wallet: string, url: string, skills: string[]): Promise<JobSub | string> {
  const sub: JobSub = { id: hex(crypto.getRandomValues(new Uint8Array(6))), wallet, url, skills, secret: hex(crypto.getRandomValues(new Uint8Array(32))), createdAt: new Date().toISOString(), fails: 0 };
  let why: string | null = null;
  const r = await kvMutate<JobSub[]>(KEY, [], (cur) => {
    if (cur.filter((s) => s.wallet === wallet).length >= SUB_LIMITS.perWallet) { why = `At most ${SUB_LIMITS.perWallet} subscriptions per wallet; remove one first.`; return null; }
    if (cur.length >= SUB_LIMITS.total) { why = "Subscriptions are full right now."; return null; }
    return [...cur, sub];
  });
  if (why) return why;
  return r === "ok" ? sub : "Could not save the subscription right now.";
}

export async function removeSub(wallet: string, id: string): Promise<boolean> {
  const r = await kvMutate<JobSub[]>(KEY, [], (cur) => (cur.some((s) => s.id === id && s.wallet === wallet) ? cur.filter((s) => s.id !== id) : null));
  return r === "ok";
}

/** POST one new job to every matching subscriber. Call after the response is sent. */
export async function notifyNewJob(job: { id: string; contract?: { skill: string | null } } & Record<string, unknown>): Promise<void> {
  const subs = await listSubs();
  if (!subs?.length) return;
  const skill = job.contract?.skill ?? null;
  const body = JSON.stringify({ event: "job.created", job, page: `https://app.blueagent.dev/jobs/${job.id}`, sent_at: new Date().toISOString() });
  const outcome = new Map<string, boolean>();
  await Promise.all(subs.filter((s) => wants(s, skill)).map(async (s) => {
    try {
      const r = await fetch(s.url, {
        method: "POST", redirect: "manual", signal: AbortSignal.timeout(SUB_LIMITS.timeoutMs),
        headers: { "content-type": "application/json", "x-blue-event": "job.created", "x-blue-signature": await sign(s.secret, body), "user-agent": "BlueAgent-Webhooks/1" },
        body,
      });
      outcome.set(s.id, r.status >= 200 && r.status < 300);
    } catch { outcome.set(s.id, false); }
  }));
  if (!outcome.size) return;
  await kvMutate<JobSub[]>(KEY, [], (cur) => cur.map((s) => {
    if (!outcome.has(s.id)) return s;
    const fails = outcome.get(s.id) ? 0 : s.fails + 1;
    return { ...s, fails, ...(fails >= SUB_LIMITS.maxFails ? { disabled: true } : {}) };
  }));
}
