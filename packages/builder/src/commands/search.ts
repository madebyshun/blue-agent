import { callBankr, extractJson } from "../bankr";
import { printError } from "../print";

interface SearchResult {
  name: string;
  type: "builder" | "agent" | "project" | "token";
  handle?: string;
  description: string;
  relevance: string;
  link?: string;
}

const SYSTEM = `You are Blue Agent's discovery engine for the Base ecosystem.

Given a search query, return the top 5 most relevant builders, agents, projects, or tokens on Base/Bankr.

Return ONLY valid JSON array:
[
  {
    "name": "<name>",
    "type": "builder" | "agent" | "project" | "token",
    "handle": "<@handle or npm:pkg or github if known>",
    "description": "<one-line description>",
    "relevance": "<why this matches the query>",
    "link": "<bankr.bot/agent/x or x.com/x if known, else null>"
  }
]

Be specific to Base and Bankr ecosystem. If you don't know exact results, return realistic examples from the Base builder community.
Focus on: DeFi builders, onchain agents, Base-native projects, Clanker tokens, Bankr agents.`;

export async function runSearch(query: string | undefined) {
  if (!query?.trim()) {
    printError('Usage: blue search "<query>"\n       blue search "defi agent on Base"');
    return;
  }

  const line = "─".repeat(56);
  process.stdout.write(`\n${line}\n  🔍 blue search — "${query}"\n${line}\n`);

  try {
    const raw = await callBankr(SYSTEM, `Search query: ${query}`);

    let results: SearchResult[];
    try {
      results = extractJson(raw) as SearchResult[];
      if (!Array.isArray(results)) throw new Error("not array");
    } catch {
      process.stdout.write("\n" + raw + "\n\n");
      return;
    }

    if (results.length === 0) {
      process.stdout.write("\n  No results found.\n\n");
      return;
    }

    const TYPE_ICON: Record<string, string> = {
      builder: "🏗️", agent: "🤖", project: "⚡", token: "🪙",
    };

    process.stdout.write("\n");
    for (const r of results) {
      const icon = TYPE_ICON[r.type] ?? "•";
      process.stdout.write(`  ${icon} ${r.name}`);
      if (r.handle) process.stdout.write(`  ${r.handle}`);
      process.stdout.write("\n");
      process.stdout.write(`     ${r.description}\n`);
      process.stdout.write(`     ${r.relevance}\n`);
      if (r.link) process.stdout.write(`     ${r.link}\n`);
      process.stdout.write("\n");
    }

    process.stdout.write(`${line}\n`);
    process.stdout.write(`  Score a result: blue score @handle  |  blue agent-score npm:pkg\n\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
