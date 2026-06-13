// Sidebar navigation for the Blue Agent docs. Order here drives both the
// sidebar and the prev/next footer links.

export type DocLink = { title: string; href: string };
export type DocGroup = { group: string; items: DocLink[] };

export const DOC_NAV: DocGroup[] = [
  { group: "Getting Started", items: [
    { title: "Overview",   href: "/docs" },
    { title: "Quickstart", href: "/docs/quickstart" },
    { title: "Founder Workflow", href: "/docs/workflow" },
  ]},
  { group: "Products", items: [
    { title: "Blue Chat", href: "/docs/blue-chat" },
    { title: "Blue Hub",  href: "/docs/blue-hub" },
  ]},
  { group: "CLI Reference", items: [
    { title: "Commands",    href: "/docs/commands" },
    { title: "Skills",      href: "/docs/skills" },
    { title: "Aeon Skills", href: "/docs/aeon-skills" },
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
