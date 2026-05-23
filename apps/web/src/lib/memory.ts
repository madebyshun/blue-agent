/**
 * Blue Agent — Persistent Memory
 * Stores user context in localStorage, keyed by wallet address.
 * Injected into system prompt on every chat call.
 */

export interface ProjectContext {
  name: string;
  stack?: string;
  repo?: string;
  stage?: "idea" | "build" | "audit" | "ship" | "raise";
  notes?: string;
  lastActivity: number;
}

export interface CommandEntry {
  command: string;
  prompt: string;
  timestamp: number;
}

export interface UserMemory {
  wallet?: string;
  currentProject?: ProjectContext;
  recentTopics: string[];
  commandHistory: CommandEntry[];
  agentNotes: string[];
  preferences: {
    defaultTier?: "fast" | "pro" | "max";
  };
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = (wallet?: string) => `blue_memory_${wallet ?? "anon"}`;
const MAX_TOPICS  = 10;
const MAX_HISTORY = 20;

// ─── Read / Write ────────────────────────────────────────────────────────────

export function getMemory(wallet?: string): UserMemory {
  if (typeof window === "undefined") return createEmpty(wallet);
  try {
    const raw = localStorage.getItem(STORAGE_KEY(wallet));
    if (!raw) return createEmpty(wallet);
    return JSON.parse(raw) as UserMemory;
  } catch {
    return createEmpty(wallet);
  }
}

export function saveMemory(memory: UserMemory): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY(memory.wallet), JSON.stringify(memory));
  } catch {}
}

export function clearMemory(wallet?: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY(wallet));
}

// ─── Update after chat exchange ──────────────────────────────────────────────

export function updateMemoryAfterChat(
  wallet: string | undefined,
  userMessage: string,
  assistantResponse: string
): UserMemory {
  const memory = getMemory(wallet);

  // Track recent topic (first 80 chars)
  const topic = userMessage.slice(0, 80).trim();
  memory.recentTopics = [topic, ...memory.recentTopics].slice(0, MAX_TOPICS);

  // Detect + update project context from message
  detectProject(memory, userMessage, assistantResponse);

  memory.updatedAt = Date.now();
  saveMemory(memory);
  return memory;
}

// ─── Add console command to history ─────────────────────────────────────────

export function addCommandToHistory(
  wallet: string | undefined,
  command: string,
  prompt: string
): void {
  const memory = getMemory(wallet);
  memory.commandHistory = [
    { command, prompt, timestamp: Date.now() },
    ...memory.commandHistory,
  ].slice(0, MAX_HISTORY);
  memory.updatedAt = Date.now();
  saveMemory(memory);
}

// ─── Add agent note ──────────────────────────────────────────────────────────

export function addAgentNote(wallet: string | undefined, note: string): void {
  const memory = getMemory(wallet);
  memory.agentNotes = [note, ...memory.agentNotes].slice(0, 10);
  memory.updatedAt = Date.now();
  saveMemory(memory);
}

// ─── Build memory context string for system prompt ──────────────────────────

export function buildMemoryContext(wallet?: string): string {
  const memory = getMemory(wallet);
  const parts: string[] = [];

  if (memory.currentProject) {
    const p = memory.currentProject;
    const stageLine = p.stage ? ` · stage: ${p.stage}` : "";
    const stackLine = p.stack ? ` · stack: ${p.stack}` : "";
    const notesLine = p.notes ? ` · notes: ${p.notes}` : "";
    parts.push(`Active project: ${p.name}${stackLine}${stageLine}${notesLine}`);
  }

  if (memory.recentTopics.length > 0) {
    parts.push(`Recent topics: ${memory.recentTopics.slice(0, 5).join(" · ")}`);
  }

  if (memory.commandHistory.length > 0) {
    const last = memory.commandHistory[0];
    const minAgo = Math.round((Date.now() - last.timestamp) / 60_000);
    const timeStr = minAgo < 60 ? `${minAgo}m ago` : `${Math.round(minAgo / 60)}h ago`;
    parts.push(
      `Last command: blue ${last.command} — "${last.prompt.slice(0, 60)}" (${timeStr})`
    );
  }

  if (memory.agentNotes.length > 0) {
    parts.push(`Agent notes: ${memory.agentNotes.slice(0, 3).join(" · ")}`);
  }

  if (parts.length === 0) return "";
  return `[User Memory]\n${parts.join("\n")}`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createEmpty(wallet?: string): UserMemory {
  return {
    wallet,
    recentTopics: [],
    commandHistory: [],
    agentNotes: [],
    preferences: {},
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function detectProject(
  memory: UserMemory,
  userMessage: string,
  _response: string
): void {
  // Detect project name from "building a X" or "I'm working on X"
  const buildMatch = userMessage.match(
    /(?:build(?:ing)?|work(?:ing)? on|creat(?:ing)?)\s+(?:a\s+)?([A-Za-z0-9][A-Za-z0-9\s\-]{2,40}?)(?:\s+on\s+Base|\s+app|\s+contract|\s+protocol|[.,!?]|$)/i
  );
  if (buildMatch) {
    const name = buildMatch[1].trim();
    if (name.length >= 3 && name.split(" ").length <= 6) {
      memory.currentProject = {
        name,
        lastActivity: Date.now(),
        stage: memory.currentProject?.stage,
        stack: memory.currentProject?.stack,
        notes: memory.currentProject?.notes,
      };
    }
  }

  // Detect stage keyword
  const stageMap: Record<string, ProjectContext["stage"]> = {
    idea: "idea", build: "build", building: "build",
    audit: "audit", auditing: "audit",
    ship: "ship", shipping: "ship", deploy: "ship", deploying: "ship",
    raise: "raise", fundraise: "raise",
  };
  const stageMatch = userMessage.match(
    /\b(idea|build(?:ing)?|audit(?:ing)?|ship(?:ping)?|deploy(?:ing)?|raise|fundraise)\b/i
  );
  if (stageMatch && memory.currentProject) {
    const detectedStage = stageMap[stageMatch[1].toLowerCase()];
    if (detectedStage) memory.currentProject.stage = detectedStage;
  }

  // Detect stack mentions (Base, Solidity, Next.js, etc.)
  const stackMatch = userMessage.match(
    /\b(Solidity|Next\.js|React|TypeScript|Hardhat|Foundry|wagmi|viem|ERC-\d+|CDP|x402)\b/i
  );
  if (stackMatch && memory.currentProject) {
    const existing = memory.currentProject.stack ?? "";
    if (!existing.includes(stackMatch[1])) {
      memory.currentProject.stack = existing
        ? `${existing}, ${stackMatch[1]}`
        : stackMatch[1];
    }
  }
}
