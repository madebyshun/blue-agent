/**
 * /api/exchange/usage — My Usage: everything the signed-in wallet paid for,
 * from our own records only. Blue Agent tools (x402 + MCP spend log), sellers it
 * hired through Hire Agent (their receipts as they answered), and its jobs.
 */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { getSpendLog } from "@/lib/wallet/spend-log";
import { readHires } from "@/lib/hub/listings";
import { listJobs, publicJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const maxDuration = 15;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const [spend, hires, jobs] = await Promise.all([getSpendLog(who.wallet), readHires(who.wallet), listJobs(200)]);
  const mine = (jobs ?? []).filter((j) => j.poster === who.wallet);
  const delivered = (jobs ?? []).flatMap((j) => j.deliveries.filter((d) => d.agent === who.wallet).map((d) => ({ jobId: j.id, title: j.title, priceUnits: d.priceUnits, unlocked: !!d.unlock, tx: d.unlock?.tx ?? null })));
  return NextResponse.json({
    wallet: who.wallet,
    blueAgent: spend,                                   // null = unreadable
    hires,
    jobsPosted: mine.map(publicJob),
    jobsDelivered: delivered,
  });
}
