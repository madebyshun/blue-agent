/**
 * Blue Agent — Health Check
 * Referenced in /.well-known/agent.json
 * Used by external agents to verify Blue Agent is up before integrating.
 */
import { NextResponse } from "next/server";
import { isKVEnabled } from "@/lib/kv";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 10;

const START_TIME = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  // Test Bankr LLM live
  let bankrLLM: string = "missing_key";
  const bankrKey = process.env.BANKR_API_KEY;
  if (bankrKey) {
    try {
      const r = await fetch("https://llm.bankr.bot/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": bankrKey,
          "Content-Type": "application/json",
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          system: "Reply ok.",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 5,
        }),
        signal: AbortSignal.timeout(8000),
      });
      if (r.ok) {
        bankrLLM = "ok";
      } else {
        const txt = await r.text().catch(() => "");
        bankrLLM = `error_${r.status}: ${txt.slice(0, 80)}`;
      }
    } catch (e) {
      bankrLLM = `unreachable: ${(e as Error).message.slice(0, 60)}`;
    }
  }

  return NextResponse.json({
    status:   "ok",
    agent:    "Blue Agent",
    version:  "1.0.0",
    network:  "base",
    chain_id: 8453,
    uptime_seconds: uptime,
    services: {
      kv:        isKVEnabled() ? "connected" : "fallback",
      bankr_key: bankrKey ? "set" : "MISSING",
      bankr_llm: bankrLLM,
    },
    endpoints: {
      web:     "https://blueagent.dev",
      signal:  "https://blueagent.dev/api/signal",
      webhook: "https://blueagent.dev/api/webhook/aeon",
      signals: "https://blueagent.dev/api/signals",
      docs:    "https://blueagent.dev/docs",
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
