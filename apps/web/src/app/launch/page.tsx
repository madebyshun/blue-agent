// /launch → redirect to Blue Chat, the real launch surface.
// The old standalone wizard called a non-existent /api/tool/token-launch route
// (404) and showed a stale fee model. Token launch now happens in Blue Chat via
// `prepare_token_launch` → one-click Bankr deploy (57% creator fee to the user).
import { redirect } from "next/navigation";

export default function LaunchRedirectPage() {
  redirect("/app/chat");
}
