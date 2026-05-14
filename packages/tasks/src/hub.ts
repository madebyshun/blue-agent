import crypto from "crypto";
import { Task, TaskCreateInput, TaskFilter, xpForDifficulty } from "./types";
import { loadTasks, saveTasks } from "./storage";

const FEE_PCT = 5;

export function createTask(input: TaskCreateInput): Task {
  const tasks = loadTasks();
  const now = new Date().toISOString();
  const doerXp = xpForDifficulty(input.difficulty);

  const task: Task = {
    id: `task_${crypto.randomBytes(4).toString("hex")}`,
    title: input.title,
    description: input.description,
    category: input.category,
    difficulty: input.difficulty,
    reward: input.reward,
    currency: "USDC",
    poster: input.poster,
    deadline: input.deadline,
    status: "open",
    proof_required: input.proof_required,
    xp_reward: { poster: 2, doer: doerXp },
    fee_pct: 5,
    created_at: now,
    updated_at: now,
  };

  tasks.push(task);
  saveTasks(tasks);
  return task;
}

export function listTasks(filter?: TaskFilter): Task[] {
  const tasks = loadTasks();
  return tasks.filter((t) => {
    if (filter?.category && t.category !== filter.category) return false;
    if (filter?.status && t.status !== filter.status) return false;
    return true;
  });
}

export function getTask(id: string): Task | undefined {
  return loadTasks().find((t) => t.id === id);
}

export function acceptTask(id: string, agentHandle: string): Task {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error(`Task ${id} not found`);
  if (tasks[idx].status !== "open") throw new Error(`Task ${id} is not open (status: ${tasks[idx].status})`);

  tasks[idx] = { ...tasks[idx], status: "in_progress", doer: agentHandle, updated_at: new Date().toISOString() };
  saveTasks(tasks);
  return tasks[idx];
}

export function submitTask(id: string, proof: string): { task: Task; xpEarned: number; doerPayout: number; fee: number } {
  const tasks = loadTasks();
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx < 0) throw new Error(`Task ${id} not found`);
  if (tasks[idx].status !== "in_progress") throw new Error(`Task ${id} is not in progress`);

  const task = tasks[idx];
  const fee = Math.round(task.reward * (FEE_PCT / 100) * 1e6) / 1e6;
  const doerPayout = Math.round((task.reward - fee) * 1e6) / 1e6;
  const xpEarned = task.xp_reward.doer;

  tasks[idx] = { ...task, status: "completed", proof, updated_at: new Date().toISOString() };
  saveTasks(tasks);
  return { task: tasks[idx], xpEarned, doerPayout, fee };
}
