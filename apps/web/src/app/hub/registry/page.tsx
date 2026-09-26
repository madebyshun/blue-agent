import type { Metadata } from "next";
import RegistryView from "@/app/hub/_components/RegistryView";

export const metadata: Metadata = {
  title: "Agent Registry — Blue Hub",
  // Kept in sync with the in-app twin at src/app/app/hub/registry/page.tsx —
  // the full note lives there. Short version: the three passes are real
  // (submit/route.ts runs Aeon ×2, MiroShark, then Blue), but they are personas
  // on one Virtuals endpoint rather than three independent agents, and this
  // route reads a GitHub repo, so it deliberately names no chain.
  description: "Discover Base AI agents. Submit your GitHub repo and get graded A–F from three analysis passes (Blue · Aeon · MiroShark) over your real repo data.",
};

// /hub/registry — public (marketing host) route. Renders the shared RegistryView
// with the full marketing chrome (<Navbar/>). The in-app twin lives at
// /app/hub/registry (<RegistryView inShell />).
export default function RegistryPage() {
  return <RegistryView />;
}
