import { listTasks } from "@blueagent/reputation";
import { TaskCategory, TaskStatus } from "@blueagent/reputation";
import { printError } from "../print";

const CATEGORY_EMOJI: Record<string, string> = {
  audit: "🔍", content: "✍️", art: "🎨", data: "📊", dev: "💻",
};

export async function runListTasks(filter?: { category?: string; status?: string }) {
  try {
    const tasks = listTasks({
      category: filter?.category as TaskCategory | undefined,
      status: filter?.status as TaskStatus | undefined,
    });
    const open = tasks.filter((t) => t.status === "open");

    if (open.length === 0) {
      console.log("\n  No open tasks. Post one with: blue post-task @handle\n");
      return;
    }

    const line = "─".repeat(60);
    console.log(`\n${line}`);
    console.log(`  📋 Open Tasks (${open.length})`);
    console.log(`${line}`);

    for (const t of open) {
      const cat = CATEGORY_EMOJI[t.category] ?? "•";
      console.log(`\n  ${cat} [${t.id}] ${t.title}`);
      console.log(`     Reward: ${t.reward} USDC`);
      console.log(`     Posted by: @${t.poster}  Deadline: ${t.deadline}`);
      console.log(`     Proof: ${t.proof_required}`);
      console.log(`     Score: ${t.score_reward.doer}`);
    }

    console.log(`\n${line}`);
    console.log(`  Accept a task: blue accept <taskId> @handle\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
