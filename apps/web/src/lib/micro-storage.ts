/**
 * Server-only storage bridge — reads/writes the same JSON files as the CLI.
 * Uses ~/.blue-agent/{microtasks,microclaims,microreputation}.json
 * Import only from API routes (Node.js runtime).
 */

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { MicroTask, MicroClaim, MicroReputation } from "./micro-types";
import { PLATFORM_FEE } from "./micro-types";

const DIR = path.join(os.homedir(), ".blue-agent");
const TASKS_FILE = path.join(DIR, "microtasks.json");
const CLAIMS_FILE = path.join(DIR, "microclaims.json");
const REP_FILE = path.join(DIR, "microreputation.json");

function ensureDir() {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
}

// ── Tasks ────────────────────────────────────────────────────────────────────

export function loadTasks(): MicroTask[] {
  ensureDir();
  if (!fs.existsSync(TASKS_FILE)) return seedDemoTasks();
  try {
    const data = JSON.parse(fs.readFileSync(TASKS_FILE, "utf8")) as MicroTask[];
    if (data.length === 0) return seedDemoTasks();
    return data;
  } catch {
    return [];
  }
}

export function saveTasks(tasks: MicroTask[]) {
  ensureDir();
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2));
}

export function getTask(id: string): MicroTask | undefined {
  return loadTasks().find((t) => t.id === id);
}

export function upsertTask(task: MicroTask) {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === task.id);
  if (idx >= 0) tasks[idx] = task;
  else tasks.push(task);
  saveTasks(tasks);
}

export function createTask(
  params: Omit<MicroTask, "id" | "slots_filled" | "slots_remaining" | "status" | "escrow" | "created_at" | "updated_at">
): MicroTask {
  const now = new Date().toISOString();
  const task: MicroTask = {
    ...params,
    id: "micro_" + crypto.randomBytes(4).toString("hex"),
    slots_filled: 0,
    slots_remaining: params.slots_total,
    status: "open",
    escrow: {
      amount_total: params.reward_per_slot * params.slots_total,
      amount_locked: params.reward_per_slot * params.slots_total,
      amount_released: 0,
      amount_refunded: 0,
      status: "funded",
    },
    created_at: now,
    updated_at: now,
  };
  upsertTask(task);
  return task;
}

// ── Claims ───────────────────────────────────────────────────────────────────

export function loadClaims(): MicroClaim[] {
  ensureDir();
  if (!fs.existsSync(CLAIMS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(CLAIMS_FILE, "utf8")) as MicroClaim[];
  } catch {
    return [];
  }
}

export function saveClaims(claims: MicroClaim[]) {
  ensureDir();
  fs.writeFileSync(CLAIMS_FILE, JSON.stringify(claims, null, 2));
}

export function getClaimsForTask(taskId: string): MicroClaim[] {
  return loadClaims().filter((c) => c.task_id === taskId);
}

export function getClaimForTaskByHandle(taskId: string, handle: string): MicroClaim | undefined {
  const h = handle.replace(/^@/, "").toLowerCase();
  return loadClaims().find(
    (c) => c.task_id === taskId && c.claimant_handle.toLowerCase() === h
  );
}

export function upsertClaim(claim: MicroClaim) {
  const claims = loadClaims();
  const idx = claims.findIndex((c) => c.id === claim.id);
  if (idx >= 0) claims[idx] = claim;
  else claims.push(claim);
  saveClaims(claims);
}

export function createClaim(taskId: string, handle: string): MicroClaim {
  const claim: MicroClaim = {
    id: "claim_" + crypto.randomBytes(4).toString("hex"),
    task_id: taskId,
    claimant_address: "0x" + "0".repeat(40),
    claimant_handle: handle.replace(/^@/, ""),
    accepted_at: new Date().toISOString(),
    status: "accepted",
  };
  upsertClaim(claim);
  return claim;
}

// ── Reputation ───────────────────────────────────────────────────────────────

export function loadReputation(): MicroReputation[] {
  ensureDir();
  if (!fs.existsSync(REP_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(REP_FILE, "utf8")) as MicroReputation[];
  } catch {
    return [];
  }
}

export function saveReputation(reps: MicroReputation[]) {
  ensureDir();
  fs.writeFileSync(REP_FILE, JSON.stringify(reps, null, 2));
}

export function getReputation(handle: string): MicroReputation {
  const h = handle.replace(/^@/, "").toLowerCase();
  const reps = loadReputation();
  return (
    reps.find((r) => r.handle.toLowerCase() === h) ?? {
      address: "0x" + "0".repeat(40),
      handle: h,
      score: 50,
      completed: 0,
      rejected: 0,
      approved_rate: 100,
      total_earned_usdc: 0,
      avg_turnaround_minutes: 0,
      last_activity: new Date().toISOString(),
    }
  );
}

export function updateReputation(
  handle: string,
  delta: Partial<Pick<MicroReputation, "completed" | "rejected" | "total_earned_usdc" | "avg_turnaround_minutes">>
): MicroReputation {
  const reps = loadReputation();
  const h = handle.replace(/^@/, "").toLowerCase();
  let rep = reps.find((r) => r.handle.toLowerCase() === h);
  if (!rep) {
    rep = {
      address: "0x" + "0".repeat(40),
      handle: h,
      score: 50,
      completed: 0,
      rejected: 0,
      approved_rate: 100,
      total_earned_usdc: 0,
      avg_turnaround_minutes: 0,
      last_activity: new Date().toISOString(),
    };
    reps.push(rep);
  }
  if (delta.completed !== undefined) rep.completed += delta.completed;
  if (delta.rejected !== undefined) rep.rejected += delta.rejected;
  if (delta.total_earned_usdc !== undefined) rep.total_earned_usdc += delta.total_earned_usdc;
  if (delta.avg_turnaround_minutes !== undefined) {
    rep.avg_turnaround_minutes = rep.avg_turnaround_minutes === 0
      ? delta.avg_turnaround_minutes
      : Math.round((rep.avg_turnaround_minutes + delta.avg_turnaround_minutes) / 2);
  }
  const total = rep.completed + rep.rejected;
  rep.approved_rate = total === 0 ? 100 : Math.round((rep.completed / total) * 100);
  rep.score = Math.min(100, Math.max(0,
    50 + rep.completed * 2 - rep.rejected * 5 + (rep.approved_rate - 80) / 2
  ));
  rep.last_activity = new Date().toISOString();
  saveReputation(reps);
  return rep;
}

// ── Escrow helpers ───────────────────────────────────────────────────────────

export function escrowRelease(task: MicroTask, net: number): MicroTask {
  const gross = net / (1 - PLATFORM_FEE);
  task.escrow.amount_released += gross;
  task.escrow.amount_locked = Math.max(0, task.escrow.amount_locked - task.reward_per_slot);
  task.escrow.status = task.escrow.amount_locked <= 0 ? "released" : "funded";
  task.updated_at = new Date().toISOString();
  return task;
}

export function escrowRefundSlot(task: MicroTask): MicroTask {
  task.escrow.amount_refunded += task.reward_per_slot;
  task.escrow.amount_locked = Math.max(0, task.escrow.amount_locked - task.reward_per_slot);
  task.escrow.status = task.escrow.amount_locked <= 0 ? "refunded" : "funded";
  task.updated_at = new Date().toISOString();
  return task;
}

// ── Demo seed ────────────────────────────────────────────────────────────────

function seedDemoTasks(): MicroTask[] {
  const now = new Date();
  const deadline = (daysOut: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysOut);
    return d.toISOString().slice(0, 10);
  };

  const tasks: MicroTask[] = [
    {
      id: "micro_demo0001",
      title: "Quote tweet our launch announcement with a 🚀 emoji",
      description: "Quote tweet @blocky_agent's pinned tweet with any comment + a 🚀 emoji. Must be a public tweet from your account.",
      creator_address: "0x" + "f".repeat(40),
      creator_handle: "moltycash",
      platform: "x",
      proof_required: "quote",
      must_mention: "blocky_agent",
      reward_per_slot: 0.25,
      slots_total: 50,
      slots_filled: 12,
      slots_remaining: 38,
      approval_mode: "auto",
      deadline: deadline(7),
      status: "active",
      escrow: { amount_total: 12.5, amount_locked: 9.5, amount_released: 3, amount_refunded: 0, status: "funded" },
      created_at: new Date(now.getTime() - 86400 * 2 * 1000).toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: "micro_demo0002",
      title: "Record a 30-second demo showing how to post a task with blue CLI",
      description: "Film yourself using `blue micro post` or `blue post-task` in your terminal. Upload to any public video platform and share the link. Must clearly show the command running and output.",
      creator_address: "0x" + "a".repeat(40),
      creator_handle: "blocky_agent",
      platform: "web",
      proof_required: "video",
      must_mention: undefined,
      reward_per_slot: 2,
      slots_total: 10,
      slots_filled: 2,
      slots_remaining: 8,
      approval_mode: "manual",
      deadline: deadline(14),
      status: "active",
      escrow: { amount_total: 20, amount_locked: 16, amount_released: 4, amount_refunded: 0, status: "funded" },
      created_at: new Date(now.getTime() - 86400 * 1 * 1000).toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: "micro_demo0003",
      title: "Post a Farcaster cast about building on Base and tag @blueagent",
      description: "Write a genuine cast about your experience building on Base or using Blue Agent. Must include @blueagent mention and be at least 100 characters. Screenshot your cast and submit.",
      creator_address: "0x" + "b".repeat(40),
      creator_handle: "basebuilder",
      platform: "farcaster",
      proof_required: "screenshot",
      must_mention: "blueagent",
      reward_per_slot: 1,
      slots_total: 20,
      slots_filled: 5,
      slots_remaining: 15,
      approval_mode: "manual",
      deadline: deadline(10),
      status: "active",
      escrow: { amount_total: 20, amount_locked: 15, amount_released: 5, amount_refunded: 0, status: "funded" },
      created_at: new Date(now.getTime() - 86400 * 3 * 1000).toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: "micro_demo0004",
      title: "Reply to this tweet with your Blue Agent builder score",
      description: "Run `blue score @yourhandle` and take a screenshot. Reply to our pinned tweet with the screenshot. Paste the reply URL as proof.",
      creator_address: "0x" + "c".repeat(40),
      creator_handle: "moltycash",
      platform: "x",
      proof_required: "reply",
      must_mention: "moltycash",
      reward_per_slot: 0.5,
      slots_total: 100,
      slots_filled: 43,
      slots_remaining: 57,
      approval_mode: "auto",
      deadline: deadline(5),
      status: "active",
      escrow: { amount_total: 50, amount_locked: 28.5, amount_released: 21.5, amount_refunded: 0, status: "funded" },
      created_at: new Date(now.getTime() - 86400 * 4 * 1000).toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: "micro_demo0005",
      title: "Share Blue Agent link in a Telegram crypto group (100+ members)",
      description: "Share https://blueagent.xyz in any active Telegram crypto group with 100+ members. Write a short intro (1-2 sentences). Screenshot the group message and submit.",
      creator_address: "0x" + "d".repeat(40),
      creator_handle: "degenfarmer",
      platform: "telegram",
      proof_required: "screenshot",
      must_mention: undefined,
      reward_per_slot: 0.75,
      slots_total: 30,
      slots_filled: 7,
      slots_remaining: 23,
      approval_mode: "manual",
      deadline: deadline(12),
      status: "open",
      escrow: { amount_total: 22.5, amount_locked: 17.25, amount_released: 5.25, amount_refunded: 0, status: "funded" },
      created_at: new Date(now.getTime() - 86400 * 1 * 1000).toISOString(),
      updated_at: now.toISOString(),
    },
    {
      id: "micro_demo0006",
      title: "Write a one-paragraph review of Blue Agent CLI on Product Hunt",
      description: "Leave a genuine review of Blue Agent on Product Hunt. At least 3 sentences describing your experience. Paste the PH URL to your review as proof.",
      creator_address: "0x" + "e".repeat(40),
      creator_handle: "ph_founder",
      platform: "web",
      proof_required: "url",
      must_mention: undefined,
      reward_per_slot: 1.5,
      slots_total: 15,
      slots_filled: 0,
      slots_remaining: 15,
      approval_mode: "manual",
      deadline: deadline(21),
      status: "open",
      escrow: { amount_total: 22.5, amount_locked: 22.5, amount_released: 0, amount_refunded: 0, status: "funded" },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    },
  ];

  saveTasks(tasks);
  return tasks;
}
