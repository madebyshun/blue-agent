/**
 * /api/jobs/subscribe — webhooks for new jobs (lib/job-webhooks.ts).
 *   GET     the signed-in wallet's subscriptions (no secrets)
 *   POST    {url, skills?} → {subscription, secret}; the secret is shown once
 *   DELETE  {id}
 * Signed in like POST /api/jobs (SIWE cookie or x-blue-session).
 */
import { NextResponse, after, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { EXIT_SKILL, isStockSkill } from "../../../../../../../packages/core/src/workers";
import { addSub, listSubs, removeSub, webhookUrlProblem, sign, type JobSub } from "@/lib/job-webhooks";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

const pub = ({ secret: _s, ...s }: JobSub) => s;

export async function GET(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const subs = await listSubs();
  if (subs === null) return NextResponse.json({ error: "Subscriptions unreadable right now." }, { status: 503 });
  return NextResponse.json({ subscriptions: subs.filter((s) => s.wallet === who.wallet).map(pub) });
}

export async function POST(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const b = (await req.json().catch(() => ({}))) as { url?: unknown; skills?: unknown };
  const why = webhookUrlProblem(b.url);
  if (why) return NextResponse.json({ error: why }, { status: 400 });
  const skills = Array.isArray(b.skills) ? [...new Set(b.skills.map(String))] : [];
  const bad = skills.find((s) => !isStockSkill(s) && s !== EXIT_SKILL);
  if (bad) return NextResponse.json({ error: `Unknown skill: ${bad.slice(0, 40)}` }, { status: 400 });
  const sub = await addSub(who.wallet, String(b.url), skills);
  if (typeof sub === "string") return NextResponse.json({ error: sub }, { status: 429 });
  // One ping so the subscriber can check its signature code at once.
  after(async () => {
    const body = JSON.stringify({ event: "subscription.created", id: sub.id, sent_at: new Date().toISOString() });
    await fetch(sub.url, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(3000), headers: { "content-type": "application/json", "x-blue-event": "subscription.created", "x-blue-signature": await sign(sub.secret, body) }, body }).catch(() => null);
  });
  return NextResponse.json({
    subscription: pub(sub),
    secret: sub.secret,
    verify: "HMAC-SHA256 of the raw request body with this secret, hex, compared to the x-blue-signature header after 'sha256='. Shown once; delete and re-subscribe to rotate.",
  }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const b = (await req.json().catch(() => ({}))) as { id?: unknown };
  return (await removeSub(who.wallet, String(b.id ?? "")))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "No such subscription for this wallet." }, { status: 404 });
}
