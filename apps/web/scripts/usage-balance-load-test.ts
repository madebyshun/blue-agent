/**
 * usage-balance-load-test — /app/usage keeps the balance when a cached session
 * turns out to be stale.
 *
 * The bug this pins (2026-10-01): the page asked for `?detail=1` whenever
 * useEnsureSession's 5-minute cache said "signed in". Turning sync off in chat
 * deletes the SIWE session without touching that cache, so the detail read got
 * 401 AUTH_REQUIRED and the page threw away EVERYTHING — error banner, every
 * KPI at 0 — although the public aggregate was one request away.
 *
 * Hermetic: `loadBalance` takes its fetch as a parameter; nothing leaves the
 * process.
 */
import { loadBalance } from "../src/app/app/usage/load-balance";

let passes = 0;
let failures = 0;
function check(label: string, pass: boolean, detail = "") {
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (pass) passes++; else failures++;
}

const ADDR = "0x1111111111111111111111111111111111111111";
const AGGREGATE = { balance: 1234, pool: 1000, dailyCr: 500, dailyRemaining: 234, spent: 10, earned: 0 };
const DETAIL = { ...AGGREGATE, recent: [{ ts: 1, kind: "spend", amount: 5, reason: "tool:x" }] };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A fake balance route: `detail` decides how ?detail=1 answers. */
function route(detail: () => Response) {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    return url.endsWith("?detail=1") ? detail() : json(AGGREGATE);
  }) as typeof fetch;
  return { calls, fetchImpl };
}

(async () => {
  console.log("\n1. A live session reads the detail");
  {
    const r = route(() => json(DETAIL));
    let stale = 0;
    const got = await loadBalance(ADDR, true, { fetchImpl: r.fetchImpl, onStaleSession: () => { stale++; } });
    check("1.1 one request, with ?detail=1", r.calls.length === 1 && r.calls[0].endsWith("?detail=1"), r.calls.join(", "));
    check("1.2 recent list kept", got.data.recent.length === 1 && got.signedIn === true);
    check("1.3 cache not touched", stale === 0);
  }

  console.log("\n2. A stale cached session falls back to the public aggregate");
  {
    const r = route(() => json({ error: "Sign in", code: "AUTH_REQUIRED", reason: "sign_in_required" }, 401));
    let stale = 0;
    const got = await loadBalance(ADDR, true, { fetchImpl: r.fetchImpl, onStaleSession: () => { stale++; } });
    check("2.1 the balance survives (not thrown away)", got.data.balance === 1234 && got.data.pool === 1000, JSON.stringify(got.data));
    check("2.2 reported as signed out, so the page offers the signature", got.signedIn === false);
    check("2.3 the stale cache is dropped exactly once", stale === 1);
    check("2.4 second request is the public one", r.calls.length === 2 && !r.calls[1].includes("detail"), r.calls.join(", "));
    check("2.5 no invented activity", got.data.recent.length === 0);
  }

  console.log("\n3. Other failures still fail loudly");
  {
    const r = route(() => json({ error: "boom" }, 500));
    let threw = "";
    try { await loadBalance(ADDR, true, { fetchImpl: r.fetchImpl }); } catch (e) { threw = (e as Error).message; }
    check("3.1 a 500 on detail throws (no silent downgrade)", /HTTP 500/.test(threw), threw);
    const r2 = route(() => json({ error: "nope" }, 401));
    threw = "";
    try { await loadBalance(ADDR, true, { fetchImpl: r2.fetchImpl }); } catch (e) { threw = (e as Error).message; }
    check("3.2 a 401 that is not AUTH_REQUIRED is not mistaken for a stale session", /HTTP 401/.test(threw) && r2.calls.length === 1, threw);
  }

  console.log("\n4. Signed out reads the aggregate directly");
  {
    const r = route(() => json(DETAIL));
    const got = await loadBalance(ADDR, false, { fetchImpl: r.fetchImpl });
    check("4.1 never asks for detail", r.calls.length === 1 && !r.calls[0].includes("detail"));
    check("4.2 signedIn stays false", got.signedIn === false && got.data.balance === 1234);
  }

  console.log(`\nusage-balance-load-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
