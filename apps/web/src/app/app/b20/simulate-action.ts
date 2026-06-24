"use server";

/**
 * Server action — simulates a B20 transfer via eth_call (no broadcast).
 * Calls simulateB20Transfer on the server so viem runs in Node.js.
 */

import { simulateB20Transfer, type B20SimulateResult } from "@/lib/b20/simulate";

export async function runB20Simulate(
  token:    string,
  sender:   string,
  receiver: string,
  amount:   string,
  network:  "mainnet" | "sepolia",
): Promise<B20SimulateResult> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
    throw new Error("Invalid token address.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(sender)) {
    throw new Error("Invalid sender address.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(receiver)) {
    throw new Error("Invalid receiver address.");
  }
  const amt = parseFloat(amount);
  if (isNaN(amt) || amt < 0) {
    throw new Error("Invalid amount — must be a non-negative number.");
  }
  return simulateB20Transfer(token, sender, receiver, amount, network);
}
