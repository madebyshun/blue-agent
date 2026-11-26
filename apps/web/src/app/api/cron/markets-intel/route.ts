/**
 * Cron: BlueAgent Markets Intel v1 — unusual session volume scan.
 *
 * Scans NVDAc, AAPLc, and MSTRc on Base (8453) across completed full-hour
 * America/New_York trading windows, ingests qualifying events idempotently,
 * and delivers newly created drafts to the @blueagent_ owner Telegram chat
 * (if /drafts on is enabled). Draft only — never posts to X.
 */
import { NextRequest, NextResponse } from "next/server";
import { runIntelIngestion } from "@/lib/intel/ingest";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const daysParam = Number(req.nextUrl.searchParams.get("days") ?? "3");
  const daysBack = Number.isFinite(daysParam) ? Math.min(Math.max(Math.floor(daysParam), 1), 14) : 3;
  const scanAll = req.nextUrl.searchParams.get("all") === "1";
  try {
    const res = await runIntelIngestion({
      daysBack,
      batchSize: scanAll ? 0 : 4,
      persist: true,
      notifyTelegram: true,
    });
    return NextResponse.json({
      status: "ok",
      summary: res.summary,
      telegramNotified: res.telegramNotified,
    });
  } catch (e) {
    const msg = (e as Error).message.slice(0, 300);
    console.error(`[cron:markets-intel] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export const POST = GET;
