import type { MicroTask } from "./types.js";

export const PLATFORM_FEE = 0.05;

/** Amount of escrow that can still be refunded (not yet released or already refunded) */
export function refundableAmount(task: MicroTask): number {
  const unreleased = task.escrow.amount_locked - task.escrow.amount_released;
  return Math.max(0, unreleased - task.escrow.amount_refunded);
}

/** Release escrow to a claimant — returns updated task */
export function releaseEscrow(task: MicroTask, grossAmount: number): MicroTask {
  const net = grossAmount * (1 - PLATFORM_FEE);
  const escrow = { ...task.escrow };
  escrow.amount_released = Math.min(
    escrow.amount_locked,
    escrow.amount_released + grossAmount
  );
  const allReleased = escrow.amount_released >= escrow.amount_locked;
  escrow.status = allReleased ? "released" : "funded";
  return { ...task, escrow };
}

/** Mark escrow as refunded — returns updated task */
export function refundEscrow(task: MicroTask, amount: number): MicroTask {
  const escrow = { ...task.escrow };
  escrow.amount_refunded = escrow.amount_refunded + amount;
  escrow.status = "refunded";
  return { ...task, escrow };
}

/** Net payout after platform fee */
export function netPayout(gross: number): number {
  return +(gross * (1 - PLATFORM_FEE)).toFixed(6);
}
