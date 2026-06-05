import { redirect } from "next/navigation";

// Staking UI lives at /app/rewards (inside the dApp shell)
export default function RewardsRedirect() {
  redirect("/app/rewards");
}
