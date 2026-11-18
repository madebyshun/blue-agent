/**
 * /hood/arrows — Blue Hood track record.
 *
 * Public receipt book. Every engine-fired, graded arrow lives here
 * forever with its brief + outcome detail + facts_at_fire strip. This
 * page WILL BE EMPTY at ship — that's the point. Reviewer explicitly
 * called out: "DO NOT seed data just for show". First real graded
 * arrow will show up here automatically when Monday's NYSE session
 * closes the first arb window.
 */
import type { Metadata } from "next";
import { pageMeta } from "@/lib/og-card";
import TrackRecordClient from "./TrackRecordClient";

export const metadata: Metadata = pageMeta("/hood/arrows", "Blue Hood · Track record", "Every graded arrow, forever. Chainlink-vs-DEX signals with a receipt: brief · outcome · facts at fire.");

export const revalidate = 0;
export const dynamic = "force-dynamic";

export default function ArrowsTrackRecordPage() {
  return <TrackRecordClient />;
}
