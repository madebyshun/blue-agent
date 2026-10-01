/**
 * Validation of a watch rule — shared by /api/watches (POST) and the chat
 * tool that drafts one, so chat can never offer a rule the API would refuse.
 */
import type { WatchDirection, WatchKind, WatchWindow } from "./types";

export function parseRule(b: Record<string, unknown>): { kind: WatchKind; direction: WatchDirection; threshold: number; window?: WatchWindow } | { error: string } {
  const kind = b.kind === "change" ? "change" : b.kind === "price" ? "price" : null;
  if (!kind) return { error: "kind must be 'price' or 'change'" };
  const threshold = Number(b.threshold);
  if (!Number.isFinite(threshold) || threshold <= 0) return { error: "threshold must be a positive number" };
  if (kind === "price") {
    if (b.direction !== "above" && b.direction !== "below") return { error: "a price watch is 'above' or 'below'" };
    if (threshold > 1e12) return { error: "threshold is out of range" };
    return { kind, direction: b.direction, threshold };
  }
  if (b.direction !== "up" && b.direction !== "down") return { error: "a change watch is 'up' or 'down'" };
  if (threshold < 1 || threshold > 1000) return { error: "a change threshold is between 1% and 1000%" };
  const window = b.window === "1h" ? "1h" : b.window === "24h" ? "24h" : null;
  if (!window) return { error: "a change watch needs window '1h' or '24h'" };
  return { kind, direction: b.direction, threshold, window };
}

