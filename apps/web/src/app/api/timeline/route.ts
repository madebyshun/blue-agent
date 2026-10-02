/**
 * /api/timeline — the wallet's one timeline (lib/activity.ts).
 *
 * GET  → { items, unavailable: string[] } newest first: fired alerts, signed
 *        trades (with the pre-trade verdict they went through), automation
 *        checks, recurring-task runs, pre-trade BLOCKs. A source that could
 *        not be read is NAMED in `unavailable`, never silently dropped.
 * POST → { kind: "task_run" | "task_failed", label, text } — a FOREGROUND
 *        recurring run reported by the browser that ran it (background runs
 *        are written by the cron tick itself). It lands only in this wallet's
 *        own private feed, so a forged entry can mislead nobody but its author.
 *
 * Wallet from the SIWE session only — same rule as /api/watches.
 */
import { NextRequest, NextResponse } from "next/server";
import { readSession } from "@/lib/session";
import { normalizeWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { rateLimit } from "@/lib/rate-limit";
import { pushFeed } from "@/lib/activity";
import { buildTimeline } from "@/lib/timeline";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

async function requireWallet(req: NextRequest): Promise<{ wallet: string } | { res: NextResponse }> {
  const session = await readSession(req);
  if (session.status === "unavailable") return { res: NextResponse.json({ error: "Could not verify session." }, { status: 503, headers: NO_STORE }) };
  if (session.status === "anonymous") return { res: NextResponse.json({ error: "Sign in with your wallet to see your activity." }, { status: 401, headers: NO_STORE }) };
  const claimed = normalizeWallet(new URL(req.url).searchParams.get("address"));
  if (claimed && claimed !== session.wallet.toLowerCase()) {
    const r = actingWalletRefusal({ status: "mismatch", sessionWallet: session.wallet });
    r.headers.set("Cache-Control", "no-store");
    return { res: r };
  }
  return { wallet: session.wallet.toLowerCase() };
}

export async function GET(req: NextRequest) {
  const auth = await requireWallet(req);
  if ("res" in auth) return auth.res;
  const { items, unavailable } = await buildTimeline(auth.wallet);
  return NextResponse.json({ items, unavailable }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const auth = await requireWallet(req);
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(auth.wallet, "hub");
  if (!rl.success) return NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: NO_STORE }); }
  const kind = b.kind === "task_run" || b.kind === "task_failed" ? b.kind : null;
  const label = typeof b.label === "string" ? b.label.slice(0, 80) : "";
  const text = typeof b.text === "string" ? b.text.replace(/\s+/g, " ").slice(0, 280) : "";
  if (!kind || !label) return NextResponse.json({ error: "send { kind: task_run | task_failed, label, text }" }, { status: 400, headers: NO_STORE });
  await pushFeed(auth.wallet, [{ at: Date.now(), kind, text: `${label}${text ? ` — ${text}` : ""}` }]);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
