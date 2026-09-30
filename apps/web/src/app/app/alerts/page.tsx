import { redirect } from "next/navigation";

// Alert deliveries land in the Hood inbox. This used to point at /dashboard,
// which is no longer in the nav. Redirect rather than delete so existing links
// keep resolving (link-liveness-check). docs/rebuild-5-tang-2026-09-30.md.
export default function AlertsRedirect() {
  redirect("/hood/inbox");
}
