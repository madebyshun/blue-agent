/**
 * /api/watches — a wallet's price watches and the alerts they fired.
 *
 * GET              → { watches, alerts, seenAt, unread }   (`?unread=1` → { unread } only)
 * POST             → create one watch: { chain, token, kind, direction, threshold, window?, repeat? }
 * PATCH            → { id, active } pause/resume · { seen: true } mark every alert read
 * DELETE ?id=…     → remove one watch
 *
 * The wallet comes from the SIWE session ONLY — same rule and same reasons as
 * /api/chat/schedule: a watch is a standing instruction on someone's behalf,
 * and a body field naming the wallet would let anyone fill a stranger's alert
 * box. `?address=` is compared with the session (401 on mismatch), never used.
 *
 * The one other proof: a linked BlueBot's device token (Bearer bbt_…,
 * lib/devices.ts). It reads with `read`; it creates, pauses or deletes only
 * with the `alerts` scope the wallet's owner ticked when approving it. Marking
 * alerts seen needs only `read` — that is reading state, not a standing order.
 *
 * The CLIENT decides what to watch; the SERVER decides where its numbers come
 * from (`resolveWatchTarget`: registry/oracle for stock tokens, the deepest
 * base-side pool for everything else). A client cannot point a watch at a feed
 * or pool of its choosing.
 *
 * Free by decision (ShunTr 2026-10-01), so the cap is the abuse guard:
 * MAX_WATCHES_PER_WALLET, plus a per-wallet write rate limit.
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { readSession } from "@/lib/session";
import { normalizeWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { readAlerts, readWatches, mutateWatches, markSeen } from "@/lib/watches/store";
import { resolveWatchTarget, readReadings } from "@/lib/watches/prices";
import { MAX_WATCHES_PER_WALLET, describeWatch, type Watch } from "@/lib/watches/types";
import { parseRule, parseTrade, parseCheckAt } from "@/lib/watches/rules";
import { nextFireAt } from "@/lib/cron-schedule";
import { hasScope, type DeviceScope } from "@/lib/devices";
import { presentsDeviceToken, requireDevice } from "@/lib/device-auth";

export const runtime = "nodejs";
const NO_STORE = { "Cache-Control": "no-store" } as const;

type Caller = { wallet: string; device?: { id: string; scopes?: DeviceScope[] } };

async function requireWallet(req: NextRequest, scope: DeviceScope = "read"): Promise<Caller | { res: NextResponse }> {
  if (presentsDeviceToken(req)) {
    const d = await requireDevice(req, scope);
    if ("res" in d) return d;
    const rl = await rateLimit(`device:${d.device.id}`, "device");
    if (!rl.success) return { res: NextResponse.json({ error: "Too many requests." }, { status: 429, headers: NO_STORE }) };
    return { wallet: d.device.wallet, device: { id: d.device.id, scopes: d.device.scopes } };
  }
  const session = await readSession(req);
  if (session.status === "unavailable") {
    return { res: NextResponse.json({ error: "Could not verify session — store unavailable." }, { status: 503, headers: NO_STORE }) };
  }
  if (session.status === "anonymous") {
    return { res: NextResponse.json({ error: "Sign in with your wallet to use price alerts." }, { status: 401, headers: NO_STORE }) };
  }
  const claimed = normalizeWallet(new URL(req.url).searchParams.get("address"));
  if (claimed && claimed !== session.wallet.toLowerCase()) {
    const refusal = actingWalletRefusal({ status: "mismatch", sessionWallet: session.wallet });
    refusal.headers.set("Cache-Control", "no-store");
    return { res: refusal };
  }
  return { wallet: session.wallet.toLowerCase() };
}

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status, headers: NO_STORE });

export async function GET(req: NextRequest) {
  const auth = await requireWallet(req);
  if ("res" in auth) return auth.res;
  const a = await readAlerts(auth.wallet);
  if (a.status === "unavailable") return bad("Alerts unavailable right now — try again shortly.", 503);
  const unread = a.value.alerts.filter((x) => x.at > a.value.seenAt).length;
  if (new URL(req.url).searchParams.get("unread") === "1") {
    return NextResponse.json({ unread }, { headers: NO_STORE });
  }
  const w = await readWatches(auth.wallet);
  if (w.status === "unavailable") return bad("Watches unavailable right now — try again shortly.", 503);
  // Live readings call price APIs whose keyless quota the 5-minute tick
  // shares — rate-limited per wallet (the badge's `?unread=1` poll is not).
  if (new URL(req.url).searchParams.get("readings") === "1") {
    const rl = await rateLimit(auth.wallet, "hub");
    if (!rl.success) return NextResponse.json({ watches: w.value, alerts: a.value.alerts, seenAt: a.value.seenAt, unread, readings: undefined }, { headers: NO_STORE });
  }
  // `?readings=1` adds each watch's live price / 1h / 24h change (the same
  // read the tick makes) — for the Scheduled page, not for every poll.
  let readings: Record<string, unknown> | undefined;
  if (new URL(req.url).searchParams.get("readings") === "1" && w.value.length > 0) {
    try { readings = Object.fromEntries(await readReadings(w.value)); } catch { readings = undefined; }
  }
  return NextResponse.json({ watches: w.value, alerts: a.value.alerts, seenAt: a.value.seenAt, unread, readings }, { headers: NO_STORE });
}

export async function POST(req: NextRequest) {
  const auth = await requireWallet(req, "alerts");
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(auth.wallet, "hub");
  if (!rl.success) return bad("Too many changes — slow down.", 429);

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Invalid JSON body"); }
  const chain = b.chain === "base" || b.chain === "robinhood" ? b.chain : null;
  if (!chain) return bad("chain must be 'base' or 'robinhood'");
  if (typeof b.token !== "string" || !b.token.trim()) return bad("token is required");
  const rule = parseRule(b);
  if ("error" in rule) return bad(rule.error);
  const tr = parseTrade(b.trade);
  if ("error" in tr) return bad(tr.error);
  const ca = parseCheckAt(b.check_at);
  if ("error" in ca) return bad(ca.error);

  const existing = await readWatches(auth.wallet);
  if (existing.status === "unavailable") return bad("Watches unavailable right now — nothing was created.", 503);
  if (existing.value.length >= MAX_WATCHES_PER_WALLET) return bad(`You already have ${MAX_WATCHES_PER_WALLET} watches — delete one first.`, 422);

  const resolved = await resolveWatchTarget(chain, b.token);
  if ("error" in resolved) return bad(resolved.error, 422);
  const t = resolved.target;
  if (rule.kind === "change" && !t.pool) return bad("No pool to read a % change from for this token.", 422);

  const dup = existing.value.find((w) => w.chain === t.chain && w.token.toLowerCase() === t.token.toLowerCase()
    && w.kind === rule.kind && w.direction === rule.direction && w.threshold === rule.threshold && (w.window ?? null) === (rule.window ?? null)
    && JSON.stringify(w.trade ?? null) === JSON.stringify(tr.trade ?? null) && JSON.stringify(w.checkAt ?? null) === JSON.stringify(ca.checkAt ?? null));
  if (dup) return bad("You already have this exact watch.", 409);

  const now = Date.now();
  const watch: Watch = {
    ...t, ...rule,
    id: crypto.randomUUID(),
    // An automation asks its question every time it comes round, so it keeps
    // running unless told to stop after the first hit; a plain alert is
    // one-shot unless told to repeat.
    repeat: ca.checkAt ? b.repeat !== false : b.repeat === true,
    active: true, armed: true,
    createdAt: now,
    ...(tr.trade ? { trade: tr.trade } : {}),
    ...(ca.checkAt ? { checkAt: ca.checkAt, nextCheckAt: nextFireAt({ ...ca.checkAt }, now) } : {}),
  };
  // Re-checked inside the write: two concurrent creates must not both pass.
  const res = await mutateWatches(auth.wallet, (ws) => (ws.length >= MAX_WATCHES_PER_WALLET ? null : [...ws, watch]));
  if (res === "unchanged") return bad(`You already have ${MAX_WATCHES_PER_WALLET} watches — delete one first.`, 422);
  if (res !== "ok") return bad("Could not save the watch right now — nothing was created.", 503);
  return NextResponse.json({ watch, rule: describeWatch(watch), priceNow: resolved.priceNow }, { headers: NO_STORE });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireWallet(req);
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(auth.wallet, "hub");
  if (!rl.success) return bad("Too many changes — slow down.", 429);
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return bad("Invalid JSON body"); }
  if (b.seen !== true && auth.device && !hasScope(auth.device, "alerts")) {
    return bad("This link can't change alerts. Link BlueBot again and allow it on app.blueagent.dev/link.", 403);
  }
  if (b.seen === true) {
    // Up to the newest alert the page actually rendered (`upTo`), so one
    // written after it loaded stays unread; capped at now by markSeen.
    const upTo = typeof b.upTo === "number" && Number.isFinite(b.upTo) ? b.upTo : Date.now();
    await markSeen(auth.wallet, upTo);
    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  }
  if (typeof b.id !== "string" || typeof b.active !== "boolean") return bad("send { id, active } or { seen: true }");
  const active = b.active;
  // Resuming an automation schedules its next check from now, not from a
  // window that passed while it was paused.
  // Re-arm only on a real paused → active transition: "resuming" a watch that
  // is already active must not re-arm a disarmed repeat and fire it again.
  const res = await mutateWatches(auth.wallet, (ws) => {
    const hit = ws.find((w) => w.id === b.id);
    if (!hit || hit.active === active) return null;
    return ws.map((w) => (w.id === b.id
      ? { ...w, active, ...(active ? { armed: true } : {}), ...(active && w.checkAt ? { nextCheckAt: nextFireAt({ ...w.checkAt }, Date.now()) } : {}) }
      : w));
  });
  if (res === "failed") return bad("Could not save — try again.", 503);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireWallet(req, "alerts");
  if ("res" in auth) return auth.res;
  const rl = await rateLimit(auth.wallet, "hub");
  if (!rl.success) return bad("Too many changes — slow down.", 429);
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return bad("id is required");
  const res = await mutateWatches(auth.wallet, (ws) => (ws.some((w) => w.id === id) ? ws.filter((w) => w.id !== id) : null));
  if (res === "failed") return bad("Could not delete — try again.", 503);
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
