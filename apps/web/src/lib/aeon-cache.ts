// lib/aeon-cache.ts
// In-memory cache for Aeon skill outputs
// Stores the latest output per skill — used by Launch Simulator

export type AeonOutput = {
  id: string;
  skill: string;
  output: string;
  quality_score: number;
  flags?: string[];
  source_repo?: string;
  timestamp: string;
  notify_channel?: string;
};

// In-memory store — persists across requests in the same process
// For production: replace with Redis or a DB
const cache = new Map<string, AeonOutput>();

export function storeAeonOutput(data: AeonOutput): void {
  cache.set(data.skill, data);
  cache.set("latest", data); // always keep the most recent regardless of skill
}

export function getAeonOutput(skill: string): AeonOutput | null {
  return cache.get(skill) ?? null;
}

export function getLatestAeonOutput(): AeonOutput | null {
  return cache.get("latest") ?? null;
}

export function getAllAeonOutputs(): AeonOutput[] {
  const results: AeonOutput[] = [];
  for (const [key, value] of cache.entries()) {
    if (key !== "latest") results.push(value);
  }
  return results.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

// Ecosystem summary for Launch Simulator — aggregates all cached outputs
export function getAeonEcosystemSummary(): string | null {
  const outputs = getAllAeonOutputs();
  if (outputs.length === 0) return null;

  return outputs
    .filter((o) => o.quality_score >= 3)
    .map((o) => `[${o.skill}] ${o.output}`)
    .join("\n\n");
}
