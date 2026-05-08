import { scoreAgent } from "@blueagent/reputation";
import { printError } from "../print";

function progressBar(value: number, max: number, width = 13): string {
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

const TIER_EMOJI: Record<string, string> = {
  "Bot": "🤖", "Agent": "⚡", "Pro Agent": "🔵", "Elite Agent": "💎", "Sovereign": "👑",
};

const TIERS = ["Bot", "Agent", "Pro Agent", "Elite Agent", "Sovereign"];
const TIER_THRESHOLDS: Record<string, number> = {
  "Bot": 0, "Agent": 100, "Pro Agent": 500, "Elite Agent": 1000, "Sovereign": 5000,
};

function nextTier(xp: number, currentTier: string): string | null {
  const idx = TIERS.indexOf(currentTier);
  if (idx < 0 || idx >= TIERS.length - 1) return null;
  const next = TIERS[idx + 1];
  const needed = TIER_THRESHOLDS[next] - xp;
  return `${next} ${TIER_EMOJI[next]} at ${TIER_THRESHOLDS[next]} XP (+${needed} needed)`;
}

export async function runAgentScore(input: string | undefined) {
  if (!input) {
    printError(
      'No input provided.\n\n  Usage:\n' +
      '    blue agent-score @handle\n' +
      '    blue agent-score npm:@blueagent/skill\n' +
      '    blue agent-score github.com/user/repo\n' +
      '    blue agent-score https://api.example.com'
    );
    return;
  }

  const display = input.replace(/^@/, "");
  const line = "─".repeat(34);

  process.stdout.write(`\n${line}\n🤖 Agent Score — ${input.startsWith("@") ? "@" : ""}${display}\n${line}\n`);

  try {
    const r = await scoreAgent(input);
    const emoji = TIER_EMOJI[r.tier] ?? "";
    const next = nextTier(r.xp, r.tier);

    const lines = [
      ``,
      `XP:       ${r.xp} — ${r.tier} ${emoji}`,
    ];
    if (next) lines.push(`Next tier: ${next}`);
    lines.push(
      ``,
      `Skill Depth    ${progressBar(r.dimensions.skillDepth, 25)}  ${r.dimensions.skillDepth}/25`,
      `Onchain        ${progressBar(r.dimensions.onchainActivity, 25)}  ${r.dimensions.onchainActivity}/25`,
      `Reliability    ${progressBar(r.dimensions.reliability, 20)}  ${r.dimensions.reliability}/20`,
      `Interop        ${progressBar(r.dimensions.interoperability, 20)}  ${r.dimensions.interoperability}/20`,
      `Reputation     ${progressBar(r.dimensions.reputation, 10)}  ${r.dimensions.reputation}/10`,
      ``,
      `Strengths: ${r.strengths.join(", ") || "—"}`,
      `Gaps: ${r.gaps.join(", ") || "—"}`,
      `Card: https://blueagent.dev/card/agent/${display}`,
      `${line}`,
      ``,
    );

    process.stdout.write(lines.join("\n"));
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
