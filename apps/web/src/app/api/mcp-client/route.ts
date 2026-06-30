// Proxy for the Blue Chat Connectors UI. The browser can't reliably do the MCP
// JSON-RPC handshake against an arbitrary cross-origin server (CORS + auth-header
// exposure), so the "Add connector" panel POSTs here to TEST a server and fetch
// its tool list. Tool *execution* during chat happens inside /api/chat directly.
//
// Body: { url: string, headers?: Record<string,string> }
// Resp: { ok: true, tools: McpToolDef[] }  |  { ok: false, error: string }
import { NextRequest, NextResponse } from "next/server";
import { mcpListTools } from "@/lib/mcp-client";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  let body: { url?: string; headers?: Record<string, string> };
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 }); }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) return NextResponse.json({ ok: false, error: "Missing url" }, { status: 400 });

  // Only forward string→string headers (drop anything malformed the UI sent).
  const headers: Record<string, string> = {};
  if (body.headers && typeof body.headers === "object") {
    for (const [k, v] of Object.entries(body.headers))
      if (typeof v === "string" && v) headers[k] = v;
  }

  try {
    const tools = await mcpListTools({ url, headers });
    return NextResponse.json({ ok: true, tools });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message || "Failed to reach MCP server" },
      { status: 200 }, // 200 so the UI reads the error message cleanly
    );
  }
}
