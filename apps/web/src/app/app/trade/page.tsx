import { redirect } from "next/navigation";

// Was a "Coming Soon" placeholder. Swap/send/bridge on Base and Robinhood Chain
// live in Wallet. Redirect rather than delete so the published URL keeps
// resolving (link-liveness-check). docs/rebuild-5-tang-2026-09-30.md.
export default function Page() {
  redirect("/wallet");
}
