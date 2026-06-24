"use server";

/**
 * Server action — lists B20 tokens from the B20Factory event log.
 * Calls getB20Registry on the server so viem runs in Node.js.
 */

import { getB20Registry, type B20RegistryResult } from "@/lib/b20/registry-logs";

export async function runB20Registry(
  network: "mainnet" | "sepolia",
): Promise<B20RegistryResult> {
  return getB20Registry(network);
}
