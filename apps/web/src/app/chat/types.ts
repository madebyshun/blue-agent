// Blue Chat v2 — Shared Types

export type ToolLog = { tool: string; status: "running" | "done"; ms?: number; result?: unknown };

export interface Attachment {
  name:     string;   // filename e.g. "Contract.sol"
  mimeType: string;   // "text/plain", "application/pdf", "image/png", etc.
  size:     number;   // bytes
  data:     string;   // base64 (binary) or raw text (isText=true)
  isText:   boolean;  // true = plain text content, false = base64 binary
}

export interface Message {
  role:             "user" | "assistant";
  content:          string;
  createdAt?:       number;   // epoch ms — for timestamp display
  thinkingContent?: string;   // Venice reasoning trace (inside <think>…</think>)
  isThinking?:      boolean;  // true while the <think> block is still streaming
  modelUsed?:       string;   // tier ID e.g. "venice-deepseek-pro"
  responseMs?:      number;   // total response time in ms
  toolLogs?:        ToolLog[];
  attachments?:     Attachment[];
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

export type SidebarTab = "tasks" | "skills" | "cron" | "settings" | "none";
