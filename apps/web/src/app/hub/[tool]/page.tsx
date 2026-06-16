import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import ToolDetailClient from "./ToolDetailClient";

// Pre-render every tool page (69 at last count) at build time — good for SEO +
// social crawlers. Count derives from AGENT_TOOLS, so this is a hint, not a gate.
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
  // Suspense: ToolDetailClient reads ?s= via useSearchParams, which needs a
  // boundary under a statically-generated route.
  return (
    <Suspense fallback={null}>
      <ToolDetailClient toolId={t.id} />
    </Suspense>
  );
}
