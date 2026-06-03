// Blue Chat v2 — Shared Types

export type ToolLog = { tool: string; status: "running" | "done"; ms?: number };

export interface Message {
  role: "user" | "assistant";
  content: string;
  toolLogs?: ToolLog[];
}

// ── Task (conversation) ────────────────────────────────────────────────────────

export interface ChatTask {
  id:         string;
  title:      string;     // auto from first user message
  messages:   Message[];
  createdAt:  number;
  updatedAt:  number;
  model:      string;     // e.g. "pro"
  persona:    PersonaId;
}

// ── Persona ────────────────────────────────────────────────────────────────────

export type PersonaId =
  | "blue-agent"
  | "blue-trader"
  | "blue-auditor"
  | "blue-researcher"
  | "custom";

export interface Persona {
  id:           PersonaId;
  label:        string;
  icon:         string;
  systemPrompt: string;   // empty = use BASE_SYSTEM only
  color:        string;
}

// ── Artifact ───────────────────────────────────────────────────────────────────

export interface Artifact {
  id:           string;
  lang:         string;     // "solidity" | "typescript" | "bash" | etc.
  filename:     string;     // derived: "contract.sol"
  code:         string;
  messageIndex: number;
}

// ── Cron ──────────────────────────────────────────────────────────────────────

export type CronSchedule = "daily" | "weekly";

export interface CronTask {
  id:          string;
  label:       string;
  schedule:    CronSchedule;
  time:        string;      // "HH:MM" local
  prompt:      string;
  active:      boolean;
  lastRun?:    number;      // epoch ms
  lastResult?: string;      // truncated output
}

// ── Sidebar ───────────────────────────────────────────────────────────────────

export type SidebarTab = "tasks" | "skills" | "cron";
