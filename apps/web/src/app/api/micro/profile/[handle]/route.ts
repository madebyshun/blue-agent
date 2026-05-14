import { NextRequest, NextResponse } from "next/server";
import { getReputation, loadClaims, loadTasks } from "@/lib/micro-storage";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ handle: string }> }
) {
  const { handle } = await params;
  const cleanHandle = handle.replace(/^@/, "");

  const rep = getReputation(cleanHandle);

  const allClaims = loadClaims();
  const allTasks = loadTasks();

  const myClaims = allClaims
    .filter((c) => c.claimant_handle.toLowerCase() === cleanHandle.toLowerCase())
    .sort((a, b) => b.accepted_at.localeCompare(a.accepted_at));

  // Enrich claims with task info
  const enriched = myClaims.slice(0, 10).map((claim) => {
    const task = allTasks.find((t) => t.id === claim.task_id);
    return { claim, task };
  });

  // Platform breakdown
  const platformMap: Record<string, number> = {};
  for (const { claim, task } of enriched) {
    if (claim.status === "approved" && task) {
      platformMap[task.platform] = (platformMap[task.platform] ?? 0) + 1;
    }
  }

  const topPlatforms = Object.entries(platformMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([p, n]) => ({ platform: p, count: n }));

  return NextResponse.json({ reputation: rep, recent: enriched, topPlatforms });
}
