import type { Metadata } from "next";
import HubView from "@/app/hub/HubView";
import { AGENT_TOOLS } from "@/lib/agent-tools";

// Pre-render every tool's metadata/OG at build time (good for SEO + social crawlers).
export function generateStaticParams() {
  return AGENT_TOOLS.map(t => ({ tool: t.id }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ tool: string }> }
): Promise<Metadata> {
  const { tool } = await params;
  const t = AGENT_TOOLS.find(x => x.id === tool);
  if (!t) return { title: "Tool not found · Blue Hub" };

  const title = `${t.name}${t.price ? ` — ${t.price}` : ""} · Blue Hub`;
  const description = t.description;
  const url = `https://blueagent.dev/app/hub/${t.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, siteName: "Blue Hub" },
    twitter: { card: "summary_large_image", title, description },
  };
}

// /app/hub/[tool] — the in-app Hub with a tool pre-selected (inline runner).
// Same shell as /app/hub, just deep-linked to one tool.
export default async function AppHubToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  return <HubView inShell initialToolId={tool} />;
}
