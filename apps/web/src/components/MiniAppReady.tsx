"use client";

import { useEffect } from "react";

/**
 * Signals to the Mini App host (Base App / Farcaster) that the interface is
 * loaded so it can dismiss the splash screen. Without this call the splash
 * never goes away and the app appears frozen inside Base App.
 *
 * Safe in a normal browser: the SDK is dynamically imported and `ready()` is a
 * no-op when there is no Mini App host, and any error is swallowed.
 */
export default function MiniAppReady() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { sdk } = await import("@farcaster/miniapp-sdk");
        // Only signal ready once we're actually inside a Mini App host.
        const inMiniApp = await sdk.isInMiniApp().catch(() => false);
        if (!cancelled && inMiniApp) {
          await sdk.actions.ready();
        }
      } catch {
        /* not in a Mini App host, or SDK unavailable — ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
