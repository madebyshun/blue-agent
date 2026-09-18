/**
 * Skill registry — maps each Blue Agent task to the skill files that ground it.
 * Skill files are loaded by runtime.ts and injected as system context before every LLM call.
 */

export type Task = "idea" | "build" | "audit" | "ship" | "raise";

/**
 * Which skill files to load for each task.
 * Keys are skill filenames without the .md extension.
 * Load order matters — files are concatenated in array order.
 *
 * Every name here MUST resolve to a real `skills/<name>.md`. An unresolvable name
 * is not a loud failure — `loadSkill` logs a warning and returns "", so the command
 * still answers, just with less grounding than its registry claims. That is why the
 * check is in CI (`apps/web/scripts/skills-truth-check.ts`) and not left to a reader.
 *
 * Two entries changed 2026-09-18:
 *   • `base-4337-aa` was removed from idea/build/audit. No such file has ever existed
 *     in `skills/` — all three tasks were silently loading 4 or 5 files, not the 5 or 6
 *     the array advertised. It is NOT re-pointed at `account-abstraction-deep-dive.md`
 *     here: that file is real and probably the intent, but wiring it in would change
 *     what the model is told, which is a product call, not a bug fix. Flagged, not guessed.
 *   • `bankr-tools` → `blue-agent-platform`. The old file described a banned LLM host,
 *     a banned action rail and two npm packages that 404 — and `build` injected all of
 *     it into the system prompt. Renamed rather than rewritten in place because skill
 *     resolution checks `~/.blue-agent/skills/` BEFORE the package copy, so a stale
 *     `bankr-tools.md` left by an earlier `blue init` would have shadowed a rewrite.
 *     Under the new name the stale file is simply never asked for.
 */
export const SKILL_REGISTRY: Record<Task, string[]> = {
  idea:  ["base-standards", "base-addresses", "blue-agent-identity", "base-ecosystem"],
  build: ["base-standards", "base-addresses", "blue-agent-platform", "base-ecosystem", "x402-patterns"],
  audit: ["base-standards", "base-addresses", "base-security", "base-ecosystem", "x402-patterns"],
  ship:  ["x402-patterns"],
  raise: ["blue-agent-identity"],
};

export function getSkillsForTask(task: Task): string[] {
  return SKILL_REGISTRY[task] ?? [];
}

export const ALL_TASKS: Task[] = ["idea", "build", "audit", "ship", "raise"];
