/**
 * /api/connectors/coinbase — the wallet's read-only Coinbase connection
 * (lib/connectors/coinbase.ts). SIWE session only.
 *   GET    → { configured, connected, tools: [{ name, description }] }
 *   DELETE → forget the tokens (sign-in again to reconnect)
 * Tokens never leave the server; this only says whether one exists and which
 * read-only tools it unlocks.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/session";
import { disconnect, isConfigured, readOnlyTools } from "@/lib/connectors/coinbase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const NO_STORE = { "Cache-Control": "no-store" } as const;

async function wallet(req: NextRequest): Promise<string | NextResponse> {
  const s = await readSession(req);
  if (s.status === "unavailable") return NextResponse.json({ error: "Could not verify your session right now." }, { status: 503, headers: NO_STORE });
  if (s.status === "anonymous") return NextResponse.json({ error: "Sign in with your wallet first.", code: "AUTH_REQUIRED" }, { status: 401, headers: NO_STORE });
  return s.wallet.toLowerCase();
}

export async function GET(req: NextRequest) {
  const w = await wallet(req);
  if (typeof w !== "string") return w;
  if (!isConfigured()) return NextResponse.json({ configured: false, connected: false, tools: [] }, { headers: NO_STORE });
  const tools = await readOnlyTools(w);
  return NextResponse.json({
    configured: true,
    connected: tools !== null,
    tools: (tools ?? []).map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema })),
  }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const w = await wallet(req);
  if (typeof w !== "string") return w;
  await disconnect(w);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
