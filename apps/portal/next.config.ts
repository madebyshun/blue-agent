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
    return [
      {
        // The secure builder-submit form (real wagmi SIWE) lives on the web app.
        // Both write to the same registry KV, so point the marketplace submit
        // entry there until the portal hosts its own wallet flow.
        source: "/submit",
        destination: "https://blueagent.dev/hub/submit",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
