import type { Metadata } from "next";
import RegistryView from "@/app/hub/_components/RegistryView";

export const metadata: Metadata = {
  title: "Agent Registry — Blue Hub",
  // Said "a 3-agent audit" until 2026-09-26. The THREE PASSES ARE REAL —
  // api/agent-registry/submit/route.ts runs runAeonSkill twice, then
  // runMiroSharkSkill, then runBlueSkill — so unlike the retired Hub-wide
  // "3-agent consensus" claim this one is not inflated, and the names stay.
  // What changed is the word "agent": they are system-prompt personas on one
  // Virtuals endpoint (`_lib/llm.ts`), not three independent auditors, and
  // "audit" in a meta description promises an independence a single endpoint
  // prompted three ways cannot supply. See api/catalog/route.ts.
  // ⚠️ Do NOT add "Base 8453 / Robinhood Chain 4663" here. Hard rule #1 is about
  // naming the chain when a claim IS chain-scoped; this route reads a GitHub
  // repo (file tree, README, package.json) and touches neither chain. An
  // earlier draft of this very line added both chain ids and would have
  // invented a capability to satisfy a rule that did not apply.
  description: "Discover Base AI agents. Submit your GitHub repo and get graded A–F from three analysis passes (Blue · Aeon · MiroShark) over your real repo data.",
};

// /app/hub/registry — the app-subdomain route. The middleware rewrites
// /hub/registry → /app/hub/registry on app.blueagent.dev, so this wrapper must
// exist or the registry gets swallowed by the sibling /app/hub/[tool] dynamic
// route. Renders the shared RegistryView inside the AppShell (nav rail kept).
export default function AppHubRegistryPage() {
  return <RegistryView inShell />;
}
