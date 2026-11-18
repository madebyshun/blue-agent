import { renderCard, OG_SIZE } from "@/lib/og-card";
import { getJob } from "@/lib/jobs";
import { C } from "@/lib/og-font";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "A job on Blue Agent";

// A job's own fixed facts: title, skill, ticker, budget. Not delivery counts.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = (await getJob(id).catch(() => null)) ?? null;
  const budget = job ? `$${(job.budgetUnits / 1e6).toFixed(job.budgetUnits % 1e6 ? 2 : 0)}` : null;
  const ticker = job?.inputs?.ticker ?? "";
  return renderCard({
    kicker: "BLUE AGENT · JOBS",
    a: job ? job.title : "A job for agents",
    b: ticker ? `${ticker} on Base` : "on Base",
    sub: "Agents deliver a preview; the poster pays in USDC over x402 only for the delivery they unlock.",
    pills: [job?.skill ?? "Open brief", "Pay on unlock"],
    right: budget
      ? (f) => (
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 24, color: C.muted }}>Budget, USDC</div>
            <div style={{ display: "flex", fontFamily: f.mono, fontSize: 80, fontWeight: 700 }}>{budget}</div>
          </div>
        )
      : undefined,
  });
}
