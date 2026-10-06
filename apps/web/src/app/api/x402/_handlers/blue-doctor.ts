/**
 * x402/blue-doctor — is the data source down, or is it me?
 *
 * Free. An agent reaches for this exactly when something else has already
 * failed, which is why it is free and why it must never fail in the same way
 * as the thing it is diagnosing: every probe is keyless, cheap, and wrapped so
 * that one dead upstream cannot take the report down with it.
 *
 * ── The distinction this file exists to keep ─────────────────────────────────
 * `down` means "I sent a request and it failed". `unknown` means "I did not
 * ask". They are NOT interchangeable, and collapsing them is the exact failure
 * CLAUDE.md names: inferring a negative from absent data. An upstream that
 * needs a secret, or that would burn a paid credit to touch, is reported
 * `unknown` with the reason — never `down`, because nothing was measured.
 *
 * ── Why the chain probes assert an id ────────────────────────────────────────
 * `eth_chainId` is the cheapest RPC call there is, and a probe that accepts any
 * answer is not a probe. Base 8453 and Robinhood Chain 4663 share no state, so
 * a proxy quietly answering for the wrong chain is a worse outcome than an
 * outage: the caller gets numbers, and they are about somewhere else. Both
 * probes therefore compare the returned id against the one they asked for and
 * report `down` on a mismatch, with both ids in the hint.
 *
 * ── What this is NOT ─────────────────────────────────────────────────────────
 * `/api/health` and `/api/status` already answer "is OUR service up" (they ping
 * Virtuals and the Hub). This answers the orthogonal question — "are the data
 * sources the tools read from reachable" — and deliberately does not duplicate
 * them. `lib/hub-liveness.ts` is a third thing again: liveness of external
 * BUILDERS' registered endpoints, not of our upstreams.
 */

const PROBE_TIMEOUT_MS = 4000;
/** Above this, a reachable upstream is reported `degraded` rather than `ok`. */
const SLOW_MS = 2500;

export type Health = "ok" | "degraded" | "down" | "unknown";

export type Probe = {
  name: string;
  /** What breaks for the caller when this is down. */
  powers: string;
  status: Health;
  latency_ms: number | null;
  /** Null when nothing went wrong, or when nothing was attempted. */
  error: string | null;
  /** Present only on `unknown`: why no request was made. */
  not_probed_reason?: string;
};

async function timed(fn: () => Promise<void>): Promise<{ ms: number; error: string | null }> {
  const t0 = Date.now();
  try {
    await fn();
    return { ms: Date.now() - t0, error: null };
  } catch (e) {
    return { ms: Date.now() - t0, error: (e as Error).message || "probe failed" };
  }
}

export function grade(ms: number, error: string | null): Health {
  if (error) return "down";
  return ms > SLOW_MS ? "degraded" : "ok";
}

/**
 * The summary, and the lists it is derived from. Exported so the rule below can
 * be tested without a network: **an `unknown` may never appear in `down`.**
 * Collapsing the two is the one mistake this tool exists to avoid, and it is a
 * one-character mistake to make (`!== "ok"` instead of `=== "down"`).
 */
export function rollup(upstreams: Probe[]): {
  summary: Health;
  down: string[];
  degraded: string[];
  unknown: string[];
} {
  const down = upstreams.filter((u) => u.status === "down").map((u) => u.name);
  const degraded = upstreams.filter((u) => u.status === "degraded").map((u) => u.name);
  const unknown = upstreams.filter((u) => u.status === "unknown").map((u) => u.name);
  // Unknowns cannot make the summary worse — not asking is not evidence of trouble.
  const summary: Health = down.length ? "down" : degraded.length ? "degraded" : "ok";
  return { summary, down, degraded, unknown };
}

async function httpProbe(name: string, powers: string, url: string): Promise<Probe> {
  const { ms, error } = await timed(async () => {
    const res = await fetch(url, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  });
  return { name, powers, status: grade(ms, error), latency_ms: ms, error };
}

/**
 * `eth_chainId` against a public RPC, asserting the answer. A wrong id is
 * reported `down`: an endpoint that answers confidently for the wrong chain is
 * more dangerous than one that does not answer at all.
 */
async function rpcProbe(name: string, powers: string, url: string, expectId: number): Promise<Probe> {
  const { ms, error } = await timed(async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { result?: string };
    const got = typeof data.result === "string" ? Number(BigInt(data.result)) : NaN;
    if (got !== expectId) {
      throw new Error(`answered for chain ${Number.isFinite(got) ? got : "?"}, asked for ${expectId}`);
    }
  });
  return { name, powers, status: grade(ms, error), latency_ms: ms, error };
}

function notProbed(name: string, powers: string, reason: string): Probe {
  return {
    name,
    powers,
    status: "unknown",
    latency_ms: null,
    error: null,
    not_probed_reason: reason,
  };
}

export default async function handler(_req: Request): Promise<Response> {
  const checked_at = new Date().toISOString();

  // Probed: every one of these is public, keyless and costs nothing.
  const probed = await Promise.all([
    rpcProbe(
      "base_rpc",
      "every Base 8453 read: token scans, gas, balances, contract calls",
      "https://mainnet.base.org",
      8453,
    ),
    rpcProbe(
      "robinhood_rpc",
      "every Robinhood Chain 4663 read: the rh-* tools and the RWA registry",
      "https://rpc.mainnet.chain.robinhood.com",
      4663,
    ),
    httpProbe(
      "dexscreener",
      "token prices, DEX flow, liquidity",
      "https://api.dexscreener.com/latest/dex/tokens/0x4200000000000000000000000000000000000006",
    ),
    httpProbe(
      "geckoterminal",
      "pool scans, trending, OHLC history",
      "https://api.geckoterminal.com/api/v2/networks/base/pools?page=1",
    ),
    httpProbe("defillama", "yield rates and protocol TVL", "https://yields.llama.fi/pools"),
    httpProbe("github", "repo health and builder due diligence", "https://api.github.com/rate_limit"),
  ]);

  // Not probed, each for a stated reason. None of these is an outage claim.
  const unprobed = [
    notProbed(
      "virtuals_llm",
      "every tool whose output includes written analysis",
      "a probe would spend inference credit. GET /api/health pings it directly with a cached TTL.",
    ),
    notProbed("vercel_kv", "Blue Hood snapshots, Aeon context, usage counters", "needs server credentials"),
    notProbed("cdp_facilitator", "x402 payment verification and USDC settlement on Base", "needs server credentials"),
    notProbed(
      "moralis",
      "wallet holdings, wallet risk, multichain transfer history",
      "needs a key, and the plan is paused — see known_issues",
    ),
    notProbed(
      "etherscan_v2",
      "verified contract source for audits",
      "the keyless probe is worse than none: Base 8453 answers HTTP 200 carrying " +
        'status "0" and "Free API access is not supported for this chain", so a naive check reads as healthy',
    ),
  ];

  const upstreams = [...probed, ...unprobed];
  const { summary, down, degraded, unknown } = rollup(upstreams);

  return Response.json({
    tool: "blue-doctor",
    checked_at,
    summary,
    // A one-line answer to the question that brought the caller here.
    verdict:
      down.length
        ? `${down.join(", ")} failed to respond. A tool that reads from it will fail too, and it is not your request.`
        : degraded.length
          ? `Everything answered, but ${degraded.join(", ")} took over ${SLOW_MS}ms. Expect slow tool calls, not failures.`
          : "Every upstream this check can reach is answering normally. A failure you are seeing is more likely your inputs than an outage.",
    counts: {
      probed: probed.length,
      ok: probed.filter((u) => u.status === "ok").length,
      degraded: degraded.length,
      down: down.length,
      not_probed: unknown.length,
    },
    upstreams,
    // Facts with a date on them, kept separate from the live probes above so a
    // stale measurement can never be read as a fresh one.
    known_issues: [
      {
        upstream: "moralis",
        measured_on: "2026-09-26",
        detail:
          "Every endpoint returned HTTP 401 with a paused-plan message. Billing, not an outage, and not a code fault. " +
          "base-activity-score and token-distribution stay halted while this holds; wallet-holdings (on-chain discovery) and " +
          "wallet-risk (GoPlus + explorer + chain) stopped depending on it on 2026-10-07.",
      },
      {
        upstream: "etherscan_v2",
        measured_on: "2026-09-26",
        detail:
          "The account module is not free on Base 8453. Only verified-source reads work, and only with BASESCAN_API_KEY.",
      },
    ],
    note:
      "`down` means a request was sent and it failed. `unknown` means no request was sent, and the reason is on the entry. " +
      "They are never interchangeable. Chain reads are asserted against the chain id they claim: Base 8453 and Robinhood Chain 4663 share no state.",
  });
}
