import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        // Clean marketing shortcut for the MCP setup guide (tweets, bio, etc.).
        // Temporary (307) so we can re-point to blueagent.dev/docs/mcp once the
        // docs domain is consolidated onto the main site.
        source: "/mcp",
        destination: "https://api.blueagent.dev/docs/mcp",
        permanent: false,
      },
      {
        // /api-docs retired — API + MCP docs now live on the api subdomain.
        // The main docs hub is blueagent.dev/docs.
        source: "/api-docs",
        destination: "https://api.blueagent.dev/docs",
        permanent: false,
      },
      {
        // The hub app lives at /app/hub but tool detail pages live at /hub/[tool].
        // A natural link like /app/hub/blue-idea has no route → 404. Point it at
        // the real detail page.
        source: "/app/hub/:tool",
        destination: "/hub/:tool",
        permanent: false,
      },
    ];
  },
  webpack(config) {
    // tempoWallet connector dynamically imports 'accounts' (native pkg)
    // which doesn't exist in Node/webpack — mark it as external to skip bundling
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      { accounts: "accounts", "pino-pretty": "pino-pretty" },
    ];
    return config;
  },
};

export default nextConfig;
