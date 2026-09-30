/**
 * x402-credit-refund-test — the credit rail charges only for a successful run.
 *
 * The chat credit path of /api/x402/[tool] debits the user's ledger BEFORE the
 * handler runs (so a failing call cannot serve free compute). Until 2026-09-30
 * it kept that debit when the handler then answered an error or threw — the
 * one rail that billed for failures, while the USDC rail settles only after
 * success (Scheduled research §2.4, W0-6(f)). Each debit now carries a ref and
 * a failed run returns exactly that debit through the ledger's refund().
 *
 * Hermetic: KV env cleared, and the call is one the handler rejects on input
 * (`contract-trust` with no address → 400) before touching any network.
 */
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"]) {
  delete process.env[k];
}
process.env.INTERNAL_SERVICE_KEY = "test-internal-key";

import { NextRequest } from "next/server";
import { getBalance, getLedgerHistory } from "../src/lib/credit-ledger";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const USER = "0x2222222222222222222222222222222222222222";

(async () => {
  const { POST } = await import("../src/app/api/x402/[tool]/route");
  const before = (await getBalance(USER)).balance;

  const res = await POST(
    new NextRequest("http://localhost/api/x402/contract-trust", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-blue-internal": "test-internal-key",
        "x-blue-user": USER,
      },
      body: JSON.stringify({}),
    }),
    { params: Promise.resolve({ tool: "contract-trust" }) },
  );
  const after = (await getBalance(USER)).balance;
  const history = await getLedgerHistory(USER);
  const kinds = (history?.history ?? []).map((e) => e.kind as string);

  console.log("\n1. A failed paid tool call is not charged");
  check("1.1 the handler's error comes back to the caller", res.status === 400, `${res.status}`);
  check("1.2 a debit was taken first (the rail still meters)", kinds.includes("spend"), kinds.join(","));
  check("1.3 …and returned by a refund", kinds.includes("refund"), kinds.join(","));
  check("1.4 the balance is where it started", after === before, `${before} → ${after}`);
  check("1.5 the caller is told 0 credits were debited", res.headers.get("X-Credits-Debited") === "0", String(res.headers.get("X-Credits-Debited")));

  console.log(`\nx402-credit-refund-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
