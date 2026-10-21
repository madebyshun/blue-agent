/**
 * Confirm-in-chat (ShunTr, 2026-10-16): the user signs a prepared action by
 * typing a confirmation word instead of opening "Review & sign".
 *
 * Non-custodial by construction — the confirmation only DRIVES the same
 * signing card, in the user's own browser, with the user's own wallet:
 *   • an embedded Privy wallet signs without a modal below SILENT_MAX_USD;
 *   • at or above it, and for every external wallet, the wallet's own
 *     prompt still appears (one tap).
 *
 * Who can confirm: only the user's own typed message, matched HERE in code
 * before anything reaches the model. A model reply, a tool result or a page
 * the agent read cannot confirm anything — that is the prompt-injection line.
 *
 * What is confirmed: the newest pending action in the open chat, created
 * within CONFIRM_WINDOW_MS. An older one (a reloaded chat, yesterday's
 * proposal) is never armed by a "yes".
 */
export const CONFIRM_WORDS = ["yes", "ok", "confirm", "có", "đồng ý"] as const;
export const CONFIRM_WINDOW_MS = 10 * 60_000;
/** At or above this estimated USD value an embedded wallet still shows its prompt. */
export const SILENT_MAX_USD = 100;

/** Pure: is this whole message a confirmation? Case, surrounding spaces and
 *  trailing punctuation are ignored; anything else in the message is not. */
export function isConfirmWord(text: string): boolean {
  const t = text.normalize("NFC").trim().toLowerCase().replace(/[\s.!?,;:…]+$/u, "").replace(/\s+/g, " ");
  return (CONFIRM_WORDS as readonly string[]).includes(t);
}

/** What happened when a confirmation was routed to a pending action. */
export type ConfirmOutcome =
  | { kind: "armed"; what: string; silent: boolean; verb?: "sign" | "arm" }
  | { kind: "warn"; what: string; why: string }
  | { kind: "blocked"; what: string; why: string }
  /** Nothing pending, but this action was just armed by an earlier "yes":
   *  still at the wallet (settled=false) or already finished. */
  | { kind: "already"; what: string; settled: boolean; silent?: boolean; verb?: "sign" | "arm" };

/** Rewrites the assistant's reply to the "yes" as the action progresses, so
 *  the outcome reads as chat (ShunTr 2026-10-16), not as a card. */
export type StatusSink = (text: string, final: boolean) => void;

export interface PendingAction {
  id: string;
  /** The chat message's creation time — not the mount time, which a reload resets. */
  createdAt: number;
  fire: (sink?: StatusSink) => ConfirmOutcome;
}

const pending = new Map<string, PendingAction>();

export function registerPending(p: PendingAction): () => void {
  pending.set(p.id, p);
  return () => { if (pending.get(p.id) === p) pending.delete(p.id); };
}

/** The newest pending action inside the window, or null. Pure over `now`. */
export function latestPending(now = Date.now(), from: Iterable<PendingAction> = pending.values()): PendingAction | null {
  let best: PendingAction | null = null;
  for (const p of from) {
    if (!(p.createdAt > 0) || now - p.createdAt > CONFIRM_WINDOW_MS || p.createdAt > now + 60_000) continue;
    if (!best || p.createdAt > best.createdAt) best = p;
  }
  return best;
}

/**
 * The last action a "yes" armed. A second "yes" right after it must not reach
 * the model: MEASURED on the PR preview 2026-10-16, the model read the bare
 * "yes" as a request and proposed the same swap again, one more "yes" away
 * from a duplicate trade. Forgotten as soon as the user types anything else,
 * so a later "yes" to an ordinary question still goes to the model.
 */
let lastArmed: { what: string; at: number; settled: boolean; silent: boolean; verb?: "sign" | "arm" } | null = null;

export function forgetArmed(): void { lastArmed = null; }
/** The armed action finished (done). A failure calls forgetArmed instead: it
 *  goes back to pending, and the next "yes" retries it. */
export function settleArmed(): void { if (lastArmed) lastArmed.settled = true; }

/** Route a confirmation. null ⟹ nothing pending: the message goes to the model as usual. */
export function confirmLatest(now = Date.now(), sink?: StatusSink): ConfirmOutcome | null {
  const p = latestPending(now);
  if (!p) {
    if (lastArmed && now - lastArmed.at <= CONFIRM_WINDOW_MS) return { kind: "already", what: lastArmed.what, settled: lastArmed.settled, silent: lastArmed.silent, verb: lastArmed.verb };
    return null;
  }
  const out = p.fire(sink);
  if (out.kind === "armed") { pending.delete(p.id); lastArmed = { what: out.what, at: now, settled: false, silent: out.silent, verb: out.verb }; }
  return out;
}

/** The assistant's local reply to a confirmation (no model call, no credits). */
export function confirmReply(o: ConfirmOutcome): string {
  if (o.kind === "blocked") return `Not signing: ${o.what} is blocked. ${o.why}`;
  // Turning on an alert signs nothing (measured 2026-10-21: the second yes
  // said "is signing from your wallet" for an alert).
  if (o.kind === "already" && o.verb === "arm") return o.settled
    ? `That is already on. Nothing else is waiting for a yes.`
    : `Already turning it on. No need to reply again; it shows above in a moment.`;
  if (o.kind === "already") return o.settled
    ? `${o.what} is already done. Nothing else is waiting for a yes.`
    : o.silent
      // Measured 2026-10-21: a Base stock buy signs an approve, waits for it,
      // then swaps — long enough that the user typed "yes" again.
      ? `Already on it: ${o.what} is signing from your wallet. No need to reply again; the result appears above in a few seconds.`
      : `Still waiting on your wallet for ${o.what}. Confirm it there, or reject it to cancel.`;
  if (o.kind === "warn") return `${o.what} has a warning: ${o.why} Reply yes again to sign it anyway.`;
  if (o.verb === "arm") return `Turning on: ${o.what}…`;
  return o.silent ? `Signing ${o.what}…` : `Signing ${o.what}. Confirm in your wallet.`;
}

/** Pure: the chat text for an armed action's progress. Markdown (the reply renders it). */
export function statusText(what: string, s:
  | { phase: "working"; note?: string } | { phase: "stuck" }
  | { phase: "sent"; href: string | null }
  | { phase: "done"; href: string | null; detail?: string; text?: string }
  | { phase: "error"; message: string }, verb: "sign" | "arm" = "sign", silent = true): string {
  const link = (href: string | null) => (href ? ` [View tx ↗](${href})` : "");
  switch (s.phase) {
    case "working": {
      if (verb === "arm") return `Turning on: ${what}…`;
      const step = s.note ? ` (${s.note})` : "";
      return silent ? `Signing ${what}…${step}` : `Signing ${what}${step}. Confirm in your wallet.`;
    }
    case "stuck": return `Couldn't start ${what}. The details are open above.`;
    case "sent": return `Sent ${what}. Waiting for it to confirm…${link(s.href)}`;
    case "done": if (s.text) return s.text;
      return `✓ Done: ${s.detail ? `${s.detail} on ${what.split(" on ").pop()}` : what}.${link(s.href)}`;
    case "error": return verb === "arm" ? `✗ Couldn't turn it on: ${s.message.replace(/\.$/, "")}. Reply **yes** to retry.` : `✗ ${what} failed: ${s.message.replace(/\.$/, "")}. Reply **yes** to retry.`;
  }
}
