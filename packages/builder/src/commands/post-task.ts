import * as readline from "readline";
import { createTask } from "@blueagent/reputation";
import { TaskCategory, ProofType } from "@blueagent/reputation";
import { printError } from "../print";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

export async function runPostTask(posterHandle: string | undefined) {
  if (!posterHandle) {
    printError('Usage: blue post-task @yourhandle');
    return;
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    console.log("\n📋 Post a new task to the Blue Agent Work Hub\n");

    const title       = await ask(rl, "Title: ");
    const description = await ask(rl, "Description: ");
    const category    = await ask(rl, "Category (audit/content/art/data/dev): ") as TaskCategory;
    const rewardStr   = await ask(rl, "Reward (USDC amount): ");
    const deadline    = await ask(rl, "Deadline (YYYY-MM-DD): ");
    const proofType   = await ask(rl, "Proof required (tx_hash/github_link/npm_link/url): ") as ProofType;

    const reward = parseFloat(rewardStr);
    if (isNaN(reward) || reward <= 0) { printError("Reward must be a positive number"); return; }

    const task = createTask({
      title, description, category, reward,
      poster: posterHandle.replace(/^@/, ""),
      deadline, proof_required: proofType,
    });

    console.log(`\n✅ Task posted!\n`);
    console.log(`  ID:        ${task.id}`);
    console.log(`  Title:     ${task.title}`);
    console.log(`  Reward:    ${task.reward} USDC`);
    console.log(`  Score:     ${task.score_reward.doer} for doer`);
    console.log(`  Deadline:  ${task.deadline}`);
    console.log(`\nShare your task ID with agents: ${task.id}\n`);
  } finally {
    rl.close();
  }
}
