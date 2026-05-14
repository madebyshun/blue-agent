import { callBankr, extractJson } from "../bankr";
import { printError } from "../print";

interface TrendingItem {
  rank: number;
  name: string;
  type: "builder" | "agent" | "project" | "token";
  handle?: string;
  signal: string;
  momentum: "rising" | "hot" | "new";
}

const SYSTEM = `You are Blue Agent's trending feed for the Base ecosystem.

Return the top 8 trending builders, agents, projects, or tokens on Base right now.
Focus on: recent launches, high engagement on X/Twitter, new Bankr agents, Clanker tokens gaining traction, Base-native DeFi.

Return ONLY valid JSON array:
[
  {
    "rank": <1-8>,
    "name": "<name>",
    "type": "builder" | "agent" | "project" | "token",
    "handle": "<@handle or identifier if known>",
    "signal": "<one-line reason this is trending>",
    "momentum": "rising" | "hot" | "new"
  }
]

Be specific and realistic about the Base/Bankr/Clanker ecosystem. Use real handles where you know them.`;

export async function runTrending(filter?: string) {
  const line = "─".repeat(56);
  const filterLabel = filter ? ` — ${filter}` : "";
  process.stdout.write(`\n${line}\n  📈 blue trending${filterLabel}\n${line}\n`);

  try {
    const userMsg = filter
      ? `Show trending ${filter} on Base right now`
      : `Show what's trending across builders, agents, projects, and tokens on Base right now`;

    const raw = await callBankr(SYSTEM, userMsg);

    let items: TrendingItem[];
    try {
      items = extractJson(raw) as TrendingItem[];
      if (!Array.isArray(items)) throw new Error("not array");
    } catch {
      process.stdout.write("\n" + raw + "\n\n");
      return;
    }

    const MOMENTUM_ICON: Record<string, string> = {
      rising: "↗", hot: "🔥", new: "✨",
    };
    const TYPE_ICON: Record<string, string> = {
      builder: "🏗️", agent: "🤖", project: "⚡", token: "🪙",
    };

    process.stdout.write("\n");
    for (const item of items) {
      const m = MOMENTUM_ICON[item.momentum] ?? "•";
      const t = TYPE_ICON[item.type] ?? "•";
      const handle = item.handle ? `  ${item.handle}` : "";
      process.stdout.write(`  ${item.rank}.  ${m} ${t} ${item.name}${handle}\n`);
      process.stdout.write(`       ${item.signal}\n\n`);
    }

    process.stdout.write(`${line}\n`);
    process.stdout.write(`  Filter: blue trending builders | agents | tokens\n`);
    process.stdout.write(`  Score:  blue score @handle | blue agent-score npm:pkg\n\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
