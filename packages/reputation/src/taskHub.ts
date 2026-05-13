import { Task, TaskCreateInput, TaskStatus, TaskCategory } from "./types";
import * as crypto from "crypto";

// In-memory store — replace with DB/onchain in production
const tasks: Map<string, Task> = new Map();

const BLUE_AGENT_FEE = 0.05; // 5% fee
const TREASURY = "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5"; // Blue Agent treasury

export function createTask(input: TaskCreateInput): Task {
  const id = `task_${crypto.randomBytes(4).toString("hex")}`;
  const now = new Date().toISOString();
  const max_slots = input.max_slots ?? 1;

  const task: Task = {
    id,
    title: input.title,
    description: input.description,
    category: input.category,
    reward: input.reward,
    currency: "USDC",
    poster: input.poster,
    deadline: input.deadline,
    status: "open",
    proof_required: input.proof_required,
    max_slots,
    slots_taken: 0,
    doers: [],
    created_at: now,
    updated_at: now,
  };

  tasks.set(id, task);
  return task;
}

export function listTasks(filter?: { category?: TaskCategory; status?: TaskStatus }): Task[] {
  const all = Array.from(tasks.values());
  return all.filter((t) => {
    if (filter?.category && t.category !== filter.category) return false;
    if (filter?.status && t.status !== filter.status) return false;
    return true;
  });
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

export function acceptTask(id: string, doer: string): Task {
  const task = tasks.get(id);
  if (!task) throw new Error(`Task ${id} not found`);
  if (task.status !== "open") throw new Error(`Task ${id} is not open (status: ${task.status})`);
  if (task.slots_taken >= task.max_slots) {
    throw new Error(`Task ${id} is full (${task.slots_taken}/${task.max_slots} slots taken)`);
  }

  const doers = [...(task.doers ?? []), doer];
  const slots_taken = task.slots_taken + 1;
  // Only move to in_progress when all slots are filled
  const status: TaskStatus = slots_taken >= task.max_slots ? "in_progress" : "open";

  const updated: Task = {
    ...task,
    status,
    doer,          // most recent acceptor (convenience field)
    doers,
    slots_taken,
    updated_at: new Date().toISOString(),
  };
  tasks.set(id, updated);
  return updated;
}

export function submitTask(id: string, doer: string, proof: string): Task {
  const task = tasks.get(id);
  if (!task) throw new Error(`Task ${id} not found`);
  if (task.status === "completed") throw new Error(`Task ${id} is already completed`);
  if (task.status === "disputed") throw new Error(`Task ${id} is under dispute`);

  // Validate doer accepted the task (single and multi-slot)
  const doers = task.doers ?? [];
  if (!doers.includes(doer)) {
    throw new Error(`${doer} has not accepted task ${id}.\n  Run: blue accept ${id} @${doer}`);
  }

  const updated: Task = { ...task, status: "completed", proof, doer, updated_at: new Date().toISOString() };
  tasks.set(id, updated);
  return updated;
}

export function getFeeAmount(reward: number): number {
  return Math.round(reward * BLUE_AGENT_FEE * 1e6) / 1e6;
}

export function getDoerAmount(reward: number): number {
  return Math.round(reward * (1 - BLUE_AGENT_FEE) * 1e6) / 1e6;
}

export { TREASURY, BLUE_AGENT_FEE };
