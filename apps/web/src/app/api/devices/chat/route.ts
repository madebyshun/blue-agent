/**
 * POST /api/devices/chat — a linked BlueBot chatting AS the wallet that
 * approved it (scope `chat`), on that wallet's credits, under the per-device
 * daily cap the owner set on the approve screen (lib/devices.ts).
 *
 *   body { messages: [{ role, content }], tier? }  → the /api/chat SSE stream
 *
 * It is a thin forwarder, the same way cron/run is: the chat pipeline, its
 * presets, tools and credit debit stay in ONE place (/api/chat), reached with
 * the internal key + x-blue-user for the wallet THE TOKEN names — never a
 * wallet from the body.
 *
 * The cap: before forwarding, the message's own price (chatCreditCost, the
 * same function /api/chat bills with) must fit under what is left today. It
 * is then counted, plus every tool's `credits` as `tool_done` events stream
 * past. A message refused before any answer (`insufficient_credits`,
 * `upstream_error` with no text) gives its count back. A tool mid-answer can
 * push a device past its cap once; the NEXT message is then refused. The
 * wallet's own ledger is what charges — this only bounds what a device may
 * spend of it.
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { resolvePresetDispatch } from "@/app/chat/components/presets";
import { addDeviceSpend, deviceSpentToday } from "@/lib/devices";
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

async function messageCost(wallet: string, tier: string): Promise<number> {
  const { fetchBlueBalance, getTierInfo } = await import("@/lib/credits");
  const { chatCreditCost } = await import("@/lib/credit-pricing");
  return chatCreditCost(tier, getTierInfo(await fetchBlueBalance(wallet)));
}

const refuse = (error: string, status: number, code?: string, extra?: Record<string, unknown>) =>
  NextResponse.json({ error, ...(code ? { code } : {}), ...extra }, { status, headers: NO_STORE });

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

  const cap = d.chatDailyCap ?? 0;
  const spent = await deviceSpentToday(d.id);
  if (spent == null) return refuse("Could not read this device's daily limit right now. Nothing was charged.", 503);
  const cost = await messageCost(d.wallet, tier);
  if (spent + cost > cap) {
    return refuse(
      `This BlueBot has used ${spent} of its ${cap} credits for today. Raise the limit on app.blueagent.dev/link, pick a cheaper preset, or wait for 00:00 UTC. Nothing was charged.`,
      402, "DEVICE_CAP", { cap, spent, needed: cost },
    );
  }

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

  await addDeviceSpend(d.id, cost);
  const reader = upstream.body.getReader();
  const dec = new TextDecoder();
  let buf = "", sawText = false, refunded = false, toolCredits = 0;

  const scan = (chunk: string) => {
    buf += chunk;
    let i: number;
    while ((i = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      const raw = line.slice(5).trim();
      if (!raw || raw === "[DONE]") continue;
      try {
        const ev = JSON.parse(raw) as { type?: string; credits?: number; delta?: { text?: string } };
        if (typeof ev.delta?.text === "string" && ev.delta.text) sawText = true;
        if (ev.type === "tool_done" && typeof ev.credits === "number" && ev.credits > 0) toolCredits += ev.credits;
        if ((ev.type === "insufficient_credits" || ev.type === "upstream_error") && !sawText && !refunded && toolCredits === 0) {
          refunded = true;
          void addDeviceSpend(d.id, -cost);
        }
      } catch { /* keepalives and partial lines */ }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        if (toolCredits > 0) await addDeviceSpend(d.id, toolCredits);
        controller.close();
        return;
      }
      scan(dec.decode(value, { stream: true }));
      controller.enqueue(value);
    },
    async cancel() {
      if (toolCredits > 0) await addDeviceSpend(d.id, toolCredits);
      await reader.cancel().catch(() => {});
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", Connection: "keep-alive" },
  });
}
