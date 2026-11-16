import Link from "next/link";
import { readStockCoverage } from "@/lib/base-stocks/coverage";
import { summarizeStockCoverage } from "../../../../../../../packages/core/src/stock-coverage";

export default async function CoverageSummary() {
  const p = await readStockCoverage();
  if (p.status !== "hit") return (
    <p className="text-[12px] text-[#94A3B8]">
      Full-catalog inventory: {p.status === "error" ? "temporarily unreadable" : "first scan pending"}. <Link className="text-[#4FC3F7]" href="/markets/drift/coverage">View coverage and assessment method</Link>.
    </p>
  );
  const v = p.value, s = summarizeStockCoverage(v);
  return (
    <div className="text-[12px] text-[#94A3B8] leading-relaxed">
      <p>Latest catalog scan: {s.listed} listed · {s.assessed} assessed · {s.issued} issued · {s.issuer_reference_available} issuer references · {s.pool_readable} pool quotes · {s.pending} pending.</p>
      <p>Inventory updated {v.updated_at}. This runs separately from the 5-minute board and does not add stocks to its graded cohort. <Link className="text-[#4FC3F7]" href="/markets/drift/coverage">Inspect every assessment</Link>.</p>
    </div>
  );
}
