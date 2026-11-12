/**
 * Cron: compose @blueagent_ drafts and send them to ShunTr on Telegram
 * (lib/xdrafts/compose.ts). Runs 00:00 and 13:00 UTC (07:00 / 20:00 Vietnam).
 * Never posts to X. Sends only to the chat stored by `/drafts on`, which the
 * bot accepts only from X_DRAFTS_OWNER_TG_ID. `?slot=0|13` forces a slot.
 * Auth: `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends).
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet } from "@/lib/kv";
import { sendMessage } from "@/lib/telegram/bot";
import { KV_DRAFTS_CHAT, draftsFor, telegramText } from "@/lib/xdrafts/compose";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return (req.headers.get("authorization") ?? "") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const now = new Date();
  const forced = req.nextUrl.searchParams.get("slot");
  const slot: 0 | 13 = forced === "13" ? 13 : forced === "0" ? 0 : now.getUTCHours() >= 12 ? 13 : 0;
  const chat = await kvGet<{ chatId: number }>(KV_DRAFTS_CHAT);
  if (!chat) return NextResponse.json({ status: "skipped", reason: "no chat enrolled; send /drafts on to the bot" });
  const drafts = await draftsFor(now, slot);
  const sent = [];
  for (const d of drafts) {
    const r = await sendMessage(chat.chatId, telegramText(d, now));
    sent.push({ kind: d.kind, ok: r.ok, error: "error" in d ? d.error : undefined });
  }
  return NextResponse.json({ status: "ok", slot, sent });
}

export const POST = GET;
