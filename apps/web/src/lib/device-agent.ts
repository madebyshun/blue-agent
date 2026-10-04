/**
 * "Your agent is working" — what a linked device (BlueCube, BlueBot) shows
 * while the wallet's Blue Chat turn is running tools.
 *
 * Writer: /api/chat, at tool start and at the end of the tool stream.
 * Reader: GET /api/devices/agent (device token), and /api/devices/feed, which
 *         only reports whether a session is live.
 *
 * BUDGET — the reason this is shaped the way it is (#148: Upstash bills per
 * command and the monthly cap has suspended the store three times):
 *   • a wallet with no linked device is never written: `hasLinkedDevices` is
 *     one read, memoized 60s per instance;
 *   • a device does NOT poll this fast by default. It learns a session is live
 *     from the feed it already polls every FEED_POLL_S, and only then polls
 *     /api/devices/agent every AGENT_POLL_S, for ACTIVE_WINDOW_S after the
 *     last turn. An idle cube costs nothing extra; a chatting one costs about
 *     one read per AGENT_POLL_S while the chat lasts.
 * The trade-off is stated, not hidden: the FIRST turn of a session can finish
 * before the device notices (up to one feed interval); every turn after it in
 * that session is shown live.
 *
 * Stale-proofing: a turn that never reaches its end write (crash, timeout)
 * cannot leave a device "thinking" forever — `thinking` also requires the
 * start to be younger than MAX_TURN_S, and the key itself expires.
 */
import { after } from "next/server";
import { kvGetProbe, kvSet } from "@/lib/kv";
import { hasLinkedDevices } from "@/lib/devices";
import type { ActivityItem } from "@/lib/activity";

export const ACTIVE_WINDOW_S = 10 * 60;
export const AGENT_POLL_S = 8;
export const MAX_TURN_S = 120;

interface AgentRecord {
  label: string;
  startedAt: number;
  endedAt?: number;
}

const kAgent = (wallet: string) => `dev:agent:${wallet.toLowerCase()}`;

/** "hub_hood_live" → "Running hood live" — ≤ 21 chars, the cube's caption width. */
export function agentLabel(toolNames: string[]): string {
  const first = (toolNames[0] ?? "").replace(/^(hub|blue|mcp)_+/, "").replace(/_+/g, " ").trim();
  const base = first ? `Running ${first}` : "Thinking";
  const more = toolNames.length > 1 ? ` +${toolNames.length - 1}` : "";
  const full = base + more;
  return full.length <= 21 ? full : `${base.slice(0, 20 - more.length)}~${more}`;
}

export async function noteAgentStart(wallet: string | undefined, toolNames: string[], now = Date.now()): Promise<void> {
  if (!wallet) return;
  try {
    if (!(await hasLinkedDevices(wallet))) return;
    await kvSet(kAgent(wallet), { label: agentLabel(toolNames), startedAt: now } satisfies AgentRecord, ACTIVE_WINDOW_S);
  } catch { /* a device indicator must never break a chat turn */ }
}

export async function noteAgentEnd(wallet: string | undefined, now = Date.now()): Promise<void> {
  if (!wallet) return;
  try {
    if (!(await hasLinkedDevices(wallet))) return;
    const p = await kvGetProbe<AgentRecord>(kAgent(wallet));
    if (p.status !== "hit") return;
    await kvSet(kAgent(wallet), { ...p.value, endedAt: now } satisfies AgentRecord, ACTIVE_WINDOW_S);
  } catch { /* same */ }
}

/**
 * The one call /api/chat makes: start now (unawaited, so the turn is not
 * slowed), end once the response has fully streamed (`after`, which runs
 * exactly then and is not cut off when the stream closes). Outside a request
 * scope (scripts, tests) `after` throws and only the start is recorded.
 */
export function markAgentTurn(wallet: string | undefined, toolNames: string[]): void {
  if (!wallet) return;
  const started = noteAgentStart(wallet, toolNames);
  try {
    after(async () => { await started; await noteAgentEnd(wallet); });
  } catch { void started; }
}

export interface AgentState {
  /** A turn is running tools right now. */
  thinking: boolean;
  label: string | null;
  /** A turn ran within ACTIVE_WINDOW_S — poll /api/devices/agent meanwhile. */
  active: boolean;
  /** Seconds until the device should ask again; null = stop fast polling. */
  next_poll_s: number | null;
}

export function agentStateOf(rec: AgentRecord | null, now = Date.now()): AgentState {
  if (!rec) return { thinking: false, label: null, active: false, next_poll_s: null };
  const thinking = rec.endedAt == null && now - rec.startedAt < MAX_TURN_S * 1000;
  const last = rec.endedAt ?? rec.startedAt;
  const active = now - last < ACTIVE_WINDOW_S * 1000;
  return { thinking, label: thinking ? rec.label : null, active, next_poll_s: active ? AGENT_POLL_S : null };
}

/** null = the store could not be read (unknown, not idle). */
export async function readAgentState(wallet: string, now = Date.now()): Promise<AgentState | null> {
  const p = await kvGetProbe<AgentRecord>(kAgent(wallet));
  if (p.status === "error") return null;
  return agentStateOf(p.status === "hit" ? p.value : null, now);
}
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
