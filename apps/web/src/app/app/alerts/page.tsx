import { redirect } from "next/navigation";

// Alerts CRUD is deferred (to be rebuilt later). The legacy route lands on
// the dashboard overview so existing links don't 404.
export default function AlertsRedirect() {
  redirect("/dashboard");
}
