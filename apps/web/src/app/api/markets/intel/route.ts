import { NextResponse } from "next/server";
import { DEMO_FIXTURE_EVENT, listIntelEvents, readIntelScanSummary } from "@/lib/intel/store";
import { DEFAULT_INTEL_CONFIG, INTEL_TARGET_TICKERS } from "@/lib/intel/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [events, scan] = await Promise.all([listIntelEvents(), readIntelScanSummary()]);
  return NextResponse.json({
    ok: true,
    chain: "base",
    chainId: 8453,
    tokens: INTEL_TARGET_TICKERS.map((t) => `${t}c`),
    config: DEFAULT_INTEL_CONFIG,
    scan,
    events,
    fixture: DEMO_FIXTURE_EVENT,
  });
}
