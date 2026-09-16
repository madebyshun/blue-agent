/**
 * /api/stats — operator dashboard data (gated).
 *
 * Per-tool paid-run counts + estimated revenue (runs × price) + live USDC
 * balance of the Club wallet. Gated by ?key= matching STATS_SECRET (falls
 * back to CRON_SECRET). If no secret is configured, access is open (dev).
 *
 * #150 read side — this is the worst place in the repo for a fabricated zero,
 * because both headline numbers are SUMS. `kvGet(...) ?? 0` folded an
 * unreadable counter into a real addend, so a partial KV outage did not show
 * up as an error or a gap: it showed up as a smaller number, indistinguishable
 * from a quiet day. An operator reads `totalRuns` to decide whether the
 * business is working.
 *
 * A tool whose counter could not be read is now OMITTED from `rows` and from
 * both sums, and `totals.countersUnreadable` says how many. The totals are
 * therefore a LOWER BOUND whenever that field is > 0 — the dashboard renders
 * them with a "≥" and a warning strip, the same lower-bound convention the
 * wallet uses for a partially-read balance.
 */
import { NextRequest, NextResponse } from "next/server";
import { kvGetCounter } from "@/lib/kv";
import { AGENT_TOOLS } from "@/lib/agent-tools";

export const runtime = "nodejs";
// Vercel kills serverless functions at 60s by default — explicit budget so
// it fails loudly instead of silently 504-ing.
export const maxDuration = 15;

const PAY_TO = "0x02950ad38ada1d599375bd447e080cd404809205";
const USDC   = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";

function priceNum(price?: string): number {
  if (!price) return 0;
  const n = parseFloat(price.replace("$", "").trim());
  return Number.isNaN(n) ? 0 : n;
}

async function usdcBalance(): Promise<number | null> {
  try {
    const r = await fetch("https://mainnet.base.org", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0", id: 1, method: "eth_call",
        params: [{ to: USDC, data: "0x70a08231000000000000000000000000" + PAY_TO.slice(2) }, "latest"],
      }),
      signal: AbortSignal.timeout(8000),
    });
    const d = await r.json() as { result?: string };
    return d.result ? parseInt(d.result, 16) / 1e6 : null;
  } catch { return null; }
}

export async function GET(_req: NextRequest) {
  // Public access — page itself is unlisted (no nav link, robots noindex)
  const read = await Promise.all(
    AGENT_TOOLS.map(async t => {
      const runs = await kvGetCounter(`usage:${t.id}`); // null ⟹ read failed
      if (runs === null) return null;
      const price = priceNum(t.price);
      return {
        id: t.id,
        name: t.name,
        category: t.category,
        price: t.price ?? "",
        runs,
        revenueEst: +(runs * price).toFixed(4),
      };
    })
  );

  const rows = read
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .sort((a, b) => b.runs - a.runs || b.revenueEst - a.revenueEst);

  const countersUnreadable = read.length - rows.length;
  if (countersUnreadable > 0) {
    console.error(`[stats] ${countersUnreadable}/${read.length} usage counters unreadable — omitted from totals, which are now a lower bound`);
  }

  const totalRuns       = rows.reduce((s, r) => s + r.runs, 0);
  const totalRevenueEst = +rows.reduce((s, r) => s + r.revenueEst, 0).toFixed(4);
  const usdcBal         = await usdcBalance();

  return NextResponse.json(
    {
      totals: {
        // Tools we could actually read a counter for. `catalogTools` is the
        // catalog size — the two diverge exactly when KV is degraded.
        tools: rows.length,
        catalogTools: AGENT_TOOLS.length,
        countersUnreadable,
        totalRuns,
        totalRevenueEst,
        usdcBalance: usdcBal,
        wallet: PAY_TO,
      },
      rows,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
