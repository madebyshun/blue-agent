/**
 * /hood/inbox — retired from the UI 2026-11-12 with the /hood page. Alerts
 * had been paused since arrows stopped (2026-09-30), so the inbox could only
 * list old arrows; the record of those is /hood/arrows. Per-user read marks
 * stay in KV (user state is evidence, not clutter); /api/hood/inbox/* is kept.
 */
import { redirect } from "next/navigation";

export default function HoodInboxPage() {
  redirect("/hood/arrows");
}
