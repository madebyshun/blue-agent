import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

const SYSTEM = `You are the Blue Agent Builder Score system. Score a builder by their X/Twitter handle.

Scoring dimensions (total 100):
- activity (0-25): GitHub commits, onchain txns, launches, open source contributions
- social (0-25): X followers, engagement, content quality, community trust
- uniqueness (0-20): unique thesis, original work, niche expertise
- thesis (0-20): clarity of building direction, Base alignment, conviction
- community (0-10): ecosystem contributions, mentoring, collaborations

Tiers:
- 0-24: Explorer
- 25-49: Builder
- 50-74: Maker
- 75-100: Founder

Badges: Explorer=🔍, Builder=🏗️, Maker=⚙️, Founder=🚀

Respond ONLY with valid JSON matching exactly:
{
  "handle": "string",
  "score": number,
  "tier": "Explorer"|"Builder"|"Maker"|"Founder",
  "badge": "emoji",
  "summary": "one sentence summary (under 100 chars)",
  "dimensions": {
    "activity": number,
    "social": number,
    "uniqueness": number,
    "thesis": number,
    "community": number
  }
}

Be thoughtful. Use your training knowledge about the handle. If unknown, give a fair default score of 25-40.`;

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
        messages: [{ role: "user", content: `Score the builder with handle: ${handle}` }],
        max_tokens: 500,
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
