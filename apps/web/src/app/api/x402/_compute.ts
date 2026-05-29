/**
 * Tool compute registry for self-hosted x402.
 *
 * Each entry runs the tool's LLM pipeline on our own server (Vercel) and
 * returns the result object. Reuses the shared Bankr LLM client in _lib/llm.ts
 * (which needs BANKR_API_KEY, already set in Vercel) and its truncation-safe
 * JSON parser. Gated behind CDP payment settlement in the route.
 *
 * Start with ecosystem-digest (MVP). Add more tools here as they are migrated
 * off Bankr-hosted compute.
 */
import { callBankrLLM, extractJsonObject, runAeonSkill } from "@/app/api/_lib/llm";

type Result = Record<string, unknown>;
export type Compute = (body: Record<string, unknown>) => Promise<Result>;

// ─── ecosystem-digest ─────────────────────────────────────────────────────────
const ecosystemDigest: Compute = async () => {
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base chain ecosystem tokens, chain=base, min_mcap=$1M"),
    runAeonSkill("narrative-tracker", "Base ecosystem, AI agents, DeFi, builder economy"),
  ]);

  const msRaw = await callBankrLLM({
    system: `You are MiroShark observer persona — neutral recorder, no strong bias.
Record the community temperature for the Base ecosystem this week.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {"temperature":"hot|warm|neutral|cool|cold","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"community_mood":"<1 sentence>","notable_events":["<event>"],"builder_activity":"high|medium|low","what_observers_say":"<1-2 sentences>"}`,
    messages: [{ role: "user", content: `Token movers:\n${moversRaw ?? "Base tokens active"}\n\nNarratives:\n${narrativeRaw ?? "AI agents, DeFi narratives active"}` }],
    temperature: 0.4,
    maxTokens: 600,
    _skipEnhance: true,
  });
  const observerTake = extractJsonObject(msRaw) ?? {
    temperature: "neutral", bull: 40, bear: 30, neutral: 30,
    community_mood: "Steady builder activity", notable_events: [],
    builder_activity: "medium", what_observers_say: "Base ecosystem continuing to grow",
  };

  const synthesis = await callBankrLLM({
    system: `You are Blue Agent — AI-native intelligence for Base builders.
Produce a concise weekly digest of the Base ecosystem.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {"headline":"<1 sentence>","movers":[{"token":"<symbol>","change":"<+/-%>","note":"<1 sentence>"}],"narratives":[{"name":"<narrative>","phase":"Emerging|Rising|Peak|Fading","key_point":"<1 sentence>"}],"community":{"temperature":"<hot/warm/neutral/cool/cold>","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>},"what_moved":["<key event>"],"what_matters":["<actionable insight>"],"what_to_watch":["<catalyst or risk>"],"builder_signal":"<1 sentence>","week_rating":<1-10>}`,
    messages: [{ role: "user", content: `Aeon token-movers:\n${moversRaw ?? "Base tokens"}\n\nAeon narratives:\n${narrativeRaw ?? "Base narratives"}\n\nMiroShark observer:\n${JSON.stringify(observerTake)}` }],
    temperature: 0.3,
    maxTokens: 1500,
    _skipEnhance: true,
  });
  const result = extractJsonObject(synthesis);
  if (!result) throw new Error("Failed to parse digest");

  return {
    tool: "ecosystem-digest",
    timestamp: new Date().toISOString(),
    period: "weekly",
    observer: observerTake,
    ...result,
  };
};

// ─── Registry ──────────────────────────────────────────────────────────────────
export const COMPUTE: Record<string, Compute> = {
  "ecosystem-digest": ecosystemDigest,
};
