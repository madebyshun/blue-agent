import { redirect } from "next/navigation";

// Alert CRUD now lives in the unified /app/dashboard shell as a tab.
export default function AlertsRedirect() {
  redirect("/app/dashboard?tab=alerts");
}
