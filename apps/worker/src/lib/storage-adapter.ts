import fs from "fs";
import path from "path";
import os from "os";
import type { MicroTask, MicroClaim, MicroReputation, WorkerState } from "./types.js";

const DATA_DIR = path.join(os.homedir(), ".blue-agent");
const TASKS_FILE = path.join(DATA_DIR, "microtasks.json");
const CLAIMS_FILE = path.join(DATA_DIR, "microclaims.json");
const REP_FILE = path.join(DATA_DIR, "microreputation.json");
const STATE_FILE = path.join(DATA_DIR, "worker-state.json");

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function readJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(file: string, data: T): void {
  ensureDir();
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

// ── Tasks ──────────────────────────────────────────────────────────────────

export function loadTasks(): MicroTask[] {
  return readJson<MicroTask[]>(TASKS_FILE, []);
}

export function saveTasks(tasks: MicroTask[]): void {
  writeJson(TASKS_FILE, tasks);
}

export function upsertTask(task: MicroTask): void {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === task.id);
  const updated = { ...task, updated_at: new Date().toISOString() };
  if (idx >= 0) tasks[idx] = updated;
  else tasks.push(updated);
  saveTasks(tasks);
}

export function getTask(id: string): MicroTask | null {
  return loadTasks().find((t) => t.id === id) ?? null;
}

// ── Claims ─────────────────────────────────────────────────────────────────

export function loadClaims(): MicroClaim[] {
  return readJson<MicroClaim[]>(CLAIMS_FILE, []);
}

export function saveClaims(claims: MicroClaim[]): void {
  writeJson(CLAIMS_FILE, claims);
}

export function upsertClaim(claim: MicroClaim): void {
  const claims = loadClaims();
  const idx = claims.findIndex((c) => c.id === claim.id);
  if (idx >= 0) claims[idx] = claim;
  else claims.push(claim);
  saveClaims(claims);
}

export function getTaskClaims(taskId: string): MicroClaim[] {
  return loadClaims().filter((c) => c.task_id === taskId);
}

// ── Reputation ─────────────────────────────────────────────────────────────

export function loadReputation(): MicroReputation[] {
  return readJson<MicroReputation[]>(REP_FILE, []);
}

export function saveReputation(reps: MicroReputation[]): void {
  writeJson(REP_FILE, reps);
}

export function upsertReputation(rep: MicroReputation): void {
  const reps = loadReputation();
  const idx = reps.findIndex((r) => r.handle === rep.handle);
  if (idx >= 0) reps[idx] = rep;
  else reps.push(rep);
  saveReputation(reps);
}

export function getReputation(handle: string): MicroReputation | null {
  return loadReputation().find((r) => r.handle === handle) ?? null;
}

// ── Worker state ───────────────────────────────────────────────────────────

const DEFAULT_STATE: WorkerState = {
  last_run_at: null,
  runs_total: 0,
  runs_succeeded: 0,
  runs_failed: 0,
  last_job_counts: {},
  reminded_tasks: {},
};

export function loadWorkerState(): WorkerState {
  return readJson<WorkerState>(STATE_FILE, { ...DEFAULT_STATE });
}

export function saveWorkerState(state: WorkerState): void {
  writeJson(STATE_FILE, state);
}

export function updateWorkerState(patch: Partial<WorkerState>): WorkerState {
  const state = { ...loadWorkerState(), ...patch };
  saveWorkerState(state);
  return state;
}

// ── Storage adapter object ─────────────────────────────────────────────────

export const storage = {
  loadTasks,
  saveTasks,
  upsertTask,
  getTask,
  loadClaims,
  saveClaims,
  upsertClaim,
  getTaskClaims,
  loadReputation,
  saveReputation,
  upsertReputation,
  getReputation,
  loadWorkerState,
  saveWorkerState,
  updateWorkerState,
};

export type StorageAdapter = typeof storage;
