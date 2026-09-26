/**
 * Blue Hub — Collab Tool Builder
 * POST /api/hub/collab-builder
 *
 * Takes: agents[] + tool description
 * Returns: composite tool proposal — name, pipeline steps, inputs, pricing
 *
 * Uses the shared callLLM (Virtuals). The old Bankr-first / Anthropic-fallback
 * path was dead: llm.bankr.bot was 403-banned 2026-07-20 and the Anthropic
 * direct key is usually out of credit, so this route returned errors.
 */

import { NextRequest, NextResponse } from "next/server";
import { callLLM } from "@/app/api/_lib/llm";

// Only first-party agents get a profile. `aeon` and `miroshark` lines were
// removed 2026-09-27 — both are retired (ShunTr), and leaving them here meant
// a caller who passed them got a confident capability blurb for products that
// no longer exist. Unknown keys are NOT an error: the lookup below falls
// through to the raw string, which is correct for this route — it DESIGNS a
// workflow, so the roster is the caller's to choose, third-party agents
// included. Add an entry here only for agents we actually operate.
const AGENT_PROFILES: Record<string, string> = {
  blue: "Blue Agent — builder intelligence, security, fundraising, Base ecosystem context, x402 payments",
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
  "agents": ["<echo back the agent keys you were given above>"],
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

Use ONLY the agents listed above — never introduce one that was not supplied. If only one agent was supplied, "why_this_collab" must say so plainly rather than inventing a second party.

No markdown. No explanation. Raw JSON only.`;

  let text: string;
  try {
    text = (await callLLM({
      // No `model`: this route passed `"claude-haiku-4-5"`, which Virtuals has
      // never listed, so callLLM's catalog pre-flight threw and every request
      // answered 503. Omitting it takes VIRTUALS_DEFAULT_MODEL.
      system:    "You are Blue Agent — AI founder console for Base builders. Return ONLY raw JSON, no markdown, no preamble.",
      messages:  [{ role: "user", content: prompt }],
      maxTokens: 1200,
    })).text;
  } catch (e) {
    return NextResponse.json({ error: `LLM unavailable: ${(e as Error).message}` }, { status: 503 });
  }

  // Lenient parse — LLMs wrap JSON in fences / add preamble.
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = cleaned.indexOf("{"), end = cleaned.lastIndexOf("}");
  const raw = start >= 0 && end > start ? cleaned.slice(start, end + 1) : cleaned;

  try {
    return NextResponse.json({ ok: true, tool: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ error: "Failed to parse LLM response", raw: text }, { status: 500 });
  }
}
