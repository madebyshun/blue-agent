// Route page for /hub/dashboard (public host). The UI lives in DashboardView, a
// client component reused by /app/hub/dashboard via the `inShell` prop. Thin
// wrapper keeps Next 15's PageProps constraint satisfied (pages only receive
// params/searchParams).
import DashboardView from "@/app/hub/_components/DashboardView";

export default function Page() {
  return <DashboardView />;
}
