// x402/builder-score
// Builder Score — anchored in REAL signals when supplied: GitHub repo activity
// (lib/github: live stars/commits/recency → deterministic shipping score) and/or
// on-chain wallet activity on Base (lib/onchain: live tx count + ERC-20 patterns).
// The X/CT community/reputation dimension has no live feed, so it is a clearly
// labelled AI estimate. The LLM never invents the grounded numbers.
// Resilient: never 500.
// Price: $0.35

import { fetchRepo, slugifyRepo, scoreRepoActivity, repoFactsPrompt, type RepoData } from "@/lib/github";
import { getWalletSnapshot, snapshotToPrompt, normalizeAddress } from "@/lib/onchain";

type Msg = { role: string; content: string };
async function llm(system: string, user: string, temp = 0.3, tokens = 800): Promise<string> {
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
function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch { try { return JSON.parse(s.replace(/[\x00-\x1F\x7F]/g, " ")); } catch { return null; } }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { handle?: string; repo?: string; github?: string; address?: string } = {};
    try { const t = await req.text(); if (t?.trim().startsWith("{")) body = JSON.parse(t); } catch {}
    const url = new URL(req.url);
    const handle = (body.handle ?? url.searchParams.get("handle") ?? "").replace(/^@/, "").trim();
    const repo = (body.repo ?? body.github ?? url.searchParams.get("repo") ?? "").trim();
    const address = (body.address ?? url.searchParams.get("address") ?? "").trim();
    if (!handle && !repo && !address) return Response.json({ error: "handle, repo (github), or address is required" }, { status: 400 });

    // ── Real grounding: GitHub repo activity + on-chain wallet activity ────────
    const [repoData, snap] = await Promise.all([
      repo ? fetchRepo(slugifyRepo(repo)) : Promise.resolve<RepoData | null>(null),
      address && normalizeAddress(address) ? getWalletSnapshot(address) : Promise.resolve(null),
    ]);
    const repoScored = repoData ? scoreRepoActivity(repoData) : null;
    const onchainGrounded = !!snap && (snap.txCount !== null || snap.transferCount > 0);
    const grounded = !!repoScored || onchainGrounded;

    const realCtx = [
      repoScored ? `REAL GitHub shipping data:\n${repoFactsPrompt(repoData!, repoScored)}` : "No GitHub repo supplied — shipping_history is an estimate.",
      onchainGrounded ? `REAL on-chain activity:\n${snapshotToPrompt(snap!)}` : "No wallet address supplied — onchain_activity is an estimate.",
      `Builder X/Twitter handle: @${handle || "(unknown)"} — NO live social feed; community/reputation is an AI estimate, not measured.`,
    ].join("\n\n");

    const system = `You are Blue Agent — builder reputation analyst for Base (chain 8453).
${grounded ? "You are given REAL signals (GitHub repo activity score and/or on-chain wallet activity). Anchor shipping_history + technical_credibility on the GitHub data and onchain_activity on the wallet data; reference them exactly, never invent numbers." : "No live signals were supplied — clearly frame the score as an estimate."}
The X/CT community/reputation dimension has no live data — treat it as a qualitative estimate.
Return ONLY raw JSON. No markdown.
Schema: {
  "score": <0-100>,
  "tier": "legendary|elite|active|emerging|unknown",
  "onchain_activity": "high|medium|low|unknown",
  "shipping_history": "prolific|active|occasional|unknown",
  "technical_credibility": "high|medium|low|unknown",
  "base_ecosystem_score": <0-100>,
  "known_projects": ["<project>"],
  "community": { "score": <0-100>, "ct_presence": "strong|moderate|minimal|unknown", "verdict": "<1 sentence, labelled estimate>" },
  "blue_assessment": "<2 sentences>"
}`;

    let blue: Record<string, unknown> | null = null;
    for (let attempt = 0; attempt < 2 && !blue; attempt++) {
      try { blue = parseJson(await llm(system, realCtx)); } catch { /* retry */ }
    }
    if (!blue) blue = { score: null, tier: "unknown", onchain_activity: "unknown", shipping_history: "unknown", technical_credibility: "unknown", base_ecosystem_score: null, known_projects: [], community: { score: null, ct_presence: "unknown", verdict: "Estimate unavailable this run." }, blue_assessment: "Synthesis briefly unavailable — re-run.", degraded: true };

    // When GitHub-grounded, anchor the headline score on the real shipping score.
    const score = repoScored ? Math.round(repoScored.score * 0.6 + ((blue.base_ecosystem_score as number) ?? repoScored.score) * 0.4) : ((blue.score as number) ?? null);
    const tier = score == null ? "unknown" : score >= 85 ? "legendary" : score >= 70 ? "elite" : score >= 50 ? "active" : score >= 30 ? "emerging" : "unknown";

    return Response.json({
      tool: "builder-score",
      timestamp: new Date().toISOString(),
      data_source: grounded
        ? `${repoScored ? "GitHub (live repo activity)" : ""}${repoScored && onchainGrounded ? " + " : ""}${onchainGrounded ? "Base RPC/Basescan (live on-chain)" : ""} + community estimate`.trim()
        : "AI estimate (no repo/address supplied — community not measured)",
      handle: handle || null,
      url: handle ? `https://x.com/${handle}` : null,
      github: repoScored ? { repo: repoData!.fullName, score: repoScored.score, grade: repoScored.grade, dimensions: repoScored.dimensions, stars: repoData!.stars, days_since_push: repoData!.daysSincePush, recent_commits: repoData!.commitCount } : null,
      onchain: onchainGrounded ? { eth_balance: snap!.ethBalance, tx_count: snap!.txCount, distinct_tokens: snap!.distinctTokens, last_activity_days: snap!.lastActivityDays } : null,
      ...blue,
      ...(score != null ? { score, tier } : {}),
    });
  } catch (error) {
    console.error("[BuilderScore]", error);
    return Response.json({ tool: "builder-score", timestamp: new Date().toISOString(), degraded: true, note: "Builder score unavailable this run — please retry.", message: (error as Error).message });
  }
}
