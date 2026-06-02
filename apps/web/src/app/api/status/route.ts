/**
 * Blue Agent — Service Status Check
 * GET /api/status
 *
 * Checks: Bankr LLM, Venice AI, Hub tool reachability
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";

interface ServiceStatus {
  name:    string;
  ok:      boolean;
  latency: number | null;
  detail:  string;
}

async function ping(url: string, opts: RequestInit, label: string): Promise<ServiceStatus> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(8_000) });
    const latency = Date.now() - t0;
    if (res.status === 401) return { name: label, ok: false, latency, detail: "Invalid API key (401)" };
    if (res.status === 429) return { name: label, ok: false, latency, detail: "Rate limited (429)" };
    if (!res.ok)            return { name: label, ok: false, latency, detail: `HTTP ${res.status}` };
    return { name: label, ok: true, latency, detail: "OK" };
  } catch (e) {
    return { name: label, ok: false, latency: null, detail: (e as Error).message };
  }
}

export async function GET() {
  const bankrKey  = process.env.BANKR_API_KEY;
  const veniceKey = process.env.VENICE_API_KEY;

  const checks = await Promise.all([
    // Bankr — model list endpoint (lightweight, no token usage)
    bankrKey
      ? ping("https://llm.bankr.bot/v1/models", {
          headers: { "x-api-key": bankrKey, "anthropic-version": "2023-06-01" },
        }, "Bankr LLM")
      : Promise.resolve<ServiceStatus>({ name: "Bankr LLM", ok: false, latency: null, detail: "BANKR_API_KEY not set" }),

    // Venice — model list (free endpoint, verifies key)
    veniceKey
      ? ping("https://api.venice.ai/api/v1/models", {
          headers: { Authorization: `Bearer ${veniceKey}` },
        }, "Venice AI")
      : Promise.resolve<ServiceStatus>({ name: "Venice AI", ok: false, latency: null, detail: "VENICE_API_KEY not set" }),

    // Hub — internal health check
    ping(
      `${process.env.NEXT_PUBLIC_APP_URL ?? "https://blueagent.dev"}/api/health`,
      {},
      "Blue Hub"
    ),
  ]);

  const allOk = checks.every((c) => c.ok);

  return NextResponse.json(
    {
      status:   allOk ? "operational" : "degraded",
      services: checks,
      ts:       new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
