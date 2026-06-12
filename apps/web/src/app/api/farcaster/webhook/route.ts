/**
 * Farcaster / Base App Mini App webhook.
 *
 * The mini-app manifest (public/.well-known/farcaster.json → frame.webhookUrl)
 * points the host (Base App / Farcaster) here. The host POSTs a signed event
 * envelope when a user adds/removes the app or toggles notifications:
 *
 *   { header, payload, signature }   // each base64url
 *
 * where the decoded `payload` is one of:
 *   { event: "frame_added",            notificationDetails?: { url, token } }
 *   { event: "frame_removed" }
 *   { event: "notifications_enabled",  notificationDetails: { url, token } }
 *   { event: "notifications_disabled" }
 *
 * This is a minimal, resilient handler: it always returns 200 so manifest
 * validation and the host never see an error, decodes the event best-effort,
 * and is the single place to later persist notification tokens (e.g. to KV)
 * when we start sending mini-app notifications. We intentionally do NOT verify
 * the signature here yet — no privileged action is taken on these events.
 */
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function b64urlToJson(b64url: string): unknown {
  try {
    const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => null)) as { payload?: string } | null;
    const event = body?.payload ? b64urlToJson(body.payload) : null;

    // Best-effort: surface the event type in logs. Token persistence (for
    // sending notifications) can hook in here later — keyed off
    // notificationDetails.{url,token} on frame_added / notifications_enabled.
    const type = (event as { event?: string } | null)?.event ?? "unknown";
    console.log(`[farcaster/webhook] event: ${type}`);

    return NextResponse.json({ ok: true });
  } catch {
    // Never fail the host — always ack.
    return NextResponse.json({ ok: true });
  }
}

// Some validators probe the webhook with GET; ack so it never 404s.
export function GET() {
  return NextResponse.json({ ok: true, service: "farcaster-webhook" });
}
