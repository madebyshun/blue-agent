// Shared Bankr LLM client for Next.js API routes
// Uses BANKR_API_KEY from Vercel env vars

import { getAeonOutput, formatAeonForLLM } from "./aeon-kv";

export type BankrMessage = { role: string; content: string };

// ─── Skill file cache (in-memory, per process) ────────────────────────────────

const _skillCache = new Map<string, { text: string; ts: number }>();
const SKILL_TTL_MS = 5 * 60 * 1000; // 5 min

async function loadSkillFile(url: string): Promise<string | null> {
  const cached = _skillCache.get(url);
  if (cached && Date.now() - cached.ts < SKILL_TTL_MS) return cached.text;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const text = await res.text();
    _skillCache.set(url, { text, ts: Date.now() });
    return text;
  } catch (e) { console.error("[llm] skill error:", (e as Error).message); return null; }
}

// ─── Real skill URLs ──────────────────────────────────────────────────────────

const GITHUB_BASE = "https://raw.githubusercontent.com/madebyshun/blue-agent/main";
const AEON_BASE   = "https://raw.githubusercontent.com/aaronjmars/aeon/main";

const SKILL_URLS = {
  miroshark:    `${GITHUB_BASE}/collab/miroshark-blueagent.prompt.md`,
  blueIdentity: `${GITHUB_BASE}/skills/blue-agent-identity.md`,
  baseEcosystem:`${GITHUB_BASE}/skills/base-ecosystem.md`,
  tokenLaunch:  `${GITHUB_BASE}/skills/token-launch-guide.md`,
  baseAddresses:`${GITHUB_BASE}/skills/base-addresses.md`,
};

// ─── Core LLM call ───────────────────────────────────────────────────────────

export async function callBankrLLM(opts: {
  model?: string;
  system: string;
  messages: BankrMessage[];
  temperature?: number;
  maxTokens?: number;
  /** Force JSON output via assistant prefill */
  jsonMode?: boolean;
  /** Skip skill auto-enhancement (internal use) */
  _skipEnhance?: boolean;
}): Promise<string> {
  let system = opts.system;

  // ── Auto-inject real skills based on system prompt prefix ────────────────
  if (!opts._skipEnhance) {
    if (system.startsWith("You are MiroShark")) {
      const miroPrompt = await loadSkillFile(SKILL_URLS.miroshark);
      if (miroPrompt) {
        system = `${miroPrompt}\n\n---\n\n## Role for this task\n${system}`;
      }
    } else if (system.startsWith("You are Blue Agent") || system.startsWith("You are Aeon —")) {
      // For Blue Agent synthesis steps, inject identity + base context
      if (system.startsWith("You are Blue Agent")) {
        const [identity, baseCtx] = await Promise.all([
          loadSkillFile(SKILL_URLS.blueIdentity),
          loadSkillFile(SKILL_URLS.baseEcosystem),
        ]);
        const extra = [identity, baseCtx].filter(Boolean).join("\n\n---\n\n");
        if (extra) system = `${extra}\n\n---\n\n## Task\n${system}`;
      }
    }
  }

  // Auto-enable JSON prefill when system contains "Return ONLY raw JSON"
  const wantsJson = opts.jsonMode ?? system.includes("Return ONLY raw JSON");
  const messages: BankrMessage[] = wantsJson
    ? [...opts.messages, { role: "assistant", content: "{" }]
    : opts.messages;

  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model ?? "claude-haiku-4-5",
      system,
      messages,
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 1000,
    }),
    signal: AbortSignal.timeout(55_000),
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`[llm] Bankr LLM error ${res.status}:`, errText);
    throw new Error(`Bankr LLM ${res.status}: ${errText.slice(0, 200)}`);
  }
  const d = await res.json() as { content?: { text: string }[]; text?: string };
  let text = "";
  if (d.content?.length) text = d.content[0].text;
  else if (d.text) text = d.text;
  else throw new Error("Invalid Bankr LLM response");
  return wantsJson ? "{" + text : text;
}

// ─── Venice LLM (REAL web search) ────────────────────────────────────────────
//
// The Bankr gateway ignores `enable_web_search` (verified: the model replies it
// "can't search the web"). Venice's `venice_parameters.enable_web_search` DOES
// run a live search. Use this for any synthesis that must ground specific
// numbers (TAM, APY, valuations, GitHub stars, revenue) in real data instead of
// guessing. Drop-in: accepts the same {system, messages|user, temperature,
// maxTokens} shape as callBankrLLM, and auto-prepends WEB_SEARCH_RULE.

/** Prepended to every Venice (web-search) tool. Tells the model to search, not invent. */
export const WEB_SEARCH_RULE =
  "You have web search available. For any specific numbers (market size, TAM, revenue, user counts, APY, GitHub stars, valuations, projections) ALWAYS search for real data first and cite the source. If search returns no result, write \"[data unavailable]\" — NEVER generate numbers without a verified source.";

/** For Bankr tools (no web search): forbid inventing numbers, but don't claim a search ability. */
export const NO_FABRICATION_RULE =
  "Do NOT invent specific numbers (market size, TAM, revenue, user counts, valuations, GitHub stars). If you do not have a verified source for a figure, write \"[data unavailable]\" instead of guessing.";

// ─── Virtuals Compute (partner-sponsored, OpenAI-compatible) ────────────────
// Base URL: https://compute.virtuals.io/v1 · Model examples:
//   moonshotai-kimi-k2-7-code · deepseek-v3.1 · qwen-2.5-72b
// No web search, but stable + funded via partnership. Preferred primary
// synthesis path for RH RWA tools since Virtuals is native to RH Chain.

export async function callVirtualsLLM(opts: {
  system: string;
  user?: string;
  messages?: BankrMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.VIRTUALS_API_KEY ?? "";
  if (!apiKey) throw new Error("VIRTUALS_API_KEY not set");
  const msgs = opts.messages ?? (opts.user != null ? [{ role: "user", content: opts.user }] : []);
  const res = await fetch("https://compute.virtuals.io/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? "moonshotai-kimi-k2-7-code",
      messages: [{ role: "system", content: opts.system }, ...msgs],
      max_tokens: opts.maxTokens ?? 1000,
      temperature: opts.temperature ?? 0.3,
    }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Virtuals ${res.status}: ${(await res.text()).slice(0, 150)}`);
  const d = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = d.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Virtuals empty response");
  return text;
}

/**
 * Synthesis with fallback chain: **Virtuals → Venice → Bankr**, always.
 *
 * Virtuals is PRIMARY on every call regardless of `webSearch` — sponsored
 * quota + Kimi/DeepSeek quality wins over Venice web-search reliability.
 * When `webSearch: true` is requested and Virtuals succeeds, the response
 * still resolves without external search; the returned `web_search_used`
 * flag lets the caller decide whether to trust "no fresh news" answers.
 *
 * Every attempt logs a structured line:
 *   [llm] provider=<p> status=<s> duration_ms=<ms> web_search=<bool> reason=<...>
 * — grep-friendly for Vercel log tail during incident response.
 */
export type LlmProvider = "virtuals" | "venice" | "bankr";
export interface LlmResult {
  text: string;
  provider: LlmProvider;
  web_search_used: boolean;
  duration_ms: number;
  attempts: Array<{
    provider: LlmProvider;
    status: "success" | "error";
    duration_ms: number;
    error?: string;
  }>;
}

function llmLog(entry: {
  provider: LlmProvider;
  status: "success" | "error";
  duration_ms: number;
  web_search?: boolean;
  reason?: string;
}) {
  const parts = [
    `[llm]`,
    `provider=${entry.provider}`,
    `status=${entry.status}`,
    `duration_ms=${entry.duration_ms}`,
    entry.web_search !== undefined ? `web_search=${entry.web_search}` : null,
    entry.reason ? `reason="${entry.reason.replace(/"/g, "'").slice(0, 200)}"` : null,
  ].filter(Boolean);
  console.log(parts.join(" "));
}

export async function callLLM(opts: {
  system: string;
  user?: string;
  messages?: BankrMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Hint that the caller wants fresh web-search grounding. Only Venice
   *  can search; Virtuals + Bankr return without. Flagged in web_search_used. */
  webSearch?: boolean;
}): Promise<LlmResult> {
  const chainStart = Date.now();
  const attempts: LlmResult["attempts"] = [];

  // 1) Virtuals — primary, always.
  {
    const t0 = Date.now();
    try {
      const text = await callVirtualsLLM(opts);
      const dur = Date.now() - t0;
      llmLog({ provider: "virtuals", status: "success", duration_ms: dur, web_search: false });
      attempts.push({ provider: "virtuals", status: "success", duration_ms: dur });
      return { text, provider: "virtuals", web_search_used: false, duration_ms: Date.now() - chainStart, attempts };
    } catch (e) {
      const dur = Date.now() - t0;
      const msg = (e as Error).message;
      llmLog({ provider: "virtuals", status: "error", duration_ms: dur, reason: msg });
      attempts.push({ provider: "virtuals", status: "error", duration_ms: dur, error: msg });
    }
  }

  // 2) Venice — fallback. Honors the caller's webSearch hint here.
  {
    const t0 = Date.now();
    try {
      const text = await callVeniceLLM({ ...opts, webSearch: opts.webSearch });
      const dur = Date.now() - t0;
      const searched = opts.webSearch !== false;
      llmLog({ provider: "venice", status: "success", duration_ms: dur, web_search: searched });
      attempts.push({ provider: "venice", status: "success", duration_ms: dur });
      return { text, provider: "venice", web_search_used: searched, duration_ms: Date.now() - chainStart, attempts };
    } catch (e) {
      const dur = Date.now() - t0;
      const msg = (e as Error).message;
      llmLog({ provider: "venice", status: "error", duration_ms: dur, reason: msg });
      attempts.push({ provider: "venice", status: "error", duration_ms: dur, error: msg });
    }
  }

  // 3) Bankr — last resort.
  {
    const t0 = Date.now();
    try {
      const text = await callBankrLLM({
        system: opts.system,
        messages: opts.messages ?? (opts.user != null ? [{ role: "user", content: opts.user }] : [{ role: "user", content: "" }]),
        temperature: opts.temperature,
        maxTokens: opts.maxTokens,
        _skipEnhance: true,
      });
      const dur = Date.now() - t0;
      llmLog({ provider: "bankr", status: "success", duration_ms: dur, web_search: false });
      attempts.push({ provider: "bankr", status: "success", duration_ms: dur });
      return { text, provider: "bankr", web_search_used: false, duration_ms: Date.now() - chainStart, attempts };
    } catch (e) {
      const dur = Date.now() - t0;
      const msg = (e as Error).message;
      llmLog({ provider: "bankr", status: "error", duration_ms: dur, reason: msg });
      attempts.push({ provider: "bankr", status: "error", duration_ms: dur, error: msg });
      // Every provider failed → surface the chain state to the caller.
      const chainErr = new Error(`all_llm_providers_failed: ${attempts.map((a) => `${a.provider}=${a.error}`).join(" | ")}`);
      (chainErr as Error & { attempts?: unknown }).attempts = attempts;
      throw chainErr;
    }
  }
}

export async function callVeniceLLM(opts: {
  system: string;
  /** Either a single user string… */
  user?: string;
  /** …or full messages (drop-in for callBankrLLM callers). */
  messages?: BankrMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Web search on by default; pass false to disable. */
  webSearch?: boolean;
}): Promise<string> {
  const apiKey = process.env.VENICE_INFERENCE_KEY ?? process.env.VENICE_API_KEY ?? "";
  const msgs = opts.messages ?? (opts.user != null ? [{ role: "user", content: opts.user }] : []);
  const system = `${WEB_SEARCH_RULE}\n\n${opts.system}`;
  try {
    const res = await fetch("https://api.venice.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: opts.model ?? "llama-3.3-70b",
        messages: [{ role: "system", content: system }, ...msgs],
        max_tokens: opts.maxTokens ?? 1000,
        temperature: opts.temperature ?? 0.3,
        venice_parameters: {
          include_venice_system_prompt: false,
          ...(opts.webSearch === false ? {} : { enable_web_search: "on" }),
        },
      }),
      signal: AbortSignal.timeout(90_000), // web search adds latency; route maxDuration is 120s
    });
    if (!res.ok) throw new Error(`Venice ${res.status}: ${(await res.text()).slice(0, 150)}`);
    const d = await res.json() as { choices?: { message?: { content?: string } }[] };
    const text = d.choices?.[0]?.message?.content ?? "";
    if (!text) throw new Error("Venice empty response");
    return text;
  } catch (e) {
    // Resilience: if Venice (web search) is unavailable, fall back to Bankr so the
    // paid tool still returns a result. The WEB_SEARCH_RULE is kept — with no search
    // the model writes "[data unavailable]" rather than inventing numbers.
    console.error("[venice] falling back to Bankr:", (e as Error).message);
    return callBankrLLM({
      system,
      messages: msgs.length ? msgs : [{ role: "user", content: "" }],
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
      _skipEnhance: true,
    });
  }
}

export function extractJsonObject(text: string): Record<string, unknown> | null {
  let raw = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const s = raw.indexOf("{");
  if (s < 0) return null;
  const e = raw.lastIndexOf("}");
  if (e > s) raw = raw.slice(s, e + 1);
  else raw = raw.slice(s); // no closing brace — truncated

  // 1. Direct parse
  try { return JSON.parse(raw); } catch {}
  // 2. Strip control chars
  try { return JSON.parse(raw.replace(/[\x00-\x1F\x7F]/g, " ")); } catch {}
  // 3. Repair truncated JSON (LLM hit max_tokens mid-output)
  try { return JSON.parse(repairTruncatedJson(raw)); } catch {}
  return null;
}

/**
 * Repair JSON that was cut off mid-stream (e.g. LLM hit max_tokens).
 * Walks the string tracking string/brace/bracket state, drops any
 * trailing incomplete token, then closes all open structures.
 */
function repairTruncatedJson(raw: string): string {
  const stack: string[] = [];
  let inStr = false, escaped = false;
  let lastSafe = 0; // index after the last closed container, closed string, or comma

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inStr) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') { inStr = false; lastSafe = i + 1; }
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    else if (c === "{") stack.push("}");
    else if (c === "[") stack.push("]");
    else if (c === "}" || c === "]") { stack.pop(); lastSafe = i + 1; }
    else if (c === ",") lastSafe = i; // safe to cut before the comma
  }

  // Roll back to last complete value, drop dangling comma, then drop a
  // dangling key that has no value yet (model cut off after `"key":`)
  let fixed = raw.slice(0, lastSafe).replace(/,\s*$/, "");
  fixed = fixed.replace(/,?\s*"[^"]*"\s*:?\s*$/, "");
  // Recompute open structures up to the cut point
  const reopen: string[] = [];
  let s2 = false, esc = false;
  for (let i = 0; i < fixed.length; i++) {
    const c = fixed[i];
    if (s2) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') s2 = false; continue; }
    if (c === '"') s2 = true;
    else if (c === "{") reopen.push("}");
    else if (c === "[") reopen.push("]");
    else if (c === "}" || c === "]") reopen.pop();
  }
  while (reopen.length) fixed += reopen.pop();
  return fixed;
}

// ─── Aeon skill runner — prefer REAL KV output; LLM is a labelled fallback ───
//
// Per CLAUDE.md: Aeon facts must come from the research-loop KV (getAeonOutput),
// NOT from "synthesize from training knowledge" — that fabricates. So we try KV
// first and return the real output. Only if KV is missing/stale do we produce a
// model-generated DRAFT, and we (a) instruct the model not to invent measured
// numbers and (b) LABEL the result so nothing downstream mistakes it for real
// Aeon data.

export async function runAeonSkill(skill: string, varInput = ""): Promise<string | null> {
  // 1. Real Aeon output from KV (fed by the research-loop cron).
  const real = await getAeonOutput(skill);
  if (real) return formatAeonForLLM(real);

  // 2. Fallback: model-generated estimate, explicitly labelled — not real data.
  try {
    const skillPrompt = await loadSkillFile(`${AEON_BASE}/skills/${skill}/SKILL.md`);
    if (!skillPrompt) return null;
    const today   = new Date().toISOString().split("T")[0];
    const varLine = varInput ? `\nFocus on: ${varInput}` : "";
    const draft = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are drafting a MODEL-GENERATED ESTIMATE in the style of the Aeon skill below. You do NOT have live data. Produce a plausible framework only — NEVER invent specific prices, market caps, volumes, or on-chain figures as if measured. Today is ${today}.`,
      messages: [{ role: "user", content: `Follow this skill template. Where a real figure would go, write "unknown" instead of inventing one.\n\nSkill:\n${skillPrompt}${varLine}\n\nReturn only the skill output, no preamble.` }],
      temperature: 0.2,
      maxTokens: 1200,
      _skipEnhance: true, // Aeon has its own identity
    });
    if (!draft) return null;
    return `=== MODEL-GENERATED ESTIMATE (no live Aeon data for "${skill}") ===\n${draft}`;
  } catch (e) { console.error("[llm] skill error:", (e as Error).message); return null; }
}

// ─── MiroShark skill runner (uses real collab prompt) ────────────────────────
//
// MiroShark is a scenario simulator — it spawns a crowd of agents and returns
// a confidence-weighted forecast. Use this for community/market consensus steps.

export async function runMiroSharkSkill(opts: {
  /** The scenario to simulate — e.g. "Launch $TOKEN with these metrics" */
  scenario: string;
  /** Structured context passed to MiroShark */
  context: Record<string, unknown>;
  /** Persona hint: "retail" | "analyst" | "influencer" | "observer" | "4-persona" */
  persona?: string;
  /** JSON output schema hint */
  outputSchema?: string;
  maxTokens?: number;
}): Promise<string | null> {
  try {
    const miroPrompt = await loadSkillFile(SKILL_URLS.miroshark);
    const personaLine = opts.persona
      ? `\n\n## Active persona: ${opts.persona}`
      : "";
    const schemaLine = opts.outputSchema
      ? `\n\nReturn ONLY raw JSON.\nSchema: ${opts.outputSchema}`
      : "";

    const system = miroPrompt
      ? `${miroPrompt}${personaLine}${schemaLine}`
      : `You are MiroShark — scenario simulator. ${personaLine}${schemaLine}`;

    return await callBankrLLM({
      model: "claude-haiku-4-5",
      system,
      messages: [{
        role: "user",
        content: `Scenario: ${opts.scenario}\n\nContext:\n${JSON.stringify(opts.context, null, 2)}`,
      }],
      temperature: 0.5,
      maxTokens: opts.maxTokens ?? 600,
      _skipEnhance: true, // already loaded real prompt above
    });
  } catch (e) { console.error("[llm] skill error:", (e as Error).message); return null; }
}

// ─── Blue Agent skill runner (uses real identity + skill files) ───────────────
//
// Use for Blue Agent synthesis / verdict steps.
// skillFiles: list of filenames from skills/ dir (e.g. ["token-launch-guide.md"])

export async function runBlueSkill(opts: {
  /** What Blue Agent is doing — the task description */
  task: string;
  /** Additional skill files from skills/ to load */
  skillFiles?: string[];
  /** Input context string */
  input: string;
  /** JSON output schema */
  outputSchema?: string;
  maxTokens?: number;
}): Promise<string | null> {
  try {
    const [identity, ...extras] = await Promise.all([
      loadSkillFile(SKILL_URLS.blueIdentity),
      ...(opts.skillFiles ?? []).map(f =>
        loadSkillFile(`${GITHUB_BASE}/skills/${f}`)
      ),
    ]);

    const skillContext = [identity, ...extras].filter(Boolean).join("\n\n---\n\n");
    const schemaLine   = opts.outputSchema
      ? `\n\nReturn ONLY raw JSON.\nSchema: ${opts.outputSchema}`
      : "";

    const system = skillContext
      ? `${skillContext}\n\n---\n\n## Task\n${opts.task}${schemaLine}`
      : `You are Blue Agent — AI-native intelligence for Base builders.\n\n## Task\n${opts.task}${schemaLine}`;

    return await callBankrLLM({
      model: "claude-haiku-4-5",
      system,
      messages: [{ role: "user", content: opts.input }],
      temperature: 0.3,
      maxTokens: opts.maxTokens ?? 1000,
      _skipEnhance: true,
    });
  } catch (e) { console.error("[llm] skill error:", (e as Error).message); return null; }
}
