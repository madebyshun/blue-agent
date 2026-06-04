// x402/builder-score
// Builder Score — on-chain activity, shipping history, community reputation (0-100)
// Price: $0.35 — for a given X/Twitter handle

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.3, tokens = 800): Promise<string> {
  const r = await fetch("https://llm.bankr.bot/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.LLM_API_KEY ?? process.env.BANKR_API_KEY ?? "",
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      system,
      messages: [{ role: "user", content: user }] as Msg[],
      temperature: temp,
      max_tokens: tokens,
    }),
  });
  if (!r.ok) throw new Error(`LLM ${r.status}: ${await r.text()}`);
  const d = await r.json() as { content?: { text: string }[] };
  return d.content?.[0]?.text ?? "";
}

function parseJson(t: string): Record<string, unknown> | null {
  let s = t.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const i = s.indexOf("{"), j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try { return JSON.parse(s); } catch {
    try { return JSON.parse(s.replace(/[\x00-\x1F\x7F]/g, " ")); } catch { return null; }
  }
}

export default async function handler(req: Request): Promise<Response> {
  try {
    let body: { handle?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const url    = new URL(req.url);
    const handle = (body.handle ?? url.searchParams.get("handle") ?? "").replace(/^@/, "").trim();

    if (!handle) {
      return Response.json({ error: "handle is required (X/Twitter handle without @)" }, { status: 400 });
    }

    const ctx = `Builder X/Twitter handle: @${handle}`;

    // Blue Agent + MiroShark parallel scoring
    const [blueRaw, msRaw] = await Promise.all([
      llm(
        `You are Blue Agent — builder reputation analyst for Base ecosystem.
Score this builder (0-100) based on their likely on-chain activity, shipping history, and technical credibility based on their X/Twitter handle.
Consider: known Base builders have higher scores, anonymous handles get lower, prolific shippers get bonus.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "score": <0-100>,
  "tier": "legendary|elite|active|emerging|unknown",
  "onchain_activity": "high|medium|low|unknown",
  "shipping_history": "prolific|active|occasional|unknown",
  "technical_credibility": "high|medium|low|unknown",
  "base_ecosystem_score": <0-100>,
  "known_projects": ["<project>" or empty],
  "blue_assessment": "<2 sentences — builder profile>"
}`,
        ctx,
        0.3,
        700
      ),
      llm(
        `You are MiroShark — community intelligence on Base.
Assess this builder's community reputation and social presence on X/CT (Crypto Twitter).
Consider: follower quality, engagement with Base ecosystem, known in CT?
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "community_score": <0-100>,
  "ct_presence": "strong|moderate|minimal|unknown",
  "base_community": "core|active|peripheral|unknown",
  "reputation_flags": ["<flag>" or empty],
  "community_verdict": "<1-2 sentences>"
}`,
        ctx,
        0.3,
        400
      ),
    ]);

    const blue = parseJson(blueRaw) ?? {
      score: 50,
      tier: "unknown",
      onchain_activity: "unknown",
      shipping_history: "unknown",
      technical_credibility: "unknown",
      base_ecosystem_score: 50,
      known_projects: [],
      blue_assessment: "Insufficient data to score this builder.",
    };

    const ms = parseJson(msRaw) ?? {
      community_score: 50,
      ct_presence: "unknown",
      base_community: "unknown",
      reputation_flags: [],
      community_verdict: "No community data available.",
    };

    const builderScore  = (blue.score ?? 50) as number;
    const communityScore = (ms.community_score ?? 50) as number;
    const composite     = Math.round(builderScore * 0.6 + communityScore * 0.4);
    const tier          = composite >= 85 ? "legendary" : composite >= 70 ? "elite" : composite >= 50 ? "active" : composite >= 30 ? "emerging" : "unknown";

    return Response.json({
      tool: "builder-score",
      timestamp: new Date().toISOString(),
      handle,
      url: `https://x.com/${handle}`,
      score: composite,
      tier,
      builder: {
        score:                 builderScore,
        tier:                  blue.tier ?? tier,
        onchain_activity:      blue.onchain_activity ?? "unknown",
        shipping_history:      blue.shipping_history ?? "unknown",
        technical_credibility: blue.technical_credibility ?? "unknown",
        base_ecosystem_score:  blue.base_ecosystem_score ?? 50,
        known_projects:        blue.known_projects ?? [],
        assessment:            blue.blue_assessment ?? "",
      },
      community: {
        score:             communityScore,
        ct_presence:       ms.ct_presence ?? "unknown",
        base_community:    ms.base_community ?? "unknown",
        reputation_flags:  ms.reputation_flags ?? [],
        verdict:           ms.community_verdict ?? "",
      },
    });
  } catch (error) {
    console.error("[BuilderScore]", error);
    return Response.json(
      { error: "Builder score failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
