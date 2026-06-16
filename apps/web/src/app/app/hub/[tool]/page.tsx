import HubView from "@/app/hub/HubView";

// /app/hub/[tool] — the in-app Hub with a tool pre-selected (inline runner).
// Same shell as /app/hub, just deep-linked to one tool.
export default async function AppHubToolPage({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  return <HubView inShell initialToolId={tool} />;
}
