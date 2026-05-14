import { callBankr, extractJson } from "../bankr";
import { printError } from "../print";

interface MarketItem {
  name: string;
  type: "agent" | "skill" | "prompt" | "template";
  creator: string;
  price: string;
  description: string;
  usage?: string;
  trust?: string;
  link?: string;
}

const BROWSE_SYSTEM = `You are Blue Agent's marketplace browser for Bankr agents, skills, prompts, and templates.

Given a browse query (or "all" for top listings), return the top 8 marketplace items.

Return ONLY valid JSON array:
[
  {
    "name": "<item name>",
    "type": "agent" | "skill" | "prompt" | "template",
    "creator": "@handle",
    "price": "<free | $X.XX USDC | $X/session>",
    "description": "<one-line description>",
    "usage": "<usage count or installs if known>",
    "trust": "<verified | community | experimental>",
    "link": "<bankr.bot/... if known>"
  }
]

Focus on real or realistic Bankr/Base-native items. Include free and paid options.
Types: agents (AI bots), skills (MCP/grounding files), prompts (reusable templates), templates (code scaffolds).`;

const PUBLISH_SYSTEM = `You are Blue Agent's publish advisor for the Bankr marketplace.

Given details about what a builder wants to publish, provide a step-by-step publishing guide
and output shapes to expect.

Format as plain text — clear steps with headers. Be concise and actionable.`;

export async function runMarket(subcommand: string | undefined, query?: string) {
  const line = "─".repeat(58);

  // blue market publish
  if (subcommand === "publish") {
    const item = query ?? "my agent";
    process.stdout.write(`\n${line}\n  📦 blue market publish — ${item}\n${line}\n\n`);

    try {
      const raw = await callBankr(PUBLISH_SYSTEM,
        `How do I publish "${item}" to the Bankr marketplace?`,
        { maxTokens: 1000 }
      );
      process.stdout.write(raw + "\n\n");
    } catch (err) {
      printError(err instanceof Error ? err.message : String(err));
    }
    return;
  }

  // blue market [query]
  const browseQuery = subcommand ?? "all";
  const label = browseQuery === "all" ? "top listings" : browseQuery;
  process.stdout.write(`\n${line}\n  🛒 blue market — ${label}\n${line}\n`);

  try {
    const raw = await callBankr(BROWSE_SYSTEM, `Browse marketplace: ${browseQuery}`);

    let items: MarketItem[];
    try {
      items = extractJson(raw) as MarketItem[];
      if (!Array.isArray(items)) throw new Error("not array");
    } catch {
      process.stdout.write("\n" + raw + "\n\n");
      return;
    }

    const TYPE_ICON: Record<string, string> = {
      agent: "🤖", skill: "🧠", prompt: "💬", template: "📐",
    };
    const TRUST_COLOR: Record<string, string> = {
      verified: "✓", community: "◎", experimental: "~",
    };

    process.stdout.write("\n");
    for (const item of items) {
      const icon  = TYPE_ICON[item.type] ?? "•";
      const trust = TRUST_COLOR[item.trust ?? "community"] ?? "◎";
      process.stdout.write(`  ${icon} ${item.name}  ${trust}\n`);
      process.stdout.write(`     by ${item.creator}  ·  ${item.price}\n`);
      process.stdout.write(`     ${item.description}\n`);
      if (item.usage) process.stdout.write(`     ${item.usage}\n`);
      if (item.link)  process.stdout.write(`     ${item.link}\n`);
      process.stdout.write("\n");
    }

    process.stdout.write(`${line}\n`);
    process.stdout.write(`  Filter: blue market agents | skills | prompts | templates\n`);
    process.stdout.write(`  Search: blue search "<query>"\n`);
    process.stdout.write(`  Publish: blue market publish "<your item>"\n\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
