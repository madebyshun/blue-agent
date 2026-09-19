// @blueagent/core — public API

// Grounded LLM runtime
export { callWithGrounding, streamWithGrounding, diagnoseSkills } from "./runtime";
export type { GroundedCallOptions } from "./runtime";

// Virtuals inference client — exported so `@blueagent/builder` reuses ONE client
// instead of keeping a second copy that can drift to a different provider.
export {
  callVirtuals,
  loadApiKey,
  CONFIG_FILE,
  VIRTUALS_BASE_URL,
  VIRTUALS_DEFAULT_MODEL,
} from "./runtime";
export type { LLMMessage } from "./runtime";

// Skill registry
export { SKILL_REGISTRY, getSkillsForTask, ALL_TASKS } from "./registry";
export type { Task } from "./registry";

// Command schemas + pricing
export {
  BLUE_AGENT_PRICING,
  listBuiltInCommands,
  readCommandDoc,
  getCommandPrice,
} from "./schemas";
export type { CommandSpec } from "./schemas";

// Tool input definitions
export { TOOL_SCHEMAS } from "./tool-inputs";
export type { Field, ToolSchema } from "./tool-inputs";

// Supported chains for token launches (Base + Robinhood Chain)
export { CHAINS, getChain, getChainById } from "./chains";
export type { ChainKey, ChainConfig } from "./chains";

// Utilities
export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
