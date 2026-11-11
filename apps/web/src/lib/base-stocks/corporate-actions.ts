/**
 * Corporate actions on Coinbase Tokenized Stocks, Base 8453: cash dividends and
 * stock splits, both ANNOUNCED (before they apply) and APPLIED (multiplier()
 * moved).
 *
 * How the issuer publishes them, measured 2026-11-11 (PMc, tx 0xf2a1b9ef…):
 *   - Each action is announced ON CHAIN on the token itself: event topic
 *     ANNOUNCED_TOPIC, whose data carries the action id, its type ("Cash
 *     Dividend", "Stock Split") and Coinbase's record URL. When it applies, the
 *     same event fires again together with the multiplier update.
 *   - Coinbase's record, by id only (there is no list endpoint; probed 8 shapes,
 *     all 404): GET api.coinbase.com/v1/tokenized-stocks/corporate-actions/<id>
 *     → status, announced_at, applied_at, multiplier_before/after.
 * So: ids come from chain logs (SEED below, then a cron walks forward from
 * SEED_BLOCK and stores new ids in KV); details come from Coinbase's record, kept
 * only when its contract_address is the token the log came from.
 *
 * Nothing is inferred. An announced action has no multiplier yet, and says so.
 */
import { createPublicClient, hexToString, http } from "viem";
import { base } from "viem/chains";
import { unstable_cache } from "next/cache";
import { kvGetProbe, kvSet } from "@/lib/kv";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";

export const ANNOUNCED_TOPIC = "0xccebf8218a62875909564adef86a6f4df81503cb617221e793357d62f8e813f7" as const;
const RECORD = "https://api.coinbase.com/v1/tokenized-stocks/corporate-actions/";

/** Every action id found by a full log scan of all 338 tokens up to SEED_BLOCK (2026-11-11). */
export const SEED_BLOCK = 55_950_000n;
export const SEED: readonly { token: string; id: string }[] = [
  { token: "0xB2000000000000000000006064f8EC027f042294", id: "4bc64a71-ac15-4253-b9c2-f7296257f3aa" }, // AEOc
  { token: "0xb200000000000000000000747BFfA52Fe2C2510B", id: "96640dd0-436e-47ff-ad38-7570ff3a7c52" }, // BALLc
  { token: "0xB200000000000000000000645c1Ec509E4261682", id: "23a7d911-defc-4b25-96c4-e9f03b611da7" }, // BXc
  { token: "0xb200000000000000000000f215E4C890CFb7176B", id: "e9ab20a2-6e1d-4825-8c14-04be154cfb9b" }, // CAKEc
  { token: "0xb2000000000000000000003bd46dbdE905508B16", id: "31fb4323-19fa-46f8-a938-6553edc83fa6" }, // CMCSAc
  { token: "0xB200000000000000000000eC622942B76a2d3b21", id: "650787d7-6bb1-440a-b8a9-bff596793c4d" }, // COPc
  { token: "0xb200000000000000000000AcccFe56da68b19a0D", id: "15d89367-085c-470d-9a81-1496d45d794a" }, // GILDc
  { token: "0xb2000000000000000000002D0BA3164cc74f58B7", id: "70925ca4-7aae-45d5-bbc4-adc4415d9248" }, // GOOGLc
  { token: "0xB200000000000000000000a82a0C88DD258eD141", id: "a558eba1-491f-41ec-a4df-a5f6cd1b8e7d" }, // GSc
  { token: "0xB200000000000000000000DBa9e310296C1066C0", id: "96aba2d2-e0c7-49c1-83b9-69cd6fd8e3c6" }, // KLACc
  { token: "0xB200000000000000000000f1a0F91e34892E4718", id: "3cce833c-1c3a-4d0d-aa9f-3f4c8648dadf" }, // LLYc
  { token: "0xB20000000000000000000034975347FF1848AAb9", id: "b2bfdf34-c1be-4ee7-acca-1df9e8b2586b" }, // LRCXc
  { token: "0xb2000000000000000000008bC8786B856E61707C", id: "b5b58e9c-bf6b-4d28-9021-49f762cdbabc" }, // METAc
  { token: "0xB200000000000000000000eC3c4c7395Cc609813", id: "e3ab4ebc-927d-466e-aa32-47313a5aab41" }, // MRVLc
  { token: "0xb200000000000000000000Fd2f87532B90095211", id: "293799e5-4c0c-4d0e-a2d9-3ea4367f17b0" }, // MUc
  { token: "0xB2000000000000000000005ac674f707E357409c", id: "b80863d5-db65-43a7-8578-59adf6922e78" }, // NOKc
  { token: "0xb20000000000000000000078ee7ce2fE4908108C", id: "0d25ab63-6a9b-4f46-93fd-9d7f6fae92da" }, // NVDAc
  { token: "0xb200000000000000000000347AFbA223D7B6b63C", id: "67deae04-adc5-4308-a1c8-d32ea2134fac" }, // ORCLc
  { token: "0xB20000000000000000000018FE7eC7d6DfeeB528", id: "a32d45fa-dedb-46be-b6cf-30580689841c" }, // PFEc
  { token: "0xB2000000000000000000008FC2A8C23cf5937b66", id: "e4071568-89ad-4f41-9a31-565225066857" }, // PMc
  { token: "0xB20000000000000000000017BB66E9301E913A99", id: "1df90f83-7c4f-4a7d-8739-3ad598ae0388" }, // SANc
  { token: "0xb200000000000000000000397293Cb8cda9a10c5", id: "4d449eba-9206-4c35-8c1e-921c20e864d5" }, // SNDKc
  { token: "0xB2000000000000000000001AC12227a8aE0Ef3Ac", id: "0328345d-4a62-4d75-b99a-7182886fb800" }, // STZc
  { token: "0xB2000000000000000000006BC65AF32d24870A2d", id: "03f71f4a-3cd8-4b61-bd58-20cba2ea4f2b" }, // TERc
  { token: "0xB200000000000000000000349ef3Aa93a0897476", id: "f0a1e377-0867-4396-ae2d-9212154a25c9" }, // ULc
  { token: "0xB20000000000000000000079DC24fe2FBD09110f", id: "e7194983-f4b2-4b6d-93f4-e332a6da1b5d" }, // VSTc
  { token: "0xb2000000000000000000008fde21a1F5c69FeC0b", id: "be5b4d3b-b87f-4f59-9317-f1d05fb11550" }, // WDCc
  { token: "0xB20000000000000000000044E3CD7a0E1028E57a", id: "7439ba61-cf3c-4d27-8f7d-3b9b180c064f" }, // WENc
];

const K = "stocks:corp-actions:v1";
type Stored = { cursor: string; found: { token: string; id: string }[] };
const WINDOW = 20_000n;  // blocks per getLogs: ~67 min at Base's 0.2 s blocks (since 2026-11-05)
const GROUP = 10;        // publicnode allows at most 10 addresses per getLogs (measured)
const ID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/;

const rpc = () => createPublicClient({ chain: base, transport: http(process.env.HUB_RPC_URL || "https://base-rpc.publicnode.com", { retryCount: 2 }) });

/** Pull an action id out of one announcement log's data. Exported for tests. */
export function actionIdFromLog(data: `0x${string}`): string | null {
  try { return hexToString(data).match(ID_RE)?.[0] ?? null; } catch { return null; }
}

/** Cron step: walk from the stored cursor toward head, whole windows only, until deadline. */
export async function scanActions(deadline: number): Promise<{ windows: number; cursor: string; head: string; added: string[] }> {
  const c = rpc();
  const head = (await c.getBlockNumber()) - 5n;
  const stored = await kvGetProbe<Stored>(K);
  if (stored.status === "error") throw new Error("cursor unreadable");
  const state: Stored = stored.status === "hit" ? stored.value : { cursor: SEED_BLOCK.toString(), found: [] };
  let cursor = BigInt(state.cursor);
  const known = new Set([...SEED, ...state.found].map((x) => x.id));
  const added: string[] = [];
  let windows = 0;
  const tokens = COINBASE_BASE_STOCKS.map((s) => s.token);
  while (cursor < head && Date.now() < deadline - 15_000) {
    const to = cursor + WINDOW > head ? head : cursor + WINDOW;
    for (let i = 0; i < tokens.length; i += GROUP) {
      const logs = await c.getLogs({ address: tokens.slice(i, i + GROUP), fromBlock: cursor + 1n, toBlock: to, topics: [ANNOUNCED_TOPIC] } as never) as { address: string; data: `0x${string}` }[];
      for (const l of logs) {
        const id = actionIdFromLog(l.data);
        if (id && !known.has(id)) { known.add(id); added.push(id); state.found.push({ token: l.address, id }); }
      }
    }
    cursor = to; windows++;
  }
  // One write per run, and none when nothing moved (Upstash budget, #148).
  if (windows) await kvSet(K, { cursor: cursor.toString(), found: state.found } satisfies Stored);
  return { windows, cursor: cursor.toString(), head: head.toString(), added };
}

export type CorporateAction = {
  id: string;
  type: string;
  status: "announced" | "applied" | "other";
  announced_at: string | null;
  applied_at: string | null;
  multiplier_before: number | null;
  multiplier_after: number | null;
  /** What the action did to multiplier(), in percent. null until applied. */
  multiplier_change_pct: number | null;
  record: string;
};

type Record_ = { id?: string; contract_address?: string; description?: string; status?: string; announced_at?: string; applied_at?: string; multiplier_before?: number; multiplier_after?: number };

// An applied record does not change again; an announced one is re-asked every 10 min.
const fetchRecord = unstable_cache(async (id: string): Promise<Record_ | null> => {
  const r = await fetch(RECORD + id, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(6_000) });
  if (!r.ok) throw new Error(`corporate action ${id}: HTTP ${r.status}`);
  return (await r.json()) as Record_;
}, ["stocks:corp-action:v1"], { revalidate: 600 });

async function record(id: string): Promise<Record_ | null> {
  try { return await fetchRecord(id); } catch (e) {
    if (/incrementalCache|static generation store/i.test(String((e as Error)?.message))) {
      const r = await fetch(RECORD + id, { headers: { accept: "application/json" } }).catch(() => null);
      return r?.ok ? ((await r.json()) as Record_) : null;
    }
    return null;
  }
}

export function normalizeAction(id: string, token: string, r: Record_ | null): CorporateAction | null {
  if (!r || r.id !== id || String(r.contract_address ?? "").toLowerCase() !== token.toLowerCase()) return null;
  const s = String(r.status ?? "");
  const status = s.endsWith("_APPLIED") ? "applied" : s.endsWith("_ANNOUNCED") ? "announced" : "other";
  const before = typeof r.multiplier_before === "number" ? r.multiplier_before : null;
  const after = typeof r.multiplier_after === "number" ? r.multiplier_after : null;
  return {
    id, type: String(r.description ?? "unknown"), status,
    announced_at: r.announced_at ?? null, applied_at: r.applied_at ?? null,
    multiplier_before: before, multiplier_after: after,
    multiplier_change_pct: before && after ? Math.round((after / before - 1) * 1e6) / 1e4 : null,
    record: RECORD + id,
  };
}

/** Every known action id, the seed plus what the cron has found since. */
export async function actionIds(): Promise<{ token: string; id: string }[]> {
  const p = await kvGetProbe<Stored>(K);
  const extra = p.status === "hit" ? p.value.found : [];
  const seen = new Set<string>();
  return [...SEED, ...extra].filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true)));
}

/** Known actions for one token, newest first. `complete` is false when a record could not be read. */
export async function actionsFor(token: string): Promise<{ actions: CorporateAction[]; complete: boolean; known_through_block: string }> {
  const [ids, p] = await Promise.all([actionIds(), kvGetProbe<Stored>(K)]);
  const mine = ids.filter((x) => x.token.toLowerCase() === token.toLowerCase());
  const got = await Promise.all(mine.map(async (x) => normalizeAction(x.id, token, await record(x.id))));
  const actions = got.filter((a): a is CorporateAction => a !== null)
    .sort((a, b) => String(b.applied_at ?? b.announced_at).localeCompare(String(a.applied_at ?? a.announced_at)));
  return { actions, complete: actions.length === mine.length, known_through_block: p.status === "hit" ? p.value.cursor : SEED_BLOCK.toString() };
}
