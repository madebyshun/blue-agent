/**
 * GET /api/devices/agent — is the linked wallet's agent running tools right
 * now? Polled fast by a device ONLY while the feed says a session is live
 * (lib/device-agent.ts explains the KV budget behind that rule). Read scope.
 */
import { NextResponse, type NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { readAgentState } from "@/lib/device-agent";
import { NO_STORE, requireDevice } from "@/lib/device-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireDevice(req);
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(`device:${auth.device.id}`, "device");
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });
  const state = await readAgentState(auth.device.wallet);
  if (!state) return NextResponse.json({ error: "Agent state unavailable right now." }, { status: 503, headers: NO_STORE });
  return NextResponse.json(state, { headers: NO_STORE });
}
