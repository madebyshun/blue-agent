import type { Metadata } from "next";
import RegistryView from "@/app/hub/_components/RegistryView";

export const metadata: Metadata = {
  title: "Agent Registry — Blue Hub",
  // Kept in sync with the in-app twin at src/app/app/hub/registry/page.tsx —
  // the full note lives there. Short version: Blue Agent only (Aeon and
  // MiroShark are retired, and the deep-research pass returned nothing anyway),
  // no pass count, and no chain named because this route reads a GitHub repo.
  description: "Discover Base AI agents. Submit your GitHub repo and get graded A–F by Blue Agent from your real repo data.",
};

// /hub/registry — public (marketing host) route. Renders the shared RegistryView
// with the full marketing chrome (<Navbar/>). The in-app twin lives at
// /app/hub/registry (<RegistryView inShell />).
export default function RegistryPage() {
  return <RegistryView />;
}
