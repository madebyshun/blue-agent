/**
 * /hood — Blue Hood public terminal.
 *
 * 24/7 onchain copilot for Robinhood Chain RWA tokens. Public read-only —
 * no auth required. Server-renders the shell for SEO + share-ability; the
 * live table + auto-refresh happens in the client child.
 *
 * Data path: this page NEVER calls x402 tools directly. It reads from the
 * KV snapshot the poller writes (see /api/cron/blue-hood/poll). Zero cost
 * per page-view even under a Reddit hug.
 */
import type { Metadata } from "next";
import HoodClient from "./HoodClient";

export const metadata: Metadata = {
  title: "Blue Hood · 24/7 copilot for Robinhood Chain",
  description:
    "Live drift board for 26 tokenized-stock tokens on Robinhood Chain. Chainlink oracle vs DEX pool spot, market-hours aware, updated every 60s.",
  openGraph: {
    title: "Blue Hood · 24/7 copilot for Robinhood Chain",
    description:
      "Chainlink oracle vs DEX. 26 RWA tokens. 30 x402 skills under the hood. Non-custodial.",
  },
};

// Public page — no dynamic rendering needed at the shell level; the
// client component fetches fresh data on mount.
export const revalidate = 0;
export const dynamic = "force-dynamic";

export default function HoodPage() {
  return (
    <main className="min-h-screen bg-[#050508] text-[#E7E9EE]">
      <HoodClient />
    </main>
  );
}
