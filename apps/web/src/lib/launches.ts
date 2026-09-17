/**
 * Blue Agent — Token Launch registry.
 *
 * Every token deployed through Blue Agent is recorded here. Stored in KV
 * (Upstash in prod, in-memory in dev) as a single capped, newest-first array
 * under `LAUNCHES_KEY`.
 *
 * WRITERS. `/api/b20hub/register` (B20 launch on Base, 8453) is the one writer
 * with a live caller — /app/b20hub/launch. `/api/robinhood/receipt` (direct
 * ERC-20 deploy on Robinhood Chain, 4663) still exists but MEASURED 2026-09-07
 * it has ZERO callers anywhere in src/: the RH launch card that used to POST to
 * it is gone. Treat it as dormant, not live; whether it gets a caller back or
 * gets retired is ShunTr's call, and until then nothing new lands on 4663.
 *
 * A THIRD writer, /api/launch-token (Bankr's launchpad), was deleted 2026-09-06
 * after Bankr suspended the account — 403 on every deploy.
 *
 * READERS. `/api/b20hub/tokens` (feeds /app/b20hub) and `lib/public-stats.ts`
 * (counts on /stats). Note that b20hub's reader filters to the `0xb200…`
 * prefix on Base, so the Bankr-era and Robinhood rows are stored but NOT
 * displayed anywhere. That is deliberate as of 2026-09-07: the surface that
 * showed them (/app/launches) existed to sell a Bankr creator-fee claim, and
 * went out with it. The ROWS stay — they are evidence of tokens that really
 * were deployed and really do exist on-chain, and CLAUDE.md is explicit that
 * retiring a route does not entitle anyone to delete the data behind it.
 *
 * ⚠️ Bankr-era rows are NOT distinguishable from the others: a record carries
 * no `source` field, and adding one now would not backfill history. Do not
 * write a reader that assumes every record has a live writer behind it, and do
 * not "clean up" rows you cannot attribute.
 */
import { kvGetProbe, kvMutate } from "./kv";

const LAUNCHES_KEY = "bluechat:launches";
const MAX_LAUNCHES = 500;

export type LaunchChain = "base" | "robinhood";

export type LaunchRecord = {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  image?: string | null;
  website?: string | null;
  description?: string | null;
  feeRecipient: { type: string; value: string };
  txHash?: string | null;
  launchedAt: number; // ms epoch
  /** Which chain this token was deployed on. Absent on legacy records = "base"
   *  (every launch recorded before Robinhood Chain support was Base-only). */
  chain?: LaunchChain;
  chainId?: number;
};

/**
 * Read the full launch list (newest first), distinguishing "no launches" from
 * "could not read". Legacy records with no `chain` field are all Base launches
 * (Robinhood support didn't exist yet).
 *
 * #150 read side. `getLaunches()` below keeps the `[]`-on-failure shape because
 * its other caller (/api/b20hub/tokens) renders a grid where an empty list and
 * a failed read look the same on screen anyway. `/stats` is different: it
 * publishes `launches.total` as a headline traction number, and a 0 there is a
 * claim ("nobody has ever launched a token") we cannot make from a throttled
 * read. That surface gets this function.
 */
export async function getLaunchesProbe(
  limit = MAX_LAUNCHES,
): Promise<{ ok: true; launches: LaunchRecord[] } | { ok: false; launches: [] }> {
  const probe = await kvGetProbe<LaunchRecord[]>(LAUNCHES_KEY);
  if (probe.status === "error") {
    console.error(`[launches] registry unreadable: ${probe.message}`);
    return { ok: false, launches: [] };
  }
  const all = probe.status === "hit" ? probe.value : [];
  return { ok: true, launches: all.slice(0, limit).map((l) => ({ chain: "base" as const, ...l })) };
}

/** Read the full launch list (newest first); `[]` if empty OR unreadable. */
export async function getLaunches(limit = MAX_LAUNCHES): Promise<LaunchRecord[]> {
  return (await getLaunchesProbe(limit)).launches;
}

function dedupeKey(rec: Pick<LaunchRecord, "tokenAddress" | "chain">): string {
  return `${rec.chain ?? "base"}:${rec.tokenAddress?.toLowerCase() ?? ""}`;
}

/**
 * Record a launch. De-dupes by (chain, tokenAddress) — a re-record updates in
 * place — keeps the list newest-first, and caps it at MAX_LAUNCHES.
 * Best-effort: never throws — the deploy already succeeded, bookkeeping must
 * not break the flow.
 *
 * ⚠ #150. "Best-effort" used to mean something much worse than it sounds. The
 * old body was `(await kvGet(...)) ?? []` → filter → unshift → `kvSet` on the
 * SAME key, and `kvGet` swallows a KV throw into null — so one throttled read
 * during an Upstash blip replaced the ENTIRE registry with `[rec]`. Every other
 * row is gone, and these rows cannot be regenerated: they are the record that a
 * token really was deployed, which the header above is explicit about keeping
 * ("retiring a route does not entitle anyone to delete the data behind it").
 *
 * `kvMutate` refuses to write when the read failed. Failing to record ONE
 * launch is a gap in the registry; the old shape was the registry.
 */
export async function recordLaunch(rec: LaunchRecord): Promise<void> {
  if (!rec.tokenAddress) return;
  const key = dedupeKey(rec);
  const res = await kvMutate<LaunchRecord[]>(
    LAUNCHES_KEY, [],
    (all) => [rec, ...all.filter((l) => dedupeKey(l) !== key)].slice(0, MAX_LAUNCHES),
  );
  if (res !== "ok") {
    console.error(`[launches] ${key} NOT recorded (${res}) — the token IS deployed on-chain; the registry row is missing, existing rows untouched`);
  }
}
