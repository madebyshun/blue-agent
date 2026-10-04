/**
 * Shaping /api/devices/feed for small screens (BlueCube, BlueBot).
 *
 * History: this file replaced lib/device-agent.ts on 2026-10-04. That module
 * fed a "your agent is thinking" face on linked devices. It was retired the
 * same day, unshipped to users, because a desk screen mirroring the chat you
 * are already looking at adds nothing, while making every message show up
 * would have cost ~130K Upstash commands a month per cube (#148). The cube's
 * mascot now reacts to what the agent actually DID: the feed items below.
 */
import type { ActivityItem } from "@/lib/activity";

/**
 * A colour hint for small screens, from fields the item already carries —
 * never a new judgement. `alert` is a fired watch (worth a look), a confirmed
 * trade is done, a reverted or failed one is not.
 */
export function itemTone(i: Pick<ActivityItem, "kind" | "title">): "good" | "warn" | "alert" | "info" {
  if (/reverted|failed|refused/i.test(i.title)) return "alert";
  if (i.kind === "alert") return "warn";
  if (/confirmed/i.test(i.title)) return "good";
  return "info";
}
