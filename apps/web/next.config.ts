import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [];
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
