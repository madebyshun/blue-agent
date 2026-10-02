/**
 * POST /api/devices/chat — a linked BlueBot chatting AS the wallet that
 * approved it (scope `chat`), on that wallet's credits. There is no
 * per-device cap: the balance is the limit, and /api/chat's own debit
 * answers `insufficient_credits` when it runs out, as it does on Blue Chat.
 *
 *   body { messages: [{ role, content }], tier? }  → the /api/chat SSE stream
 *
 * It is a thin forwarder, the same way cron/run is: the chat pipeline, its
 * presets, tools and credit debit stay in ONE place (/api/chat), reached with
 * the internal key + x-blue-user for the wallet THE TOKEN names — never a
 * wallet from the body.
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { resolvePresetDispatch } from "@/app/chat/components/presets";
import { NO_STORE, requireDevice } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_MESSAGES = 30;
const MAX_CHARS = 8_000;

type Msg = { role: "user" | "assistant"; content: string };

function cleanMessages(raw: unknown): Msg[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const out: Msg[] = [];
  for (const m of raw.slice(-MAX_MESSAGES)) {
    const r = (m as Record<string, unknown>)?.role, c = (m as Record<string, unknown>)?.content;
    if ((r !== "user" && r !== "assistant") || typeof c !== "string" || !c.trim()) continue;
    out.push({ role: r, content: c.slice(0, MAX_CHARS) });
  }
  return out.length && out[out.length - 1].role === "user" ? out : null;
}

const refuse = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function POST(req: NextRequest) {
  const auth = await requireDevice(req, "chat");
  if ("res" in auth) return auth.res;
  const d = auth.device;
  const rl = await rateLimit(`device-chat:${d.id}`, "device");
  if (!rl.success) return refuse("Too many messages. Wait a minute.", 429);

  const key = process.env.INTERNAL_SERVICE_KEY ?? "";
  if (!key) return refuse("Chat from a linked device is not available on this server.", 503);

  let b: Record<string, unknown> = {};
  try { b = await req.json(); } catch { return refuse("Invalid JSON body.", 400); }
  const messages = cleanMessages(b.messages);
  if (!messages) return refuse("Send at least one message, ending with yours.", 400);
  const tier = typeof b.tier === "string" && /^[a-z0-9_-]{1,24}$/.test(b.tier) ? b.tier : "balanced";

  const dispatch = resolvePresetDispatch(tier);
  const upstream = await fetch(`${new URL(req.url).origin}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-blue-internal": key, "x-blue-user": d.wallet },
    body: JSON.stringify({
      messages, tier, address: d.wallet,
      provider: dispatch.provider,
      ...(dispatch.modelId ? { modelId: dispatch.modelId } : {}),
      ...(dispatch.webSearch ? { webSearch: true } : {}),
    }),
    signal: AbortSignal.timeout(115_000),
  }).catch(() => null);
  if (!upstream || !upstream.ok || !upstream.body) {
    return refuse("Blue Agent could not answer right now. Nothing was charged.", 502);
  }

  return new Response(upstream.body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" },
  });
}
