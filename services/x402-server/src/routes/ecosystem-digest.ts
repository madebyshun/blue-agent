import { Router, Request, Response } from "express";
import { callBankrLLM, runAeonSkill, extractJson } from "../lib/llm.js";

const router = Router();

// ── Fallback (no LLM) ─────────────────────────────────────────────────────────

function staticFallback(focus: string) {
  return {
    title: "Base Ecosystem Digest",
    generatedAt: new Date().toISOString(),
    summary:
      "Base continues to see strong builder activity with AI agent narratives dominating CT. " +
      "DeFi TVL holding steady; new token launches concentrated in agent and meme categories.",
    bullets: [
      "AI agent tokens remain the dominant narrative on Base CT",
      "Builder activity high — multiple new protocol deployments this week",
      "USDC volume on Base reaching new highs via Coinbase integration",
      "Uniswap v4 hooks gaining traction among Base-native protocols",
      focus ? `Focus area noted: ${focus}` : "Watch: next Coinbase-backed project announcement",
    ],
    source: "fallback",
  };
}

// ── LLM pipeline (Aeon + MiroShark + Blue) ────────────────────────────────────

async function generateDigest(focus: string) {
  const [moversRaw, narrativeRaw] = await Promise.all([
    runAeonSkill("token-movers", "Base chain ecosystem tokens, chain=base, min_mcap=$1M"),
    runAeonSkill("narrative-tracker", "Base ecosystem, AI agents, DeFi, builder economy"),
  ]);

  const msRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are MiroShark observer — neutral recorder, synthesizes community signals.
Record the Base ecosystem temperature this week.
Return ONLY raw JSON, no markdown.
Schema: {"temperature":"hot|warm|neutral|cool|cold","bull":<0-100>,"bear":<0-100>,"neutral":<0-100>,"community_mood":"<1 sentence>","notable_events":["<event>"],"builder_activity":"high|medium|low","what_observers_say":"<1-2 sentences>"}`,
    messages: [
      {
        role: "user",
        content: `Token movers:\n${moversRaw ?? "Base tokens active"}\n\nNarratives:\n${narrativeRaw ?? "AI agents, DeFi narratives active"}`,
      },
    ],
    temperature: 0.4,
    maxTokens: 500,
  });

  const observer = extractJson(msRaw) ?? {
    temperature: "neutral",
    community_mood: "Steady builder activity on Base",
    what_observers_say: "Base ecosystem growing steadily",
  };

  const synthesisRaw = await callBankrLLM({
    model: "claude-haiku-4-5",
    system: `You are Blue Agent — AI-native intelligence for Base builders.
Produce a concise weekly digest of the Base ecosystem.
Return ONLY raw JSON, no markdown.
Schema: {
  "headline": "<1 sentence digest headline>",
  "summary": "<2-3 sentence ecosystem summary>",
  "bullets": ["<key insight>","<key insight>","<key insight>","<key insight>","<key insight>"],
  "dominant_narrative": "<what is driving Base right now>",
  "builder_signal": "<1 sentence for builders>",
  "week_rating": <1-10>
}`,
    messages: [
      {
        role: "user",
        content: `Aeon token-movers:\n${moversRaw ?? "Base tokens"}\n\nAeon narratives:\n${narrativeRaw ?? "Base narratives"}\n\nMiroShark observer:\n${JSON.stringify(observer)}${focus ? `\n\nFocus area: ${focus}` : ""}`,
      },
    ],
    temperature: 0.3,
    maxTokens: 1000,
  });

  const result = extractJson(synthesisRaw);
  if (!result) throw new Error("Failed to parse LLM synthesis");

  return {
    title: (result.headline as string) ?? "Base Ecosystem Digest",
    generatedAt: new Date().toISOString(),
    summary: (result.summary as string) ?? "",
    bullets: (result.bullets as string[]) ?? [],
    dominantNarrative: result.dominant_narrative,
    builderSignal: result.builder_signal,
    weekRating: result.week_rating,
    observer,
    source: "llm",
  };
}

// ── Route handler ─────────────────────────────────────────────────────────────

async function handle(req: Request, res: Response) {
  const focus =
    (req.body?.focus as string | undefined) ??
    (req.query.focus as string | undefined) ??
    "";

  const hasLLM = !!process.env.BANKR_API_KEY;

  if (!hasLLM) {
    return res.json(staticFallback(focus));
  }

  try {
    const digest = await generateDigest(focus);
    return res.json(digest);
  } catch (err) {
    console.error("[ecosystem-digest] LLM error, returning fallback:", (err as Error).message);
    return res.json({ ...staticFallback(focus), error: (err as Error).message });
  }
}

router.get("/ecosystem-digest", handle);
router.post("/ecosystem-digest", handle);

export default router;
