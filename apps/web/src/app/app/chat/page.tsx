import type { Metadata } from "next";
import ChatClient from "./ChatClient";

/* 🔴 All three strings below read "Build anything on Base … launch tokens,
   deploy B20, audit contracts, live Base intelligence" until 2026-09-26. Three
   separate wrongs, and the middle one is the one the retiring law is about.
   MEASURED that day against `api/chat/route.ts`: chat declares 55 tools and
   emits exactly three signable cards — `prepare_swap`, `prepare_send`,
   `prepare_yield` (plus `robinhood_bridge`/`_send`/`_swap`). There is NO launch
   card and NO B20-deploy card. "launch tokens" was the Bankr launchpad, deleted
   2026-09-06 after a 403 ban; "deploy B20" lives at /app/b20hub/launch, a
   different page. So the copy kept selling a deleted product and a product that
   is somewhere else — the exact gap CLAUDE.md names: exposure outliving
   maintenance. A description is where a retired surface hides longest, because
   the page it describes never renders it.
   "live Base intelligence" was also one chain: the same file's tool list holds
   `hub_hood_arrow` + the three `robinhood_*` cards, so chat has spanned Base
   8453 AND Robinhood Chain 4663 for as long as those existed. Hard rule #1.
   What is claimed below is now exactly what was counted in the route. If you
   add or remove a card, this block is part of that commit. */
export const metadata: Metadata = {
  title: "Blue Chat — BlueAgent",
  description: "Agent chat that hands you transactions to sign: swap, send, bridge, earn. Audit contracts, read Base 8453 and Robinhood Chain 4663 live. Non-custodial.",
  openGraph: {
    title: "Blue Chat — transactions you sign yourself",
    description: "Swap, send, bridge and earn through transactions you sign yourself. Audit contracts, read Base 8453 and Robinhood Chain 4663 live.",
    url: "https://app.blueagent.dev/chat",
    siteName: "BlueAgent",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Blue Chat — transactions you sign yourself",
    description: "Swap, send, bridge and earn through transactions you sign yourself. Audit contracts, read Base 8453 and Robinhood Chain 4663 live.",
  },
};

export default function Page() {
  return <ChatClient />;
}
