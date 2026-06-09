import { redirect } from "next/navigation";

// /app/profile content has been consolidated into /app/dashboard alongside
// portfolio balances, stake summary, and active alerts. This redirect keeps
// existing bookmarks and deep-links from anywhere in the app working.
export default function ProfileRedirect() {
  redirect("/app/dashboard");
}
