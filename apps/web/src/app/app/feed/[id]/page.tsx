// /app/feed/[id] — TEMPORARILY HIDDEN while Blue Feed is rebuilt.
//
// Was the server route that rendered per-item OpenGraph tags for shareable feed
// links. Parked alongside ../page.tsx: renders 404 + noindex for now. The route
// is KEPT so existing /feed/<id> share URLs stay reserved.
//
// To restore: bring back the KV-backed generateMetadata + meta-refresh redirect
// from git history, and re-enable the cron (FEED_PAUSED in
// src/app/api/cron/feed/_shared.ts).
import type { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Blue Feed",
  robots: { index: false, follow: false },
};

export default function Page() {
  notFound();
}
