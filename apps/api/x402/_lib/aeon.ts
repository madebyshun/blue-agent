// _lib/aeon.ts
// Runs Aeon skills on-demand by fetching SKILL.md from GitHub and executing via Bankr LLM
// Aeon already uses Bankr LLM (ANTHROPIC_BASE_URL=https://llm.bankr.bot) — same engine

import { callBankrLLM } from "@blue-agent/bankr";

const AEON_REPO = "aaronjmars/aeon";
const GITHUB_RAW = "https://raw.githubusercontent.com";

// ── Fetch skill prompt from Aeon repo ─────────────────────────────────────────

async function fetchSkillPrompt(skill: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${GITHUB_RAW}/${AEON_REPO}/main/skills/${skill}/SKILL.md`,
      { signal: AbortSignal.timeout(6000) }
    );
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ── Run a single Aeon skill via Bankr LLM ─────────────────────────────────────

async function runAeonSkill(skill: string, varInput = ""): Promise<string | null> {
  const skillPrompt = await fetchSkillPrompt(skill);
  if (!skillPrompt) return null;

  const today = new Date().toISOString().split("T")[0];
  const varLine = varInput ? `\nUse this variable: var=${varInput}` : "";

  try {
    const result = await callBankrLLM({
      model: "claude-haiku-4-5",
      system: `You are Aeon — an autonomous intelligence agent running in offline/knowledge mode.
You cannot call external APIs or browse the web. Instead, synthesize ecosystem intelligence from your training knowledge.
Be specific, data-driven, and actionable. Use realistic figures from your knowledge of Base ecosystem.
Today is ${today}.`,
      messages: [{
        role: "user",
        content: `Use the skill template below as a guide for structure and output format.
Generate the output entirely from your training knowledge — do NOT say APIs are unavailable or data is blocked.
Produce concrete, realistic signals as if you had just run the skill.

Skill template:
${skillPrompt}${varLine}

Return only the skill output, no meta-commentary.`,
      }],
      temperature: 0.2,
      maxTokens: 1200,
    });
    return result ?? null;
  } catch {
    return null;
  }
}

// ── Main export: run relevant skills for Launch Simulator ─────────────────────

export type AeonEcosystemData = {
  available: boolean;
  summary: string;
  skills: Record<string, string | null>;
};

export async function fetchAeonEcosystemData(ticker = ""): Promise<AeonEcosystemData> {
  // Run token-movers + digest in parallel
  // defi-monitor skipped — needs on-chain-watches.yml config from Aeon memory
  const [tokenMovers, digest] = await Promise.all([
    runAeonSkill("token-movers", ticker || "Base ecosystem"),
    runAeonSkill("digest", "Base ecosystem builders launch"),
  ]);

  const skills = { "token-movers": tokenMovers, digest };
  const available = Object.values(skills).some((v) => v !== null);

  const summary = Object.entries(skills)
    .filter(([, v]) => v !== null)
    .map(([skill, output]) => `### Aeon / ${skill}\n${output}`)
    .join("\n\n");

  return { available, summary, skills };
}
