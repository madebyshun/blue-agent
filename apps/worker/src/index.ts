/**
 * Blue Agent Worker — entrypoint
 *
 * Usage:
 *   node dist/index.js          # start polling worker + health server
 *   node dist/index.js --once   # run all jobs once and exit
 *
 * Env vars:
 *   WORKER_INTERVAL_MS=300000   # polling interval (default 5 min)
 *   WORKER_PORT=3002            # health check port
 *   WORKER_WEBHOOK_URL=https… # optional webhook for notifications
 *   TELEGRAM_BOT_TOKEN=…       # optional Telegram notifications
 *   TELEGRAM_CHAT_ID=…
 */
import { startWorker } from "./worker.js";
import { startHealthServer } from "./health.js";
import { runAllJobs } from "./runner.js";

const args = process.argv.slice(2);
const once = args.includes("--once");

async function main() {
  console.log("╔══════════════════════════════════╗");
  console.log("║   Blue Agent Worker  v0.1.0      ║");
  console.log("╚══════════════════════════════════╝");

  if (once) {
    console.log("[index] --once mode: running jobs and exiting\n");
    const summary = await runAllJobs({ silent: false });
    const ok = summary.total_failed === 0;
    console.log(`\n[index] Run complete — ${ok ? "✅ OK" : "❌ FAILED"}`);
    process.exit(ok ? 0 : 1);
  }

  // Start health check server
  startHealthServer();

  // Start polling worker
  startWorker();
}

main().catch((err) => {
  console.error("[index] Fatal:", err);
  process.exit(1);
});
