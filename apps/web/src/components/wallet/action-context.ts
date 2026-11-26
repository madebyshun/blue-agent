"use client";
/**
 * Contexts that let a chat confirmation ("yes") drive a signing card.
 *
 *   ActionMessageContext  set by ChatMessages around each message's tool
 *                         results: the message's createdAt, so a reloaded chat
 *                         never arms yesterday's proposal (lib/chat/confirm.ts).
 *   AutoConfirmContext    set by ActionStrip around its card: `armed` once the
 *                         user confirmed, `silent` when the embedded wallet may
 *                         sign without its modal (< SILENT_MAX_USD).
 */
import { createContext, useContext, useEffect, useRef } from "react";

export const ActionMessageContext = createContext<{ createdAt: number } | null>(null);

/** What a chat-confirmed card is doing, reported up to its ActionStrip so the
 *  card itself can stay out of sight (ShunTr 2026-10-16: "chỉ cần chat ngôn
 *  ngữ tự nhiên, không cần thao tác trên card"). */
export type AutoStatus =
  | { phase: "working"; note?: string }
  | { phase: "sent"; href: string | null }
  | { phase: "done"; href: string | null; detail?: string; text?: string }
  | { phase: "warn"; why: string }
  | { phase: "error"; message: string };

export interface AutoConfirm {
  armed: boolean; silent: boolean; report?: (s: AutoStatus) => void;
  /** The strip's warning was said in chat and the user said "yes" again. */
  warnAck?: boolean;
}
export const AutoConfirmContext = createContext<AutoConfirm>({ armed: false, silent: false });

/** What each card step means, said in the chat reply while it runs, so a
 *  two-transaction action (approve, then swap) visibly moves. */
const STEP_NOTE: Record<string, string> = {
  switching: "switching network",
  preparing: "preparing",
  approving: "approving the token first",
  swapping: "swapping",
  signing: "signing",
  sending: "sending",
};

/**
 * In a signing card: report its own step machine to the strip while armed.
 * `sentSteps`: submitted, waiting for the chain (or the bridge fill).
 * `doneSteps`: finished. "idle" says nothing; "error" carries `err`; any other
 * step is work in progress.
 */
export function useAutoReport(
  step: string, err: string, href: string | null,
  o: { sentSteps?: string[]; doneSteps?: string[]; detail?: string; doneText?: string } = {},
) {
  const { armed, report } = useContext(AutoConfirmContext);
  const sent = (o.sentSteps ?? ["broadcasting"]).includes(step);
  const done = (o.doneSteps ?? ["done"]).includes(step);
  useEffect(() => {
    if (!armed || !report || step === "idle") return;
    if (step === "error") report({ phase: "error", message: err || "Failed." });
    else if (done) report({ phase: "done", href, detail: o.detail, ...(o.doneText ? { text: o.doneText } : {}) });
    else if (sent) report({ phase: "sent", href });
    else report({ phase: "working", ...(STEP_NOTE[step] ? { note: STEP_NOTE[step] } : {}) });
  }, [armed, report, step, err, href, sent, done, o.detail, o.doneText]);
}

/**
 * In a signing card: once the user confirmed in chat and the card is ready
 * (quote in, check cleared, nothing in flight), run its primary action ONCE,
 * passing whether the embedded wallet may sign silently.
 */
export function useAutoConfirm(ready: boolean, run: (opts: { silent: boolean }) => void) {
  const { armed, silent } = useContext(AutoConfirmContext);
  const fired = useRef(false);
  useEffect(() => {
    if (!armed || !ready || fired.current) return;
    fired.current = true;
    run({ silent });
  }, [armed, ready, silent, run]);
}

/**
 * In a signing card: once the user confirmed in chat (`armed`), report any
 * pre-flight blocker (no quote, insufficient balance, missing wallet, invalid
 * address) immediately as chat text instead of sitting silent until
 * ActionStrip's timeout fires.
 */
export function useAutoBlocker(reason: string | null | undefined) {
  const { armed, report } = useContext(AutoConfirmContext);
  const reported = useRef(false);
  useEffect(() => {
    if (!armed) { reported.current = false; return; }
    if (!report || !reason || reported.current) return;
    reported.current = true;
    report({ phase: "error", message: reason });
  }, [armed, report, reason]);
}

/**
 * In a signing card: once armed, if the card's own pre-trade check (e.g. after
 * resolving a Basename → 0x address) returns WARN, surface the warning in chat
 * and let a second "yes" acknowledge it instead of timing out silently.
 */
export function useAutoWarn(why: string | null | undefined) {
  const { armed, warnAck, report } = useContext(AutoConfirmContext);
  const reported = useRef(false);
  useEffect(() => {
    if (!armed) { reported.current = false; return; }
    if (!report || !why || warnAck || reported.current) return;
    reported.current = true;
    report({ phase: "warn", why });
  }, [armed, warnAck, report, why]);
}
