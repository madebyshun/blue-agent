/**
 * Blue Hub — Collab Tool Builder
 * POST /api/hub/collab-builder
 *
 * Takes: agents[] + tool description
 * Returns: composite tool proposal — name, pipeline steps, inputs, pricing
 *
 * Uses Bankr LLM (falls back to Anthropic).
 */

import { NextRequest, NextResponse } from "next/server";

const BANKR_API_KEY     = process.env.BANKR_API_KEY ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const BANKR_LLM         = "https://llm.bankr.bot/v1/messages";
const ANTHROPIC_LLM     = "https://api.anthropic.com/v1/messages";

const AGENT_PROFILES: Record<string, string> = {
  blue:      "Blue Agent — builder intelligence, security, fundraising, Base ecosystem context, x402 payments",
  aeon:      "Aeon — market signals, token analysis, narrative tracking, on-chain data, CT sentiment",
  miroshark: "MiroShark — crowd intelligence, community sentiment, social signals, Farcaster + Telegram buzz",
};

export async function POST(req: NextRequest) {
  const body = await req.json() as {
    agents:      string[];
    description: string;
    category?:   string;
  };

  const { agents, description, category } = body;
  if (!agents?.length || !description?.trim()) {
    return NextResponse.json({ error: "agents[] and description are required" }, { status: 400 });
  }

  const agentContext = agents
    .map(a => `- ${AGENT_PROFILES[a] ?? a}`)
    .join("\n");

  const prompt = `You are Blue Agent — AI founder console for Base builders.

A builder wants to create a new collaborative tool using these agents:
${agentContext}

Tool description: "${description}"
${category ? `Category hint: ${category}` : ""}

Design a concrete, actionable composite tool proposal. Be specific — this is for builders who will actually build it.

Return ONLY valid JSON with this exact structure:
{
  "name": "Tool name (2-4 words, punchy)",
  "tagline": "One sentence — what it does and for whom",
  "category": "intelligence | builder | trading | content | agent-economy | security",
  "agents": ["blue", "aeon", "miroshark"],
  "price": "$0.XX",
  "pipeline": [
    { "step": 1, "agent": "agent name", "action": "what this agent does", "output": "what it produces" },
    { "step": 2, "agent": "agent name", "action": "what this agent does", "output": "what it produces" },
    { "step": 3, "agent": "agent name", "action": "synthesizes + final output", "output": "final deliverable" }
  ],
  "inputs": [
    { "key": "field_key", "label": "Human label", "placeholder": "example value", "required": true }
  ],
  "output_format": "What the final output looks like — report, score, signal, etc.",
  "why_this_collab": "1-2 sentences on why these agents together are better than one alone",
  "base_native": "How this tool is specifically useful for Base builders/traders"
}

No markdown. No explanation. Raw JSON only.`;

  const bodyPayload = JSON.stringify({
    model:      "claude-haiku-4-5",
    max_tokens: 1200,
    messages:   [{ role: "user", content: prompt }],
  });

  const headers = {
    "Content-Type":      "application/json",
    "anthropic-version": "2023-06-01",
  };

  // Try Bankr first
  if (BANKR_API_KEY) {
    const res = await fetch(BANKR_LLM, {
      method:  "POST",
      headers: { ...headers, "x-api-key": BANKR_API_KEY },
      body:    bodyPayload,
      signal:  AbortSignal.timeout(30000),
    });
    if (res.ok) {
      const data = await res.json() as { content?: { text?: string }[] };
      const text = data.content?.[0]?.text ?? "{}";
      try {
        return NextResponse.json({ ok: true, tool: JSON.parse(text) });
      } catch { /* fall through */ }
    }
  }

  // Fallback: Anthropic
  if (!ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "No LLM available" }, { status: 503 });
  }

  const res = await fetch(ANTHROPIC_LLM, {
    method:  "POST",
    headers: { ...headers, "x-api-key": ANTHROPIC_API_KEY },
    body:    bodyPayload,
    signal:  AbortSignal.timeout(30000),
  });

  if (!res.ok) {
    return NextResponse.json({ error: `LLM error: ${res.status}` }, { status: 500 });
  }

  const data = await res.json() as { content?: { text?: string }[] };
  const text = data.content?.[0]?.text ?? "{}";

  try {
    return NextResponse.json({ ok: true, tool: JSON.parse(text) });
  } catch {
    return NextResponse.json({ error: "Failed to parse LLM response", raw: text }, { status: 500 });
  }
}
