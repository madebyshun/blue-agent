// Shared command schemas for Blue Agent (core)

import fs from "fs";
import path from "path";

export type CommandSpec = {
  name: string;
  description?: string;
  requiredOutput?: string[];
};

export const BLUE_AGENT_PRICING = {
  idea: 0.05,
  build: 0.5,
  audit: 1.0,
  ship: 0.1,
  raise: 0.2,
} as const;

export const LAUNCH_SIMULATOR_PRICING = {
  tier1: 0.10,  // Quick Signal — Blue Agent LLM only
  tier2: 0.35,  // Deep Signal  — + live market data
  tier3: 0.50,  // Full Sim     — + risk matrix + timeline
} as const;

const COMMANDS_DIR = path.resolve(__dirname, "../../../commands");

export function listBuiltInCommands(): CommandSpec[] {
  try {
    const files = fs.readdirSync(COMMANDS_DIR).filter((f) => f.endsWith(".md"));
    return files.map((f) => ({ name: f.replace(/\.md$/, ""), description: undefined }));
  } catch {
    return [];
  }
}

export function readCommandDoc(command: string): string | null {
  const p = path.join(COMMANDS_DIR, `${command}.md`);
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

export function getCommandPrice(command: keyof typeof BLUE_AGENT_PRICING): number {
  return BLUE_AGENT_PRICING[command];
}
