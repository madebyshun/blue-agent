/** /api/exchange/follow — the signed-in wallet's followed sellers. POST {payTo, on}. */
import { NextResponse, type NextRequest } from "next/server";
import { resolveActingWallet, actingWalletRefusal } from "@/lib/acting-wallet";
import { readFollows, setFollow } from "@/lib/hub/listings";
import { readExchange } from "@/lib/hub/exchange";

export const runtime = "nodejs";
export const maxDuration = 10;
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const follows = await readFollows(who.wallet);
  if (req.nextUrl.searchParams.get("detail") !== "1") return NextResponse.json({ follows });
  // Following page: each followed seller with its measured 30-day figures.
  const ex = await readExchange(30);
  const by = new Map(ex.rows.map((r) => [r.payTo, r]));
  return NextResponse.json({
    follows,
    readable: ex.readable,
    daysCovered: ex.daysCovered,
    sellers: follows.map((p) => {
      const r = by.get(p);
      return { payTo: p, host: r?.hosts[0] ?? null, title: r?.title ?? "", usd: r?.usd ?? 0, paidCalls: r?.paidCalls ?? 0, payers: r?.payers ?? 0, series: r?.series.slice(ex.firstIndex) ?? [] };
    }),
  });
}

export async function POST(req: NextRequest) {
  const who = await resolveActingWallet(req);
  if (who.status !== "ok") return actingWalletRefusal(who);
  const b = (await req.json().catch(() => ({}))) as { payTo?: string; on?: boolean };
  if (!/^0x[0-9a-fA-F]{40}$/.test(String(b.payTo ?? ""))) return NextResponse.json({ error: "payTo must be a 0x address." }, { status: 400 });
  return NextResponse.json({ follows: await setFollow(who.wallet, String(b.payTo), b.on !== false) });
}
