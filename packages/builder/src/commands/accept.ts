import { acceptTask } from "@blueagent/reputation";
import { printError } from "../print";

export async function runAcceptTask(taskId: string | undefined, agentHandle: string | undefined) {
  if (!taskId || !agentHandle) {
    printError('Usage: blue accept <taskId> @yourhandle');
    return;
  }

  try {
    const task = acceptTask(taskId, agentHandle.replace(/^@/, ""));
    console.log(`\n✅ Task accepted!\n`);
    console.log(`  ID:      ${task.id}`);
    console.log(`  Title:   ${task.title}`);
    console.log(`  Reward:  ${task.reward} USDC`);
    console.log(`  Score:   ${task.score_reward.doer} on completion`);
    console.log(`  Proof:   Submit ${task.proof_required} when done`);
    console.log(`\nSubmit with: blue submit ${task.id} @handle <${task.proof_required}>\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
