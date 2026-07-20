"use client";

/**
 * Blue Hood — Enable alerts (T-D D3, hardened).
 *
 * Bug history (task A root-cause):
 *   The v1 impl registered the SW with `scope: "/hood/"` and then
 *   awaited `navigator.serviceWorker.ready`. On this app, pages live
 *   at `/app/hood/*` (middleware rewrite exposes `/hood/*` publicly),
 *   so the SW that controls the current tab must have a scope
 *   covering `/app/hood/*`. A `/hood/`-scoped SW does NOT control the
 *   current page → `.ready` never resolves → the button hangs on "…"
 *   with zero console output. Three separate reports, same root.
 *
 * Fixes in this file (spec A1–A5):
 *   A1 · register with `scope: "/"` — covers /app/hood/* AND /hood/*.
 *   A2 · use the `reg` returned by `register()` directly. Never touch
 *        `navigator.serviceWorker.ready`.
 *   A3 · migration: on mount, sweep any existing `/hood/`-scoped
 *        registration and unregister it so a stale v1 SW doesn't sit
 *        there confusing the picture.
 *   A4 · every step logs a `[push] <step>` line. Every catch logs
 *        `[push] ERROR step=<step> err=<verbatim>`. NO silent branch.
 *   A5 · explicit state machine with a Retry button on error, plus a
 *        10s per-step timeout so the UI never sits on "…" forever.
 *   A6 · VAPID public key is fetched from `/api/hood/push-health` —
 *        server-owned single source. No `NEXT_PUBLIC_*` involved.
 *
 * iOS Safari note (unchanged): notifications only work when the site
 * is installed to the home screen. Shown as a one-time hint when we
 * detect iOS + no standalone mode.
 */

import { useCallback, useEffect, useState } from "react";

type UiState =
  | { kind: "loading" }
  | { kind: "unsupported" }
  | { kind: "denied" }
  | { kind: "idle" }
  | { kind: "busy"; step: string }
  | { kind: "subscribed" }
  | { kind: "error"; step: string; message: string };

const BORDER = "#1A1A2E";
const RH_GREEN = "#00C805";
const MUTED = "#6b7280";
const AMBER = "#f5b342";
const RED = "#ef4444";

const STEP_TIMEOUT_MS = 10_000;

/** Race any promise against a per-step timeout so a hung await can never
 *  strand the UI on "…". Rejected timeouts surface as `error` states with
 *  the step name — traceable from the console + visible in the pill. */
function withTimeout<T>(p: Promise<T>, step: string, ms = STEP_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms}ms at step="${step}"`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); },
           (e) => { clearTimeout(t); reject(e); });
  });
}

/** Unified logger. Every step of enable/disable calls this so a grep
 *  for `[push]` in the browser console tells the full story. */
function plog(step: string, extra?: Record<string, unknown>) {
  const parts = [`[push] ${step}`];
  if (extra) for (const [k, v] of Object.entries(extra)) parts.push(`${k}=${v}`);
  console.log(parts.join(" "));
}
function perr(step: string, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[push] ERROR step=${step} err="${msg.replace(/"/g, "'").slice(0, 300)}"`);
  return msg;
}

export default function EnableAlertsButton() {
  const [state, setState] = useState<UiState>({ kind: "loading" });
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      plog("mount");
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        plog("capability-check", { supported: false });
        setState({ kind: "unsupported" });
        setIosHint(iOSNeedsHomescreen());
        return;
      }
      plog("capability-check", { supported: true, permission: Notification.permission });

      // A3 · migration — sweep any stale v1 registration whose scope
      // ends with `/hood/` (matches the buggy scope exactly). Left in
      // place, that SW's `.ready` promise for `/hood/*` would keep
      // resolving and confuse debugging next time we go there.
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) {
          if (r.scope.endsWith("/hood/") || r.scope.endsWith("/hood")) {
            plog("migration-unregister", { scope: r.scope });
            await r.unregister().catch((e) => perr("migration-unregister", e));
          }
        }
      } catch (e) {
        // Non-fatal — just means we can't sweep. New registration below
        // still works.
        perr("migration-list", e);
      }

      if (Notification.permission === "denied") {
        setState({ kind: "denied" });
        return;
      }

      // A1 · scope "/" — covers /app/hood/* AND /hood/* (middleware
      // rewrites /hood → /app/hood but the SW's `scope` is compared
      // against the raw request URL, so it needs to cover both).
      // A2 · use the returned `reg` directly. NEVER `.ready`.
      let reg: ServiceWorkerRegistration;
      try {
        reg = await withTimeout(
          navigator.serviceWorker.register("/hood-sw.js", { scope: "/" }),
          "sw-register",
        );
        plog("sw-registered", { scope: reg.scope });
      } catch (e) {
        setIosHint(iOSNeedsHomescreen());
        setState({ kind: "unsupported" });
        perr("sw-register", e);
        return;
      }

      // Check for an existing subscription on the freshly-registered SW.
      try {
        const existing = await withTimeout(reg.pushManager.getSubscription(), "get-existing-sub");
        if (cancelled) return;
        plog("existing-sub", { present: !!existing });
        setState(existing ? { kind: "subscribed" } : { kind: "idle" });
      } catch (e) {
        perr("get-existing-sub", e);
        if (!cancelled) setState({ kind: "idle" }); // fail-open — user can still try enable
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async () => {
    plog("click-enable");
    setState({ kind: "busy", step: "requesting-permission" });
    let step = "requesting-permission";
    try {
      // A2 · use fresh registration handle directly, ignore .ready.
      // We re-register here on purpose: `register()` is idempotent when
      // the same URL+scope is already active, so this either returns
      // the existing registration or activates a new one — either way,
      // no `.ready` trap.
      const perm = await withTimeout(Notification.requestPermission(), step);
      plog("permission-result", { perm });
      if (perm !== "granted") {
        setState({ kind: "denied" });
        return;
      }

      step = "fetch-vapid-key";
      setState({ kind: "busy", step });
      const health = await withTimeout(
        fetch("/api/hood/push-health", { cache: "no-store" }).then((r) => r.json()),
        step,
      ) as { ok?: boolean; public_key?: string; vapid_public?: boolean; error?: string };
      plog("push-health", {
        vapid_public: health.vapid_public,
        key_len: health.public_key ? health.public_key.length : 0,
      });
      if (!health.public_key) {
        throw new Error(`push_disabled: server missing VAPID keys (vapid_public=${health.vapid_public})`);
      }

      step = "sw-register";
      setState({ kind: "busy", step });
      const reg = await withTimeout(
        navigator.serviceWorker.register("/hood-sw.js", { scope: "/" }),
        step,
      );
      plog("sw-registered", { scope: reg.scope });

      step = "subscribing";
      setState({ kind: "busy", step });
      const sub = await withTimeout(reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(health.public_key),
      }), step, 20_000);
      plog("subscribed", { endpoint_len: sub.endpoint.length });

      step = "server-ack";
      setState({ kind: "busy", step });
      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const post = await withTimeout(fetch("/api/hood/push/subscribe", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, ua: navigator.userAgent }),
      }), step);
      if (!post.ok) throw new Error(`server_ack_failed: HTTP ${post.status}`);
      plog("server-ack", { status: post.status });

      setState({ kind: "subscribed" });
    } catch (e) {
      const message = perr(step, e);
      setState({ kind: "error", step, message });
    }
  }, []);

  const disable = useCallback(async () => {
    plog("click-disable");
    let step = "sw-lookup";
    setState({ kind: "busy", step });
    try {
      // A2 · again avoid `.ready`. `register()` gives us the same handle
      // idempotently.
      const reg = await withTimeout(
        navigator.serviceWorker.register("/hood-sw.js", { scope: "/" }),
        step,
      );
      step = "get-existing-sub";
      const sub = await withTimeout(reg.pushManager.getSubscription(), step);
      if (sub) {
        step = "unsubscribe";
        const endpoint = sub.endpoint;
        await withTimeout(sub.unsubscribe(), step);
        step = "server-delete";
        await withTimeout(fetch("/api/hood/push/subscribe", {
          method: "DELETE",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }), step);
        plog("disabled", { endpoint_len: endpoint.length });
      }
      setState({ kind: "idle" });
    } catch (e) {
      const message = perr(step, e);
      setState({ kind: "error", step, message });
    }
  }, []);

  if (state.kind === "loading") return null;

  if (state.kind === "unsupported") {
    return (
      <span className="rounded border px-2 py-1 font-mono text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
        alerts unsupported
        {iosHint && <> · <span style={{ color: AMBER }}>iOS: Add to Home Screen</span></>}
      </span>
    );
  }

  if (state.kind === "denied") {
    return (
      <span className="rounded border px-2 py-1 font-mono text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
        alerts blocked · enable in browser settings
      </span>
    );
  }

  if (state.kind === "subscribed") {
    return (
      <button
        onClick={disable}
        className="rounded border px-2 py-1 font-mono text-[11px] hover:text-white"
        style={{ borderColor: RH_GREEN, color: RH_GREEN }}
      >
        ● Alerts on · turn off
      </button>
    );
  }

  if (state.kind === "error") {
    // A5 · error branch is visible: reason + Retry. Never "…" forever.
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="rounded border px-2 py-1 font-mono text-[11px]"
          style={{ borderColor: RED, color: AMBER }}
          title={state.message}
        >
          push setup failed · {state.step}
        </span>
        <button
          onClick={enable}
          className="rounded border px-2 py-1 font-mono text-[11px] hover:text-white"
          style={{ borderColor: BORDER, color: "#9aa1ac" }}
        >
          Retry
        </button>
      </span>
    );
  }

  // idle | busy
  const label = state.kind === "busy" ? "…" : "Enable alerts";
  const title = state.kind === "busy" ? `step: ${state.step}` : undefined;
  return (
    <button
      onClick={enable}
      disabled={state.kind === "busy"}
      title={title}
      className="rounded border px-2 py-1 font-mono text-[11px] hover:text-white disabled:opacity-50"
      style={{ borderColor: BORDER, color: "#9aa1ac" }}
    >
      {label}
    </button>
  );
}

function iOSNeedsHomescreen(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  const isStandalone =
    (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches)
    // Old iOS Safari flag; typed loosely to avoid a Navigator patch.
    || Boolean((window.navigator as unknown as { standalone?: boolean }).standalone);
  return isIOS && !isStandalone;
}

// Return an `ArrayBuffer` (not `Uint8Array`) so it satisfies `BufferSource`
// without relying on the new-in-TS-5.7 `Uint8Array<ArrayBuffer>` generic.
// `pushManager.subscribe.applicationServerKey` accepts BufferSource; an
// ArrayBuffer is the least-ambiguous fit.
function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return buf;
}
