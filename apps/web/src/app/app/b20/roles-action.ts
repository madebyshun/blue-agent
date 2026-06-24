"use server";

/**
 * Server action — checks which of the 7 B20 roles a wallet holds on a token.
 * Calls checkB20Roles on the server so viem runs in Node.js.
 */

import { checkB20Roles, type B20RolesResult } from "@/lib/b20/roles";

export async function runB20Roles(
  token:   string,
  wallet:  string,
  network: "mainnet" | "sepolia",
): Promise<B20RolesResult> {
  if (!/^0x[a-fA-F0-9]{40}$/.test(token)) {
    throw new Error("Invalid token address — must be 0x followed by 40 hex characters.");
  }
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    throw new Error("Invalid wallet address — must be 0x followed by 40 hex characters.");
  }
  return checkB20Roles(token, wallet, network);
}
