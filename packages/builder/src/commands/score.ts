import { scoreBuilder } from "@blueagent/reputation";
import { printHeader, printResult, printError } from "../print";

export async function runScore(handle: string | undefined) {
  if (!handle) {
    printError('No handle provided.\n\n  Usage: blue score @handle\n         blue score madebyshun');
    return;
  }

  const clean = handle.replace(/^@/, "");
  printHeader("score", `Builder Score — @${clean}`);

  try {
    const result = await scoreBuilder(clean);

    const tierEmoji: Record<string, string> = {
      Explorer: "🌱", Builder: "🔨", Maker: "⚡", Legend: "🔥", Founder: "👑",
    };

    const output = [
      `Handle:  @${result.handle}`,
      `Score:   ${result.score}/100`,
      `Tier:    ${tierEmoji[result.tier] ?? ""} ${result.tier}`,
      ``,
      `Dimensions:`,
      `  Activity    ${result.dimensions.activity}/25`,
      `  Social      ${result.dimensions.social}/25`,
      `  Uniqueness  ${result.dimensions.uniqueness}/20`,
      `  Thesis      ${result.dimensions.thesis}/20`,
      `  Community   ${result.dimensions.community}/10`,
      ``,
      `Summary: ${result.summary}`,
      ``,
      `Badge: ${result.badge}`,
    ].join("\n");

    printResult(output);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
