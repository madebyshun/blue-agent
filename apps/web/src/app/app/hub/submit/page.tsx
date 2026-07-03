import type { Metadata } from "next";
import HubView from "@/app/hub/HubView";

export const metadata: Metadata = {
  title: "List your tool — Blue Hub",
  description: "Register an external, AI, or API-wrapper tool on Blue Hub and earn USDC per call.",
};

// /app/hub/submit — the app-subdomain route. The middleware rewrites
// /hub/submit → /app/hub/submit on app.blueagent.dev, so this wrapper must exist
// or the submit route 404s there. Renders the submit form INSIDE the Hub shell
// (sidebar + nav kept) via initialView, mirroring /app/hub/dashboard — so a
// creator can jump back to Browse in one click instead of losing the shell.
export default function AppHubSubmitPage() {
  return <HubView inShell initialView="submit" />;
}
