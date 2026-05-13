import { BuilderScoreResult, BuilderTier, BuilderScoreDimensions } from "./types";
import { builderBadgeUrl } from "./badges";

function getBuilderTier(score: number): BuilderTier {
  if (score >= 91) return "Founder";
  if (score >= 76) return "Legend";
  if (score >= 61) return "Maker";
  if (score >= 41) return "Builder";
  return "Explorer";
}

function extractJson(text: string): any {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return JSON.parse(text.slice(start, end + 1));
  throw new Error("No JSON found in response");
}

async function callBankrLLM(system: string, user: string): Promise<string> {
  if (!process.env.BANKR_API_KEY) {
    throw new Error(
      "BANKR_API_KEY is not set.\n" +
      "  Export it: export BANKR_API_KEY=<your-key>\n" +
      "  Check setup: blue doctor"
    );
  }
  const res = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.BANKR_API_KEY,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      system,
      messages: [{ role: "user", content: user }],
      temperature: 0.3,
      max_tokens: 1000,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Bankr LLM error ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json() as any;
  if (data.content?.[0]?.text) return data.content[0].text;
  throw new Error("Invalid Bankr LLM response");
}

const SYSTEM_PROMPT = `You are Blue Agent's Builder Score engine. You score builders on X/Twitter.

Given a handle, score them on 5 dimensions (max pts shown):
- activity (25): posting frequency, streak, consistency
- social (25): followers, engagement rate, mentions
- uniqueness (20): niche clarity, differentiation in bio/content
- thesis (20): vision clarity, pinned content, project description
- community (10): replies, retweets, builder interactions

Return ONLY valid JSON in this exact format:
{
  "dimensions": {
    "activity": <0-25>,
    "social": <0-25>,
    "uniqueness": <0-20>,
    "thesis": <0-20>,
    "community": <0-10>
  },
  "summary": "<1-2 sentence sharp summary of their builder profile>"
}

Be realistic. Most builders score 40-70. Only exceptional ones score 80+.
Base your assessment on what you know about this handle — if unknown, score conservatively (30-50 range).`;

export async function scoreBuilder(handle: string): Promise<BuilderScoreResult> {
  const clean = handle.replace(/^@/, "");

  const raw = await callBankrLLM(
    SYSTEM_PROMPT,
    `Score this X/Twitter handle: @${clean}`
  );

  let parsed: { dimensions: BuilderScoreDimensions; summary: string };
  try {
    parsed = extractJson(raw);
  } catch {
    throw new Error(`Failed to parse score response: ${raw.slice(0, 200)}`);
  }

  // Clamp each dimension to its max
  const dims: BuilderScoreDimensions = {
    activity:   Math.min(25, Math.max(0, Math.round(parsed.dimensions?.activity ?? 10))),
    social:     Math.min(25, Math.max(0, Math.round(parsed.dimensions?.social ?? 10))),
    uniqueness: Math.min(20, Math.max(0, Math.round(parsed.dimensions?.uniqueness ?? 8))),
    thesis:     Math.min(20, Math.max(0, Math.round(parsed.dimensions?.thesis ?? 8))),
    community:  Math.min(10, Math.max(0, Math.round(parsed.dimensions?.community ?? 4))),
  };

  const score = dims.activity + dims.social + dims.uniqueness + dims.thesis + dims.community;

  return {
    handle: clean,
    score,
    tier: getBuilderTier(score),
    dimensions: dims,
    summary: parsed.summary ?? "No summary available.",
    badge: builderBadgeUrl(clean),
  };
}
