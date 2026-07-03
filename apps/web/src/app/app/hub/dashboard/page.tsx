import type { Metadata } from "next";
import HubView from "@/app/hub/HubView";

export const metadata: Metadata = {
  title: "Creator Dashboard — Blue Hub",
  description: "Your listed tools, live run counts, and accrued USDC earnings on Blue Hub.",
};

// /app/hub/dashboard — the app-subdomain route. The middleware rewrites
// /hub/dashboard → /app/hub/dashboard on app.blueagent.dev, so this wrapper must
// exist or the creator dashboard 404s there. Renders the dashboard INSIDE the Hub
// shell (sidebar + nav kept) via initialView, mirroring /app/hub/[tool] — so a
// creator can jump back to Browse in one click instead of losing the shell.
export default function AppHubDashboardPage() {
  return <HubView inShell initialView="dashboard" />;
}
