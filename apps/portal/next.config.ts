import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // api.blueagent.dev — developer portal, separate from blueagent.dev.
  // Point Next at the monorepo root so it resolves the workspace lockfile
  // correctly — fixes the "Failed to patch lockfile / Cannot read properties
  // of undefined (reading 'os')" crash that fails the Vercel build of this
  // subproject (non-fatal locally, fatal on Vercel).
  outputFileTracingRoot: path.join(process.cwd(), "..", ".."),
  async redirects() {
    // ── Retiring the api.blueagent.dev product UI (0 users) ────────────────────
    // The single live marketplace is now app.blueagent.dev/hub (95/5). The dead
    // product-UI routes below (marketplace, agents, submit, staking, dashboard,
    // providers, auth, home) redirect there.
    //
    // KEPT (still referenced — do NOT redirect): /docs/* (linked from
    // blueagent.dev's /mcp + /api-docs redirects and the web docs pages), the
    // /api/* backend, /blog, and the /terms + /privacy legal pages. A blanket
    // redirect would break the docs, so these routes are preserved by omission.
    const HUB = "https://app.blueagent.dev/hub";
    const toHub = (source: string) => ({ source, destination: HUB, permanent: false });
    return [
      { source: "/submit", destination: "https://app.blueagent.dev/hub/submit", permanent: false },
      toHub("/"),
      toHub("/marketplace"),
      toHub("/marketplace/:id"),
      toHub("/agents"),
      toHub("/staking"),
      toHub("/dashboard"),
      toHub("/providers"),
      toHub("/providers/:handle"),
      toHub("/signin"),
      toHub("/signup"),
    ];
  },
};

export default nextConfig;
