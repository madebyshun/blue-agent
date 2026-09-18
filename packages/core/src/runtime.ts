/**
 * Blue Agent runtime — loads skills, builds grounded system context, calls the
 * LLM through Virtuals.
 *
 * Skill file resolution order (first found wins):
 *   1. BLUE_AGENT_SKILLS_DIR env var
 *   2. ~/.blue-agent/skills/   (installed via `blue init`)
 *   3. <package-root>/../../skills/  (monorepo dev)
 *
 * WHY THIS FILE CALLS VIRTUALS AND NOT BANKR
 * ------------------------------------------
 * Until 2026-09-18 this module POSTed to `https://llm.bankr.bot/v1/messages`
 * with `BANKR_API_KEY`. That was dead on arrival for anyone who installed the
 * package:
 *
 *   - MEASURED 2026-09-18 — `POST https://llm.bankr.bot/v1/messages` with no
 *     key returns `401 {"error":{"message":"API key required"}}`. The host is
 *     alive; it is the credential that is missing. An installing user has no
 *     Bankr key and our docs never told them to get one, so every grounded
 *     call they made 401'd.
 *   - MEASURED 2026-09-06 — the Blue Agent Bankr ACCOUNT is suspended
 *     (`banned: true`, `reasonCode: "fraud"`), so even our own key 403s on
 *     writes. There is no key, ours or theirs, that makes the old path work
 *     as advertised.
 *
 * This matters more than "a package has a stale dependency", because
 * `callWithGrounding` is the only inference path in THREE published packages:
 * `@blueagent/skill` (its five console commands), `@blueagent/sdk` (all five
 * builder methods) and `@blueagent/builder` (`blue idea|build|audit|ship|raise`).
 * All three were dead on install. Fixing this file fixes all three; breaking it
 * breaks all three.
 *
 * Virtuals is the repo-wide policy (see apps/web/src/app/api/_lib/llm.ts) and
 * the provider every other surface already uses, so core now speaks the same
 * OpenAI-compatible endpoint. The client is still inlined rather than imported
 * — core must stay dependency-free to publish — but the wire format now
 * matches the one the rest of the stack is verified against.
 *
 * The key is the USER'S, not ours: a published package cannot ship a
 * credential. If it is absent we throw a message that names the variable and
 * where to put it, instead of forwarding an opaque upstream 401.
 */

import fs from "fs";
import path from "path";
import os from "os";
import { getSkillsForTask, type Task } from "./registry";
import { readCommandDoc } from "./schemas";

// ── Load API key from config.toml if not in env ───────────────────────────────

const CONFIG_FILE = path.join(os.homedir(), ".blue-agent", "config.toml");

function loadApiKey(): void {
  if (process.env.VIRTUALS_API_KEY?.trim()) return;
  if (!fs.existsSync(CONFIG_FILE)) return;
  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  const match = raw.match(/^\s*virtuals_api_key\s*=\s*"([^"]+)"/m);
  if (match) process.env.VIRTUALS_API_KEY = match[1].trim();
}

loadApiKey();

// ── Virtuals LLM client (inlined to keep core self-contained for publishing) ──

export type LLMMessage = { role: string; content: string };

/** @deprecated Bankr is not the provider. Kept so deep imports keep compiling. */
export type BankrLLMMessage = LLMMessage;

const VIRTUALS_URL = "https://compute.virtuals.io/v1/chat/completions";

// Kept in step with VIRTUALS_DEFAULT_MODEL in apps/web/src/app/api/_lib/llm.ts.
// A model id that is not in the live Virtuals catalog returns 400, and that
// class of bug cost four CI runs before apps/web added catalog validation —
// so this must be copied from a measured source, never guessed.
const DEFAULT_MODEL = "deepseek-deepseek-v4-flash";

async function callVirtuals(options: {
  model?: string;
  system: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.VIRTUALS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "VIRTUALS_API_KEY is not set. Blue Agent runs inference through Virtuals " +
        `(${VIRTUALS_URL}). Export VIRTUALS_API_KEY, or add ` +
        `virtuals_api_key = "…" to ${CONFIG_FILE}.`,
    );
  }

  const model = options.model ?? process.env.VIRTUALS_MODEL ?? DEFAULT_MODEL;
  const maxTokens = options.maxTokens ?? 2000;

  // OpenAI-compatible: the system prompt is the first message, not a
  // top-level field, and the payload carries only the four keys the schema
  // mandates. Virtuals 400s on unrecognised keys — apps/web lost four CI runs
  // to that before settling on a minimal body. Do not add hints here.
  const response = await fetch(VIRTUALS_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: options.system }, ...options.messages],
      max_tokens: maxTokens,
      temperature: options.temperature ?? 0.6,
    }),
  });

  if (!response.ok) {
    // Verbatim upstream body. A generic "Virtuals 4xx" is how a bad model id
    // survives several debugging rounds — the message is the diagnosis.
    const errorText = await response.text();
    throw new Error(`Virtuals ${response.status} model=${model}: ${errorText.slice(0, 400)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string }; finish_reason?: string }>;
    usage?: { completion_tokens?: number };
  };
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content === "string" && content.trim()) return stripThinkBlock(content);

  // Empty content is almost never an outage — it is a starved budget, and it is
  // the EXPENSIVE failure: the call still bills the full max_tokens and returns
  // nothing. The default model reasons before answering, Virtuals bills that
  // hidden reasoning inside `usage.completion_tokens`, spends it from the SAME
  // max_tokens pocket as the answer, and never returns it in message.content.
  // MEASURED 2026-09-17, one real prompt, 12 consecutive calls at max_tokens:400
  // → 8 returned empty (reasoning alone 189–417 tokens); 1000/1500/2000 were 8/8
  // clean. So the error names the cause instead of sending the reader to look
  // for a dead endpoint.
  const spent = data.usage?.completion_tokens;
  if (choice?.finish_reason === "length") {
    throw new Error(
      `Virtuals returned no content (model=${model}): hit the max_tokens limit ` +
        `(${maxTokens})${spent ? ` after billing ${spent} tokens` : ""} before emitting an answer. ` +
        `This model reasons before answering and that reasoning is billed from the same ` +
        `budget, so a low limit yields an empty — but still charged — response. Retry with ` +
        `max_tokens >= 1500.`,
    );
  }
  throw new Error(
    `Virtuals returned no content (model=${model}, finish_reason=${choice?.finish_reason ?? "none"})`,
  );
}

/**
 * Reasoning models may emit their chain of thought as a leading <think> block.
 * It is not part of the answer and must never reach a user or a JSON parser.
 */
function stripThinkBlock(text: string): string {
  const stripped = text.replace(/^\s*<think>[\s\S]*?<\/think>/i, "").trim();
  return stripped || text.trim();
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
    // The old fourth rule read "Use Bankr LLM — you are already running on it."
    // It was false (the call goes to Virtuals) and it was never a rule — it
    // told the model a fact about its own hosting, which changes no output.
    // A prompt is not the place to name the gateway.
    `\n## Rules\n- Base chain only (chain ID 8453). Never suggest Ethereum mainnet.\n- Never invent contract addresses. Use only verified addresses from the grounding knowledge.\n- Be direct, builder-first, no filler.`,
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
 * Call the LLM with skill-grounded system context for the given task.
 * Returns the assistant's full response text.
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

  // No hardcoded model default here. This previously pinned
  // "claude-sonnet-4-6", an Anthropic id that does not exist in the Virtuals
  // catalog — against the new gateway it would 400 on every call. Fall
  // through to DEFAULT_MODEL, which is kept in step with a measured source.
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
 * Wraps callWithGrounding because the gateway returns a full response, not SSE.
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
