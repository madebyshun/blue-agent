import { submitTask, getFeeAmount, getDoerAmount } from "@blueagent/reputation";
import { printError } from "../print";

export async function runSubmitTask(
  taskId: string | undefined,
  doerHandle: string | undefined,
  proof: string | undefined
) {
  if (!taskId || !doerHandle || !proof) {
    printError(
      'Usage: blue submit <taskId> @handle <proof>\n' +
      '  Example: blue submit task_abc123 @me https://github.com/user/repo'
    );
    return;
  }

  try {
    const task = submitTask(taskId, doerHandle.replace(/^@/, ""), proof);
    const fee = getFeeAmount(task.reward);
    const doerPayout = getDoerAmount(task.reward);

    console.log(`\n🎉 Task submitted!\n`);
    console.log(`  Task:    ${task.title}`);
    console.log(`  Proof:   ${proof}`);
    console.log(`  Payout:  ${doerPayout} USDC (after ${fee} USDC Blue Agent fee)`);
    console.log(`  Score:   ${task.score_reward.doer}`);
    console.log(`\nWaiting for poster confirmation...\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
