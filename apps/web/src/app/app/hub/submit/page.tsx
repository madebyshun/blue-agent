import type { Metadata } from "next";
import SubmitToolPage from "@/app/hub/submit/page";

export const metadata: Metadata = {
  title: "List your tool — Blue Hub",
  description: "Register an external, AI, or API-wrapper tool on Blue Hub and earn USDC per call.",
};

// /app/hub/submit — app-subdomain fallback route. The middleware rewrites
// /hub/submit → /app/hub/submit on app.blueagent.dev, so this wrapper must exist
// or the submit route 404s there. The primary path is the "List your tool" modal
// on the Hub (G3); this stays as a shareable/deep-link fallback.
export default function AppHubSubmitPage() {
  return <SubmitToolPage />;
}
