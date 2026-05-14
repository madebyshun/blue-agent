import fs from "fs";
import path from "path";
import os from "os";

const LOCK_FILE = path.join(os.homedir(), ".blue-agent", ".worker.lock");
const LOCK_TTL_MS = 5 * 60 * 1000; // 5 min — stale lock timeout

interface LockData {
  pid: number;
  acquired_at: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, "utf8");
      const lock = JSON.parse(raw) as LockData;
      const age = Date.now() - new Date(lock.acquired_at).getTime();

      // Stale lock: process is dead or TTL exceeded
      if (!isProcessAlive(lock.pid) || age > LOCK_TTL_MS) {
        console.warn(`[locks] Stealing stale lock from PID ${lock.pid} (age ${Math.round(age / 1000)}s)`);
      } else {
        return false; // Another worker is alive — skip this run
      }
    }

    const data: LockData = { pid: process.pid, acquired_at: new Date().toISOString() };
    fs.writeFileSync(LOCK_FILE, JSON.stringify(data), "utf8");
    return true;
  } catch {
    return false;
  }
}

export function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const raw = fs.readFileSync(LOCK_FILE, "utf8");
      const lock = JSON.parse(raw) as LockData;
      if (lock.pid === process.pid) {
        fs.unlinkSync(LOCK_FILE);
      }
    }
  } catch {
    // non-fatal
  }
}

export function isLocked(): boolean {
  if (!fs.existsSync(LOCK_FILE)) return false;
  try {
    const raw = fs.readFileSync(LOCK_FILE, "utf8");
    const lock = JSON.parse(raw) as LockData;
    const age = Date.now() - new Date(lock.acquired_at).getTime();
    return isProcessAlive(lock.pid) && age < LOCK_TTL_MS;
  } catch {
    return false;
  }
}
