import { redirect } from "next/navigation";

// Staking UI now lives in the unified /app/dashboard shell as a tab.
// Existing inbound links (footer CTAs, share links, /rewards marketing)
// land directly on the Stake tab.
export default function RewardsRedirect() {
  redirect("/dashboard?tab=stake");
}
