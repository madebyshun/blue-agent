/** vet402 delivery records: CSV parsing and per-host folding (lib/hub/vet402.ts). No network. */
import { foldSellers, recordFor, splitCsv } from "../src/lib/hub/vet402";
let failed = 0, passed = 0;
const check = (n: string, ok: boolean) => { if (ok) { passed++; console.log(`  PASS  ${n}`); } else { failed++; console.log(`  FAIL  ${n}`); } };
check("quoted commas stay in one field", splitCsv('a,"b,c",d').length === 3 && splitCsv('a,"b,c",d')[1] === "b,c");
const csv = ["host,endpoint_id,resource_key,outcome", "A.com,1,a/x,delivered", "a.com,2,a/y,seller", "a.com,3,a/z,vet402", "a.com,4,a/w,unsorted", "b.com,5,b/x,not_tried", ""].join("\n");
const h = foldSellers(csv);
check("hosts fold case-insensitively", h["a.com"]?.bought === 3 && h["a.com"].delivered === 1 && h["a.com"].sellerFail === 1);
check("vet402-side failures are not the seller's record", h["a.com"].bought === 3);
check("hosts never bought from are not stored", !("b.com" in h));
const blob = { retrievedAt: "x", source: "s", license: "CC-BY-4.0" as const, hosts: h };
check("a seller with no purchases reads null, not 0/0", recordFor(blob, ["b.com"]) === null);
check("a seller's hosts are summed", recordFor(blob, ["A.com", "b.com"])?.bought === 3);
let threw = false; try { foldSellers("x,y\n1,2"); } catch { threw = true; }
check("unexpected columns throw instead of folding nothing", threw);
console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
process.exit(failed ? 1 : 0);
