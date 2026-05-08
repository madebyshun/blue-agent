import { scoreAgent } from "@blueagent/reputation";
import { printHeader, printResult, printError } from "../print";

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

  printHeader("agent-score", `Agent Score — ${input}`);

  try {
    const result = await scoreAgent(input);

    const tierEmoji: Record<string, string> = {
      "Bot": "🤖", "Agent": "⚡", "Pro Agent": "🔵", "Elite Agent": "💎", "Sovereign": "👑",
    };

    const output = [
      `Input:   ${input}`,
      `Score:   ${result.score}/100`,
      `Tier:    ${tierEmoji[result.tier] ?? ""} ${result.tier}`,
      ``,
      `Dimensions:`,
      `  Skill Depth       ${result.dimensions.skillDepth}/25`,
      `  Onchain Activity  ${result.dimensions.onchainActivity}/25`,
      `  Reliability       ${result.dimensions.reliability}/20`,
      `  Interoperability  ${result.dimensions.interoperability}/20`,
      `  Reputation        ${result.dimensions.reputation}/10`,
      ``,
      `Strengths:`,
      ...result.strengths.map((s: string) => `  ✓ ${s}`),
      ``,
      `Gaps:`,
      ...result.gaps.map((g: string) => `  △ ${g}`),
      ``,
      `Badge: ${result.badge}`,
    ].join("\n");

    printResult(output);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
