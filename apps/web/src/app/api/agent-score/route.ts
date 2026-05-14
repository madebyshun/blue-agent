import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

const SYSTEM = `You are the Blue Agent Agent Score system. Score an AI agent by its handle, npm package, or GitHub repo.

Scoring dimensions (total 100):
- skillDepth (0-25): range of capabilities, tools, domains covered
- onchainActivity (0-25): Base transactions, contracts deployed, USDC earned
- reliability (0-20): uptime, response consistency, error handling
- interoperability (0-20): MCP support, API integrations, multi-chain capability
- reputation (0-10): community trust, user reviews, ecosystem standing

Tiers:
- 0-24: Bot
- 25-49: Specialist
- 50-74: Operator
- 75-100: Sovereign

Badges: Bot=🤖, Specialist=🔧, Operator=⚙️, Sovereign=👑

Status: Determine if the agent appears to be "online", "offline", or "unknown" based on recency of activity.

Respond ONLY with valid JSON matching exactly:
{
  "handle": "string",
  "xp": number,
  "tier": "Bot"|"Specialist"|"Operator"|"Sovereign",
  "badge": "emoji",
  "status": "online"|"offline"|"unknown",
  "dimensions": {
    "skillDepth": number,
    "onchainActivity": number,
    "reliability": number,
    "interoperability": number,
    "reputation": number
  },
  "strengths": ["string", "string"],
  "gaps": ["string", "string"]
}

Be thoughtful. Use your training knowledge. If unknown, give fair defaults (25-40 XP).`;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const handle = searchParams.get("handle");

  if (!handle) {
    return NextResponse.json({ error: "handle required" }, { status: 400 });
  }

  try {
    const res = await fetch(BANKR_LLM, {
      method: "POST",
      headers: {
        "x-api-key": process.env.BANKR_API_KEY ?? "",
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        system: SYSTEM,
        messages: [{ role: "user", content: `Score the AI agent: ${handle}` }],
        max_tokens: 600,
        temperature: 0.3,
      }),
    });

    if (!res.ok) {
      throw new Error(`LLM error: ${res.status}`);
    }

    const data = await res.json() as { content?: Array<{ text: string }> };
    const text = data.content?.[0]?.text ?? "{}";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const score = JSON.parse(jsonMatch[0]);
    return NextResponse.json(score);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
