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
import { readJobOnChain } from "../src/lib/blue-hood/acp-chain";

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
// MEASURED on job 81132: a 0.5 budget paid the provider 0.45, sent 0.025 to a
// fee recipient and 0.025 to an address that is both the job's `client` and its
// `evaluator`, which leaves that leg unclassified. `getJob` exposes no net field,
// so the amount banked is NOT derivable. The old field name claimed it was and
// overstated by ~11%. This is the one number the public read publishes, so the
// name matters more than it looks.

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
    "5.4 no fee rate is inferred from the single observation",
    !/0\.9\s*\*|\*\s*0\.9/.test(sellerSrc) && !/FEE_RATE/.test(sellerSrc + chainSrc),
  );
}

// ── Group 6: expiry cannot be read from the chain, and says so ───────────────
// Nothing on-chain moves a job to EXPIRED — 81119 sat hours past its deadline
// still reading OPEN. Server-side expiry bookkeeping lands on no public field.
// A future reader who assumes the reconcile closes expired jobs would wire the
// ungraduation warning to a branch that never fires.

{
  check(
    "6.1 the expired-is-unreachable caveat is recorded where the code is",
    /stays `OPEN` on chain|nothing\s*\n?\s*\*?\s*on-chain moves a job to EXPIRED/.test(sellerSrc),
  );
  check(
    "6.2 unsettled jobs the chain cannot resolve stay in flight",
    /listUnsettledJobIds/.test(ledgerSrc) && /!TERMINAL\.has\(r\.status\)/.test(ledgerSrc),
  );
}

// ── report ───────────────────────────────────────────────────────────────────

guardUnknownState().then(() => {
  console.log(`\nacp-reconcile guard: ${pass} passed, ${failures.length} failed`);
  for (const f of failures) console.log(`  FAIL  ${f}`);
  process.exit(failures.length === 0 ? 0 : 1);
});
