// Route page for /hub/submit (public host). Renders the List-your-tool form
// INSIDE the Hub shell (sidebar + nav) via HubView's initialView, so the layout
// matches /hub/dashboard and the user can return to Browse in one click. The
// app-subdomain variant lives at /app/hub/submit (inShell). Thin wrapper keeps
// Next 15's PageProps constraint satisfied (pages only receive params).
import HubView from "@/app/hub/HubView";

export default function Page() {
  return <HubView initialView="submit" />;
}
