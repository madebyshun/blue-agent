/**
 * /api/debug-bankr — Test BANKR_API_KEY live
 * GET → tests Bankr LLM and returns exact error if any
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const key = process.env.BANKR_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "BANKR_API_KEY not set in Vercel env vars" });
  }

  try {
    const r = await fetch("https://llm.bankr.bot/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        system: "You are a test. Reply with the word OK only.",
        messages: [{ role: "user", content: "ping" }],
        max_tokens: 10,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await r.text();
    if (r.ok) {
      return NextResponse.json({ ok: true, status: r.status, response: JSON.parse(body) });
    }
    return NextResponse.json({ ok: false, status: r.status, error: body });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
