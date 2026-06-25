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
import { getB20Activity, type B20ActivityResult } from "@/lib/b20/activity-cdp";

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

/**
 * Recent B20 control events (pause / policy / cap / role / freeze-seize).
 * CDP SQL only — no getLogs fallback (control events span every B20 token, which
 * would be far too many chunked scans). On any CDP failure returns an honest
 * `unavailable` result so the Registry UI hides the section / shows a notice.
 */
export async function runB20Activity(
  network: "mainnet" | "sepolia",
): Promise<B20ActivityResult> {
  try {
    return await getB20Activity(network);
  } catch (err) {
    console.warn(
      `[b20-activity] CDP path failed (${(err as Error).message}) — activity unavailable`,
    );
    return { network, events: [], total: 0, unavailable: true };
  }
}
