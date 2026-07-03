import type { Metadata } from "next";
import DashboardView from "@/app/hub/_components/DashboardView";

export const metadata: Metadata = {
  title: "Creator Dashboard — Blue Hub",
  description: "Your listed tools, live run counts, and accrued USDC earnings on Blue Hub.",
};

// /app/hub/dashboard — the app-subdomain route. The middleware rewrites
// /hub/dashboard → /app/hub/dashboard on app.blueagent.dev, so this wrapper must
// exist or the creator dashboard 404s there. Runs inside the app shell.
export default function AppHubDashboardPage() {
  return <DashboardView inShell />;
}
