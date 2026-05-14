import { scoreBuilder } from "@blueagent/reputation";
import { printError } from "../print";

function progressBar(value: number, max: number, width = 13): string {
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

const TIER_EMOJI: Record<string, string> = {
  Explorer: "🌱", Builder: "🔨", Maker: "⚡", Legend: "🔥", Founder: "👑",
};

export async function runScore(handle: string | undefined) {
  if (!handle) {
    printError('No handle provided.\n\n  Usage: blue score @handle\n         blue score madebyshun');
    return;
  }

  const clean = handle.replace(/^@/, "");
  const line = "─".repeat(34);

  process.stdout.write(`\n${line}\n🏗️  Builder Score — @${clean}\n${line}\n`);

  try {
    const r = await scoreBuilder(clean);
    const emoji = TIER_EMOJI[r.tier] ?? "";

    process.stdout.write([
      ``,
      `Score:    ${r.score}/100 — ${r.tier} ${emoji}`,
      ``,
      `Activity       ${progressBar(r.dimensions.activity, 25)}  ${r.dimensions.activity}/25`,
      `Social         ${progressBar(r.dimensions.social, 25)}  ${r.dimensions.social}/25`,
      `Uniqueness     ${progressBar(r.dimensions.uniqueness, 20)}  ${r.dimensions.uniqueness}/20`,
      `Thesis         ${progressBar(r.dimensions.thesis, 20)}  ${r.dimensions.thesis}/20`,
      `Community      ${progressBar(r.dimensions.community, 10)}  ${r.dimensions.community}/10`,
      ``,
      `Summary: ${r.summary}`,
      `Card: https://blueagent.dev/card/builder/${clean}`,
      `${line}`,
      ``,
    ].join("\n"));
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
