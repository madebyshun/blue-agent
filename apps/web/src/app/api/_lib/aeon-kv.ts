/**
 * aeon-kv.ts — Read/write real Aeon skill outputs from Vercel KV
 *
 * Keys: `aeon:<skill-id>` → AeonOutput
 * Fresh window: 2 hours (Aeon runs daily; KV data is stale after 2h for safety)
 */

import { kv } from "@vercel/kv";

export interface AeonOutput {
  output:   string;   // raw text from Aeon's notify (Discord content)
  ts:       number;   // Unix ms when stored
  skill:    string;   // e.g. "token-pick"
  username?: string;  // Discord webhook username field
}

/** Max age before we consider KV output stale and fall back to our pipeline */
const MAX_AGE_MS = 25 * 60 * 60 * 1000; // 25 hours — Aeon runs daily, keep for full cycle

/**
 * Retrieve a fresh Aeon output for a given skill.
 * Returns null if not found or stale.
 */
export async function getAeonOutput(skill: string): Promise<AeonOutput | null> {
  try {
    const data = await kv.get<AeonOutput>(`aeon:${skill}`);
    if (!data) return null;
    if (Date.now() - data.ts > MAX_AGE_MS) {
      console.info(`[aeon-kv] stale: skill=${skill} age=${Math.round((Date.now() - data.ts) / 60_000)}min`);
      return null;
    }
    console.info(`[aeon-kv] hit: skill=${skill} age=${Math.round((Date.now() - data.ts) / 60_000)}min`);
    return data;
  } catch (e) {
    console.warn("[aeon-kv] read error:", e);
    return null;
  }
}

/**
 * Store an Aeon skill output.
 * TTL: 26 hours (Aeon runs daily — keep one full cycle + buffer)
 */
export async function setAeonOutput(skill: string, output: string, username?: string): Promise<void> {
  const value: AeonOutput = { output, ts: Date.now(), skill, username };
  await kv.set(`aeon:${skill}`, value, { ex: 26 * 60 * 60 }); // 26h TTL
}

/**
 * Format Aeon output as context string for LLM prompts
 */
export function formatAeonForLLM(aeon: AeonOutput): string {
  const age = Math.round((Date.now() - aeon.ts) / 60_000);
  return `=== REAL AEON OUTPUT (${age}min ago, ${new Date(aeon.ts).toISOString()}) ===\n${aeon.output}`;
}

/**
 * List all stored Aeon skills (for debugging)
 */
export async function listAeonSkills(): Promise<string[]> {
  try {
    const keys = await kv.keys("aeon:*");
    return keys.map(k => k.replace("aeon:", ""));
  } catch { return []; }
}
