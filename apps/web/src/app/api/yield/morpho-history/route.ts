// GET /api/yield/morpho-history
//
// Last ~30 daily net-APY points for the Morpho "Gauntlet USDC Prime" vault on
// Base — real data from the Morpho API (blue-api.morpho.org). Powers the APY
// sparkline on the BlueBank dashboard. Cached 1h.

import { NextResponse } from "next/server";

export const revalidate = 3600;

const VAULT = "0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61";

export async function GET() {
  try {
    const start = Math.floor(Date.now() / 1000) - 60 * 86400; // last 60d window
    const query = `{ vaultByAddress(address: "${VAULT}", chainId: 8453) {
      state { netApy }
      historicalState { netApy(options: { startTimestamp: ${start}, interval: DAY }) { x y } }
    } }`;
    const res = await fetch("https://blue-api.morpho.org/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
      next: { revalidate: 3600 },
    });
    const json = await res.json();
    const v = json?.data?.vaultByAddress;
    const series: { x: number; y: number }[] = v?.historicalState?.netApy ?? [];
    const points = series
      .slice()
      .sort((a, b) => a.x - b.x)        // ascending by time
      .slice(-30)                        // last 30 days
      .map(p => Number((p.y * 100).toFixed(3))); // → percent
    const current = v?.state?.netApy != null ? Number((v.state.netApy * 100).toFixed(2)) : (points.at(-1) ?? null);
    return NextResponse.json({ points, current, ts: Date.now() });
  } catch (e) {
    return NextResponse.json({ points: [], current: null, error: (e as Error).message, ts: Date.now() }, { status: 200 });
  }
}
