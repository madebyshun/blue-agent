"use client";

/**
 * Blue Hood — Enable alerts (T-D D3).
 *
 * Only requests notification permission when the user CLICKS the button.
 * Never auto-prompts on page load — per reviewer: "Permission hỏi ĐÚNG
 * 1 LẦN lúc user bấm 'Enable alerts'".
 *
 * States:
 *   • idle              — button says "Enable alerts"
 *   • checking          — briefly, while we ask the SW registration
 *   • subscribed        — button says "Alerts on ·  turn off"
 *   • unsupported / denied — button becomes an inline status label
 *
 * iOS Safari note: notifications only work when the site is installed
 * to the home screen (Add to Home Screen). We show a one-time hint
 * inline when we detect iOS + no standalone-mode.
 */

import { useCallback, useEffect, useState } from "react";

type Status = "loading" | "unsupported" | "denied" | "idle" | "subscribed" | "busy";

const BORDER = "#1A1A2E";
const RH_GREEN = "#00C805";
const MUTED = "#6b7280";
const AMBER = "#f5b342";

export default function EnableAlertsButton() {
  const [status, setStatus] = useState<Status>("loading");
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Basic capability check.
      if (typeof window === "undefined" || !("serviceWorker" in navigator) || !("PushManager" in window)) {
        setStatus("unsupported");
        setIosHint(iOSNeedsHomescreen());
        return;
      }
      if (Notification.permission === "denied") { setStatus("denied"); return; }

      // Register (idempotent — registering an already-active worker is a no-op).
      let reg: ServiceWorkerRegistration;
      try {
        reg = await navigator.serviceWorker.register("/hood-sw.js", { scope: "/hood/" });
      } catch {
        setStatus("unsupported");
        return;
      }
      const existing = await reg.pushManager.getSubscription();
      if (cancelled) return;
      setStatus(existing ? "subscribed" : "idle");
    })();
    return () => { cancelled = true; };
  }, []);

  const enable = useCallback(async () => {
    setStatus("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("denied");
        return;
      }
      const keyRes = await fetch("/api/hood/push/subscribe", { method: "GET", cache: "no-store" });
      const keyBody = (await keyRes.json()) as { vapid_public_key?: string; error?: string };
      if (!keyBody.vapid_public_key) {
        console.warn("[hood-alerts] server disabled:", keyBody.error);
        setStatus("idle");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyBody.vapid_public_key),
      });
      const json = sub.toJSON() as {
        endpoint?: string;
        keys?: { p256dh?: string; auth?: string };
      };
      const post = await fetch("/api/hood/push/subscribe", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          ua: navigator.userAgent,
        }),
      });
      if (!post.ok) throw new Error(`server ${post.status}`);
      setStatus("subscribed");
    } catch (e) {
      console.warn("[hood-alerts] enable failed:", (e as Error).message);
      setStatus("idle");
    }
  }, []);

  const disable = useCallback(async () => {
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        const endpoint = sub.endpoint;
        await sub.unsubscribe();
        await fetch("/api/hood/push/subscribe", {
          method: "DELETE",
          cache: "no-store",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint }),
        });
      }
      setStatus("idle");
    } catch {
      setStatus("subscribed");
    }
  }, []);

  if (status === "loading") return null;
  if (status === "unsupported") {
    return (
      <span className="rounded border px-2 py-1 font-mono text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
        alerts unsupported
        {iosHint && <> · <span style={{ color: AMBER }}>iOS: Add to Home Screen</span></>}
      </span>
    );
  }
  if (status === "denied") {
    return (
      <span className="rounded border px-2 py-1 font-mono text-[11px]" style={{ borderColor: BORDER, color: MUTED }}>
        alerts blocked · enable in browser settings
      </span>
    );
  }
  if (status === "subscribed") {
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
  return (
    <button
      onClick={enable}
      disabled={status === "busy"}
      className="rounded border px-2 py-1 font-mono text-[11px] hover:text-white disabled:opacity-50"
      style={{ borderColor: BORDER, color: "#9aa1ac" }}
    >
      {status === "busy" ? "…" : "Enable alerts"}
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
