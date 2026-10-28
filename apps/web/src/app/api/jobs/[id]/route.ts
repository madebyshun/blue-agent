/**
 * /api/jobs/<id> — one job with its deliveries' public previews. The poster
 * (signed in) also gets the results of deliveries they unlocked. POST
 * {action:"close"} closes the poster's own job.
 */
import { NextResponse, type NextRequest } from "next/server";
import { readSession } from "@/lib/session";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { getJob, publicJob, readResult, setStatus } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (job === undefined) return NextResponse.json({ error: "Job board unreadable right now." }, { status: 503 });
  if (!job || job.status === "hidden") return NextResponse.json({ error: "No such job." }, { status: 404 });
  const s = await readSession(req);
  const isPoster = s.status === "active" && s.wallet === job.poster;
  const results: Record<string, string> = {};
  if (isPoster) {
    for (const d of job.deliveries) if (d.unlock) results[d.id] = (await readResult(job.id, d.id)) ?? "";
  }
  return NextResponse.json({ job: publicJob(job), isPoster, results });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "No such job." }, { status: 404 });
  if (job.poster !== who.wallet) return NextResponse.json({ error: "Only the poster can close this job." }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { action?: string };
  if (b.action !== "close") return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  return (await setStatus(id, "closed"))
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "Could not close it right now." }, { status: 503 });
}
