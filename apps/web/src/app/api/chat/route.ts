import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

const MODELS: Record<string, { id: string; maxTokens: number }> = {
  fast: { id: "claude-haiku-4-5",  maxTokens: 1024 },
  pro:  { id: "claude-sonnet-4-6", maxTokens: 2048 },
  max:  { id: "claude-sonnet-4-6", maxTokens: 4096 },
};

const SYSTEM = `You are Blue Agent — the Base-native AI assistant for builders.
You help founders and developers on Base with idea generation, smart contract architecture, DeFi design, agent development, and launch strategy.
Be direct, technical, and actionable. Prefer Base, USDC, Coinbase tools, and the Bankr ecosystem.`;

export async function POST(req: NextRequest) {
  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "BANKR_API_KEY not configured." }, { status: 500 });
  }

  let body: { messages?: { role: string; content: string }[]; tier?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { messages, tier = "pro" } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages array required." }, { status: 400 });
  }

  const model = MODELS[tier] ?? MODELS.pro;

  const upstream = await fetch(BANKR_LLM, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model.id,
      system: SYSTEM,
      messages,
      max_tokens: model.maxTokens,
      stream: true,
    }),
  });

  if (!upstream.ok) {
    const err = await upstream.text();
    return NextResponse.json({ error: `Bankr LLM error: ${upstream.status}`, detail: err }, { status: upstream.status });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
