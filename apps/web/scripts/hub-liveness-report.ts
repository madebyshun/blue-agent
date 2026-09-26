/**
 * Live endpoint report for the External half of the Hub catalog.
 *
 * Run: `npm run hub:liveness` (from apps/web). Reads production, probes every
 * registered builder endpoint, prints a table. Exits 0 even when endpoints are
 * down — see below.
 *
 * ── WHY THE FILENAME DOES NOT END IN -test / -check ─────────────────────────
 * `scripts/run-tests.ts` discovers `*-test.ts` and `*-check.ts` by OPT-OUT, so
 * either suffix would have wired this into `npm test` automatically — the gate
 * that must be green before every push to main.
 *
 * It must not be. These are third-party dev tunnels (pinggy, lhr.life,
 * trycloudflare); expiring is what they DO. A mandatory gate that reddens when
 * a builder closes their laptop teaches everyone to push past red, and then the
 * gate protects nothing. That lesson was paid for once already, on
 * `ticker-list-input-test.ts` the same week.
 *
 * So the split is: logic is guarded hermetically in `hub-liveness-check.ts`
 * (which DOES gate), and reality is reported here, on demand, without gating.
 *
 * Exit code is 0 for a down endpoint and 1 only for a broken REPORT — the
 * registry unreadable, or the catalog request failing. "Someone's tunnel is
 * down" is the finding; "I could not find out" is the error.
 */
import { probeEndpoint } from "../src/lib/hub-registry";
import { ageLabel } from "../src/lib/hub-liveness-format";

const BASE = process.env.HUB_BASE_URL ?? "https://blueagent.dev";

type Registered = {
  id: string;
  name: string;
  endpoint: string;
  price: string;
  status?: "live";
  builderAddress: string;
  submittedAt: number;
};

async function main() {
  let payload: { tools?: Registered[]; coverage?: string; unreadableIds?: string[] };
  try {
    const res = await fetch(`${BASE}/api/hub/tools`, { cache: "no-store" });
    if (!res.ok) throw new Error(`catalog returned ${res.status}`);
    payload = await res.json();
  } catch (e) {
    console.error(`hub-liveness: could not read the catalog — ${(e as Error).message}`);
    process.exit(1);
    return;
  }

  const tools = payload.tools ?? [];
  // ⚠ #149: a throttled KV read answers with an empty list, which is
  // indistinguishable from "nobody has registered anything". Reporting "0 tools,
  // all healthy" off that would be the most confident wrong answer available.
  if (payload.coverage !== "complete") {
    console.log(`  note  registry coverage = ${payload.coverage ?? "unknown"} — this list may be SHORT.`);
    if (payload.unreadableIds?.length) {
      console.log(`  note  unreadable ids: ${payload.unreadableIds.join(", ")}`);
    }
  }
  if (tools.length === 0) {
    console.log("hub-liveness: no external tools registered.");
    process.exit(payload.coverage === "complete" ? 0 : 1);
    return;
  }

  console.log(`\nProbing ${tools.length} external endpoint(s) via ${BASE}\n`);

  const now = Date.now();
  const rows = await Promise.all(
    tools.map(async (t) => {
      const r = await probeEndpoint(t.endpoint);
      return {
        id: t.id,
        advertised: t.status ?? "live",
        // 2xx or 402 — the same bar the submit probe applied, so "up" here means
        // exactly what "live" claimed to mean at registration.
        observed: r.ok ? "up" : "UNREACHABLE",
        code: r.status === 0 ? "conn" : String(r.status),
        ms: r.durationMs,
        age: ageLabel(t.submittedAt, now) ?? "?",
        host: safeHost(t.endpoint),
        hint: r.ok ? "" : (r.hint ?? ""),
      };
    }),
  );

  const w = (s: string, n: number) => s.padEnd(n).slice(0, n);
  console.log(
    `${w("id", 22)} ${w("says", 6)} ${w("really", 12)} ${w("code", 5)} ${w("ms", 6)} ${w("listed", 7)} host`,
  );
  console.log("-".repeat(96));
  for (const r of rows) {
    console.log(
      `${w(r.id, 22)} ${w(r.advertised, 6)} ${w(r.observed, 12)} ${w(r.code, 5)} ${w(String(r.ms), 6)} ${w(r.age, 7)} ${r.host}`,
    );
  }

  const down = rows.filter((r) => r.observed !== "up");
  console.log(`\n${rows.length - down.length}/${rows.length} reachable.`);
  if (down.length) {
    console.log(`\nUnreachable — each still advertises status "live" in the catalog:`);
    for (const r of down) console.log(`  ${r.id}  ${r.hint}`);
    console.log(
      `\n⚠ This is a REPORT. Do not delist from it — an expired dev tunnel is a\n` +
        `  normal thing to happen to a submission, and the call is ShunTr's.`,
    );
  }
  // Deliberately 0: see the header. A down endpoint is the finding, not a failure.
  process.exit(0);
}

function safeHost(u: string): string {
  try { return new URL(u).host; } catch { return "(unparseable url)"; }
}

main().catch((e) => { console.error(e); process.exit(1); });
