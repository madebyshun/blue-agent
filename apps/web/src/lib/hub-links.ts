"use client";

import { useEffect, useState } from "react";

/**
 * Host-aware Blue Hub tool-detail links.
 *
 * The per-tool detail page lives at a DIFFERENT path on each host:
 *   • marketing (blueagent.dev)     → /hub/tool/<slug>   (src/app/hub/tool/[slug])
 *   • app       (app.blueagent.dev) → /hub/<slug>        (middleware rewrites /hub/* → /app/hub/[tool])
 *
 * Shared client components (DashboardView, SubmitTool) render on BOTH hosts, so a
 * hardcoded `/hub/tool/<slug>` link 404s on the app subdomain (no `/tool/` route
 * there). This hook returns a builder that picks the right path at runtime.
 *
 * Starts on the marketing path so the server render and the first client render
 * agree (no hydration mismatch), then flips after mount when the host is the app
 * subdomain. Navigation only happens post-mount, so the flipped value is always
 * what the user actually clicks.
 */
export function useToolDetailHref(): (id: string) => string {
  const [onAppHost, setOnAppHost] = useState(false);
  useEffect(() => {
    if (typeof window !== "undefined") {
      setOnAppHost(window.location.host.startsWith("app."));
    }
  }, []);
  return (id: string) => (onAppHost ? `/hub/${id}` : `/hub/tool/${id}`);
}
