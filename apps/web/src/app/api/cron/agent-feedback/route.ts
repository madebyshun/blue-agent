/**
 * Cron: write queued ERC-8004 reputation feedback for paid job unlocks
 * (lib/agent-feedback.ts). Every 30 minutes; at most 5 per run. Does nothing
 * but report until ShunTr sets AGENT_FEEDBACK_PRIVATE_KEY (a dedicated wallet
 * he creates and funds) and AGENT_FEEDBACK_ENABLED=1 in Vercel. When the
 * wallet runs low on gas it says so on the drafts Telegram chat, once a day.
 * Auth: `Authorization: Bearer $CRON_SECRET`.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGet, kvMutate } from "@/lib/kv";
import { sendMessage } from "@/lib/telegram/bot";
import { KV_DRAFTS_CHAT } from "@/lib/xdrafts/compose";
import { runFeedbackQueue } from "@/lib/agent-feedback";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const okAuth = secret ? (req.headers.get("authorization") ?? "") === `Bearer ${secret}` : process.env.NODE_ENV !== "production";
  if (!okAuth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const r = await runFeedbackQueue(5);
  if (r.lowGas) {
    const day = new Date().toISOString().slice(0, 10);
    let fresh = false;
    await kvMutate<string>("agents:feedback:lowgas-alert", "", (cur) => (cur === day ? null : ((fresh = true), day)));
    const chat = fresh ? await kvGet<{ chatId: number }>(KV_DRAFTS_CHAT) : null;
    if (chat) await sendMessage(chat.chatId, `ERC-8004 feedback wallet ${r.signer} is low on gas (${r.balanceEth} ETH on Base). Feedback is held until it is topped up.`).catch(() => undefined);
  }
  return NextResponse.json(r);
}

export const POST = GET;
