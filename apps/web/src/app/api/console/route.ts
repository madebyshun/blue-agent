import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";

export const runtime = "nodejs";
// 90s lets the upstream Bankr 75s ceiling resolve before Vercel kills us.
// Persona 2 was hitting 504 because the upstream fetch was unbounded — when
// Bankr stalled, this function got killed at the old 60s with no error msg.
export const maxDuration = 90;

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

const COMMAND_SYSTEMS: Record<string, string> = {
  idea: `You are Blue Agent running the 'blue idea' command.
Turn the user's rough concept into a structured fundable brief:
1. Problem & insight
2. Why now, why Base
3. Target user & GTM
4. MVP scope (what's in / what's out)
5. Key risks and mitigations
6. First 24 hours: a concrete action plan
Constraint: the ONLY timeframe in this brief is the first 24 hours. Do not invent
multi-day, multi-week, or multi-month MVP timelines or roadmaps, and never state a
build duration in weeks. Keep all scope and timing internally consistent.
Be specific, actionable, and Base-native. No fluff.`,

  build: `You are Blue Agent running the 'blue build' command.
Generate a complete technical build plan:
1. Architecture overview
2. Tech stack with reasoning
3. Folder structure
4. Key integrations (Base, Bankr, x402, etc.)
5. Implementation steps in order
6. Test plan
Use real Base ecosystem tools. Never invent contract addresses.`,

  audit: `You are Blue Agent running the 'blue audit' command.
Perform a thorough security and product risk review:
1. Critical security issues (reentrancy, oracle, MEV, access control)
2. Product/logic risks
3. Base-specific risks (chain ID, USDC decimals, Coinbase Wallet compat)
4. Suggested fixes for each issue
5. Go / No-go recommendation
Be direct and specific. Flag anything that could cause loss of funds.`,

  ship: `You are Blue Agent running the 'blue ship' command.
Generate a complete deployment and launch checklist:
1. Pre-deploy checklist (tests, audits, env vars)
2. Deployment steps for Base mainnet
3. Verification steps (Basescan, contracts, APIs)
4. Release notes template
5. Post-launch monitoring plan
Be thorough. Cover what founders forget when they're excited to ship.`,

  raise: `You are Blue Agent running the 'blue raise' command.
Write a compelling fundraising narrative:
1. Market framing and why this wins
2. Traction and proof points
3. Why Base, why now
4. Team and unfair advantages
5. Ask, use of funds, milestones
6. Target investor profile
Be sharp and investor-ready. No generic startup speak.`,
};

export async function POST(req: NextRequest) {
  // Rate limit: 10 commands/min per IP
  const { success } = await rateLimit(getIdentifier(req), "console");
  if (!success) {
    return NextResponse.json({ error: "Too many requests. Slow down." }, { status: 429 });
  }

  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "BANKR_API_KEY not configured." }, { status: 500 });
  }

  let body: { command?: string; prompt?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { command, prompt } = body;
  if (!command || !prompt?.trim()) {
    return NextResponse.json({ error: "command and prompt are required." }, { status: 400 });
  }

  const system = COMMAND_SYSTEMS[command] ?? COMMAND_SYSTEMS.idea;

  // 75s ceiling on the upstream LLM call. If Bankr hangs we surface a 502
  // with a clear message instead of letting Vercel kill the function silently
  // (which used to bubble up as a 504 to MCP clients).
  let upstream: Response;
  try {
    upstream = await fetch(BANKR_LLM, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        system,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1500,
      }),
      signal: AbortSignal.timeout(75_000),
    });
  } catch (e) {
    const msg = (e as Error).name === "TimeoutError"
      ? "Bankr LLM did not respond within 75s. This is an upstream issue — retry in a moment, or DM @blueagent_ if it persists."
      : `Bankr LLM unreachable: ${(e as Error).message}`;
    return NextResponse.json({ error: msg }, { status: 502 });
  }

  if (!upstream.ok) {
    const err = await upstream.text();
    return NextResponse.json(
      { error: `Bankr LLM error: ${upstream.status}`, detail: err.slice(0, 300) },
      { status: 502 }
    );
  }

  const data = await upstream.json();
  const result = data.content?.[0]?.text ?? data.text ?? "";
  if (!result) {
    return NextResponse.json({ error: "Bankr returned an empty response. Likely credit / rate-limit issue." }, { status: 502 });
  }
  return NextResponse.json({ result });
}
