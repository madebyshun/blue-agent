import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // api.blueagent.dev — developer portal, separate from blueagent.dev
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
