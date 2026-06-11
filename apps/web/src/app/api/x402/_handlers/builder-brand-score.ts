// x402/builder-brand-score/index.ts
// Builder Brand Score — brand/CT reputation has no live feed wired in, so the score is
// an AI ESTIMATE generated from model knowledge (labelled via data_source/disclaimer),
// NOT measured from real social data. When a GitHub `repo` is supplied, the credibility/
// consistency dimensions are anchored to REAL repo activity (lib/github). Resilient: never 500.
// Price: $0.35

import { fetchRepo, slugifyRepo, scoreRepoActivity, repoFactsPrompt, type RepoData } from "@/lib/github";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.4, tokens = 1000): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: { "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "", "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-haiku-4-5", system, messages: [{ role: "user", content: user }] as Msg[], temperature: temp, max_tokens: tokens }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}
const DISCLAIMER = "Brand/CT reputation is an AI estimate from model knowledge — NOT measured from live social data. GitHub-derived credibility (when a repo is supplied) is real.";
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F]/g, " ")); } catch { return null; } }
}
async function aeon(skill: string, focus = ""): Promise<string | null> {
  try {
    const r = await fetch(`https://raw.githubusercontent.com/aaronjmars/aeon/main/skills/${skill}/SKILL.md`, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return null;
    const p = await r.text();
    return await llm(`You are Aeon. Synthesize from training knowledge. Today: ${new Date().toISOString().split("T")[0]}.`,
      `Follow skill template. Be concrete.\n\nSkill:\n${p}${focus ? `\nFocus: ${focus}` : ""}\n\nReturn only skill output.`, 0.2, 1200);
  } catch { return null; }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { builder?: string; project?: string; handle?: string; repo?: string; github?: string } = {};
    try { const t = await req.text(); if (t.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const builder = body.builder ?? url.searchParams.get("builder") ?? "";
    const project = body.project ?? url.searchParams.get("project") ?? "";
    const handle = body.handle ?? url.searchParams.get("handle") ?? "";
    const repo = (body.repo ?? body.github ?? url.searchParams.get("repo") ?? "").trim();
    if (!builder && !handle) return Response.json({ error: "builder or handle is required" }, { status: 400 });

    const target = builder || handle;

    // Real GitHub credibility signal (optional) + brand research (model estimate).
    const [repoData, researchRaw, narrativeRaw] = await Promise.all([
      repo ? fetchRepo(slugifyRepo(repo)) : Promise.resolve<RepoData | null>(null),
      aeon("deep-research", `${target}${project ? ` — ${project}` : ""}: reputation in Base/crypto ecosystem, CT presence, community standing, past projects, credibility signals.`),
      aeon("narrative-tracker", `${target} brand positioning: how are they perceived on CT? What narratives are they associated with? Brand strength in Base ecosystem.`),
    ]);
    const repoScored = repoData ? scoreRepoActivity(repoData) : null;
    const githubCtx = repoScored ? `\nREAL GitHub credibility (anchor consistency/credibility on this):\n${repoFactsPrompt(repoData!, repoScored)}` : "";

    const msRaw = await llm(`You are MiroShark — influencer persona (2.8x weight). You know who has real brand in crypto vs who is faking it.
Score this builder's brand.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "brand_tier": "S|A|B|C|D",
  "ct_presence": "dominant|strong|moderate|weak|unknown",
  "authenticity": <0-10>,
  "narrative_alignment": "<what narrative they own>",
  "influencer_verdict": "<1-2 sentences>"
}`,
      `Builder: ${target}\nProject: ${project || "unknown"}\nResearch: ${researchRaw ?? target}\nNarratives: ${narrativeRaw ?? target}`, 0.4, 500);
    const influencer = parseJson(msRaw) ?? {};

    const resultRaw = await llm(`You are Blue Agent — builder brand scoring engine for Base ecosystem.
CRITICAL: Return ONLY raw JSON.
Schema: {
  "brand_score": <0-100>,
  "tier": "S|A|B|C|D",
  "dimensions": {
    "visibility": <0-10>,
    "credibility": <0-10>,
    "community": <0-10>,
    "consistency": <0-10>,
    "narrative_ownership": <0-10>
  },
  "strengths": ["<brand strength>"],
  "gaps": ["<brand gap>"],
  "quick_wins": ["<easy action to improve brand>"],
  "brand_keywords": ["<what they're known for>"],
  "recommended_positioning": "<1-2 sentences on how to strengthen brand>",
  "summary": "<2 sentences>"
}`,
      `Builder: ${target}\nProject: ${project || "unknown"}\nResearch: ${researchRaw ?? target}\nNarratives: ${narrativeRaw ?? target}${githubCtx}\nInfluencer: ${JSON.stringify(influencer)}`, 0.3, 1000);

    let result = parseJson(resultRaw);
    if (!result) {
      result = {
        brand_score: null,
        tier: "C",
        dimensions: { visibility: null, credibility: null, community: null, consistency: null, narrative_ownership: null },
        strengths: [],
        gaps: [],
        quick_wins: ["Re-run for a full brand read"],
        brand_keywords: [],
        recommended_positioning: "Brand estimate briefly unavailable — re-run.",
        summary: "Estimate unavailable this run.",
        degraded: true,
      };
    }

    return Response.json({
      tool: "builder-brand-score",
      timestamp: new Date().toISOString(),
      data_source: repoScored ? "GitHub (live repo credibility) + brand estimate" : "AI estimate (no live social data — brand not measured)",
      disclaimer: DISCLAIMER,
      builder: target,
      project,
      github: repoScored ? { repo: repoData!.fullName, score: repoScored.score, grade: repoScored.grade, dimensions: repoScored.dimensions, stars: repoData!.stars, days_since_push: repoData!.daysSincePush } : null,
      influencer,
      ...result,
    });
  } catch (e) {
    return Response.json({
      tool: "builder-brand-score",
      timestamp: new Date().toISOString(),
      data_source: "AI estimate (no live social data — brand not measured)",
      disclaimer: DISCLAIMER,
      degraded: true,
      note: "Brand estimate unavailable this run — please retry.",
      message: (e as Error).message,
    });
  }
}
