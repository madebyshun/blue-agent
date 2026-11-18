/**
 * ERC-8004 reputation feedback for paid job unlocks (BaseCity plan item 8,
 * approved by ShunTr 2026-11-18 with these conditions).
 *
 * After a verified unlock, Blue writes ONE giveFeedback on the Reputation
 * registry for the delivering agent, from a dedicated low-balance wallet:
 *
 *  - The wallet is ShunTr's: he creates it, funds it with a small ETH gas
 *    float, and sets AGENT_FEEDBACK_PRIVATE_KEY in Vercel himself. No session
 *    creates, reads or handles it. It holds no USDC and grants no approvals.
 *  - AGENT_FEEDBACK_ENABLED must be "1"; otherwise the cron only reports.
 *  - The signer must not be any payee: refused if it equals the x402 payTo or
 *    the ACP seller. One key, one job.
 *  - Runs from a cron queue, never inline in unlock: a gas failure cannot
 *    break a poster's unlock.
 *  - Skips: self-paid (payer is the agent's owner or payTo), price under
 *    $0.05, a receipt that does not verify (lib/agent-ledger verifyUnlock).
 *  - One feedback per receipt tx (done-marker, permanent).
 *  - What it says: tag1 "paid-unlock", value 100 = "Blue observed a poster pay
 *    this agent for a delivery, verified on Base". It is NOT a quality score.
 *
 * ABI checked 2026-11-18 against the deployed implementation behind
 * ERC8004_REPUTATION (proxy -> 0x16e0fa7f…da34): the giveFeedback(uint256,
 * int128,uint8,string,string,string,string,bytes32) selector is present.
 */
import { createPublicClient, createWalletClient, http, keccak256, toHex, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { kv, kvGetProbe, kvMutate } from "@/lib/kv";
import { ERC8004_ABI, ERC8004_IDENTITY, ERC8004_REPUTATION, ERC8004_CHAIN_ID, feedbackUri } from "@/lib/erc8004";
import { verifyUnlock, type LedgerEntry } from "@/lib/agent-ledger";
import { X402_PAY_TO } from "@/lib/x402-payee";
import { BLUE_REFERRER } from "@/lib/agent-coin";
import { TEAM_WALLETS } from "@/lib/mcp-receipts";

export const FEEDBACK_MIN_UNITS = 50_000;          // $0.05
export const LOW_GAS_WEI = 300_000_000_000_000n;   // 0.0003 ETH
const K_QUEUE = "agents:feedback:queue:v1";
const kDone = (tx: string) => `agents:feedback:done:v1:${tx.toLowerCase()}`;
const lc = (s: string) => s.toLowerCase();

export interface FeedbackItem { agentId: string; jobId: string; did: string; tx: string; payer: string; payTo: string; priceUnits: number; at: string }
export interface FeedbackFile {
  agentRegistry: string; agentId: number; clientAddress: string; createdAt: string; tag1: string; tag2: string; endpoint: string;
  proofOfPayment: { fromAddress: string; toAddress: string; chainId: string; txHash: string; amountUsdcUnits: number };
  job: string;
}

/** Pure: should this unlock be queued at all? (Owner self-pay is re-checked on chain at send time.) */
export function queueable(i: Pick<FeedbackItem, "tx" | "payer" | "payTo" | "priceUnits">): boolean {
  // Team / test payers are not outside demand; no reputation for them.
  if (TEAM_WALLETS.has(lc(i.payer))) return false;
  return /^0x[0-9a-fA-F]{64}$/.test(i.tx) && i.priceUnits >= FEEDBACK_MIN_UNITS && lc(i.payer) !== lc(i.payTo);
}

/** Pure: the off-chain feedback file the on-chain entry points at. */
export function feedbackFile(i: FeedbackItem): FeedbackFile {
  return {
    agentRegistry: `eip155:${ERC8004_CHAIN_ID}:${ERC8004_IDENTITY}`,
    agentId: Number(i.agentId),
    clientAddress: `eip155:${ERC8004_CHAIN_ID}:${lc(i.payer)}`,
    createdAt: i.at,
    tag1: "paid-unlock",
    tag2: "blueagent-job",
    endpoint: "https://blueagent.dev/api/jobs",
    proofOfPayment: { fromAddress: lc(i.payer), toAddress: lc(i.payTo), chainId: String(ERC8004_CHAIN_ID), txHash: i.tx, amountUsdcUnits: i.priceUnits },
    job: `https://app.blueagent.dev/jobs/${i.jobId}`,
  };
}

/** Called after an unlock is recorded. Best effort; the cron does the rest. */
export async function enqueueFeedback(i: FeedbackItem): Promise<void> {
  if (!queueable(i)) return;
  await kvMutate<FeedbackItem[]>(K_QUEUE, [], (cur) => (cur.some((x) => x.tx === i.tx) ? null : [...cur, i].slice(-500)));
}

/**
 * Backfill (2026-11-18): unlocks settled before this queue existed were never
 * enqueued (e.g. job 30e6f6d987b0, unlocked 2026-11-17 19:18Z, before #569
 * deployed). Re-scan the live board at most once every 6 hours and enqueue
 * every unlocked delivery with a tx. Safe to repeat: enqueue dedupes by tx,
 * the done-marker stops a second feedback, and every send re-verifies.
 */
export async function backfillFromBoard(force = false): Promise<number> {
  const stamp = "agents:feedback:backfill-at:v1";
  const last = await kv.get<string>(stamp).catch(() => null);
  if (!force && last && Date.now() - Date.parse(last) < 6 * 3600_000) return 0;
  const { listJobs } = await import("@/lib/jobs");
  const jobs = await listJobs(500);
  if (!jobs) return 0;
  let n = 0;
  for (const j of jobs) for (const d of j.deliveries) {
    if (!d.unlock?.tx) continue;
    const item = { agentId: d.agentId, jobId: j.id, did: d.id, tx: d.unlock.tx, payer: d.unlock.payer, payTo: d.payTo, priceUnits: d.priceUnits, at: d.unlock.at };
    if (!queueable(item) || (await kv.get(kDone(item.tx)).catch(() => null))) continue;
    await enqueueFeedback(item);
    n++;
  }
  await kv.set(stamp, new Date().toISOString()).catch(() => undefined);
  return n;
}

/** The file for a tx Blue wrote feedback for, or null. */
export async function readFeedbackFile(tx: string): Promise<FeedbackFile | null | undefined> {
  const p = await kvGetProbe<{ file: FeedbackFile }>(kDone(tx));
  return p.status === "error" ? undefined : p.status === "hit" ? p.value.file : null;
}

type Outcome = { tx: string; agentId: string; result: string };

/** One cron pass. Never throws; reports what it did and why it skipped. */
export async function runFeedbackQueue(max = 5): Promise<{ status: string; signer?: string; balanceEth?: string; lowGas?: boolean; outcomes: Outcome[] }> {
  const key = (process.env.AGENT_FEEDBACK_PRIVATE_KEY ?? "").trim();
  const enabled = process.env.AGENT_FEEDBACK_ENABLED === "1";
  // Best effort: a failed backfill leaves the queue as it was; nothing is reported as a count.
  if (enabled) await backfillFromBoard().catch(() => undefined);
  const q = await kvGetProbe<FeedbackItem[]>(K_QUEUE);
  const queue = q.status === "hit" ? q.value : [];
  if (!enabled) return { status: "disabled (AGENT_FEEDBACK_ENABLED is not 1)", outcomes: queue.map((i) => ({ tx: i.tx, agentId: i.agentId, result: "queued" })) };
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return { status: "no valid AGENT_FEEDBACK_PRIVATE_KEY", outcomes: [] };
  const account = privateKeyToAccount(key as `0x${string}`);
  const signer = lc(account.address);
  if (signer === lc(X402_PAY_TO) || signer === lc(BLUE_REFERRER)) return { status: "refused: the feedback key is a payee wallet; use a dedicated one", signer, outcomes: [] };

  const transport = http(process.env.BASE_RPC_URL || "https://mainnet.base.org");
  const pub = createPublicClient({ chain: base, transport });
  const wallet = createWalletClient({ account, chain: base, transport });
  const bal = await pub.getBalance({ address: account.address }).catch(() => null);
  const lowGas = bal !== null && bal < LOW_GAS_WEI;
  const outcomes: Outcome[] = [];
  const finished = new Set<string>();

  for (const i of queue.slice(0, max)) {
    const o = (result: string, done = true) => { outcomes.push({ tx: i.tx, agentId: i.agentId, result }); if (done) finished.add(i.tx); };
    if (await kv.get(kDone(i.tx)).catch(() => null)) { o("already sent"); continue; }
    const entry: LedgerEntry = { jobId: i.jobId, did: i.did, title: "", skill: null, ticker: null, at: i.at, priceUnits: i.priceUnits, payTo: i.payTo, unlock: { tx: i.tx, payer: i.payer, at: i.at } };
    const ok = await verifyUnlock(entry);
    if (ok === null) { o("receipt unreadable, retry next run", false); continue; }
    if (!ok) { o("skipped: receipt does not show the USDC transfer"); continue; }
    const owner = await pub.readContract({ address: ERC8004_IDENTITY, abi: ERC8004_ABI, functionName: "ownerOf", args: [BigInt(i.agentId)] }).then(lc).catch(() => null);
    if (owner === null) { o("owner unreadable, retry next run", false); continue; }
    if (owner === lc(i.payer)) { o("skipped: self-paid (payer owns the agent)"); continue; }
    if (owner === signer) { o("skipped: the feedback wallet owns this agent"); continue; }
    if (lowGas) { o("held: feedback wallet is low on gas", false); continue; }
    const file = feedbackFile(i);
    try {
      const hash = await wallet.writeContract({
        address: ERC8004_REPUTATION, abi: ERC8004_ABI, functionName: "giveFeedback",
        args: [BigInt(i.agentId), 100n, 0, "paid-unlock", "blueagent-job", "https://blueagent.dev/api/jobs", feedbackUri(i.tx), keccak256(toHex(JSON.stringify(file)))],
      });
      await kv.set(kDone(i.tx), { file, feedbackTx: hash, at: new Date().toISOString() });
      o(`sent ${hash}`);
    } catch (e) { o(`send failed: ${(e as Error).message.slice(0, 120)}`, false); }
  }
  if (finished.size) await kvMutate<FeedbackItem[]>(K_QUEUE, [], (cur) => cur.filter((x) => !finished.has(x.tx)));
  return { status: "ran", signer, balanceEth: bal === null ? undefined : formatEther(bal), lowGas, outcomes };
}
