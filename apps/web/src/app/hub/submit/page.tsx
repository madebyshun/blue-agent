// Route page for /hub/submit (public host + app-subdomain fallback via
// /app/hub/submit). The form UI lives in SubmitTool, a client component also
// mounted as the "List your tool" modal on the Hub. Thin wrapper satisfies
// Next 15's PageProps constraint (pages only receive params/searchParams).
import SubmitTool from "@/app/hub/_components/SubmitTool";

export default function Page() {
  return <SubmitTool variant="page" />;
}
