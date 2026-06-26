import type { Metadata } from "next";
import HubView from "@/app/hub/HubView";
import { AGENT_TOOLS } from "@/lib/agent-tools";

// Pre-render every tool's metadata/OG at build time (good for SEO + social crawlers).
export function generateStaticParams() {
  return AGENT_TOOLS.map(t => ({ tool: t.id }));
}

export async function generateMetadata(
  { params, searchParams }: { params: Promise<{ tool: string }>; searchParams: Promise<{ s?: string }> }
): Promise<Metadata> {
  const { tool } = await params;
  const { s } = await searchParams;
  const t = AGENT_TOOLS.find(x => x.id === tool);
  if (!t) return { title: "Tool not found · Blue Hub" };

  const title = `${t.name}${t.price ? ` — ${t.price}` : ""} · Blue Hub`;
  const description = t.description;
  const canonical = `https://app.blueagent.dev/hub/${t.id}`;

  // Shared result (?s=<id>) → dynamic OG image (verdict + confidence). Without
  // it, the file-based opengraph-image (static tool card) is used automatically.
  const images = s && /^[a-f0-9]{6,32}$/.test(s)
    ? [{ url: `https://blueagent.dev/api/og/hub-result?s=${s}`, width: 1200, height: 630 }]
    : undefined;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: { type: "website", url: images ? `${canonical}?s=${s}` : canonical, title, description, siteName: "Blue Hub", ...(images ? { images } : {}) },
    twitter: { card: "summary_large_image", title, description, ...(images ? { images: images.map(i => i.url) } : {}) },
  };
}

// /app/hub/[tool] — the in-app Hub with a tool pre-selected (inline runner).
// Same shell as /app/hub, just deep-linked to one tool.
export default async function AppHubToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  return <HubView inShell initialToolId={tool} />;
}
