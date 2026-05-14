/**
 * health — HTTP health check server on PORT (default 3002).
 *
 * GET /health  → { status, last_run_at, pending, failed, uptime_s }
 * GET /state   → full worker state JSON
 * POST /run    → trigger an immediate job run (for manual ops / CI)
 */
import http from "http";
import { storage } from "./lib/storage-adapter.js";
import { runAllJobs } from "./runner.js";

const PORT = parseInt(process.env.WORKER_PORT ?? "3002", 10);
let running = false;

function countPending(): number {
  const tasks = storage.loadTasks();
  const claims = storage.loadClaims();
  const now = new Date();
  let pending = 0;

  // Expired tasks not yet marked
  pending += tasks.filter(
    (t) => !["expired", "completed", "cancelled"].includes(t.status) && new Date(t.deadline) < now
  ).length;

  // Pending submissions
  pending += claims.filter((c) => c.status === "submitted").length;

  return pending;
}

export function startHealthServer(): http.Server {
  const startedAt = Date.now();

  const server = http.createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");

    if (req.method === "GET" && req.url === "/health") {
      const state = storage.loadWorkerState();
      res.writeHead(200);
      res.end(JSON.stringify({
        status: "ok",
        last_run_at: state.last_run_at,
        runs_total: state.runs_total,
        runs_succeeded: state.runs_succeeded,
        runs_failed: state.runs_failed,
        pending_items: countPending(),
        uptime_s: Math.round((Date.now() - startedAt) / 1000),
      }));
      return;
    }

    if (req.method === "GET" && req.url === "/state") {
      res.writeHead(200);
      res.end(JSON.stringify(storage.loadWorkerState(), null, 2));
      return;
    }

    if (req.method === "POST" && req.url === "/run") {
      if (running) {
        res.writeHead(409);
        res.end(JSON.stringify({ error: "A run is already in progress" }));
        return;
      }
      res.writeHead(202);
      res.end(JSON.stringify({ message: "Job run triggered" }));
      // Run async after response flushed
      setImmediate(async () => {
        running = true;
        try {
          await runAllJobs({ silent: true });
        } finally {
          running = false;
        }
      });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: "Not found" }));
  });

  server.listen(PORT, () => {
    console.log(`[health] Server listening on http://localhost:${PORT}/health`);
  });

  return server;
}
