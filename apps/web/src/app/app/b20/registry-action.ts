"use server";

/**
 * Server action — lists B20 tokens from the B20Factory event log.
 *
 * Primary path: CDP SQL API (getB20RegistryCDP) — one query, full history, fast.
 * Fallback:     chunked getLogs (getB20Registry) — runs only if CDP throws
 *               (missing keys, network error, Cloudflare WAF challenge, parse).
 * Both run server-side so the CDP secret key + viem stay in Node.js.
 */

import { getB20Registry, type B20RegistryResult } from "@/lib/b20/registry-logs";
import { getB20RegistryCDP } from "@/lib/b20/registry-cdp";

export async function runB20Registry(
  network: "mainnet" | "sepolia",
): Promise<B20RegistryResult> {
  try {
    return await getB20RegistryCDP(network);
  } catch (err) {
    console.warn(
      `[b20-registry] CDP path failed (${(err as Error).message}) — falling back to getLogs`,
    );
    return getB20Registry(network);
  }
}
