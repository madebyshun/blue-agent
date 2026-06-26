"use server";

/**
 * Server action — calls inspectB20 on the server so:
 *   (a) no internal secrets reach the client bundle
 *   (b) viem runs in Node.js (not in the browser)
 *
 * Uses only public Base RPC endpoints (mainnet.base.org / sepolia.base.org)
 * — no API key required.
 */

import { inspectB20, type B20Inspection } from "@/lib/b20/inspect";

export async function runB20Inspect(
  address: string,
  network: "mainnet" | "sepolia",
  // Optional connected wallet — enables the per-wallet DEFAULT_ADMIN check.
  account?: string,
): Promise<B20Inspection> {
  // Light validation before hitting the RPC.
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    throw new Error("Invalid address — must be 0x followed by 40 hex characters.");
  }
  const acct = account && /^0x[a-fA-F0-9]{40}$/.test(account) ? account : undefined;
  return inspectB20(address, network, acct);
}
