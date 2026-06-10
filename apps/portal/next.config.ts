import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // api.blueagent.dev — developer portal, separate from blueagent.dev
  webpack(config) {
    // wagmi connectors pull in optional/native packages (porto, accounts,
    // pino-pretty) that don't exist in the Node/webpack build — mark them
    // external so the bundle skips them. Mirrors apps/web/next.config.ts.
    config.externals = [
      ...(Array.isArray(config.externals) ? config.externals : config.externals ? [config.externals] : []),
      {
        accounts: "accounts",
        "pino-pretty": "pino-pretty",
        "porto/internal": "porto/internal",
        porto: "porto",
      },
    ];
    return config;
  },
};

export default nextConfig;
