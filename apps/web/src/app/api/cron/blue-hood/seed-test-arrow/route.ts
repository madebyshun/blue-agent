/**
 * DEV-ONLY: seed a synthetic arrow so the /hood UI can be visually
 * verified without waiting for a real drift to appear.
 *
 * Refuses to run outside NODE_ENV=development. In prod this endpoint
 * always 404s — the file is left in the tree because the poll cron
 * relies on the same rule-engine primitives it exercises.
 */
import { NextRequest, NextResponse } from "next/server";
import { fireArrow } from "@/lib/blue-hood/rule-engine";
import type { ArrowType } from "@/lib/blue-hood/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "AAPL").toUpperCase();
  const type = (url.searchParams.get("type") ?? "drift") as ArrowType;
  const direction = url.searchParams.get("direction") === "down" ? "down" : "up";
  const refPrice = Number(url.searchParams.get("ref") ?? "0") || 100;
  const windowH = Number(url.searchParams.get("window") ?? "0") || (type === "arb" ? 4 : 6);

  const arrow = await fireArrow(
    ticker,
    {
      type,
      expected_direction: direction as "up" | "down",
      grading_window_h: windowH,
      reference_price: refPrice,
    },
    Math.floor(Date.now() / 1000),
  );

  if (!arrow) {
    return NextResponse.json({
      ok: false,
      message: `Deduped — an open ${type} arrow already exists for ${ticker}`,
    });
  }

  return NextResponse.json({ ok: true, arrow });
}
