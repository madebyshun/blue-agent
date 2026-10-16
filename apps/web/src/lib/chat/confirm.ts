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
  | { kind: "armed"; what: string; silent: boolean }
  | { kind: "warn"; what: string; why: string }
  | { kind: "blocked"; what: string; why: string }
  /** Nothing pending, but this action was just armed by an earlier "yes". */
  | { kind: "already"; what: string };

/** Rewrites the assistant's reply to the "yes" as the action progresses, so
 *  the outcome reads as chat (ShunTr 2026-10-16), not as a card. */
export type StatusSink = (text: string) => void;

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
let lastArmed: { what: string; at: number } | null = null;

export function forgetArmed(): void { lastArmed = null; }

/** Route a confirmation. null ⟹ nothing pending: the message goes to the model as usual. */
export function confirmLatest(now = Date.now(), sink?: StatusSink): ConfirmOutcome | null {
  const p = latestPending(now);
  if (!p) {
    if (lastArmed && now - lastArmed.at <= CONFIRM_WINDOW_MS) return { kind: "already", what: lastArmed.what };
    return null;
  }
  const out = p.fire(sink);
  if (out.kind === "armed") { pending.delete(p.id); lastArmed = { what: out.what, at: now }; }
  return out;
}

/** The assistant's local reply to a confirmation (no model call, no credits). */
export function confirmReply(o: ConfirmOutcome): string {
  if (o.kind === "blocked") return `Not signing: ${o.what} is blocked. ${o.why}`;
  if (o.kind === "already") return `${o.what} was already sent to your wallet above. Nothing else is waiting for a yes.`;
  if (o.kind === "warn") return `${o.what} has a warning: ${o.why} Reply yes again to sign it anyway.`;
  return o.silent ? `Signing ${o.what}…` : `Signing ${o.what}. Confirm in your wallet.`;
}

/** Pure: the chat text for an armed action's progress. Markdown (the reply renders it). */
export function statusText(what: string, s:
  | { phase: "working" } | { phase: "stuck" }
  | { phase: "sent"; href: string | null }
  | { phase: "done"; href: string | null; detail?: string }
  | { phase: "error"; message: string }): string {
  const link = (href: string | null) => (href ? ` [View tx ↗](${href})` : "");
  switch (s.phase) {
    case "working": return `Signing ${what}…`;
    case "stuck": return `Couldn't start ${what}. The details are open above.`;
    case "sent": return `Sent ${what}. Waiting for it to confirm…${link(s.href)}`;
    case "done": return `✓ Done: ${s.detail ? `${s.detail} on ${what.split(" on ").pop()}` : what}.${link(s.href)}`;
    case "error": return `✗ ${what} failed: ${s.message.replace(/\.$/, "")}. Reply **yes** to retry.`;
  }
}
