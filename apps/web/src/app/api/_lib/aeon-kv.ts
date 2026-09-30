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
  // Provenance: "aeon" = genuine Aeon agent output (A2A/webhook feed) → may be
  // labelled REAL. "model" = bridged from our own research-loop cron (Bankr LLM)
  // → must be labelled model-generated, never "REAL".
  source?:  "aeon" | "model";
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
export async function setAeonOutput(
  skill: string,
  output: string,
  username?: string,
  source: "aeon" | "model" = "aeon",
): Promise<void> {
  const value: AeonOutput = { output, ts: Date.now(), skill, username, source };
  await kv.set(`aeon:${skill}`, value, { ex: 26 * 60 * 60 }); // 26h TTL
}

/**
 * Format Aeon output as context string for LLM prompts
 */
export function formatAeonForLLM(aeon: AeonOutput): string {
  const age = Math.round((Date.now() - aeon.ts) / 60_000);
  const stamp = `${age}min ago, ${new Date(aeon.ts).toISOString()}`;
  // Fail-safe default: ONLY an explicit source==="aeon" (genuine Aeon agent feed)
  // earns the "REAL" label. Everything else — model-generated cron output, or
  // legacy KV entries written before `source` existed (source===undefined) — is
  // treated as model-generated. When provenance is unknown, label conservatively
  // rather than overclaiming "real".
  if (aeon.source === "aeon") {
    return `=== REAL AEON OUTPUT (${stamp}) ===\n${aeon.output}`;
  }
  return `=== AEON SIGNAL (model-generated, not measured — treat as a lead, verify independently) (${stamp}) ===\n${aeon.output}`;
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

// ─── The null path (rebuild plan §4 #4, 2026-09-30) ──────────────────────────
//
// The Aeon job is being turned off, so every read above returns null. Fifteen
// paid x402 tools read it, and until today most of them filled the gap with a
// placeholder the model could not tell from data — `Research: ${x ?? target}`
// handed the project's own name over as "research", `Narratives: ${x ?? "Base
// ecosystem"}` handed two words over as the narrative feed. A model given a
// slot labelled "Narratives" writes narratives. Now the slot says, in words,
// that there is nothing in it, and the response says the same to the caller.

/** What a prompt receives in place of a missing Aeon output. */
export const AEON_NONE_PROMPT =
  "NONE — no Aeon data is available for this run. Do not invent research, narratives, trends, market moves, metrics or sources; where you would have needed them, say they are unknown.";

/** What the caller is told when an Aeon read came back empty. */
export const AEON_NONE_NOTE =
  "No Aeon data: the Aeon research feed is not running, so no part of this answer comes from it — it is model-generated from your input alone.";

export type AeonStatus = {
  status: "fresh" | "partial" | "none";
  skills: Record<string, "fresh" | "none">;
  note?: string;
};

/** The `aeon_data` field every Aeon-reading tool ships: which skills were
 *  read, and — whenever any was missing — the plain statement of it. */
export function aeonStatus(read: Record<string, string | null | undefined>): AeonStatus {
  const skills: Record<string, "fresh" | "none"> = {};
  for (const [k, v] of Object.entries(read)) skills[k] = v ? "fresh" : "none";
  const n = Object.values(skills).filter((s) => s === "fresh").length;
  const total = Object.keys(skills).length;
  const status = n === 0 ? "none" : n === total ? "fresh" : "partial";
  return { status, skills, ...(status === "fresh" ? {} : { note: AEON_NONE_NOTE }) };
}
