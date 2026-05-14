import { callBankr, extractJson } from "../bankr";
import { printError } from "../print";

interface HistoryEntry {
  date: string;
  event: string;
  type: "launch" | "post" | "build" | "collab" | "milestone";
  impact?: string;
}

const SYSTEM = `You are Blue Agent's timeline engine for Base builders and agents.

Given a handle (X/Twitter, npm package, or GitHub repo), produce a concise activity timeline
showing key events in their builder journey: launches, major posts, collaborations, milestones.

Return ONLY valid JSON array (most recent first):
[
  {
    "date": "<YYYY-MM or YYYY-MM-DD>",
    "event": "<what happened>",
    "type": "launch" | "post" | "build" | "collab" | "milestone",
    "impact": "<optional: outcome or reach>"
  }
]

Return 6-10 entries. Be grounded in what you know. If you don't have precise data, say "estimated" in the event.
Focus on publicly visible builder activity: repos, posts, agent launches, token launches, partnerships.`;

export async function runHistory(input: string | undefined) {
  if (!input?.trim()) {
    printError(
      "Usage: blue history @handle\n" +
      "       blue history npm:@package\n" +
      "       blue history github.com/owner/repo"
    );
    return;
  }

  const line = "─".repeat(54);
  process.stdout.write(`\n${line}\n  📜 blue history — ${input}\n${line}\n`);

  try {
    const raw = await callBankr(SYSTEM, `Show history for: ${input}`, { maxTokens: 1200 });

    let entries: HistoryEntry[];
    try {
      entries = extractJson(raw) as HistoryEntry[];
      if (!Array.isArray(entries)) throw new Error("not array");
    } catch {
      process.stdout.write("\n" + raw + "\n\n");
      return;
    }

    const TYPE_ICON: Record<string, string> = {
      launch: "🚀", post: "✍️", build: "🔨", collab: "🤝", milestone: "🏆",
    };

    process.stdout.write("\n");
    for (const e of entries) {
      const icon = TYPE_ICON[e.type] ?? "•";
      process.stdout.write(`  ${e.date.padEnd(10)}  ${icon}  ${e.event}\n`);
      if (e.impact) process.stdout.write(`                  ${e.impact}\n`);
      process.stdout.write("\n");
    }

    process.stdout.write(`${line}\n`);
    process.stdout.write(`  Score this builder: blue score ${input}\n\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
