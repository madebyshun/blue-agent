/**
 * Guard for ACP terminal-state reconciliation.
 *
 * Run: `npx tsx scripts/acp-reconcile-check.ts` (from apps/web). Exit 0 = pass.
 *
 * The bug this protects against is invisible by construction. The seller drives
 * itself from `agent.sessions`, hydrated from `getActiveJobs()`; a job that
 * settles leaves that set at once, while the cron only looks every 2 minutes. So
 * the tick that would record the outcome usually never sees the job, and a
 * seller that has been paid looks exactly like a seller nobody hired. MEASURED
 * 2026-09-25: 81125's rejection and 81132's completion were both missed and
 * `/api/acp/revenue` reported zero earnings after 0.45 USDC had arrived.
 *
 * Nothing about that failure is loud. No exception, no failed write, no red
 * check — the only symptom is a number that stays 0, which is also what a
 * correct idle seller reports. Hence a guard rather than trust.
 *
 * Live RPC is deliberately NOT exercised here: the suite must stay offline and
 * deterministic. What is checked is the half that can rot silently — the guard
 * clauses that must return "unknown" instead of a guess, the status mapping
 * whose ORDER is load-bearing, and the structure that keeps the reconcile
 * wired in and the heavy SDK out.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readJobOnChain, type OnChainJob } from "../src/lib/blue-hood/acp-chain";
// Pure + offline: importing it pulls in no SDK, no KV and no clock. That is the
// whole reason the inference was factored out of the reconcile.
import { shouldInferExpiry } from "../src/lib/blue-hood/acp-seller";

let pass = 0;
const failures: string[] = [];

function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const ROOT = process.cwd();
const chainSrc = readFileSync(join(ROOT, "src/lib/blue-hood/acp-chain.ts"), "utf8");
const sellerSrc = readFileSync(join(ROOT, "src/lib/blue-hood/acp-seller.ts"), "utf8");
const ledgerSrc = readFileSync(join(ROOT, "src/lib/blue-hood/acp-jobs.ts"), "utf8");

// ── Group 1: unknown state is never a guess ──────────────────────────────────
// Every one of these must resolve null WITHOUT a network call. Null means "did
// not learn anything"; the caller leaves the ledger untouched. Any other return
// would let an unreachable RPC write a terminal status onto a live job.

async function guardUnknownState(): Promise<void> {
  const abi = [{ type: "function", name: "getJob", stateMutability: "view", inputs: [], outputs: [] }];
  const contract = "0x238E541BfefD82238730D00a2208E5497F1832E0";

  check(
    "1.1 unsupported chain reads unknown, not settled",
    (await readJobOnChain({ contract, abi, jobId: "81132", chainId: 4663 })) === null,
  );
  check(
    "1.2 a non-numeric job id reads unknown",
    (await readJobOnChain({ contract, abi, jobId: "not-a-number", chainId: 8453 })) === null,
  );
  // `BigInt("")` is 0n rather than a throw, so a blank id reaching the RPC would
  // quietly ask the contract about job 0 — and make this suite hit the network.
  check(
    "1.3 an empty job id reads unknown, offline",
    (await readJobOnChain({ contract, abi, jobId: "", chainId: 8453 })) === null,
  );
  check(
    "1.4 a whitespace job id reads unknown, offline",
    (await readJobOnChain({ contract, abi, jobId: "   ", chainId: 8453 })) === null,
  );
  check(
    "1.5 a negative job id reads unknown",
    (await readJobOnChain({ contract, abi, jobId: "-1", chainId: 8453 })) === null,
  );
}

// ── Group 2: the status mapping's ORDER is the contract ──────────────────────
// `status` arrives as a raw uint8 and is used as an index. Reordering the array
// silently relabels every job — a completed job could read "rejected" with no
// error anywhere. Pinned against `AgenticCommerceV3.JobStatus`.

{
  const m = chainSrc.match(/const JOB_STATUS = \[([^\]]+)\]/);
  const order = (m?.[1] ?? "").replace(/["\s]/g, "").split(",").filter(Boolean);
  check(
    "2.1 JOB_STATUS is exactly the on-chain enum order",
    order.join("|") === ["open", "funded", "submitted", "completed", "rejected", "expired"].join("|"),
  );
  check("2.2 the index-is-the-enum intent is written down", /Index IS the on-chain uint8/.test(chainSrc));
}

// ── Group 3: the reconcile stays wired in ────────────────────────────────────
// Structure, not behaviour: no fixture can catch a future contributor deleting
// the call and leaving the function behind, which is exactly the shape the
// original bug had.

{
  check("3.1 the poll cycle calls the reconcile", /await reconcileSettledJobs\(/.test(sellerSrc));
  check(
    "3.2 it is passed the ACTIVE ids, so only stale jobs are chain-read",
    /new Set\(providerSessions\.map\(\(s\) => String\(s\.jobId\)\)\)/.test(sellerSrc),
  );
  check(
    "3.3 the per-tick RPC fan-out is bounded",
    /RECONCILE_MAX_PER_TICK/.test(sellerSrc) && /slice\(0, RECONCILE_MAX_PER_TICK\)/.test(sellerSrc),
  );
  check(
    "3.4 an unknown chain read writes nothing",
    /if \(!chainJob\) continue;/.test(sellerSrc),
  );
  check(
    "3.5 only terminal states are written back",
    !/case "open":/.test(sellerSrc.slice(sellerSrc.indexOf("reconcileSettledJobs"))),
  );
}

// ── Group 4: the SDK must not be pulled into the bundle ──────────────────────
// The seller is inert until configured BECAUSE the heavy SDK is only reached
// through a runtime dynamic import. A static import in the chain reader would
// undo that property from a file whose name gives no hint it could.

{
  check(
    "4.1 the chain reader never statically imports the ACP SDK",
    !/^import .*@virtuals-protocol\/acp-node-v2/m.test(chainSrc),
  );
  check(
    "4.2 address and ABI are passed in rather than hardcoded",
    /abi: readonly unknown\[\]/.test(chainSrc) && !/0x238E541B/i.test(chainSrc.replace(/\*.*\n/g, "")),
  );
  check(
    "4.3 the seller sources both from the SDK it already imported",
    /acp\.ACP_CONTRACT_ADDRESSES\[cfg\.chainId\]/.test(sellerSrc) && /abi: acp\.ACP_ABI/.test(sellerSrc),
  );
}

// ── Group 5: gross is never relabelled as collected ──────────────────────────
// MEASURED on job 81132: a 0.5 budget paid the provider 0.45, the platform
// treasury 0.025 and the evaluator 0.025 — the contract's `platformFeeBP` and
// `evaluatorFeeBP` are both 500, so a provider banks 90%. The old field name
// promised the amount banked while carrying the budget, overstating by ~11%.
// This is the one number the public read publishes, so the name matters more
// than it looks.
//
// 5.4 below still forbids hardcoding that 90%, and knowing the rate makes it
// MORE tempting, not less: both BPs are owner-settable (`setPlatformFee`,
// `setEvaluatorFee`), so a baked-in 0.9 would drift into a wrong published
// number with nothing to catch it.

{
  check("5.1 the ledger field is named gross", /usdc_gross\?: number/.test(ledgerSrc));
  check(
    "5.2 the overstating name is gone repo-side",
    !/usdc_collected/.test(ledgerSrc) && !/usdc_collected/.test(sellerSrc),
  );
  check(
    "5.3 the reconcile writes the chain's budget, not a derived net",
    /usdc_gross: chainJob\.budget_usdc/.test(sellerSrc),
  );
  check(
    "5.4 the owner-settable fee rate is never hardcoded",
    !/0\.9\s*\*|\*\s*0\.9/.test(sellerSrc) && !/FEE_RATE/.test(sellerSrc + chainSrc),
  );
}

// ── Group 6: expiry is INFERRED, because the chain never reports it ──────────
// Crossing `expiredAt` is not an on-chain transition — nothing ever flips a job
// to EXPIRED. MEASURED 2026-09-27: job 81119 read `open` 36.1 HOURS past its own
// deadline, while 81118/81125 read `rejected` and 81132 read `completed`. So the
// contract closes every terminal state except this one.
//
// Left alone that record is never terminal: re-read by RPC every tick forever,
// counted as in-flight revenue still coming, and — the part that bites — never
// appended to the terminal log, so `expire_streak` stays 0. A streak stuck at 0
// does not read as broken, it reads as HEALTHY, right up until ACP auto-
// ungraduates the agent at ten consecutive expirations the counter never saw.

{
  check(
    "6.1 the expiry-is-not-a-transition measurement is recorded where the code is",
    /EXPIRY IS NOT AN ON-CHAIN TRANSITION/.test(sellerSrc) && /36\.1 hours/i.test(sellerSrc),
  );
  check(
    "6.2 the reconcile's fall-through actually infers, rather than dropping the job",
    /shouldInferExpiry\(chainJob, Date\.now\(\)\)/.test(sellerSrc),
  );
  check(
    "6.3 the deadline comes from the same view call as the status",
    /expires_at: number/.test(chainSrc) && /expiredAt\?: unknown/.test(chainSrc),
  );
  // An inferred terminal state must never be presentable as a chain-confirmed
  // one. Both halves matter: the counter for the operator, the stamp for anyone
  // reading a single record later.
  check(
    "6.4 an inferred expiry is counted apart from a reported one",
    /expired_inferred: number/.test(sellerSrc) && /tally\.expired_inferred\+\+/.test(sellerSrc),
  );
  check(
    "6.5 an inferred expiry is stamped INFERRED in the record itself",
    /expiry INFERRED/.test(sellerSrc),
  );
  // The prior error is usually the whole explanation of WHY it expired — 81119
  // carries "setBudget still pending after 15000ms". Overwriting it would keep
  // the symptom and delete the cause.
  check(
    "6.6 the write-off appends to the prior diagnosis rather than replacing it",
    /appendReason\(\s*rec\.error/.test(sellerSrc),
  );
}

// ── Group 7: the inference itself, pinned in BOTH directions ─────────────────
// The only place this codebase invents a terminal state. A guard that only
// proved it fires would pass a function that returns true unconditionally —
// which would write off live, funded jobs as dead.

{
  const deadline = 1_790_320_363; // job 81119's real `expiredAt`, unix seconds
  const atMs = deadline * 1000;
  const open: OnChainJob = { status: "open", budget_usdc: 0.5, expires_at: deadline };

  check("7.1 does NOT fire before the deadline", !shouldInferExpiry(open, atMs - 60_000));
  check("7.2 does NOT fire in the grace window just after it", !shouldInferExpiry(open, atMs + 60_000));
  check("7.3 DOES fire well past the deadline", shouldInferExpiry(open, atMs + 36 * 3600_000));
  // Escrow is funded and an evaluator may still act — guessing here could write
  // off revenue that is about to settle. Both must hold out to infinity, not
  // merely until some later grace.
  check(
    "7.4 never fires for a funded job, however late",
    !shouldInferExpiry({ ...open, status: "funded" }, atMs + 365 * 24 * 3600_000),
  );
  check(
    "7.5 never fires for a submitted job, however late",
    !shouldInferExpiry({ ...open, status: "submitted" }, atMs + 365 * 24 * 3600_000),
  );
  // A missing/zero deadline is absent data, not a deadline of 1970 — the whole
  // ledger is past THAT. Fabricating from absence is the one failure mode that
  // would write off every open job at once.
  check("7.6 a zero deadline is unknown, not 1970", !shouldInferExpiry({ ...open, expires_at: 0 }, atMs));
  check(
    "7.7 a NaN deadline is unknown, not a comparison that silently reads false",
    !shouldInferExpiry({ ...open, expires_at: Number.NaN }, atMs + 365 * 24 * 3600_000),
  );
}

// ── Group 8: the open index is a cache, never the source of truth ────────────
// It exists for the Upstash budget: the reconcile asks "which jobs are open" on
// every 2-minute tick (720/day) and answering from the lifetime index costs
// `1 + every job ever seen` — ~216K commands/day at 300 jobs, against a 500K
// MONTHLY allowance that has starved this engine twice (#123, #148).
//
// A cache that is trusted becomes a second source of truth, and a wrong member
// then costs a job its reconciliation permanently. These pin the three
// properties that keep it demotable.

{
  check(
    "8.1 membership is derived from the record's own status",
    /TERMINAL\.has\(rec\.status\)\) await kvSRem/.test(ledgerSrc),
  );
  check(
    "8.2 a member whose record went terminal is dropped on read, so it self-heals",
    /const evict: string\[\] = \[\]/.test(ledgerSrc) && /kvSRem\(KV_ACP_JOB_OPEN_INDEX, \.\.\.evict\)/.test(ledgerSrc),
  );
  // A null read is a KV blip OR a 90d TTL expiry — never evidence. Evicting on
  // it would delete exactly the long-quiet jobs the mechanism exists to find.
  check(
    "8.3 an unreadable record is left in the index rather than evicted",
    /if \(!rec\) continue;/.test(ledgerSrc),
  );
  // The index is populated by writes, and a job that stopped transitioning is by
  // definition one nothing writes to. Without the back-fill the mechanism cannot
  // see 81119 at all — the very job it was built for.
  check(
    "8.4 the one-shot back-fill runs before the first read, not after",
    /await seedOpenIndexOnce\(\);\s*\n\s*open = await listOpenJobs\(\)/.test(sellerSrc),
  );
  check(
    "8.5 the back-fill is marker-guarded so it cannot rescan every tick",
    /kvSetNX\(KV_ACP_JOB_OPEN_SEEDED/.test(ledgerSrc),
  );
}

// ── report ───────────────────────────────────────────────────────────────────

guardUnknownState().then(() => {
  console.log(`\nacp-reconcile guard: ${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
});
