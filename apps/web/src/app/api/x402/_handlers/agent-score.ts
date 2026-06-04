// x402/agent-score
// Agent Score — performance, XP, interactions, uptime for AI agents on Base
// Price: $0.35

type Msg = { role: string; content: string };

async function llm(system: string, user: string, temp = 0.3, tokens = 700): Promise<string> {
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
    let body: { handle?: string; name?: string } = {};
    try {
      const t = await req.text();
      if (t?.trim().startsWith("{")) body = JSON.parse(t);
    } catch {}

    const url    = new URL(req.url);
    const handle = (body.handle ?? body.name ?? url.searchParams.get("handle") ?? url.searchParams.get("name") ?? "").replace(/^@/, "").trim();

    if (!handle) {
      return Response.json({ error: "handle is required (agent handle or name)" }, { status: 400 });
    }

    const ctx = `AI Agent handle/name: ${handle} (Base ecosystem)`;

    const [blueRaw, msRaw] = await Promise.all([
      llm(
        `You are Blue Agent — AI agent performance analyst for the Base ecosystem.
Score this AI agent (0-100) based on their likely performance, interactions, XP, and uptime.
Consider: known Base agents (Blue Agent, Aeon, etc.) get higher scores, unknown/new agents get lower.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "score": <0-100>,
  "tier": "apex|elite|active|emerging|unknown",
  "interaction_volume": "high|medium|low|unknown",
  "uptime_reliability": "high|medium|low|unknown",
  "xp_estimate": "<number or unknown>",
  "capabilities": ["<capability>" or empty],
  "known_agent": <boolean>,
  "blue_assessment": "<2 sentences — agent profile>"
}`,
        ctx,
        0.3,
        600
      ),
      llm(
        `You are MiroShark — AI agent intelligence analyst.
Assess this agent's community reputation and ecosystem impact.
CRITICAL: Return ONLY raw JSON. No markdown.
Schema: {
  "community_score": <0-100>,
  "ecosystem_impact": "high|medium|low|unknown",
  "agent_type": "trading|security|builder|social|general|unknown",
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
      interaction_volume: "unknown",
      uptime_reliability: "unknown",
      xp_estimate: "unknown",
      capabilities: [],
      known_agent: false,
      blue_assessment: "Insufficient data to score this agent.",
    };

    const ms = parseJson(msRaw) ?? {
      community_score: 50,
      ecosystem_impact: "unknown",
      agent_type: "unknown",
      community_verdict: "No data available.",
    };

    const agentScore     = (blue.score ?? 50) as number;
    const communityScore = (ms.community_score ?? 50) as number;
    const composite      = Math.round(agentScore * 0.6 + communityScore * 0.4);
    const tier           = composite >= 85 ? "apex" : composite >= 70 ? "elite" : composite >= 50 ? "active" : composite >= 30 ? "emerging" : "unknown";

    return Response.json({
      tool: "agent-score",
      timestamp: new Date().toISOString(),
      handle,
      score: composite,
      tier,
      performance: {
        score:               agentScore,
        tier:                blue.tier ?? tier,
        interaction_volume:  blue.interaction_volume ?? "unknown",
        uptime_reliability:  blue.uptime_reliability ?? "unknown",
        xp_estimate:         blue.xp_estimate ?? "unknown",
        capabilities:        blue.capabilities ?? [],
        known_agent:         blue.known_agent ?? false,
        assessment:          blue.blue_assessment ?? "",
      },
      community: {
        score:            communityScore,
        ecosystem_impact: ms.ecosystem_impact ?? "unknown",
        agent_type:       ms.agent_type ?? "unknown",
        verdict:          ms.community_verdict ?? "",
      },
    });
  } catch (error) {
    console.error("[AgentScore]", error);
    return Response.json(
      { error: "Agent score failed", message: (error as Error).message },
      { status: 500 }
    );
  }
}
