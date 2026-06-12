import type { NextConfig } from "next";

// Deploy retrigger: production was stuck at PR #27; this nudge ships PR #28's
// /app/hub/:tool redirect.

const nextConfig: NextConfig = {
  // Allow a second `next dev` of THIS app (e.g. a parallel agent session) to
  // use its own build dir so two servers don't corrupt a shared `.next`.
  // Defaults to `.next` → production and the primary dev server are unaffected.
  // Start the secondary server with: NEXT_DIST_DIR=.next-dev3004 PORT=3004 …
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
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
    // wagmi v3's `wagmi/connectors` barrel re-exports OPTIONAL connectors
    // (porto / safe / walletconnect / metamask-sdk / base-account) whose peer
    // deps we don't install — we only use coinbaseWallet + EIP-6963 + farcaster.
    // Those unresolved imports made webpack fail the whole connectors module,
    // leaving coinbaseWallet undefined and breaking wallet connect. Stub them to
    // empty modules so the barrel compiles; the app never instantiates them.
    config.resolve = config.resolve || {};
    config.resolve.fallback = {
      ...(config.resolve.fallback || {}),
      "@base-org/account": false,
      "@metamask/connect-evm": false,
      porto: false,
      "porto/internal": false,
      "porto/wagmi": false,
      "@safe-global/safe-apps-sdk": false,
      "@safe-global/safe-apps-provider": false,
      "@walletconnect/ethereum-provider": false,
    };
    return config;
  },
};

export default nextConfig;
