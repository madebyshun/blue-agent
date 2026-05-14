import { scoreBuilder } from "@blueagent/reputation";
import { scoreAgent } from "@blueagent/reputation";
import { printError } from "../print";

function bar(value: number, max: number, width = 12): string {
  const filled = Math.round((value / max) * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function isAgentInput(s: string): boolean {
  return s.startsWith("npm:") || s.startsWith("github.com/") || s.startsWith("https://");
}

export async function runCompare(a: string | undefined, b: string | undefined) {
  if (!a || !b) {
    printError(
      "Usage: blue compare <a> <b>\n" +
      "       blue compare @builderA @builderB\n" +
      "       blue compare npm:agentA npm:agentB\n" +
      "       blue compare @handle npm:package"
    );
    return;
  }

  const line = "─".repeat(60);
  process.stdout.write(`\n${line}\n  ⚖️  blue compare — ${a}  vs  ${b}\n${line}\n`);
  process.stdout.write(`\n  Scoring both...\n`);

  try {
    const [scoreA, scoreB] = await Promise.all([
      isAgentInput(a) ? scoreAgent(a) : scoreBuilder(a.replace(/^@/, "")),
      isAgentInput(b) ? scoreAgent(b) : scoreBuilder(b.replace(/^@/, "")),
    ]);

    const labelA = a.padEnd(22);
    const labelB = b;

    process.stdout.write(`\n`);
    process.stdout.write(`  ${"".padEnd(22)}  ${labelA}  ${labelB}\n`);
    process.stdout.write(`  ${line.slice(0, 56)}\n`);

    // Total score row
    const totalA = scoreA.score;
    const totalB = scoreB.score;
    const totalAStr = String(totalA) + (totalA > totalB ? " ◀" : "");
    const totalBStr = String(totalB) + (totalB > totalA ? " ◀" : "");
    process.stdout.write(`  ${"TOTAL".padEnd(22)}  ${totalAStr.padEnd(22)}  ${totalBStr}\n`);
    process.stdout.write(`  ${"tier".padEnd(22)}  ${scoreA.tier.padEnd(22)}  ${scoreB.tier}\n`);
    process.stdout.write(`\n`);

    // Dimension comparison — use whichever dims are available
    const dimsA = scoreA.dimensions as unknown as Record<string, number>;
    const dimsB = scoreB.dimensions as unknown as Record<string, number>;
    const dimKeys = Object.keys(dimsA);
    const dimMax: Record<string, number> = {};

    // Always populate both sets of dimension maxes so mixed comparisons work correctly
    Object.assign(dimMax, {
      // builder dims
      activity: 25, social: 25, uniqueness: 20, thesis: 20, community: 10,
      // agent dims
      skillDepth: 25, onchainActivity: 25, reliability: 20, interoperability: 20, reputation: 10,
    });

    for (const dim of dimKeys) {
      const max = dimMax[dim] ?? 25;
      const vA = dimsA[dim] ?? 0;
      const vB = dimsB[dim] ?? 0;
      const bA = bar(vA, max);
      const bB = bar(vB, max);
      const winnerA = vA > vB ? " ◀" : "";
      const winnerB = vB > vA ? " ◀" : "";
      const padA = " ".repeat(Math.max(0, 5 - String(vA).length - winnerA.length));
      process.stdout.write(
        `  ${dim.padEnd(22)}  ${bA} ${String(vA).padStart(2)}/${max}${winnerA}${padA}  ${bB} ${String(vB).padStart(2)}/${max}${winnerB}\n`
      );
    }

    process.stdout.write(`\n${line}\n`);

    // Verdict
    if (totalA > totalB) {
      process.stdout.write(`  Verdict: ${a} leads by ${totalA - totalB} points\n`);
    } else if (totalB > totalA) {
      process.stdout.write(`  Verdict: ${b} leads by ${totalB - totalA} points\n`);
    } else {
      process.stdout.write(`  Verdict: tied at ${totalA} points\n`);
    }

    process.stdout.write(`\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
