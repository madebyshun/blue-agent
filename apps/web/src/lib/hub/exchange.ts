/**
 * Blue Hub v3 — Base Agent Exchange index (docs/bluehub-v3-plan-2026-10-27.md).
 *
 * WHO is listed: every x402 seller the CDP Bazaar knows on Base 8453, keyed by
 * its payTo wallet (P0, 2026-10-27: 84,777 resources → 1,813 Base payTos).
 * Nobody registers; the page fills itself from public data, which is the
 * lesson Blue Hub v1 (0 builders in its own registry) paid for.
 *
 * WHAT is measured: USDC on Base paid to that wallet in a transaction that
 * also emitted USDC's `AuthorizationUsed` for the same payer — i.e. an
 * EIP-3009 settlement, the way x402 settles. A plain transfer is not counted.
 * P0 one-day sample: 110,658 transfers to listed payTos, 110,062 of them
 * EIP-3009; 777 providers paid; $3,821.
 * It is GROSS inflow: we cannot know another seller's test wallets, so we do
 * not guess. Blue Agent's own team wallets (TEAM_WALLETS) are split out.
 *
 * HOW: a cursor walks Base blocks forward in 2,000-block chunks; each chunk is
 * folded into a per-UTC-day blob. Public RPC (`HUB_RPC_URL`, default
 * publicnode — mainnet.base.org answers "request limit reached" to getLogs,
 * measured 2026-10-27). Nothing here signs or moves funds.
 */
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { base } from "viem/chains";
import { kv, kvGetProbe, kvMutate } from "@/lib/kv";
import { X402_PAY_TO } from "@/lib/x402-payee";
import { TEAM_WALLETS } from "@/lib/mcp-receipts";

const USDC: Address = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const AUTH_USED = parseAbiItem("event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)");
const BAZAAR = "https://api.cdp.coinbase.com/platform/v2/x402/discovery/resources";

export const CHUNK = 2_000n;          // blocks per getLogs window (~67 min on Base)
const ADDR_BATCH = 200;               // payTos per getLogs (publicnode caps results at 20,000)
const BACKFILL_DAYS = 7;              // first run starts here, then walks forward
const BLOCKS_PER_DAY = 43_200n;
const DAY_TTL = 35 * 24 * 3600;
const PAYER_KEEP = 2_000;             // per provider per day; beyond it the count saturates

const K_INDEX = "hub:x:index";
const K_CURSOR = "hub:x:cursor";
const dayKey = (d: string) => `hub:x:d:${d}`;
// 16 shards by the payTo's first hex digit: one write each, not 1,813 (a
// sequential per-provider write took >10 min against Upstash, 2026-10-28).
const detailKey = (a: string) => `hub:x:p:${a.slice(2, 3)}`;

export interface ProviderIndexEntry { hosts: string[]; resources: number; title: string }
export interface ProviderIndex { updatedAt: string; providers: Record<string, ProviderIndexEntry> }
export interface ResourceSample { url: string; priceUsd: number | null; description: string }
export interface ProviderDetail { payTo: string; hosts: string[]; resources: ResourceSample[]; total: number; updatedAt: string }

interface DayCell { n: number; u: number; pay: string[]; tn?: number; tu?: number }
interface DayBlob { p: Record<string, DayCell>; from: string; to: string }

const rpc = () => createPublicClient({ chain: base, transport: http(process.env.HUB_RPC_URL || "https://base-rpc.publicnode.com", { retryCount: 2 }) });
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10).replace(/-/g, "");

// ── Provider list (Bazaar) ───────────────────────────────────────────────────

interface BazaarItem { resource?: string; description?: string; accepts?: { network?: string; payTo?: string; maxAmountRequired?: string; amount?: string; description?: string }[] }

/** Pull every Bazaar resource and keep the Base payTos. Writes the index and one detail blob per provider. */
export async function refreshProviders(deadline: number): Promise<{ resources: number; providers: number; complete: boolean }> {
  const by = new Map<string, { hosts: Set<string>; res: ResourceSample[]; total: number }>();
  let offset = 0, seen = 0, complete = false;
  while (Date.now() < deadline) {
    // The Bazaar 504s now and then mid-walk (measured 2026-10-28 at offset 23,000): retry the page.
    let r: Response | null = null;
    for (let attempt = 0; attempt < 4 && Date.now() < deadline; attempt++) {
      r = await fetch(`${BAZAAR}?limit=1000&offset=${offset}`, { signal: AbortSignal.timeout(30_000), cache: "no-store" }).catch(() => null);
      if (r?.ok) break;
      await new Promise((ok) => setTimeout(ok, 1_500 * 2 ** attempt));
    }
    if (!r?.ok) throw new Error(`bazaar ${r?.status ?? "unreachable"} at offset ${offset}`);
    const items = ((await r.json()).items ?? []) as BazaarItem[];
    seen += items.length;
    for (const it of items) {
      const url = String(it.resource ?? "");
      let host = "";
      try { host = new URL(url).host; } catch { /* keep "" */ }
      for (const a of it.accepts ?? []) {
        if (a.network !== "eip155:8453" && a.network !== "base") continue;
        const p = String(a.payTo ?? "").toLowerCase();
        if (!/^0x[0-9a-f]{40}$/.test(p)) continue;
        const e = by.get(p) ?? { hosts: new Set<string>(), res: [], total: 0 };
        if (host) e.hosts.add(host);
        e.total++;
        const raw = Number(a.maxAmountRequired ?? a.amount);
        if (e.res.length < 8) e.res.push({ url, priceUsd: Number.isFinite(raw) ? raw / 1e6 : null, description: String(it.description ?? a.description ?? "").slice(0, 160) });
        by.set(p, e);
      }
    }
    if (items.length < 1000) { complete = true; break; }
    offset += 1000;
  }
  // Partial pulls never replace a good index: a cut-short list would silently drop sellers.
  if (!complete) return { resources: seen, providers: by.size, complete };
  const now = new Date().toISOString();
  const providers: Record<string, ProviderIndexEntry> = {};
  for (const [p, e] of by) providers[p] = { hosts: [...e.hosts].slice(0, 3), resources: e.total, title: e.res[0]?.description.slice(0, 90) ?? "" };
  const first = (await kvGetProbe<ProviderIndex>(K_INDEX)).status === "miss";
  await kv.set(K_INDEX, { updatedAt: now, providers } satisfies ProviderIndex);
  // First list ever: anything indexed before it watched Blue Agent alone, so
  // restart the backfill rather than keep windows that miss every other seller.
  if (first) {
    await kv.del(K_CURSOR);
    await Promise.all(Array.from({ length: BACKFILL_DAYS + 2 }, (_, i) => kv.del(dayKey(ymd(Date.now() - i * 86_400_000)))));
  }
  const shards = new Map<string, Record<string, ProviderDetail>>();
  for (const [p, e] of by) {
    const k = detailKey(p);
    const m = shards.get(k) ?? {};
    m[p] = { payTo: p, hosts: [...e.hosts], resources: e.res.slice(0, 5), total: e.total, updatedAt: now };
    shards.set(k, m);
  }
  await Promise.all([...shards].map(([k, m]) => kv.set(k, m, { ex: 21 * 24 * 3600 })));
  return { resources: seen, providers: by.size, complete };
}

export async function readProviderIndex(): Promise<ProviderIndex | null> {
  const p = await kvGetProbe<ProviderIndex>(K_INDEX);
  return p.status === "hit" ? p.value : null;
}

export async function readProviderDetail(payTo: string): Promise<ProviderDetail | null> {
  const a = payTo.toLowerCase();
  const p = await kvGetProbe<Record<string, ProviderDetail>>(detailKey(a));
  return p.status === "hit" ? p.value[a] ?? null : null;
}

/** Everyone we index: the Bazaar's Base sellers, plus Blue Agent itself. */
function watchList(idx: ProviderIndex | null): Address[] {
  const s = new Set(Object.keys(idx?.providers ?? {}));
  s.add(X402_PAY_TO.toLowerCase());
  return [...s] as Address[];
}

// ── Indexer ──────────────────────────────────────────────────────────────────

/** Fold one block window into its UTC day. Pure: exported for the test. */
export function foldChunk(
  blob: DayBlob,
  transfers: { tx: string; from: string; to: string; value: bigint }[],
  authorized: Set<string>,
): DayBlob {
  for (const t of transfers) {
    const from = t.from.toLowerCase();
    if (!authorized.has(`${t.tx.toLowerCase()}:${from}`)) continue;   // not an EIP-3009 settlement
    const to = t.to.toLowerCase();
    const c = (blob.p[to] ??= { n: 0, u: 0, pay: [] });
    const units = Number(t.value);
    if (TEAM_WALLETS.has(from)) { c.tn = (c.tn ?? 0) + 1; c.tu = (c.tu ?? 0) + units; continue; }
    c.n++; c.u += units;
    const short = from.slice(0, 12);
    if (c.pay.length < PAYER_KEEP && !c.pay.includes(short)) c.pay.push(short);
  }
  return blob;
}

/** Walk the cursor forward until `deadline`. Safe to call often: at the head it costs one RPC call. */
export async function indexStep(deadline: number): Promise<{ chunks: number; cursor: string; head: string; lagBlocks: string }> {
  const c = rpc();
  const head = (await c.getBlockNumber()) - 5n;                   // stay off the reorg edge
  const stored = await kvGetProbe<string>(K_CURSOR);
  if (stored.status === "error") throw new Error("cursor unreadable");
  let cursor = stored.status === "hit" ? BigInt(stored.value) : head - BLOCKS_PER_DAY * BigInt(BACKFILL_DAYS);
  // Only whole windows: an idle tick costs ONE KV read (the cursor), not the
  // ~270 KB provider list — Upstash's budget has suspended this DB before (#148).
  if (head - cursor + 1n < CHUNK) return { chunks: 0, cursor: cursor.toString(), head: head.toString(), lagBlocks: (head - cursor + 1n).toString() };
  const idx = await readProviderIndex();
  // No seller list yet (fresh deploy, before hub-providers ran): walking now
  // would fold windows for Blue Agent alone and never revisit them.
  if (!idx) return { chunks: 0, cursor: cursor.toString(), head: head.toString(), lagBlocks: "waiting for the provider list" };
  const watch = watchList(idx);
  let chunks = 0;
  while (head - cursor + 1n >= CHUNK && Date.now() < deadline - 20_000) {
    const to = cursor + CHUNK - 1n;
    const transfers: { tx: string; from: string; to: string; value: bigint }[] = [];
    for (let i = 0; i < watch.length; i += ADDR_BATCH) {
      const logs = await c.getLogs({ address: USDC, event: TRANSFER, args: { to: watch.slice(i, i + ADDR_BATCH) }, fromBlock: cursor, toBlock: to });
      for (const l of logs) transfers.push({ tx: l.transactionHash, from: l.args.from!, to: l.args.to!, value: l.args.value! });
    }
    const authorized = new Set<string>();
    const payers = [...new Set(transfers.map((t) => t.from))] as Address[];
    for (let i = 0; i < payers.length; i += ADDR_BATCH) {
      const logs = await c.getLogs({ address: USDC, event: AUTH_USED, args: { authorizer: payers.slice(i, i + ADDR_BATCH) }, fromBlock: cursor, toBlock: to });
      for (const l of logs) authorized.add(`${l.transactionHash.toLowerCase()}:${l.args.authorizer!.toLowerCase()}`);
    }
    const ts = Number((await c.getBlock({ blockNumber: cursor })).timestamp) * 1000;
    const day = ymd(ts);
    const res = await kvMutate<DayBlob>(dayKey(day), { p: {}, from: cursor.toString(), to: to.toString() }, (b) => {
      b.to = to.toString();
      return foldChunk(b, transfers, authorized);
    }, DAY_TTL);
    if (res !== "ok" && res !== "unchanged") throw new Error(`day ${day} write ${res}`);   // never advance past unwritten data
    cursor = to + 1n;
    await kv.set(K_CURSOR, cursor.toString());
    chunks++;
  }
  return { chunks, cursor: cursor.toString(), head: head.toString(), lagBlocks: (head - cursor + 1n).toString() };
}

// ── Readers ──────────────────────────────────────────────────────────────────

export interface ProviderRow {
  payTo: string;
  hosts: string[];
  title: string;
  resources: number;
  paidCalls: number;
  usd: number;
  payers: number;          // distinct paying wallets (saturates at PAYER_KEEP/day)
  teamCalls: number;
  teamUsd: number;
  series: number[];        // usd per day, oldest first
}

export interface Exchange {
  readable: boolean;
  /** Days that actually have indexed data — the honest window, ≤ requested. */
  daysCovered: number;
  firstDay: string | null;
  /** Index into each row's `series` of the first indexed day. */
  firstIndex: number;
  lagBlocks: number | null;
  listUpdatedAt: string | null;
  providersListed: number;
  rows: ProviderRow[];
}

export async function readExchange(days = 30): Promise<Exchange> {
  const out: Exchange = { readable: true, daysCovered: 0, firstDay: null, firstIndex: 0, lagBlocks: null, listUpdatedAt: null, providersListed: 0, rows: [] };
  try {
    const idx = await readProviderIndex();
    out.listUpdatedAt = idx?.updatedAt ?? null;
    out.providersListed = Object.keys(idx?.providers ?? {}).length;
    const now = Date.now();
    const keys = Array.from({ length: days }, (_, i) => ymd(now - (days - 1 - i) * 86_400_000));
    const blobs = await Promise.all(keys.map((k) => kv.get<DayBlob>(dayKey(k))));
    const acc = new Map<string, ProviderRow & { set: Set<string> }>();
    const ours = X402_PAY_TO.toLowerCase();
    blobs.forEach((b, i) => {
      if (!b) return;
      out.daysCovered++;
      if (out.firstDay === null) { out.firstDay = keys[i]; out.firstIndex = i; }
      for (const [p, c] of Object.entries(b.p)) {
        const meta = idx?.providers[p];
        const r = acc.get(p) ?? {
          payTo: p, hosts: meta?.hosts ?? (p === ours ? ["blueagent.dev"] : []), title: meta?.title ?? (p === ours ? "Blue Agent" : ""),
          resources: meta?.resources ?? 0, paidCalls: 0, usd: 0, payers: 0, teamCalls: 0, teamUsd: 0, series: Array(days).fill(0), set: new Set<string>(),
        };
        r.paidCalls += c.n; r.usd += c.u / 1e6; r.teamCalls += c.tn ?? 0; r.teamUsd += (c.tu ?? 0) / 1e6;
        r.series[i] += c.u / 1e6;
        for (const x of c.pay) r.set.add(x);
        acc.set(p, r);
      }
    });
    out.rows = [...acc.values()].map(({ set, ...r }) => ({ ...r, payers: set.size }))
      .sort((a, b) => b.usd - a.usd || b.paidCalls - a.paidCalls);
    const cur = await kv.get<string>(K_CURSOR);
    if (cur) {
      const head = await rpc().getBlockNumber().catch(() => null);
      out.lagBlocks = head ? Math.max(0, Number(head - BigInt(cur))) : null;
    }
  } catch {
    out.readable = false;
  }
  return out;
}
