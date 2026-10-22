/**
 * Guard: every catalog tool's Bazaar extension survives the facilitator's own
 * extraction step, or Coinbase's discovery index never lists it.
 *
 * Run: `npx tsx scripts/bazaar-extension-test.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — no network, no wallet, no writes.
 *
 * WHY IT EXISTS
 * -------------
 * MEASURED 2026-10-22: a real paid settle on token-price (block 52,927,120,
 * submitted by CDP's relayer) still left
 * `GET /platform/v2/x402/discovery/merchant?payTo=0x0295…` at total 0. The
 * extension had been hand-built since 2026-05-31 with `info` and no `schema`,
 * and `extractDiscoveryInfo` — the SDK step a facilitator runs before it
 * catalogs anything — rejects that with "schema must be object or boolean".
 * Verify and settle never complain, so nothing but a check like this one sees
 * it: the money moves and the listing silently does not happen.
 *
 * The CONTROL case re-runs the old hand-built shape through the same extractor
 * and requires it to FAIL, so this suite cannot pass by testing nothing.
 */
import { extractDiscoveryInfo, validateDiscoveryExtension } from "@x402/extensions/bazaar";
import { AGENT_TOOLS } from "../src/lib/agent-tools";
import { buildBazaarExtension } from "../src/lib/x402-bazaar";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

const PAY_TO = "0x02950ad38ada1d599375bd447e080cd404809205";
const requirements = {
  scheme: "exact", network: "eip155:8453", amount: "10000",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", payTo: PAY_TO,
  maxTimeoutSeconds: 120, extra: { name: "USD Coin", version: "2" },
};
// The SDK logs a line for every rejected extension; keep the run readable.
const quiet = <T,>(fn: () => T): T => {
  const log = console.log, warn = console.warn, err = console.error;
  console.log = console.warn = console.error = () => {};
  try { return fn(); } finally { console.log = log; console.warn = warn; console.error = err; }
};
const extract = (id: string, ext: unknown) => quiet(() => extractDiscoveryInfo(
  {
    x402Version: 2,
    resource: { url: `https://blueagent.dev/api/x402/${id}`, serviceName: "Blue Hub" },
    extensions: { bazaar: ext },
    accepted: requirements,
    payload: {},
  } as never,
  requirements as never,
  true,
));

console.log("\nCONTROL — the hand-built shape shipped 2026-05-31 → 2026-10-22:");
const old = {
  info: {
    input: { type: "http", method: "POST", bodyType: "json", body: { token: "<token>" } },
    output: { example: { tool: "token-price" } },
  },
};
check("the old shape is DROPPED by the facilitator's extractor", extract("token-price", old) === null);

console.log("\nEvery catalog tool:");
const bad: string[] = [];
for (const tool of AGENT_TOOLS) {
  const ext = buildBazaarExtension(tool);
  const valid = validateDiscoveryExtension(ext as never).valid;
  const found = extract(tool.id, ext) as { resourceUrl?: string; discoveryInfo?: { input?: { method?: string } } } | null;
  const ok = valid
    && found?.resourceUrl === `https://blueagent.dev/api/x402/${tool.id}`
    && found?.discoveryInfo?.input?.method === "POST"
    && !("routeTemplate" in (ext as object));
  if (!ok) bad.push(tool.id);
}
check(
  `all ${AGENT_TOOLS.length} extensions validate, extract at their own URL, method POST, no routeTemplate`,
  bad.length === 0,
  bad.length ? `failing: ${bad.slice(0, 10).join(", ")}${bad.length > 10 ? ` +${bad.length - 10}` : ""}` : "",
);

console.log(`\n${failures === 0 ? "✓ bazaar extension checks passed" : `✗ ${failures} failure(s)`}\n`);
process.exit(failures === 0 ? 0 : 1);
