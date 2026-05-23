/**
 * Blue Agent — Health Check
 * Referenced in /.well-known/agent.json
 * Used by external agents to verify Blue Agent is up before integrating.
 */
import { NextResponse } from "next/server";
import { isKVEnabled } from "@/lib/kv";

export const runtime = "nodejs";

const START_TIME = Date.now();

export async function GET() {
  const uptime = Math.floor((Date.now() - START_TIME) / 1000);

  return NextResponse.json({
    status:   "ok",
    agent:    "Blue Agent",
    version:  "1.0.0",
    network:  "base",
    chain_id: 8453,
    uptime_seconds: uptime,
    services: {
      kv:      isKVEnabled() ? "connected" : "fallback",
      bankr:   !!process.env.BANKR_API_KEY ? "configured" : "missing",
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
