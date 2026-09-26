/**
 * Is a registered External tool's endpoint still there?
 *
 * WHY THIS EXISTS
 * ---------------
 * `RegisteredTool.status: "live"` is set ONCE, by the x402 probe at submit time,
 * and nothing has ever re-checked it. It is a birth certificate, not a pulse.
 *
 * MEASURED 2026-09-26 — 5 of the 6 registered endpoints were dead while all 6
 * still advertised `status: "live"` to every visitor:
 *
 *   hermes-evidence     pinggy-free tunnel     conn failed
 *   hermes-verify       pinggy-free tunnel     conn failed
 *   jefri-base-create2  lhr.life tunnel        503
 *   jefri-base-permit2  lhr.life tunnel        503
 *   indie-ops-ping      trycloudflare quick    conn failed
 *   desk-x402-block     Cloudflare Worker      402   ← the only one still up
 *
 * That is not neglect on anyone's part, it is the submit flow: builders test
 * from a laptop behind an ephemeral tunnel (pinggy / lhr.life / trycloudflare
 * all expire in hours), the probe passes, the URL dies when they close the
 * terminal, and the Hub keeps selling it.
 *
 * ── THREE THINGS THIS DELIBERATELY DOES NOT DO ──────────────────────────────
 *
 * 1. It does NOT delist. Tunnel expiry is expected and a submission is the
 *    builder's, not ours. We re-probe and SHOW staleness; any delisting is
 *    ShunTr's call. `status` is never written by this file.
 *
 * 2. It does NOT run in `npm test`. A gate that reddens when a third party's
 *    tunnel expires is worse than no gate — it trains everyone to push past
 *    red. The hermetic logic lives in `scripts/hub-liveness-check.ts`; the live
 *    probe is `npm run hub:liveness`, a report that never gates.
 *
 * 3. It does NOT add a cron. Seven are already scheduled (~2,568 invocations a
 *    day) and `/api/cron/research-loop` was unscheduled in 2026-09 for Upstash
 *    budget. Probing is therefore LAZY: the Hub asks after it has already
 *    rendered, the answer is cached in KV for `HEALTH_TTL_S`, and a visit that
 *    finds a warm cache costs one read and zero outbound requests.
 *
 * ── never is not down ────────────────────────────────────────────────────────
 * `null` means NOT CHECKED (cold cache, or KV unreadable) and must render as
 * its own state. Collapsing it to "down" would accuse a live builder; collapsing
 * it to "up" rebuilds the exact bug above. Same discipline as `callCount`, which
 * is nullable here for the same reason.
 */
import { kvGetProbe, kvSet } from "@/lib/kv";
import { probeEndpoint } from "@/lib/hub-registry";
// Types + pure formatters live apart so the Hub grid (a CLIENT component) can
// import the wording without dragging `@/lib/kv` into the browser bundle.
import type { ToolHealth } from "@/lib/hub-liveness-format";

export type { ToolHealth } from "@/lib/hub-liveness-format";
export {
  livenessLabel,
  livenessTitle,
  ageLabel,
  LIVENESS_META,
  type LivenessLabel,
} from "@/lib/hub-liveness-format";

/**
 * How long a probe answer is trusted.
 *
 * The cost being bounded is OUTBOUND, not KV: one cold visit fans out to every
 * registered endpoint at once. Ten minutes puts the worst case at ~144
 * probe-sets/day even under constant traffic, while still catching a tunnel that
 * died an hour ago — which is the actual failure mode, not a 30-second blip.
 */
export const HEALTH_TTL_S = 600;

const K = {
  health: (id: string) => `hub:tools:health:${id}`,
  lastOk: (id: string) => `hub:tools:lastok:${id}`,
};

/**
 * Cached probe for one tool, or `null` if there is no fresh answer.
 *
 * `null` covers BOTH a cold cache and an unreadable KV. Both mean the same thing
 * to a caller — we do not currently know — and neither may be rendered as a
 * verdict about the endpoint.
 */
export async function readCachedHealth(id: string): Promise<ToolHealth | null> {
  const probe = await kvGetProbe<ToolHealth>(K.health(id));
  return probe.status === "hit" ? (probe.value ?? null) : null;
}

/** Last time this endpoint was seen up, or `null` if we have never observed it. */
export async function readLastOk(id: string): Promise<number | null> {
  const probe = await kvGetProbe<number>(K.lastOk(id));
  return probe.status === "hit" && typeof probe.value === "number" ? probe.value : null;
}

/**
 * Probe ONE endpoint now and cache the answer. Never throws: a probe failure is
 * a RESULT (`ok: false`), and a KV failure must not turn a successful probe into
 * an exception on a page-load path.
 */
export async function checkToolHealth(id: string, endpoint: string): Promise<ToolHealth> {
  const r = await probeEndpoint(endpoint);
  const checkedAt = Date.now();
  const prevOk = await readLastOk(id);
  // Only a SUCCESSFUL probe moves `lastOkAt`. A failure leaves the previous
  // value in place, which is the whole point — "last seen up 3 days ago" is the
  // sentence a builder needs, and overwriting it on every failed probe would
  // erase it.
  const lastOkAt = r.ok ? checkedAt : prevOk;

  const health: ToolHealth = {
    ok: r.ok,
    status: r.status,
    checkedAt,
    durationMs: r.durationMs,
    hint: r.hint,
    lastOkAt,
  };
  try {
    await kvSet(K.health(id), health, HEALTH_TTL_S);
    if (r.ok) await kvSet(K.lastOk(id), checkedAt); // no TTL: this is history
  } catch {
    /* Cache write failed — the answer is still correct for THIS request. */
  }
  return health;
}

/**
 * Health for a set of tools, re-probing only the ones whose cache went cold.
 *
 * Probes run in PARALLEL because they are independent and each already carries
 * its own 8s timeout inside `probeEndpoint`; serialising six dead tunnels would
 * cost 48s on one page-load. The result is keyed by id and every id in `tools`
 * is present, so a caller cannot silently lose one.
 */
export async function healthForTools(
  tools: { id: string; endpoint: string }[],
): Promise<Record<string, ToolHealth | null>> {
  const entries = await Promise.all(
    tools.map(async (t): Promise<[string, ToolHealth | null]> => {
      const cached = await readCachedHealth(t.id);
      if (cached) return [t.id, cached];
      try {
        return [t.id, await checkToolHealth(t.id, t.endpoint)];
      } catch {
        // An unexpected throw is NOT evidence the endpoint is down — it is
        // evidence we failed to ask. Report "unknown", never "down".
        return [t.id, null];
      }
    }),
  );
  return Object.fromEntries(entries);
}

