/**
 * GET /api/devices/feed — what a linked BlueBot shows: the wallet's timeline
 * (lib/timeline.ts), read with the device's read-only token. It can read and
 * nothing else; a fired automation is opened on the web, where the wallet
 * signs (`open_url`).
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { FEED_POLL_S } from "@/lib/devices";
import { buildTimeline } from "@/lib/timeline";
import { NO_STORE, requireDevice } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALERTS_CHAT = "https://app.blueagent.dev/chat?alerts=1";

export async function GET(req: NextRequest) {
  const auth = await requireDevice(req);
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(`device:${auth.device.id}`, "device");
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });
  const { items, unavailable } = await buildTimeline(auth.device.wallet, 30);
  const w = auth.device.wallet;
  return NextResponse.json({
    wallet: `${w.slice(0, 6)}…${w.slice(-4)}`,
    device: { id: auth.device.id, name: auth.device.name },
    items: items.map((i) => (i.kind === "alert" ? { ...i, open_url: ALERTS_CHAT } : i)),
    unavailable,
    next_poll_s: FEED_POLL_S,
  }, { headers: NO_STORE });
}
