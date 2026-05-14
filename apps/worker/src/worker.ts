/**
 * worker — polling loop with lock protection.
 *
 * Runs jobs on INTERVAL_MS schedule (default 5 min).
 * Acquires a file lock before each run to prevent duplicate workers.
 */
import { acquireLock, releaseLock } from "./lib/locks.js";
import { runAllJobs } from "./runner.js";

const INTERVAL_MS = parseInt(process.env.WORKER_INTERVAL_MS ?? String(5 * 60 * 1000), 10);

let shuttingDown = false;
let timer: ReturnType<typeof setTimeout> | null = null;

async function tick() {
  if (shuttingDown) return;

  if (!acquireLock()) {
    console.log("[worker] Another worker is running — skipping this tick");
    schedule();
    return;
  }

  try {
    await runAllJobs({ silent: false });
  } catch (err) {
    console.error(`[worker] Unhandled error in runAllJobs: ${err}`);
  } finally {
    releaseLock();
  }

  if (!shuttingDown) schedule();
}

function schedule() {
  timer = setTimeout(tick, INTERVAL_MS);
}

export function startWorker() {
  console.log(`[worker] Starting — interval=${INTERVAL_MS / 1000}s`);

  // Run immediately on start
  void tick();

  // Graceful shutdown
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\n[worker] ${signal} received — shutting down`);
    if (timer) clearTimeout(timer);
    releaseLock();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

export function stopWorker() {
  shuttingDown = true;
  if (timer) clearTimeout(timer);
  releaseLock();
}
