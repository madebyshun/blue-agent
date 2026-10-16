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
  | { phase: "working" }
  | { phase: "sent"; href: string | null }
  | { phase: "done"; href: string | null; detail?: string }
  | { phase: "error"; message: string };

export interface AutoConfirm {
  armed: boolean; silent: boolean; report?: (s: AutoStatus) => void;
  /** The strip's warning was said in chat and the user said "yes" again. */
  warnAck?: boolean;
}
export const AutoConfirmContext = createContext<AutoConfirm>({ armed: false, silent: false });

/**
 * In a signing card: report its own step machine to the strip while armed.
 * `sentSteps`: submitted, waiting for the chain (or the bridge fill).
 * `doneSteps`: finished. "idle" says nothing; "error" carries `err`; any other
 * step is work in progress.
 */
export function useAutoReport(
  step: string, err: string, href: string | null,
  o: { sentSteps?: string[]; doneSteps?: string[]; detail?: string } = {},
) {
  const { armed, report } = useContext(AutoConfirmContext);
  const sent = (o.sentSteps ?? ["broadcasting"]).includes(step);
  const done = (o.doneSteps ?? ["done"]).includes(step);
  useEffect(() => {
    if (!armed || !report || step === "idle") return;
    if (step === "error") report({ phase: "error", message: err || "Failed." });
    else if (done) report({ phase: "done", href, detail: o.detail });
    else if (sent) report({ phase: "sent", href });
    else report({ phase: "working" });
  }, [armed, report, step, err, href, sent, done, o.detail]);
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
