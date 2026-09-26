import type { Metadata } from "next";
import RegistryView from "@/app/hub/_components/RegistryView";

export const metadata: Metadata = {
  title: "Agent Registry — Blue Hub",
  // Blue Agent only, and no pass count. This line has now been walked back
  // twice, each time for a different reason, so both are recorded:
  //   2026-09-26 — "a 3-agent audit" → "three analysis passes (Blue · Aeon ·
  //     MiroShark)". The number was fine; the words were not. They are
  //     system-prompt personas on one Virtuals endpoint (`_lib/llm.ts`), not
  //     independent auditors, and "audit" promises an independence a single
  //     endpoint prompted three ways cannot supply. See api/catalog/route.ts.
  //   2026-09-27 — the names and the number both go. Aeon and MiroShark are
  //     retired products (ShunTr), and the count was already hollow before
  //     that: runAeonSkill("deep-research") returns null in prod because the
  //     research-loop cron was unscheduled 2026-09-05 (aeon:* KV expired) AND
  //     the GitHub fallback SKILL.md 404s, so submit/route.ts forwards `?? ""`
  //     — one of the three "passes" fed nothing into the grade.
  // The lesson worth keeping: the 09-26 fix audited the adjectives and left
  // the number, because three call sites were right there in the route. Call
  // sites are not outputs. Verify what a pass RETURNS before advertising it.
  // ⚠️ Do NOT add "Base 8453 / Robinhood Chain 4663" here. Hard rule #1 is about
  // naming the chain when a claim IS chain-scoped; this route reads a GitHub
  // repo (file tree, README, package.json) and touches neither chain. An
  // earlier draft of this very line added both chain ids and would have
  // invented a capability to satisfy a rule that did not apply.
  description: "Discover Base AI agents. Submit your GitHub repo and get graded A–F by Blue Agent from your real repo data.",
};

// /app/hub/registry — the app-subdomain route. The middleware rewrites
// /hub/registry → /app/hub/registry on app.blueagent.dev, so this wrapper must
// exist or the registry gets swallowed by the sibling /app/hub/[tool] dynamic
// route. Renders the shared RegistryView inside the AppShell (nav rail kept).
export default function AppHubRegistryPage() {
  return <RegistryView inShell />;
}
