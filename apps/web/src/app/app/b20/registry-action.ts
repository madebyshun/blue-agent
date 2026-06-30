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
import { getB20Activity, getB20AdminRenounced, type B20ActivityResult, type B20AdminRenounceResult } from "@/lib/b20/activity-cdp";
import { getB20Activation, type B20Activation } from "@/lib/b20/activation";

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

/**
 * Confirms whether a specific B20 token permanently renounced DEFAULT_ADMIN
 * (LastAdminRenounced event). The ONLY honest proof of "admin renounced" — B20
 * can't enumerate role holders. On any CDP failure returns `unavailable` so the
 * Scanner stays conservative and never claims immutability it can't prove.
 */
export async function runB20AdminRenounced(
  token: string,
  network: "mainnet" | "sepolia",
): Promise<B20AdminRenounceResult> {
  try {
    return await getB20AdminRenounced(token, network);
  } catch (err) {
    console.warn(
      `[b20-renounce] CDP path failed (${(err as Error).message}) — cannot confirm renounce`,
    );
    return { token: token.toLowerCase(), renounced: false, unavailable: true };
  }
}

/**
 * ActivationRegistry gate for the Launch tab — is the B20 createB20 feature live
 * for ASSET / STABLECOIN on this network? Read on-chain (0x8453…0001) so the UI
 * can disable Deploy with a clear message before the wallet hits a confusing
 * "Unable to estimate fee" revert. Never throws; ok:false ⟹ unknown (don't block).
 */
export async function runB20Activation(
  network: "mainnet" | "sepolia",
): Promise<B20Activation> {
  try {
    return await getB20Activation(network);
  } catch (err) {
    console.warn(
      `[b20-activation] check failed (${(err as Error).message}) — treating as unknown`,
    );
    return { network, ok: false, asset: true, stablecoin: true, checkedAt: Date.now() };
  }
}
