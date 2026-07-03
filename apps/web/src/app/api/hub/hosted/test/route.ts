/**
 * POST /api/hub/hosted/test — dry-run a hosted-tool config before registering.
 *
 * The /hub/submit form calls this so a creator can see what their ai_tool prompt
 * or api_wrapper produces BEFORE they sign the manifest. It runs the tool once
 * with sample inputs and returns only the output — it does NOT persist anything,
 * does NOT charge, and does NOT echo the secret config back.
 *
 * Abuse controls: rate-limited; ai_tool goes through the same safety envelope as
 * production (runAiTool); api_wrapper is SSRF-guarded (runApiWrapper via
 * assertSafeMcpUrl). No payment path is touched here.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getIdentifier } from "@/lib/rate-limit";
import { assertSafeMcpUrl } from "@/lib/mcp-client";
import {
  runAiTool,
  runApiWrapper,
  type AiToolConfig,
  type ApiWrapperConfig,
} from "@/lib/hub-hosted";

export const runtime = "nodejs";
export const maxDuration = 120;

const MODEL_ALLOWLIST = new Set(["claude-haiku-4-5", "claude-sonnet-4-5"]);

const clamp = (n: unknown, lo: number, hi: number, def: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : def;
  return Math.min(hi, Math.max(lo, v));
};

interface TestBody {
  template: "ai_tool" | "api_wrapper";
  config:   Record<string, unknown>;
  inputs:   Record<string, unknown>;
}

export async function POST(req: NextRequest) {
  const { success } = await rateLimit(getIdentifier(req), "api");
  if (!success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  let body: TestBody;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const inputs = (body.inputs && typeof body.inputs === "object") ? body.inputs : {};
  const raw    = (body.config && typeof body.config === "object") ? body.config : {};

  if (body.template === "ai_tool") {
    const systemPrompt = typeof raw.systemPrompt === "string" ? raw.systemPrompt.trim() : "";
    if (!systemPrompt) {
      return NextResponse.json({ error: "ai_tool requires config.systemPrompt" }, { status: 400 });
    }
    const cfg: AiToolConfig = {
      kind:         "ai_tool",
      systemPrompt: systemPrompt.slice(0, 8000),
      model:        typeof raw.model === "string" && MODEL_ALLOWLIST.has(raw.model) ? raw.model : undefined,
      temperature:  clamp(raw.temperature, 0, 1, 0.7),
      maxTokens:    clamp(raw.maxTokens, 100, 2000, 900),
    };
    const run = await runAiTool(cfg, inputs);
    return NextResponse.json(
      { ok: run.ok, contentType: run.contentType, body: run.body, error: run.error },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (body.template === "api_wrapper") {
    const endpoint = typeof raw.endpoint === "string" ? raw.endpoint.trim() : "";
    try { assertSafeMcpUrl(endpoint); }
    catch (e) {
      return NextResponse.json({ error: `Invalid/blocked endpoint: ${(e as Error).message}` }, { status: 400 });
    }
    const cfg: ApiWrapperConfig = {
      kind:       "api_wrapper",
      endpoint,
      method:     raw.method === "GET" ? "GET" : "POST",
      authHeader: typeof raw.authHeader === "string" ? raw.authHeader.trim().slice(0, 80) || undefined : undefined,
      authValue:  typeof raw.authValue === "string" ? raw.authValue.slice(0, 2000) || undefined : undefined,
    };
    const run = await runApiWrapper(cfg, inputs);
    return NextResponse.json(
      { ok: run.ok, status: run.status, contentType: run.contentType, body: run.body, error: run.error },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({ error: "template must be ai_tool or api_wrapper" }, { status: 400 });
}
