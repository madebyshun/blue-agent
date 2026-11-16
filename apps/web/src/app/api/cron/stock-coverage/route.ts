import { NextRequest } from "next/server";
import { runStockCoverage } from "@/lib/base-stocks/coverage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret ? req.headers.get("authorization") !== `Bearer ${secret}` : process.env.NODE_ENV === "production") {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await runStockCoverage(Date.now() + 50_000);
    return Response.json(result, { status: result.status === "storage_unavailable" ? 503 : 200 });
  } catch (e) {
    console.error("[stock-coverage]", (e as Error).message);
    return Response.json({ error: "Coverage scan could not advance; prior results retained." }, { status: 503 });
  }
}
export const POST = GET;
