import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { CONSOLE_SYSTEMS } from "@/lib/console-systems";

export const runtime = "nodejs";
// 90s lets the upstream Bankr 75s ceiling resolve before Vercel kills us.
// Persona 2 was hitting 504 because the upstream fetch was unbounded — when
// Bankr stalled, this function got killed at the old 60s with no error msg.
export const maxDuration = 90;

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

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

  const system = CONSOLE_SYSTEMS[command as keyof typeof CONSOLE_SYSTEMS] ?? CONSOLE_SYSTEMS.idea;

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
