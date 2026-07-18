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

  // Reviewer T-A #1: seed arrows ALWAYS carry origin="seeded", even when
  // `?with_brief=1` is set. That flag only controls whether A4 gets called
  // (useful for exercising the brief pipeline in localhost). Origin stays
  // seeded so the arrow is never eligible for the public feed/hit-rate,
  // regardless of what UI plumbing the caller is exercising.
  const withBrief = url.searchParams.get("with_brief") === "1"
    || url.searchParams.get("real") === "1"; // legacy alias — remove after v1
  const arrow = await fireArrow(
    ticker,
    {
      type,
      expected_direction: direction as "up" | "down",
      grading_window_h: windowH,
      reference_price: refPrice,
    },
    Math.floor(Date.now() / 1000),
    withBrief
      ? { origin: "seeded" }
      : { origin: "seeded", test: true }, // `test` still gates A4 call
  );

  if (!arrow) {
    return NextResponse.json({
      ok: false,
      message: `Deduped — an open ${type} arrow already exists for ${ticker}`,
    });
  }

  return NextResponse.json({ ok: true, arrow });
}
