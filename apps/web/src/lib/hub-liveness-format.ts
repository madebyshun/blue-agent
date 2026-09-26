/**
 * Endpoint-liveness TYPES and pure formatters. No KV, no fetch, no server deps.
 *
 * Split out from `hub-liveness.ts` for one reason: the Hub grid is a client
 * component, and `hub-liveness.ts` imports `@/lib/kv` and `probeEndpoint`. A
 * client component importing that pulls the KV client into the browser bundle
 * and fails the server/client boundary at `next build` — the exact class of
 * error `tsc --noEmit` does not catch.
 *
 * So the three places that must agree on wording — the Hub badge, the report
 * script, and the hermetic guard — all import from HERE, and nothing in this
 * file can reach the network.
 */

/** One probe result, as stored in KV and as served to the browser. */
export type ToolHealth = {
  /** Reachable AND answering like a tool: 2xx or 402. Mirrors `probeEndpoint`. */
  ok: boolean;
  /** HTTP status, or 0 when the connection itself failed (DNS, refused, TLS). */
  status: number;
  /** When THIS probe ran (unix ms). The badge shows age from here. */
  checkedAt: number;
  durationMs: number;
  /** Verbatim failure reason from the probe. Shown to the builder, not summarised. */
  hint?: string;
  /**
   * Last time this endpoint was EVER seen up (unix ms), across all probes.
   *
   * Stored in its own key with no TTL, so "last reachable 3 days ago" survives
   * the probe cache expiring. `null` = never observed up BY THIS MECHANISM,
   * which for a tool registered before it existed means "no data", NOT "never
   * worked". The UI must not phrase it as the latter.
   */
  lastOkAt: number | null;
};

/**
 * How an endpoint reads to a human.
 *
 * 🔴 `"unknown"` is a THIRD state and not a synonym for either neighbour.
 * Collapsing it to `"unreachable"` accuses a builder whose tool is fine;
 * collapsing it to `"up"` rebuilds the original bug, where 5 dead tunnels were
 * advertised as live because nothing had re-checked them. Anything rendering
 * this must branch on all three.
 */
export type LivenessLabel = "up" | "unreachable" | "unknown";

export function livenessLabel(h: ToolHealth | null | undefined): LivenessLabel {
  if (!h) return "unknown";
  return h.ok ? "up" : "unreachable";
}

/** Badge text + colour per state. One table so the three surfaces cannot drift. */
export const LIVENESS_META: Record<LivenessLabel, { label: string; color: string; title: string }> = {
  up: {
    label: "Endpoint up",
    color: "#34D399",
    title: "The builder's endpoint answered a live probe",
  },
  unreachable: {
    label: "Unreachable",
    color: "#F87171",
    // Says what we observed, not what the builder did. Most of these are
    // expired dev tunnels, which is a normal thing to happen to a submission.
    title: "Did not answer the last probe — it may be an expired dev tunnel",
  },
  unknown: {
    label: "Not checked",
    color: "#64748B",
    title: "No recent probe — this is not a claim that the endpoint is down",
  },
};

/** "3m", "5h", "2d" — compact age for a badge. Non-finite in → `null` out. */
export function ageLabel(ts: number | null | undefined, now = Date.now()): string | null {
  if (typeof ts !== "number" || !Number.isFinite(ts)) return null;
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}

/**
 * The full sentence for a tooltip: state, when we looked, and — when it is down
 * — when it last worked. `lastOkAt` is the part a builder actually needs, so it
 * is only omitted when we genuinely have no value for it.
 */
export function livenessTitle(h: ToolHealth | null | undefined, now = Date.now()): string {
  const state = livenessLabel(h);
  const meta = LIVENESS_META[state];
  if (!h) return meta.title;
  const checked = ageLabel(h.checkedAt, now);
  const parts = [meta.title];
  if (checked) parts.push(`Checked ${checked} ago.`);
  if (h.status > 0) parts.push(`HTTP ${h.status}.`);
  if (!h.ok) {
    const seen = ageLabel(h.lastOkAt, now);
    parts.push(seen ? `Last seen up ${seen} ago.` : "Not yet seen up by this check.");
    if (h.hint) parts.push(h.hint);
  }
  return parts.join(" ");
}
