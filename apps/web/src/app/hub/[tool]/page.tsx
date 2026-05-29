import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import ToolDetailClient from "./ToolDetailClient";

// Pre-render all 34 tool pages at build time (good for SEO + social crawlers)
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
  const url = `https://blueagent.dev/hub/${t.id}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title,
      description,
      siteName: "Blue Hub",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function ToolPage(
  { params }: { params: Promise<{ tool: string }> }
) {
  const { tool } = await params;
  const t = AGENT_TOOLS.find(x => x.id === tool);
  if (!t) notFound();
  return <ToolDetailClient toolId={t.id} />;
}
