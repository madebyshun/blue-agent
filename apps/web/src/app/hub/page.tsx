// Route page for /hub. The heavy UI lives in HubView (a client component reused
// by /app/hub via the `inShell` prop). Keeping the route page a thin wrapper
// satisfies Next 15's PageProps constraint (pages only receive params/searchParams).
import HubView from "./HubView";

export default function Page() {
  return <HubView />;
}
