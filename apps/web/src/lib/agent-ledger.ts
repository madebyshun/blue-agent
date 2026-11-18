/**
 * Per-agent job record (BaseCity plan item 3, ShunTr 2026-11-18).
 *
 * Jobs live 90 days in KV (lib/jobs.ts); an agent's record must not. Every
 * delivery and unlock is also appended here, with NO TTL, keyed by the
 * ERC-8004 agent id. Readers merge this with the live board, so deliveries
 * from before this index existed still show while their job is alive.
 *
 * What counts:
 *  - purchased: an unlock whose payer is neither the agent's owner nor its
 *    payTo. Self-paid unlocks are listed but excluded from every total.
 *  - verified USDC: the unlock tx's receipt holds a USDC Transfer on Base
 *    from the payer to the payTo of at least the price. Checked once per tx
 *    and cached forever (a mined receipt does not change); an unreadable
 *    receipt is "unverified", never assumed paid.
 */
import { createPublicClient, http, parseAbiItem, decodeEventLog } from "viem";
import { base } from "viem/chains";
import { kv, kvGetProbe, kvMutate } from "@/lib/kv";
import { ERC8004_ABI, ERC8004_IDENTITY } from "@/lib/erc8004";
import { listJobs, type Job } from "@/lib/jobs";

export interface LedgerEntry {
  jobId: string; did: string; title: string; skill: string | null; ticker: string | null;
  at: string; priceUnits: number; payTo: string;
  unlock?: { tx: string | null; payer: string; at: string };
}

const USDC = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const K_IDS = "agents:ids:v1";
const kLedger = (id: string) => `agents:ledger:v1:${id}`;
const kReceipt = (tx: string) => `agents:receipt:v1:${tx.toLowerCase()}`;
const MAX_ENTRIES = 500, MAX_IDS = 5000;
const lc = (s: string) => s.toLowerCase();

export const entryOf = (job: Job, d: Job["deliveries"][number]): LedgerEntry => ({
  jobId: job.id, did: d.id, title: job.title, skill: job.skill ?? null, ticker: job.inputs?.ticker ?? null,
  at: d.at, priceUnits: d.priceUnits, payTo: lc(d.payTo), ...(d.unlock ? { unlock: d.unlock } : {}),
});

/** Append or update one entry. Best effort: the job board stays the source of truth. */
export async function recordLedger(agentId: string, e: LedgerEntry): Promise<void> {
  if (!/^\d{1,12}$/.test(agentId)) return;
  await kvMutate<LedgerEntry[]>(kLedger(agentId), [], (cur) => {
    const i = cur.findIndex((x) => x.did === e.did);
    if (i >= 0) { const next = [...cur]; next[i] = { ...cur[i], ...e }; return next; }
    return [e, ...cur].slice(0, MAX_ENTRIES);
  });
  await kvMutate<string[]>(K_IDS, [], (cur) => (cur.includes(agentId) ? null : [agentId, ...cur].slice(0, MAX_IDS)));
}

/** Every entry for an agent: the permanent index merged with the live board. */
export async function readLedger(agentId: string, live?: Job[] | null): Promise<LedgerEntry[]> {
  const p = await kvGetProbe<LedgerEntry[]>(kLedger(agentId));
  const stored = p.status === "hit" ? p.value : [];
  const byDid = new Map(stored.map((e) => [e.did, e]));
  for (const j of live ?? []) for (const d of j.deliveries) if (d.agentId === agentId) byDid.set(d.id, { ...byDid.get(d.id), ...entryOf(j, d) });
  return [...byDid.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Agent ids with any job activity: the index plus whoever delivers on the live board. */
export async function knownAgentIds(live?: Job[] | null): Promise<string[]> {
  const p = await kvGetProbe<string[]>(K_IDS);
  const ids = new Set(p.status === "hit" ? p.value : []);
  for (const j of live ?? []) for (const d of j.deliveries) ids.add(d.agentId);
  return [...ids].filter((x) => /^\d{1,12}$/.test(x));
}

const client = () => createPublicClient({ chain: base, transport: http(process.env.BASE_RPC_URL || "https://mainnet.base.org") });

/** Pure: does this receipt's log list hold USDC payer → payTo of at least `units`? */
export function receiptPays(logs: { address: string; topics: readonly string[]; data: string }[], payer: string, payTo: string, units: number): boolean {
  return logs.some((l) => {
    if (lc(l.address) !== USDC) return false;
    try {
      const ev = decodeEventLog({ abi: [TRANSFER], topics: l.topics as [`0x${string}`, ...`0x${string}`[]], data: l.data as `0x${string}` });
      return lc(ev.args.from) === lc(payer) && lc(ev.args.to) === lc(payTo) && ev.args.value >= BigInt(units);
    } catch { return false; }
  });
}

/** true / false once the receipt is read (cached forever); null = could not read now. */
export async function verifyUnlock(e: LedgerEntry): Promise<boolean | null> {
  const tx = e.unlock?.tx;
  if (!tx || !/^0x[0-9a-fA-F]{64}$/.test(tx)) return false;
  const cached = await kv.get<boolean>(kReceipt(tx)).catch(() => null);
  if (typeof cached === "boolean") return cached;
  try {
    const r = await client().getTransactionReceipt({ hash: tx as `0x${string}` });
    const ok = r.status === "success" && receiptPays(r.logs, e.unlock!.payer, e.payTo, e.priceUnits);
    await kv.set(kReceipt(tx), ok).catch(() => undefined);
    return ok;
  } catch { return null; }
}

export interface AgentRecord {
  delivered: number;
  purchased: number;          // unlocks by someone other than the agent itself
  selfPaid: number;
  verifiedUsd: number;        // purchased AND receipt verified
  unverified: number;         // purchased, receipt not (yet) readable or not matching
  uniquePayers: number;
  skills: string[];
  receipts: { tx: string; usd: number; payer: string; verified: boolean | null; title: string; jobId: string }[];
}

/** Totals for an agent. `self` = its owner and payTo wallets. */
export async function agentRecord(entries: LedgerEntry[], self: string[]): Promise<AgentRecord> {
  const mine = new Set(self.map(lc));
  const unlocked = entries.filter((e) => e.unlock);
  // Self-paid: the payer is the agent's owner, its registered payTo, or the
  // delivery's own payTo (paying yourself moves no money).
  const bought = unlocked.filter((e) => !mine.has(lc(e.unlock!.payer)) && lc(e.unlock!.payer) !== lc(e.payTo));
  const checks = await Promise.all(bought.map((e) => verifyUnlock(e)));
  return {
    delivered: entries.length,
    purchased: bought.length,
    selfPaid: unlocked.length - bought.length,
    verifiedUsd: bought.reduce((a, e, i) => a + (checks[i] ? e.priceUnits / 1e6 : 0), 0),
    unverified: checks.filter((c) => c !== true).length,
    uniquePayers: new Set(bought.map((e) => lc(e.unlock!.payer))).size,
    skills: [...new Set(entries.map((e) => e.skill).filter((s): s is string => !!s))],
    receipts: bought.map((e, i) => ({ tx: e.unlock!.tx ?? "", usd: e.priceUnits / 1e6, payer: e.unlock!.payer, verified: checks[i], title: e.title, jobId: e.jobId })),
  };
}

// ── identity, light: owner + registration, no log scans ─────────────────────

export interface AgentCard { id: string; owner: string; uri: string; name: string; image: string | null; payTo: string; blocky: { url: string } | null }

const BLOCKY_CARD = /^https:\/\/(www\.)?basecity\.space\/api\/agent-card\?/;

/**
 * A Blocky only when BOTH hold: the agent's on-chain tokenURI points at
 * BaseCity's agent-card endpoint, AND the card served there lists this agent
 * id under `registrations`. A name like "Blocky #N" proves nothing.
 */
export function isBlockyCard(uri: string, card: { registrations?: { agentId?: unknown }[] } | null, id: string): boolean {
  return BLOCKY_CARD.test(uri) && !!card?.registrations?.some((r) => String(r.agentId) === id);
}

export async function readAgentCard(id: string): Promise<AgentCard | null> {
  if (!/^\d{1,12}$/.test(id)) return null;
  const c = client();
  let owner: string;
  try { owner = lc(await c.readContract({ address: ERC8004_IDENTITY, abi: ERC8004_ABI, functionName: "ownerOf", args: [BigInt(id)] })); } catch { return null; }
  const uri = await c.readContract({ address: ERC8004_IDENTITY, abi: ERC8004_ABI, functionName: "tokenURI", args: [BigInt(id)] }).catch(() => "");
  let reg: { name?: string; image?: string; payTo?: string; url?: string; registrations?: { agentId?: unknown }[] } | null = null;
  try {
    if (uri.startsWith("data:")) {
      const body = uri.slice(uri.indexOf(",") + 1);
      reg = JSON.parse(uri.includes(";base64,") ? Buffer.from(body, "base64").toString("utf8") : decodeURIComponent(body));
    } else if (/^https:\/\//.test(uri)) {
      const r = await fetch(uri, { signal: AbortSignal.timeout(5000), next: { revalidate: 600 } });
      if (r.ok) reg = await r.json();
    }
  } catch { reg = null; }
  const name = typeof reg?.name === "string" && reg.name.trim() ? reg.name.trim().slice(0, 60) : `Agent #${id}`;
  const image = typeof reg?.image === "string" && /^https:\/\//.test(reg.image) ? reg.image : null;
  const payTo = typeof reg?.payTo === "string" && /^0x[0-9a-fA-F]{40}$/.test(reg.payTo) ? lc(reg.payTo) : owner;
  const blocky = isBlockyCard(uri, reg, id) ? { url: typeof reg?.url === "string" && /^https:\/\/(www\.)?basecity\.space\//.test(reg.url) ? reg.url : "https://www.basecity.space" } : null;
  return { id, owner, uri, name, image, payTo, blocky };
}

/** The directory: every agent with job activity, with its record. */
export async function readDirectory(limit = 60) {
  const live = await listJobs(500);
  const ids = (await knownAgentIds(live)).slice(0, limit);
  const rows = await Promise.all(ids.map(async (id) => {
    const card = await readAgentCard(id);
    if (!card) return null;
    const entries = await readLedger(id, live);
    return { card, record: await agentRecord(entries, [card.owner, card.payTo]) };
  }));
  return { rows: rows.filter((r): r is NonNullable<typeof r> => !!r), readable: live !== null };
}
