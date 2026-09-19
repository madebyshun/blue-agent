/**
 * Blue Agent runtime — loads skills, builds grounded system context, calls the
 * Virtuals inference gateway.
 *
 * ⚠️ Until 1.0.4 this file called `https://llm.bankr.bot/v1/messages` with a
 * `BANKR_API_KEY`. Bankr 403-banned this project at the ACCOUNT level (LLM host
 * 2026-07-20; re-measured on every verb 2026-09-06 and 2026-09-18 — a different
 * key does not help). Because `blue idea|build|audit|ship|raise` all funnel
 * through `callWithGrounding` below, that made **every core command in the
 * published CLI dead**, and `@blueagent/core@1.0.3` shipped it to npm. The docs
 * telling users to get a bankr.bot key were not stale — they accurately described
 * a runtime that could no longer answer.
 *
 * The gateway is now Virtuals, matching `apps/web`'s policy (read the header of
 * `apps/web/src/app/api/_lib/llm.ts` before changing any of this): ONE provider,
 * no silent fallback. A failure throws rather than degrading into a different
 * model, because a caller that cannot tell which model answered cannot trust the
 * answer.
 *
 * Shape note — this is not a URL swap. Bankr spoke the Anthropic Messages API
 * (`/v1/messages`, `x-api-key`, top-level `system`, `content[0].text`). Virtuals
 * is OpenAI-compatible (`/v1/chat/completions`, `Authorization: Bearer`, `system`
 * as the first message, `choices[0].message.content`).
 *
 * Skill file resolution order (first found wins):
 *   1. BLUE_AGENT_SKILLS_DIR env var
 *   2. ~/.blue-agent/skills/   (installed via `blue init`)
 *   3. <package-root>/../../skills/  (monorepo dev)
 */

import fs from "fs";
import path from "path";
import os from "os";
import { getSkillsForTask, type Task } from "./registry";
import { readCommandDoc } from "./schemas";

// ── Load API key from config.toml if not in env ───────────────────────────────

/** `~/.blue-agent/config.toml` — the file `blue init` writes and `blue doctor` reads. */
export const CONFIG_FILE = path.join(os.homedir(), ".blue-agent", "config.toml");

/**
 * Populate `VIRTUALS_API_KEY` from `~/.blue-agent/config.toml` when it isn't
 * already in the environment. Env always wins, so CI can override the file.
 */
export function loadApiKey(): void {
  if (process.env.VIRTUALS_API_KEY?.trim()) return;
  if (!fs.existsSync(CONFIG_FILE)) return;
  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  const match = raw.match(/^\s*virtuals_api_key\s*=\s*"([^"]+)"/m);
  if (match) process.env.VIRTUALS_API_KEY = match[1].trim();
}

loadApiKey();

// ── Virtuals client (inlined to keep core self-contained for publishing) ──────

/** Virtuals OpenAI-compatible gateway — the single inference provider. */
export const VIRTUALS_BASE_URL = "https://compute.virtuals.io/v1";

/** Kept in sync with `apps/web/src/app/api/_lib/llm.ts`'s VIRTUALS_DEFAULT_MODEL. */
export const VIRTUALS_DEFAULT_MODEL = "deepseek-deepseek-v4-flash";

export type LLMMessage = { role: string; content: string };

/** @deprecated Named for a provider this package no longer calls. Use `LLMMessage`. */
export type BankrLLMMessage = LLMMessage;

/**
 * One call to Virtuals. Throws on a missing key or a non-2xx, and never falls
 * back to another provider — see the file header for why.
 */
export async function callVirtuals(options: {
  model?: string;
  system: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  loadApiKey();
  const apiKey = process.env.VIRTUALS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "VIRTUALS_API_KEY is not set.\n" +
      `  Add it to ${CONFIG_FILE}:  virtuals_api_key = "your_key_here"\n` +
      "  Or export it:  export VIRTUALS_API_KEY=<your-key>\n" +
      "  Check setup:   blue doctor",
    );
  }

  const response = await fetch(`${VIRTUALS_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? process.env.VIRTUALS_MODEL ?? VIRTUALS_DEFAULT_MODEL,
      // OpenAI shape has no top-level `system` — it is the first message.
      messages: [{ role: "system", content: options.system }, ...options.messages],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 800,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Virtuals LLM error: ${response.status} - ${errorText.slice(0, 300)}`);
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const text = data.choices?.[0]?.message?.content;
  if (typeof text === "string" && text.trim()) return text;
  throw new Error("Invalid response format from Virtuals — no choices[0].message.content");
}

// ── Skill resolution ─────────────────────────────────────────────────────────

const SKILL_SEARCH_DIRS: string[] = [
  process.env.BLUE_AGENT_SKILLS_DIR ?? "",
  path.join(os.homedir(), ".blue-agent", "skills"),
  path.resolve(__dirname, "../../../skills"),
].filter(Boolean);

function resolveSkillFile(name: string): string | null {
  for (const dir of SKILL_SEARCH_DIRS) {
    const p = path.join(dir, `${name}.md`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadSkill(name: string): string {
  const p = resolveSkillFile(name);
  if (!p) {
    console.warn(`[blueagent/core] Skill not found: ${name}.md — skipping`);
    return "";
  }
  return fs.readFileSync(p, "utf8").trim();
}

// ── System prompt assembly ────────────────────────────────────────────────────

function buildSystemPrompt(task: Task): string {
  const skillNames = getSkillsForTask(task);
  const commandDoc = readCommandDoc(task) ?? "";

  const skillBlocks = skillNames
    .map(loadSkill)
    .filter(Boolean)
    .map((content, i) => `--- Skill: ${skillNames[i]} ---\n${content}`)
    .join("\n\n");

  return [
    `You are Blue Agent — the AI-native founder console for Base builders.`,
    `You are running the "${task}" command.`,
    commandDoc ? `\n## Command contract\n${commandDoc}` : "",
    skillBlocks ? `\n## Grounding knowledge\n${skillBlocks}` : "",
    `\n## Rules\n- Base chain only (chain ID 8453). Never suggest Ethereum mainnet.\n- Never invent contract addresses. Use only verified addresses from the grounding knowledge.\n- If the grounding knowledge does not cover something, say "insufficient data" — never fill the gap with a plausible-looking number or address.\n- Be direct, builder-first, no filler.`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface GroundedCallOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  history?: LLMMessage[];
}

/**
 * Call Virtuals with skill-grounded system context for the given task.
 * Returns the assistant's full response text.
 *
 * No `model` default is hard-coded here — `callVirtuals` resolves it from
 * `VIRTUALS_MODEL` or `VIRTUALS_DEFAULT_MODEL`, so the model id lives in exactly
 * one place. (Before 1.0.4 this passed `claude-sonnet-4-6`, a Bankr id that
 * Virtuals does not serve.)
 */
export async function callWithGrounding(
  task: Task,
  userPrompt: string,
  options: GroundedCallOptions = {}
): Promise<string> {
  const system = buildSystemPrompt(task);
  const messages: LLMMessage[] = [
    ...(options.history ?? []),
    { role: "user", content: userPrompt },
  ];

  return callVirtuals({
    model: options.model,
    system,
    messages,
    temperature: options.temperature ?? 0.6,
    maxTokens: options.maxTokens ?? 2000,
  });
}

/**
 * Stream a grounded response as a ReadableStream<Uint8Array>.
 * Wraps callWithGrounding because the gateway returns one full response, not SSE
 * — the word-by-word pacing below is cosmetic, not real token streaming.
 * Suitable for returning directly from Next.js route handlers.
 */
export function streamWithGrounding(
  task: Task,
  userPrompt: string,
  options: GroundedCallOptions = {}
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        const text = await callWithGrounding(task, userPrompt, options);
        const words = text.split(" ");
        for (const word of words) {
          controller.enqueue(encoder.encode(word + " "));
          await new Promise((r) => setTimeout(r, 8));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Transfer-Encoding": "chunked",
      "X-Blue-Agent-Task": task,
    },
  });
}

/** List which skill files are configured and whether each one is resolvable. */
export function diagnoseSkills(task: Task): Array<{ name: string; resolved: boolean; path: string | null }> {
  return getSkillsForTask(task).map((name) => {
    const p = resolveSkillFile(name);
    return { name, resolved: p !== null, path: p };
  });
}
