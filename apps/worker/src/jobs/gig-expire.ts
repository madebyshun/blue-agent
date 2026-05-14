/**
 * gig-expire — expires stale gig listings.
 *
 * Stub implementation: gig storage (`~/.blue-agent/gigs.json`) is not
 * yet implemented in the CLI. This job is ready to be wired in once
 * the gig data model is finalized.
 */
import type { StorageAdapter } from "../lib/storage-adapter.js";
import type { Notifier, JobResult } from "../lib/types.js";
import fs from "fs";
import path from "path";
import os from "os";

const GIGS_FILE = path.join(os.homedir(), ".blue-agent", "gigs.json");

interface GigTask {
  id: string;
  title: string;
  status: string;
  deadline: string;
  creator_handle?: string;
  claimant_handle?: string;
  updated_at: string;
}

function loadGigs(): GigTask[] {
  try {
    if (!fs.existsSync(GIGS_FILE)) return [];
    return JSON.parse(fs.readFileSync(GIGS_FILE, "utf8")) as GigTask[];
  } catch {
    return [];
  }
}

function saveGigs(gigs: GigTask[]): void {
  fs.writeFileSync(GIGS_FILE, JSON.stringify(gigs, null, 2), "utf8");
}

export async function runGigExpiry(
  _storage: StorageAdapter,
  notify: Notifier
): Promise<JobResult> {
  const result: JobResult = {
    job: "gig.expire",
    processed: 0,
    skipped: 0,
    failed: 0,
    errors: [],
    mutations: [],
  };

  const gigs = loadGigs();
  if (gigs.length === 0) {
    result.skipped++;
    return result;
  }

  const now = new Date();
  const expirable = gigs.filter(
    (g) =>
      (g.status === "open" || g.status === "active" || g.status === "submitted") &&
      new Date(g.deadline) < now
  );

  for (const gig of expirable) {
    try {
      gig.status = "expired";
      gig.updated_at = now.toISOString();
      result.mutations.push(`gig:expire:${gig.id}`);
      result.processed++;
      notify({
        type: "gig.expired",
        taskId: gig.id,
        creatorHandle: gig.creator_handle,
        message: `Gig expired: "${gig.title.slice(0, 50)}" — @${gig.creator_handle ?? "unknown"}`,
      });
    } catch (err) {
      result.failed++;
      result.errors.push(`gig:${gig.id} — ${String(err)}`);
    }
  }

  if (expirable.length > 0) saveGigs(gigs);

  return result;
}
