/**
 * runner — executes all jobs in sequence, collects results, updates state.
 */
import { storage } from "./lib/storage-adapter.js";
import { createNotifier } from "./lib/notification-adapter.js";
import type { JobResult } from "./lib/types.js";

import { runMicrotaskExpiry } from "./jobs/microtask-expire.js";
import { runMicrotaskAutoApprove } from "./jobs/microtask-auto-approve.js";
import { runMicrotaskRefund } from "./jobs/microtask-refund.js";
import { runMicrotaskRemind } from "./jobs/microtask-remind.js";
import { runGigExpiry } from "./jobs/gig-expire.js";
import { runGigReminder } from "./jobs/gig-reminder.js";
import { runReputationSync } from "./jobs/reputation-sync.js";
import { runCleanup } from "./jobs/cleanup.js";

export interface RunOptions {
  silent?: boolean;
  dryRun?: boolean;
}

export interface RunSummary {
  started_at: string;
  finished_at: string;
  duration_ms: number;
  jobs: JobResult[];
  total_processed: number;
  total_failed: number;
  total_mutations: number;
}

export async function runAllJobs(opts: RunOptions = {}): Promise<RunSummary> {
  const started_at = new Date().toISOString();
  const t0 = Date.now();
  const notify = createNotifier(opts.silent ?? false);
  const jobs: JobResult[] = [];

  const run = async (fn: () => Promise<JobResult>) => {
    try {
      const result = await fn();
      jobs.push(result);
      if (!opts.silent) {
        const tag = result.processed > 0 || result.failed > 0
          ? result.failed > 0 ? "❌" : "✅"
          : "·";
        console.log(
          `  ${tag} [${result.job}] processed=${result.processed} skipped=${result.skipped} failed=${result.failed}`
        );
        for (const err of result.errors) {
          console.error(`     error: ${err}`);
        }
      }
    } catch (err) {
      const errJob: JobResult = {
        job: "unknown",
        processed: 0,
        skipped: 0,
        failed: 1,
        errors: [String(err)],
        mutations: [],
      };
      jobs.push(errJob);
      if (!opts.silent) console.error(`  ❌ job threw: ${err}`);
    }
  };

  if (!opts.silent) console.log(`\n[runner] Starting job run at ${started_at}`);

  // --- Order matters: expire → auto-approve → refund → remind → sync → cleanup ---
  await run(() => runMicrotaskExpiry(storage, notify));
  await run(() => runMicrotaskAutoApprove(storage, notify));
  await run(() => runMicrotaskRefund(storage, notify));
  await run(() => runMicrotaskRemind(storage, notify));
  await run(() => runGigExpiry(storage, notify));
  await run(() => runGigReminder(storage, notify));
  await run(() => runReputationSync(storage, notify));
  await run(() => runCleanup(storage, notify));

  const finished_at = new Date().toISOString();
  const duration_ms = Date.now() - t0;

  const summary: RunSummary = {
    started_at,
    finished_at,
    duration_ms,
    jobs,
    total_processed: jobs.reduce((s, j) => s + j.processed, 0),
    total_failed: jobs.reduce((s, j) => s + j.failed, 0),
    total_mutations: jobs.reduce((s, j) => s + j.mutations.length, 0),
  };

  // Update worker state
  const state = storage.loadWorkerState();
  state.last_run_at = finished_at;
  state.runs_total++;
  if (summary.total_failed === 0) state.runs_succeeded++;
  else state.runs_failed++;
  state.last_job_counts = Object.fromEntries(
    jobs.map((j) => [j.job, j.processed])
  );
  storage.saveWorkerState(state);

  if (!opts.silent) {
    console.log(
      `[runner] Done in ${duration_ms}ms — processed=${summary.total_processed} failed=${summary.total_failed} mutations=${summary.total_mutations}\n`
    );
  }

  return summary;
}
