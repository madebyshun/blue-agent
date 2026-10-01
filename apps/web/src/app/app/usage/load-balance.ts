// The /app/usage balance read, kept out of page.tsx so it can be tested
// without rendering React (scripts/usage-balance-load-test.ts).
//
// GET /api/credits/balance/<addr> answers twice: the public AGGREGATE, and
// with `?detail=1` the same plus the owner-only `recent` list (SIWE). The page
// asks for detail when `hasSession` says this wallet is signed in — but that
// answer comes from useEnsureSession's 5-minute cache, so it can be stale: the
// session may have been ended (chat's sync toggle deletes it) or expired since.
//
// A detail read refused with 401 AUTH_REQUIRED is therefore NOT a failure to
// read the balance — only the private half was refused. The caller is told the
// cache was wrong (`onStaleSession`), and the public aggregate is read instead,
// so the KPIs still render and Recent activity offers the signature. Any other
// non-2xx is a real failure and throws.
//
// The default fetch is `sessionFetch`, so inside the embedded mini-app — where
// the session rides the `x-blue-session` header, not the cookie — the detail
// read is still recognised as the owner's (lib/session-client.ts).
import type { BalanceSummary } from "@/lib/credit-ledger";
import { sessionFetch } from "@/lib/session-client";

export interface BalanceLoad {
  data: BalanceSummary;
  /** Whether the answer includes the owner-only `recent` list. */
  signedIn: boolean;
}

export async function loadBalance(
  address: string,
  signedIn: boolean,
  opts: { fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>; onStaleSession?: () => void } = {},
): Promise<BalanceLoad> {
  const doFetch = opts.fetchImpl ?? sessionFetch;
  let mine = signedIn;
  let res = await doFetch(`/api/credits/balance/${address}${mine ? "?detail=1" : ""}`);
  if (mine && res.status === 401) {
    const refusal = (await res.clone().json().catch(() => ({}))) as { code?: string };
    if (refusal.code === "AUTH_REQUIRED") {
      opts.onStaleSession?.();
      mine = false;
      res = await doFetch(`/api/credits/balance/${address}`);
    }
  }
  if (!res.ok) throw new Error(`Couldn't load balance (HTTP ${res.status}).`);
  const body = (await res.json()) as Omit<BalanceSummary, "recent"> & { recent?: BalanceSummary["recent"] };
  return { data: { ...body, recent: body.recent ?? [] }, signedIn: mine };
}
