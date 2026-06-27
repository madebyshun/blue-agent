// /app/feed — TEMPORARILY HIDDEN while Blue Feed is rebuilt.
//
// The data pipeline (cron) is paused and the feed showed stale/broken data, so
// the route is parked: it renders 404 + noindex instead of the live feed. The
// file (and ./FeedClient, ./[id]) is intentionally KEPT so the URL stays
// reserved and the rebuild has its scaffold.
//
// To restore: bring back FeedClient + the KV-backed generateMetadata from git
// history (see the commit that introduced this notice), and re-enable the cron
// (FEED_PAUSED in src/app/api/cron/feed/_shared.ts).
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Blue Feed",
  robots: { index: false, follow: false },
};

export default function Page() {
  notFound();
}
