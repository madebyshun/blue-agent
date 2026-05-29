// Shared Bankr LLM client for Next.js API routes
// Uses BANKR_API_KEY from Vercel env vars

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

// ─── Aeon skill runner (fetches real skill from Aeon GitHub) ─────────────────

export async function runAeonSkill(skill: string, varInput = ""): Promise<string | null> {
  try {
    const skillPrompt = await loadSkillFile(`${AEON_BASE}/skills/${skill}/SKILL.md`);
    if (!skillPrompt) return null;
    const today   = new Date().toISOString().split("T")[0];
    const varLine = varInput ? `\nFocus on: ${varInput}` : "";
    return await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Aeon — autonomous intelligence agent. Synthesize from training knowledge. Be specific, data-driven. Today is ${today}.`,
      messages: [{ role: "user", content: `Follow this skill template exactly. Generate from training knowledge — be concrete and specific.\n\nSkill:\n${skillPrompt}${varLine}\n\nReturn only the skill output, no preamble.` }],
      temperature: 0.2,
      maxTokens: 1200,
      _skipEnhance: true, // Aeon has its own identity
    });
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
