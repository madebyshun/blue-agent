/**
 * Blue Agent job board — work first, paid on unlock (after TOLLY's, adapted).
 *
 *   1. A poster (signed in with their wallet) posts a job with a budget.
 *   2. An agent with an ERC-8004 identity on Base delivers: a public PREVIEW,
 *      a PRICE ≤ budget, the wallet it is paid to, and the full RESULT, which
 *      stays hidden.
 *   3. The poster pays that price over x402 STRAIGHT TO THE AGENT's wallet and
 *      the result unlocks. Nobody pays for work that was not delivered.
 *
 * Decided by ShunTr 2026-10-28: no platform fee (one x402 authorization pays
 * one wallet, and a fee would mean a second signature or custody); only
 * ERC-8004 agents deliver; text is length-capped, rate-limited, and ShunTr can
 * hide a job. Blue Agent never holds a poster's or an agent's money.
 *
 * Results are stored here until unlocked, and are shown only to the poster.
 */
import { isStockSkill, workerJobContract, type StockInputs } from "../../../../packages/core/src/workers";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { kv, kvGetProbe, kvMutate } from "@/lib/kv";

export const LIMITS = {
  title: 100, brief: 2_000, preview: 600, result: 20_000,
  minBudget: 10_000, maxBudget: 100_000_000,      // $0.01 … $100, USDC micro-units
  openPerPoster: 5, deliveriesPerJob: 20, indexMax: 500,
} as const;

export type JobStatus = "open" | "closed" | "hidden";

export interface Delivery {
  id: string;
  agent: string;          // the delivering wallet (owner of agentId)
  agentId: string;        // ERC-8004 id on Base
  payTo: string;          // where the unlock payment goes
  priceUnits: number;     // ≤ the job's budget
  preview: string;
  at: string;
  unlock?: { tx: string | null; payer: string; at: string };
}

export interface Job {
  id: string;
  title: string;
  brief: string;
  budgetUnits: number;
  poster: string;
  status: JobStatus;
  createdAt: string;
  deliveries: Delivery[];
  /** Optional structured research job (stock skills). Absent on free-text jobs. */
  skill?: string;
  inputs?: StockInputs;
  /**
   * Direct hire (BaseCity plan, ShunTr 2026-11-18): only this ERC-8004 agent
   * may deliver until `inviteUntil`; after that the job is open to anyone.
   */
  invitedAgentId?: string;
  inviteUntil?: string;
}

/** How long an invited agent holds a direct-hire job before it opens up. */
export const INVITE_MS = 48 * 3600 * 1000;
const AGENT_ID = /^\d{1,12}$/;

/** A direct-hire invite from user input: the agent id, null for none, or a refusal. Pure. */
export function inviteSpec(raw: unknown): string | null | { refusal: string } {
  if (raw == null || raw === "") return null;
  const id = String(raw).trim().replace(/^#/, "");
  return AGENT_ID.test(id) ? id : { refusal: "invitedAgentId: an ERC-8004 agent id on Base (digits)." };
}

/** The invited agent, while its hold is still running; null once it lapsed. Pure. */
export function activeInvite(job: Pick<Job, "invitedAgentId" | "inviteUntil">, now = Date.now()): string | null {
  if (!job.invitedAgentId || !job.inviteUntil) return null;
  return now < Date.parse(job.inviteUntil) ? job.invitedAgentId : null;
}

const K_INDEX = "jobs:index";
const itemKey = (id: string) => `jobs:item:${id}`;
const resultKey = (jobId: string, did: string) => `jobs:result:${jobId}:${did}`;
const TTL = 90 * 24 * 3600;
const ADDR = /^0x[0-9a-fA-F]{40}$/;

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => b.toString(16).padStart(2, "0")).join("");
/** Strip control characters (keep newlines/tabs) and trim. Text is shown as text, never HTML. */
export const clean = (s: unknown, max: number) =>
  String(s ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim().slice(0, max);

/** Why a job cannot be posted, or null. Pure. */
export function jobProblem(title: string, brief: string, budgetUsd: number): string | null {
  if (title.length < 4) return "Title: at least 4 characters.";
  if (brief.length < 10) return "Brief: say what you need in at least 10 characters.";
  const u = Math.round(budgetUsd * 1e6);
  if (!Number.isFinite(u) || u < LIMITS.minBudget || u > LIMITS.maxBudget) return "Budget: between $0.01 and $100 USDC.";
  return null;
}

/**
 * Resolve a structured stock job. The token ADDRESS identifies the stock (a
 * ticker exists on Base and Robinhood Chain); it must be in Coinbase's Base
 * list (checked on chain). A ticker, if sent, must agree with that entry.
 * Returns the stored skill+inputs, null for a free-text job, or a refusal.
 */
export function stockJobSpec(skill: unknown, token: unknown, ticker?: unknown): { skill: string; inputs: StockInputs } | null | string {
  if (skill == null || skill === "") return null;
  if (!isStockSkill(skill)) return "Unknown skill.";
  if (typeof token !== "string" || !ADDR.test(token)) return "token: the stock's 0x address on Base 8453 is required.";
  const hit = COINBASE_BASE_STOCKS.find((s) => s.token.toLowerCase() === token.toLowerCase());
  if (!hit) return "token is not a Coinbase tokenized stock on Base 8453.";
  if (ticker != null && ticker !== "" && String(ticker).toUpperCase().replace(/C$/, "") !== hit.ticker && String(ticker).toUpperCase() !== hit.ticker) return `ticker does not match token (that address is ${hit.ticker}).`;
  return { skill, inputs: { ticker: hit.ticker, token: hit.token, chainId: 8453 } };
}

/** Why a delivery cannot be accepted, or null. Pure. */
export function deliveryProblem(job: Job, d: { agent: string; agentId?: string; payTo: string; priceUsd: number; preview: string; result: string }, now = Date.now()): string | null {
  if (job.status !== "open") return "This job is not open.";
  const invited = activeInvite(job, now);
  if (invited && d.agentId !== invited) return `This job is a direct hire for agent #${invited} until ${job.inviteUntil}; it opens to everyone after that.`;
  if (!ADDR.test(d.payTo)) return "payTo must be a 0x address on Base.";
  const u = Math.round(d.priceUsd * 1e6);
  if (!Number.isFinite(u) || u < LIMITS.minBudget) return "Price: at least $0.01.";
  if (u > job.budgetUnits) return "Price is above the job's budget.";
  if (d.preview.length < 10) return "Preview: at least 10 characters, so the poster can judge it.";
  if (!d.result) return "Result is empty.";
  if (job.deliveries.length >= LIMITS.deliveriesPerJob) return "This job has the most deliveries it takes.";
  if (job.deliveries.some((x) => x.agent === d.agent.toLowerCase())) return "This wallet already delivered to this job.";
  if (d.agent.toLowerCase() === job.poster) return "The poster cannot deliver to their own job.";
  return null;
}

export async function listJobs(limit = 50): Promise<Job[] | null> {
  const idx = await kvGetProbe<string[]>(K_INDEX);
  if (idx.status === "error") return null;
  const ids = idx.status === "hit" ? idx.value.slice(0, limit) : [];
  const jobs = await Promise.all(ids.map((id) => kv.get<Job>(itemKey(id)).catch(() => null)));
  return jobs.filter((j): j is Job => !!j && j.status !== "hidden");
}

export async function getJob(id: string): Promise<Job | null | undefined> {
  if (!/^[0-9a-f]{12}$/.test(id)) return null;
  const p = await kvGetProbe<Job>(itemKey(id));
  return p.status === "error" ? undefined : p.status === "hit" ? p.value : null;
}

export async function createJob(poster: string, title: string, brief: string, budgetUnits: number, spec?: { skill: string; inputs: StockInputs } | null, invitedAgentId?: string | null): Promise<Job | string> {
  const open = ((await listJobs(LIMITS.indexMax)) ?? []).filter((j) => j.poster === poster && j.status === "open").length;
  if (open >= LIMITS.openPerPoster) return `You have ${open} open jobs; close one first.`;
  const job: Job = { id: newId(), title, brief, budgetUnits, poster, status: "open", createdAt: new Date().toISOString(), deliveries: [], ...(spec ?? {}),
    ...(invitedAgentId ? { invitedAgentId, inviteUntil: new Date(Date.now() + INVITE_MS).toISOString() } : {}) };
  await kv.set(itemKey(job.id), job, { ex: TTL });
  const r = await kvMutate<string[]>(K_INDEX, [], (cur) => [job.id, ...cur].slice(0, LIMITS.indexMax));
  if (r !== "ok") return "Could not save the job right now; nothing was posted.";
  return job;
}

export async function addDelivery(job: Job, d: Omit<Delivery, "id" | "at">, result: string): Promise<Delivery | string> {
  const delivery: Delivery = { ...d, id: newId(), at: new Date().toISOString() };
  await kv.set(resultKey(job.id, delivery.id), result, { ex: TTL });
  const r = await kvMutate<Job>(itemKey(job.id), job, (cur) => {
    if (deliveryProblem(cur, { agent: d.agent, agentId: d.agentId, payTo: d.payTo, priceUsd: d.priceUnits / 1e6, preview: d.preview, result })) return null;
    return { ...cur, deliveries: [...cur.deliveries, delivery] };
  }, TTL);
  if (r !== "ok") return "Could not record the delivery right now.";
  // Permanent per-agent record (lib/agent-ledger.ts), best effort.
  await import("@/lib/agent-ledger").then((m) => m.recordLedger(d.agentId, m.entryOf(job, delivery))).catch(() => undefined);
  return delivery;
}

export async function readResult(jobId: string, did: string): Promise<string | null> {
  return (await kv.get<string>(resultKey(jobId, did)).catch(() => null)) ?? null;
}

export async function recordUnlock(jobId: string, did: string, unlock: NonNullable<Delivery["unlock"]>): Promise<void> {
  let after: Job | null = null;
  await kvMutate<Job>(itemKey(jobId), {} as Job, (cur) => cur.id
    ? (after = { ...cur, deliveries: cur.deliveries.map((x) => (x.id === did ? { ...x, unlock } : x)) })
    : null, TTL);
  const job = after as Job | null;
  const d = job?.deliveries.find((x) => x.id === did);
  if (job && d) await import("@/lib/agent-ledger").then((m) => m.recordLedger(d.agentId, m.entryOf(job, d))).catch(() => undefined);
}

export async function setStatus(jobId: string, status: JobStatus): Promise<boolean> {
  const r = await kvMutate<Job>(itemKey(jobId), {} as Job, (cur) => (cur.id ? { ...cur, status } : null), TTL);
  return r === "ok";
}

/** A job as anyone may see it: deliveries without results; unlock state without the payer. */
export function publicJob(j: Job) {
  return {
    ...j,
    contract: workerJobContract(j),
    deliveries: j.deliveries.map(({ unlock, ...d }) => ({ ...d, unlocked: !!unlock, receipt: unlock?.tx && /^0x[0-9a-f]{64}$/i.test(unlock.tx) ? { tx: unlock.tx, payer: unlock.payer, payTo: d.payTo, amountUnits: d.priceUnits, chainId: 8453, settledAt: unlock.at } : null })),
  };
}

// ── Delivering without a browser session (agents) ────────────────────────────
//
// An agent signs this exact text with the wallet that owns its ERC-8004 id and
// sends {signer, signature, issuedAt} with the delivery. Pure: the route and the
// agent build the same string. It binds every field that matters, so a captured
// signature cannot be reused for a different job, price, payee or result; a
// replay of the same one is refused anyway (one delivery per wallet per job),
// and issuedAt must be within 10 minutes.
export const DELIVERY_SIG_WINDOW_MS = 10 * 60 * 1000;

export async function sha256Hex(s: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function deliveryMessage(f: { jobId: string; agentId: string; payTo: string; priceUnits: number; preview: string; result: string; issuedAt: string }): Promise<string> {
  return [
    "Blue Agent job delivery",
    `job: ${f.jobId}`,
    `agent: ${f.agentId}`,
    `payTo: ${f.payTo.toLowerCase()}`,
    `price: ${f.priceUnits} (USDC micro-units, Base 8453)`,
    `preview-sha256: ${await sha256Hex(f.preview)}`,
    `result-sha256: ${await sha256Hex(f.result)}`,
    `issued: ${f.issuedAt}`,
  ].join("\n");
}

// ── Posting without a browser session (agents) ───────────────────────────────
//
// BaseCity plan item 6 (ShunTr 2026-11-18). The poster signs this exact text
// with its wallet (EOA, or a smart account via ERC-1271/6492) and sends
// {signer, signature, issuedAt} with the job. It binds every field, so a
// captured signature cannot post a different job; issuedAt must be within 10
// minutes, and each signature posts once. Signed posts are limited per wallet
// per UTC day (API_POSTS_PER_DAY), on top of LIMITS.openPerPoster.
export const API_POSTS_PER_DAY = 10;
/** The x402 anti-spam fee for posting without a session or signature: $0.02 (ShunTr 2026-11-18). */
export const POST_FEE_UNITS = 20_000;

export async function jobPostMessage(f: { title: string; brief: string; budgetUnits: number; skill?: string | null; token?: string | null; invitedAgentId?: string | null; issuedAt: string }): Promise<string> {
  return [
    "Blue Agent job post v1",
    "Domain: blueagent.dev | Base 8453",
    `title-sha256: ${await sha256Hex(f.title)}`,
    `brief-sha256: ${await sha256Hex(f.brief)}`,
    `budget: ${f.budgetUnits} (USDC micro-units, Base 8453)`,
    `skill: ${f.skill || "-"}`,
    `token: ${f.token ? f.token.toLowerCase() : "-"}`,
    `invite: ${f.invitedAgentId || "-"}`,
    `issued: ${f.issuedAt}`,
  ].join("\n");
}

/** Count one signed post for this wallet today; false once over the limit. Also burns the signature. */
export async function takeApiPost(wallet: string, signature: string, now = new Date()): Promise<"ok" | "limit" | "replay" | "error"> {
  const sig = await sha256Hex(signature.toLowerCase());
  const seen = { replay: false };
  const used = await kvMutate<boolean>(`jobs:postsig:${sig}`, false, (cur) => { if (cur) { seen.replay = true; return null; } return true; }, 900);
  if (seen.replay) return "replay";
  if (used !== "ok") return "error";
  const cap = { over: false };
  const day = now.toISOString().slice(0, 10);
  const r = await kvMutate<number>(`jobs:apiposts:${wallet}:${day}`, 0, (n) => { if (n >= API_POSTS_PER_DAY) { cap.over = true; return null; } return n + 1; }, 2 * 86400);
  if (cap.over) return "limit";
  return r === "ok" ? "ok" : "error";
}

/** Open jobs as an agent should see them: what to do, for how much, where to deliver. */
export function jobsForAgents(jobs: Job[], limit = 10) {
  return jobs.filter((j) => j.status === "open").slice(0, limit).map((j) => ({
    id: j.id,
    title: j.title,
    brief: j.brief.slice(0, 400),
    budget_usd: j.budgetUnits / 1e6,
    deliveries: j.deliveries.length,
    invited_agent_id: activeInvite(j),
    invite_until: activeInvite(j) ? j.inviteUntil : null,
    contract: workerJobContract(j),
    page: `https://app.blueagent.dev/jobs/${j.id}`,
    deliver: `POST https://blueagent.dev/api/jobs/${j.id}/deliveries`,
  }));
}
