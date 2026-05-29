/**
 * /api/debug-bankr — Diagnose Bankr x402 + LLM
 * GET → tests Bankr LLM key
 * GET ?tool=ecosystem-digest → tests if Bankr x402 handler is registered
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const X402_BASE = "https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5";

export async function GET(req: NextRequest) {
  const tool = req.nextUrl.searchParams.get("tool");

  // ── Test Bankr LLM key ──────────────────────────────────────────────────
  const key = process.env.BANKR_API_KEY;
  const llmResult: Record<string, unknown> = { key_set: !!key };

  if (key) {
    try {
      const r = await fetch("https://llm.bankr.bot/v1/messages", {
        method: "POST",
        headers: { "x-api-key": key, "Content-Type": "application/json", "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-haiku-4-5", system: "Reply OK only.", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
        signal: AbortSignal.timeout(8000),
      });
      const body = await r.text();
      llmResult.status = r.status;
      llmResult.ok = r.ok;
      llmResult.response = r.ok ? JSON.parse(body)?.content?.[0]?.text : body.slice(0, 200);
    } catch (e) { llmResult.error = (e as Error).message; }
  }

  // ── Test Bankr x402 handler (no payment → expect 402) ──────────────────
  let handlerResult: Record<string, unknown> = {};
  if (tool) {
    try {
      const r = await fetch(`${X402_BASE}/${tool}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test: true }),
        signal: AbortSignal.timeout(10_000),
      });
      const body = await r.text();
      let parsed: unknown;
      try { parsed = JSON.parse(body); } catch { parsed = body.slice(0, 300); }
      handlerResult = { status: r.status, body: parsed };
    } catch (e) { handlerResult = { error: (e as Error).message }; }
  }

  return NextResponse.json({
    llm: llmResult,
    ...(tool ? { handler: { tool, ...handlerResult } } : {}),
  });
}
