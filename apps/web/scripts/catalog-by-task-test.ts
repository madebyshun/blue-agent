// /api/catalog byTask + jobs (BaseCity plan item 7): every listed tool sits in
// exactly one task group with its price, and job skills carry their checklist.
import { GET } from "../src/app/api/catalog/route";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

(async () => {
  const j = await (await GET()).json();
  const grouped = j.byTask.flatMap((g: { tools: { id: string }[] }) => g.tools.map((t) => t.id));
  check("every tool appears in exactly one task group", grouped.length === j.tools.length && new Set(grouped).size === j.tools.length);
  check("every grouped tool carries a numeric or null price", j.byTask.every((g: { tools: { priceUsd: unknown }[] }) => g.tools.every((t) => t.priceUsd === null || typeof t.priceUsd === "number")));
  check("priceUsd agrees with priceUsdcUnits", j.tools.every((t: { priceUsd: number | null; priceUsdcUnits: number | null }) => (t.priceUsdcUnits == null ? t.priceUsd == null : t.priceUsd === t.priceUsdcUnits / 1e6)));
  check("job skills listed with required checklist", j.jobs.skills.length >= 3 && j.jobs.skills.every((s: { required: string[] }) => s.required.length > 0));
  check("direct-hire link documented", j.jobs.directHire.link.includes("?agent="));
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
