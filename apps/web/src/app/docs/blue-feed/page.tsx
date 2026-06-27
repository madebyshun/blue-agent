// /docs/blue-feed — TEMPORARILY HIDDEN while Blue Feed is rebuilt.
//
// Parked alongside the product itself (/app/feed renders 404 + noindex). The
// previous doc content is kept in git history; restore it here — and re-add the
// nav entry in ../_nav.ts + the product card in ../_data.ts — when the feed
// relaunches.
import { notFound } from "next/navigation";

export const metadata = {
  title: "Blue Feed — BlueAgent Docs",
  robots: { index: false, follow: false },
};

export default function BlueFeedDoc() {
  notFound();
}
