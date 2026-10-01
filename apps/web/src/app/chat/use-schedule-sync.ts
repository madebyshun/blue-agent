"use client";
/**
 * Blue Chat — keeping the browser's task list and the server's scheduler agreed.
 *
 * Two copies exist because they answer different questions. localStorage is what
 * the panel renders and works with no account at all; `crons:w:<wallet>` is what
 * a cron can read at 09:00 while the tab is closed. This hook is the seam.
 *
 * ── Who owns which field ─────────────────────────────────────────────────────
 * The split is not symmetric, and it can't be — both sides write, so "last write
 * wins" would mean a tick landing mid-edit either loses the user's rename or
 * resurrects a task they just switched off.
 *
 *   CLIENT owns  label · schedule · time · tz · prompt · tier · background
 *   SERVER owns  nextAt · lastRun · lastResult · lastError · pausedReason
 *   `active` is the client's — EXCEPT when the server paused it, which it
 *   reports by attaching a `pausedReason`. That is a fact about a run that
 *   already happened (usually an empty balance), so the client adopts it. Any
 *   other `active:false` from the server is stale and the local value wins.
 *
 * ── Only background tasks are uploaded ───────────────────────────────────────
 * A task with `background` off never leaves the browser. Nothing about a
 * foreground task needs to be on a server, and every row we upload is a row a
 * cron will read forever.
 *
 * ── A 503 is not an empty schedule ───────────────────────────────────────────
 * Same rule as `/api/workspace`: on "could not check", do nothing. Rendering
 * "no scheduled tasks" during a KV throttle is how a user re-creates tasks that
 * already exist and gets billed for both.
 *
 * ── Only as the CONNECTED wallet ─────────────────────────────────────────────
 * Every request carries `?address=<walletAddr>`, which the route compares with
 * the session (401 `wallet_mismatch` on a difference), and neither the pull nor
 * the push starts without `hasSession(walletAddr)`. A session left over from a
 * different wallet used to be enough: B's tasks were uploaded under A, and A's
 * were adopted into B's browser.
 *
 * ── Every list change is ONE functional update ───────────────────────────────
 * `mutateCrons(prev => …)` with the pure helpers in `schedule-merge.ts`, never
 * a loop of per-task patches over the `crons` this render saw — see that file's
 * header for the two ways the loop lost writes and re-enrolled tasks.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { CronTask } from "./types";
import { isBackground } from "./storage";
import {
  applyServerPull, applyServerNextAt, patchById, switchAllToForeground,
  FOREGROUND_PATCH, type ServerTask,
} from "./schedule-merge";
import { useEnsureSession } from "@/hooks/useEnsureSession";
import { sessionFetch } from "@/lib/session-client";

export type ScheduleState =
  | { phase: "off" }                     // nothing is scheduled server-side
  | { phase: "signed-out" }              // background tasks exist, no session
  | { phase: "syncing" }
  | { phase: "idle";  at: number }
  | { phase: "error"; message: string };

export interface UseScheduleSync {
  state: ScheduleState;
  /** How many tasks are set to run in the background. */
  count: number;
  /**
   * Turn background running on for one task. Prompts for a signature if there is
   * no session yet — that is the whole cost of the feature, and it is charged
   * once, at the moment the user asks for unattended spending.
   */
  enable:  (id: string) => Promise<void>;
  disable: (id: string) => Promise<void>;
  /**
   * Stop EVERY background task — the server copy included, even tasks this
   * browser no longer knows about (Scheduled research L4). Local tasks are
   * kept, switched to "on open".
   */
  disableAll: () => Promise<void>;
}

/** Only what the server needs. Everything else stays in the browser. */
function toPayload(c: CronTask) {
  return {
    id: c.id, label: c.label, schedule: c.schedule,
    time: c.time, tz: c.tz, prompt: c.prompt,
    tier: c.tier ?? "pro", active: c.active,
  };
}

/** Cheap change detector, so an unchanged list never costs a request. */
function fingerprint(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

export function useScheduleSync(
  walletAddr: string | undefined,
  crons: CronTask[],
  /** Apply `fn` to the CURRENT list (a functional update that also persists). */
  mutateCrons: (fn: (prev: CronTask[]) => CronTask[]) => void,
  signIn: () => Promise<string>,
): UseScheduleSync {
  const [state, setState] = useState<ScheduleState>({ phase: "off" });
  const { hasSession } = useEnsureSession();

  const lastSent = useRef<string>("");
  const pulled   = useRef<string | null>(null);   // wallet we have already pulled for

  const background = crons.filter(isBackground);
  const payload    = JSON.stringify(background.map(toPayload));
  // The connected wallet, for the route to compare with the session. Never the
  // owner — the route takes that from the SIWE session only.
  const scheduleUrl = walletAddr
    ? `/api/chat/schedule?address=${encodeURIComponent(walletAddr)}`
    : "/api/chat/schedule";

  // ── Pull: adopt whatever the scheduler did while we were away ──────────────
  //
  // Once per wallet, on open. Not on a timer: the tick writes at most once per
  // task per day, so polling would spend requests to learn nothing. Re-opening
  // the tab is the natural refresh.
  //
  // Also when THIS browser has no background task but the wallet is signed in
  // (2026-09-30, Scheduled research L4): tasks saved from another browser, or
  // before localStorage was cleared, kept running and charging with no way to
  // see or stop them here. Without a session there is nothing to ask — and no
  // prompt is shown on open.
  //
  // The session must be THIS wallet's whether or not background tasks exist
  // locally: with one present this used to GET under whatever session the
  // cookie held, and adopt that other wallet's tasks into this wallet's list.
  useEffect(() => {
    if (!walletAddr) return;
    if (pulled.current === walletAddr) return;

    let cancelled = false;
    void (async () => {
      if (!(await hasSession(walletAddr))) {
        if (!cancelled && background.length > 0) setState({ phase: "signed-out" });
        return;
      }
      if (cancelled) return;
      pulled.current = walletAddr;
      return sessionFetch(scheduleUrl, { cache: "no-store" })
      .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
      .then(({ status, body }) => {
        if (cancelled) return;
        if (status === 401) { setState({ phase: "signed-out" }); pulled.current = null; return; }
        if (status === 503) {
          // Explicitly leave the local list alone. See the header.
          setState({ phase: "error", message: "Couldn't reach the scheduler — showing your local tasks." });
          pulled.current = null;
          return;
        }
        const tasks = Array.isArray(body?.tasks) ? (body.tasks as ServerTask[]) : [];
        // Every patch and every adoption in ONE update, against the list as it
        // is now. A pause wins over the local `active`; a bare `active:false`
        // does not; server-only tasks are adopted as background so they can be
        // seen and switched off here. See `applyServerPull`.
        if (tasks.length > 0) mutateCrons(prev => applyServerPull(prev, tasks));
        setState({ phase: "idle", at: Date.now() });
      })
      .catch(() => {
        if (cancelled) return;
        setState({ phase: "error", message: "Couldn't reach the scheduler." });
        pulled.current = null;
      });
    })();
    return () => { cancelled = true; };
  }, [walletAddr, background.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Push: mirror the background subset up whenever it changes ──────────────
  useEffect(() => {
    if (!walletAddr) return;
    const fp = fingerprint(payload);
    if (fp === lastSent.current) return;

    // An empty list still uploads once — it is how "I turned my last background
    // task off" reaches the scheduler. Without it the task keeps firing.
    if (background.length === 0 && lastSent.current === "") {
      lastSent.current = fp;
      setState({ phase: "off" });
      return;
    }

    let cancelled = false;
    setState({ phase: "syncing" });
    void (async () => {
      // Same gate as the pull: never upload this wallet's tasks under a session
      // that belongs to another one. The route refuses a mismatch too; this
      // just doesn't send the request. The fingerprint is not recorded, so the
      // next change after signing in retries.
      if (!(await hasSession(walletAddr))) {
        if (!cancelled) setState({ phase: "signed-out" });
        return;
      }
      if (cancelled) return;
      return sessionFetch(scheduleUrl, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ tasks: JSON.parse(payload) }),
      })
        .then(async r => ({ status: r.status, body: await r.json().catch(() => ({})) }))
        .then(({ status, body }) => {
          if (cancelled) return;
          if (status === 401) { setState({ phase: "signed-out" }); return; }
          if (!(status >= 200 && status < 300)) {
            // Do NOT record the fingerprint — the next change retries.
            setState({ phase: "error", message: body?.error ?? "Couldn't save your schedule." });
            return;
          }
          lastSent.current = fp;
          // Adopt the server's `nextAt`, so the panel shows the instant the cron
          // will actually use rather than one the browser computed separately.
          const saved = Array.isArray(body?.tasks) ? (body.tasks as ServerTask[]) : [];
          if (saved.length > 0) mutateCrons(prev => applyServerNextAt(prev, saved));
          setState(background.length === 0 ? { phase: "off" } : { phase: "idle", at: Date.now() });
        });
    })().catch(() => {
      if (!cancelled) setState({ phase: "error", message: "Couldn't reach the scheduler." });
    });
    return () => { cancelled = true; };
  }, [walletAddr, payload]); // eslint-disable-line react-hooks/exhaustive-deps

  const enable = useCallback(async (id: string) => {
    if (!walletAddr) {
      setState({ phase: "error", message: "Connect a wallet to run tasks in the background." });
      return;
    }
    // Sign in FIRST, then flip the flag. Flipping first would show the task as
    // scheduled while the PUT that makes it true is still 401-ing — a task the
    // UI says is running and nothing is running.
    if (state.phase === "signed-out" || state.phase === "off") {
      try {
        await signIn();
      } catch (e) {
        setState({ phase: "error", message: (e as Error).message || "Sign-in was cancelled." });
        return;
      }
    }
    pulled.current = null;   // let the next pull adopt this task's run history
    mutateCrons(prev => patchById(prev, id, { background: true }));
  }, [walletAddr, state.phase, signIn, mutateCrons]);

  const disable = useCallback(async (id: string) => {
    // Clears the server-owned fields too: leaving a stale `nextAt` behind would
    // make the card claim a firing time nothing is going to honour.
    mutateCrons(prev => patchById(prev, id, FOREGROUND_PATCH));
  }, [mutateCrons]);

  const disableAll = useCallback(async () => {
    if (!walletAddr) {
      setState({ phase: "error", message: "Connect a wallet to manage background tasks." });
      return;
    }
    // DELETE first: it stops tasks this browser cannot see, which the per-task
    // switch never could. Only on success are the local switches flipped, so
    // the UI never claims "all off" while the server is still running them —
    // and the route now answers 503, not 200, when the KV delete did not land.
    try {
      const r = await sessionFetch(scheduleUrl, { method: "DELETE" });
      if (r.status === 401) { setState({ phase: "signed-out" }); return; }
      if (!r.ok) { setState({ phase: "error", message: "Couldn't stop the background tasks — try again." }); return; }
    } catch {
      setState({ phase: "error", message: "Couldn't reach the scheduler." });
      return;
    }
    // Every background task in ONE update, so the payload this produces is
    // "[]" by construction and the push effect has nothing to re-upload. (A
    // per-task loop kept only its last patch and PUT the rest straight back.)
    mutateCrons(switchAllToForeground);
    lastSent.current = fingerprint("[]");
    setState({ phase: "off" });
  }, [walletAddr, scheduleUrl, mutateCrons]);

  return { state, count: background.length, enable, disable, disableAll };
}
