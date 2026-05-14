import fs from "fs";
import path from "path";
import os from "os";
import { Task } from "./types";

const TASKS_DIR = path.join(os.homedir(), ".blue-agent");
const TASKS_FILE = path.join(TASKS_DIR, "tasks.json");

export function loadTasks(): Task[] {
  try {
    if (!fs.existsSync(TASKS_FILE)) return [];
    const raw = fs.readFileSync(TASKS_FILE, "utf8");
    return JSON.parse(raw) as Task[];
  } catch {
    return [];
  }
}

export function saveTasks(tasks: Task[]): void {
  fs.mkdirSync(TASKS_DIR, { recursive: true });
  fs.writeFileSync(TASKS_FILE, JSON.stringify(tasks, null, 2), "utf8");
}
