// /app/feed — server wrapper around the client feed UI.
//
// Exists so a shared `?item=<id>` deep link gets per-item OpenGraph meta
// (title/description/image) for social cards. The interactive feed lives in
// FeedClient. generateMetadata reads the item from KV; everything is defensive
// (KV miss / unknown id → generic feed meta, never throws).
import type { Metadata } from "next";
import { kvGet } from "@/lib/kv";
import type { FeedItem } from "@/app/api/cron/feed/route";
import FeedClient from "./FeedClient";

const FALLBACK: Metadata = {
  title: "Blue Feed · Live Base intelligence",
  description:
    "Live Base ecosystem intelligence — TVL, narratives, momentum, whale flow. Powered by Bankr + Venice AI.",
};

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ item?: string }> },
): Promise<Metadata> {
  try {
    const { item } = await searchParams;
    if (!item) return FALLBACK;

    const items = (await kvGet<FeedItem[]>("feed:items")) ?? [];
    const found = items.find((i) => i.id === item);
    if (!found) return FALLBACK;

    const title = `${found.title} · Blue Feed`;
    const description = found.summary || "Live Base ecosystem intelligence.";
    const url = `https://app.blueagent.dev/feed/${found.id}`;
    const image = {
      url: `https://blueagent.dev/api/og/feed/${encodeURIComponent(found.id)}`,
      width: 1200,
      height: 630,
    };

    return {
      title,
      description,
      openGraph: { type: "website", url, title, description, siteName: "Blue Feed", images: [image] },
      twitter: { card: "summary_large_image", title, description, images: [image.url] },
    };
  } catch {
    return FALLBACK;
  }
}

export default function Page() {
  return <FeedClient />;
}
