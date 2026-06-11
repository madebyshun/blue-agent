/**
 * Blue Agent — Token Launch registry.
 *
 * Every token deployed through Blue Chat (POST /api/launch-token, real deploy
 * — not a simulateOnly preview) is recorded here so the public /app/launches
 * showcase has a durable list that doesn't churn like Bankr's 50-most-recent
 * feed. Stored in KV (Upstash in prod, in-memory in dev) as a single capped,
 * newest-first array under `LAUNCHES_KEY`.
 */
import { kvGet, kvSet } from "./kv";

const LAUNCHES_KEY = "bluechat:launches";
const MAX_LAUNCHES = 500;

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
};

/** Read the full launch list (newest first). */
export async function getLaunches(limit = MAX_LAUNCHES): Promise<LaunchRecord[]> {
  const all = (await kvGet<LaunchRecord[]>(LAUNCHES_KEY)) ?? [];
  return all.slice(0, limit);
}

/**
 * Record a launch. De-dupes by tokenAddress (a re-record updates in place),
 * keeps the list newest-first, and caps it at MAX_LAUNCHES. Best-effort: never
 * throws — the deploy already succeeded, bookkeeping must not break the flow.
 */
export async function recordLaunch(rec: LaunchRecord): Promise<void> {
  if (!rec.tokenAddress) return;
  try {
    const addr = rec.tokenAddress.toLowerCase();
    const all = (await kvGet<LaunchRecord[]>(LAUNCHES_KEY)) ?? [];
    const deduped = all.filter((l) => l.tokenAddress?.toLowerCase() !== addr);
    deduped.unshift(rec);
    await kvSet(LAUNCHES_KEY, deduped.slice(0, MAX_LAUNCHES));
  } catch {
    /* best-effort */
  }
}
