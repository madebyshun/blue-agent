/**
 * Blue Agent — Memory API
 * Server-side memory store (in-process Map, scoped by wallet).
 * Client can GET/POST to sync server notes (agent-written context).
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// Simple in-process store (survives restarts in dev; use KV in prod for persistence)
const memoryStore = new Map<string, Record<string, unknown>>();

export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "anon";
  const data = memoryStore.get(wallet) ?? {};
  return NextResponse.json({ wallet, memory: data });
}

export async function POST(req: NextRequest) {
  let body: { wallet?: string; key: string; value: unknown } = { key: "", value: null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const wallet = body.wallet ?? "anon";
  const existing = memoryStore.get(wallet) ?? {};
  const updated = { ...existing, [body.key]: body.value, updatedAt: Date.now() };
  memoryStore.set(wallet, updated);

  return NextResponse.json({ ok: true, wallet, memory: updated });
}

export async function DELETE(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet") ?? "anon";
  memoryStore.delete(wallet);
  return NextResponse.json({ ok: true, wallet });
}
