/**
 * Blue Chat — Cron Task Runner
 * Executes a stored cron prompt against the Bankr LLM and returns the plain-text result.
 * Called by ChatContext.runCron() when user clicks "run now" or on schedule.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const BANKR_LLM = "https://llm.bankr.bot/v1/messages";

const MODELS: Record<string, string> = {
  fast: "claude-haiku-4-5",
  pro:  "claude-sonnet-4-6",
  max:  "claude-sonnet-4-6",
};

const SYSTEM = `You are Blue Agent — a Base-native AI assistant for builders and traders.
Execute the given task concisely. If it's a slash command like /pick, /scan, or /idea, respond with a structured output.
Keep your response under 500 words unless the task explicitly requires more. Be direct and actionable.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { prompt?: string; tier?: string };
    const prompt = (body.prompt ?? "").trim();
    const tier   = body.tier ?? "pro";

    if (!prompt) {
      return NextResponse.json({ error: "prompt required" }, { status: 400 });
    }

    const apiKey = process.env.BANKR_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "BANKR_API_KEY not configured" }, { status: 500 });
    }

    const modelId  = MODELS[tier] ?? MODELS.pro;
    const maxTokens = tier === "max" ? 2048 : 1024;

    const res = await fetch(BANKR_LLM, {
      method: "POST",
      headers: {
        "Content-Type":  "application/json",
        "x-api-key":     apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      modelId,
        max_tokens: maxTokens,
        system:     SYSTEM,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(55_000),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      return NextResponse.json({ error: `LLM error: ${err}` }, { status: 502 });
    }

    const data = await res.json() as {
      content?: Array<{ type: string; text?: string }>;
    };

    const result = data.content
      ?.filter(c => c.type === "text")
      .map(c => c.text ?? "")
      .join("") ?? "";

    return NextResponse.json({ result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
