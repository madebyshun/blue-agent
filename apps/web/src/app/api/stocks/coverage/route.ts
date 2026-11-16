import { readStockCoverage } from "@/lib/base-stocks/coverage";
import { summarizeStockCoverage } from "../../../../../../../packages/core/src/stock-coverage";

export const dynamic = "force-dynamic";

export async function GET() {
  const p = await readStockCoverage();
  if (p.status === "error") return Response.json({ status: "unavailable", chain_id: 8453 }, { status: 503 });
  if (p.status === "miss") return Response.json({ status: "not_started", chain_id: 8453, summary: null, rows: [] });
  const v = p.value;
  return Response.json({ status: v.completed_at ? "complete" : "in_progress", chain_id: 8453,
    catalog_at: v.catalog_at, updated_at: v.updated_at, completed_at: v.completed_at,
    is_stale: Date.now() - Date.parse(v.updated_at) > 24 * 3600_000,
    summary: summarizeStockCoverage(v), rows: v.rows,
    method: "Bounded inventory matched to the official Base and Coinbase lists by Base address. NAV is issuer-published USD per token, not the official stock close. Missing NAV is not evidence that a Chainlink feed does not exist. Pool absence means not indexed by the provider. 24h activity is not a 72h candle admission check. This scan never admits a stock to historical grading.",
  });
}
