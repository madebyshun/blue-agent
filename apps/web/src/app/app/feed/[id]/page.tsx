// /app/feed/[id] — server route for shareable per-item Blue Feed links.
//
// /app/feed is a client component, so X/Twitter/Farcaster crawlers can't read
// its dynamic meta tags. This server page renders proper per-item OpenGraph
// tags (via generateMetadata, read from KV) for bots, then meta-refreshes human
// visitors to /app/feed?item=<id> (the live client view). Everything is
// defensive — an unknown id still returns valid fallback meta, never throws.
import type { Metadata } from "next";
import { kvGet } from "@/lib/kv";
import type { FeedItem } from "@/app/api/cron/feed/route";

async function findItem(id: string): Promise<FeedItem | null> {
  try {
    const items = (await kvGet<FeedItem[]>("feed:items")) ?? [];
    return items.find((i) => i.id === id) ?? null;
  } catch {
    return null;
  }
}

export async function generateMetadata(
  { params }: { params: Promise<{ id: string }> },
): Promise<Metadata> {
  const { id } = await params;
  const item = await findItem(id);
  if (!item) return { title: "Blue Feed — BlueAgent" };

  const ogImage = `https://blueagent.dev/api/og/feed/${encodeURIComponent(id)}`;
  return {
    title: `${item.title} — Blue Feed`,
    description: item.summary,
    openGraph: {
      title: item.title,
      description: item.summary,
      url: `https://blueagent.dev/app/feed/${id}`,
      siteName: "BlueAgent",
      type: "website",
      images: [{ url: ogImage, width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title: item.title,
      description: item.summary,
      images: [ogImage],
    },
  };
}

export default async function FeedItemPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const target = `/app/feed?item=${encodeURIComponent(id)}`;
  return (
    <>
      {/* Bots read the og tags above (head); humans get redirected to the feed. */}
      <meta httpEquiv="refresh" content={`0;url=${target}`} />
      <div className="flex h-full w-full items-center justify-center bg-[#050508]">
        <a href={target} className="font-mono text-[12px] text-[#4FC3F7] hover:underline">
          Opening Blue Feed…
        </a>
      </div>
    </>
  );
}
