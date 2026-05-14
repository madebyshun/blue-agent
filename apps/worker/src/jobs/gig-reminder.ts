/**
 * gig-reminder — sends deadline warnings for upcoming gig tasks.
 *
 * Sends a reminder when a gig is 48h from deadline and has
 * an active claimant or pending submission.
 *
 * Stub: wires in once gig storage is finalized.
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult } from "../lib/types.js";
import fs from "fs";
import path from "path";
import os from "os";

const GIGS_FILE = path.join(os.homedir(), ".blue-agent", "gigs.json");
const REMIND_WINDOW_MS = 48 * 60 * 60 * 1000; // 48 h before deadline

interface GigTask {
  id: string;
  title: string;
  status: string;
  deadline: string;
  creator_handle?: string;
  claimant_handle?: string;
}

function loadGigs(): GigTask[] {
  try {
    if (!fs.existsSync(GIGS_FILE)) return [];
    return JSON.parse(fs.readFileSync(GIGS_FILE, "utf8")) as GigTask[];
  } catch {
    return [];
  }
}

export async function runGigReminder(
  _storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = {
    job: "gig.reminder",
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    mutations: [],
  };

  const gigs = loadGigs();
  if (gigs.length === 0) { result.skipped++; return result; }

  const now = Date.now();
  const approaching = gigs.filter((g) => {
    if (g.status === "expired" || g.status === "completed" || g.status === "cancelled") return false;
    const deadline = new Date(g.deadline).getTime();
    const timeLeft = deadline - now;
    return timeLeft > 0 && timeLeft < REMIND_WINDOW_MS;
  });

  for (const gig of approaching) {
    try {
      const hoursLeft = Math.round((new Date(gig.deadline).getTime() - now) / 3_600_000);

      if (gig.claimant_handle) {
        notify({
          type: "gig.reminded",
          taskId: gig.id,
          handle: gig.claimant_handle,
          message: `Gig deadline in ${hoursLeft}h — @${gig.claimant_handle}, please submit: "${gig.title.slice(0, 40)}"`,
        });
      }
      if (gig.creator_handle) {
        notify({
          type: "gig.reminded",
          taskId: gig.id,
          creatorHandle: gig.creator_handle,
          message: `Gig deadline in ${hoursLeft}h — review pending for: "${gig.title.slice(0, 40)}"`,
        });
      }

      result.processed++;
    } catch (err) {
      result.failed++;
      result.errors.push(`gig:${gig.id} — ${String(err)}`);
    }
  }

  return result;
}
