// Sidebar navigation for the Blue Agent docs. Order here drives both the
// sidebar and the prev/next footer links.

export type DocLink = { title: string; href: string };
export type DocGroup = { group: string; items: DocLink[] };

export const DOC_NAV: DocGroup[] = [
  { group: "Getting Started", items: [
    { title: "Overview",   href: "/docs" },
    { title: "Quickstart", href: "/docs/quickstart" },
    { title: "Workflow",   href: "/docs/workflow" },
  ]},
  { group: "Products", items: [
    // BlueAgent Relaunch order — Blue Hood first (flagship: oracle-vs-DEX
    // drift on Base + RH). Blue Bank removed (archived, /docs/bluebank
    // parked; middleware redirects /bank + /pay to /chat).
    { title: "Blue Hood", href: "/docs/blue-hood" },
    { title: "Blue Chat", href: "/docs/blue-chat" },
    { title: "Blue Hub",  href: "/docs/blue-hub" },
    { title: "List a Tool", href: "/docs/list-a-tool" },
    // Blue Feed hidden while rebuilding — its docs page is parked (404).
  ]},
  { group: "Knowledge", items: [
    { title: "Skills",      href: "/docs/skills" },
    // Aeon Skills left the nav 2026-08 (legacy narrative) and the page itself
    // was deleted 2026-09-25 with the Bankr purge. /docs/aeon-skills now 301s
    // to /docs/skills from culledRedirect() in middleware.ts — it answered 200
    // in production, so it gets a redirect, not a 404. Do not re-add it here.
    { title: "Beryl / B20", href: "/docs/beryl" },
  ]},
  { group: "Platform", items: [
    { title: "x402 Tools",      href: "/docs/x402" },
    { title: "Credits & Tiers", href: "/docs/credits" },
    { title: "MCP Setup",       href: "/docs/mcp" },
    { title: "For Developers",  href: "/docs/develop" },
  ]},
];

// Flattened order for prev/next navigation.
export const DOC_ORDER: DocLink[] = DOC_NAV.flatMap((g) => g.items);
