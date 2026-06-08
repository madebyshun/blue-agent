export interface BlogPost {
  slug:    string;
  title:   string;
  excerpt: string;
  date:    string;       // ISO YYYY-MM-DD
  tag:     string;
  color:   string;
  read:    string;
  author:  string;
  body:    string[];     // paragraphs (rendered as <p>)
}

export const POSTS: BlogPost[] = [
  {
    slug:    "blue-hub-v2-launch",
    title:   "Blue Agent v2 — Open marketplace for Base API builders",
    excerpt: "We just shipped the open registry. Anyone can list an API on Blue Hub MCP server in 5 minutes, earn 80% USDC per call.",
    date:    "2026-06-08",
    tag:     "ANNOUNCEMENT",
    color:   "#A78BFA",
    read:    "5 min",
    author:  "Blue Agent team",
    body: [
      "Today we're opening Blue Agent's API marketplace to external builders. Until now, the 50 tools live on Blue Hub MCP server were all first-party — built by us, audited by us, priced by us. That worked for getting started, but the whole point of an MCP server is to be a shared discovery layer for AI agents. So we're opening it up.",
      "Here's what changed: any developer with an HTTPS endpoint that speaks x402 USDC settlement on Base can register their API at /submit. Sign a one-line manifest with your wallet, pass our endpoint probe, and within minutes your tool appears in tools/list on the public Blue Agent MCP. Claude Desktop, Cursor, Cline, every modern MCP client picks you up automatically.",
      "Revenue split is 80/20. You keep 80% of every call settled in USDC on Base; 20% goes to the Blue Hub treasury, which funds operations, ecosystem grants, and (eventually) fee-share to $BLUEAGENT stakers. There's no subscription, no API key, no minimum payout. The first paid call → first USDC.",
      "Why we built it this way: every API marketplace we've used has friction — register an account, generate a key, fund a credit balance, monitor usage. AI agents shouldn't have to do any of that. x402 makes it possible to skip all of it: the agent makes a request, gets HTTP 402 with payment details, signs once, retries with the X-Payment header, gets the result. The whole flow is sub-second, no human in the loop.",
      "What's next: detail pages for every API (so you can drill into pricing, schema, code samples), provider profile pages (already live for Blue Agent, Aeon, MiroShark), public catalog endpoint at /api/catalog, MCP catalog distribution (Smithery, MCP.SO, CDP), and uptime monitoring badges so callers can trust what they're calling.",
      "If you have an API that AI agents should be able to call, list it. If you're an AI agent dev, point your MCP client at our endpoint and discover everything in one place. Either way, ping us on X @blueagent_ — we'll boost good listings.",
    ],
  },
  {
    slug:    "mcp-distribution-blueprint",
    title:   "Why MCP is the agent-discovery layer for crypto",
    excerpt: "Claude Desktop, Cursor, Cline — they all speak one protocol. Here's how Blue Agent lists on every major MCP catalog.",
    date:    "2026-06-07",
    tag:     "INFRA",
    color:   "#4FC3F7",
    read:    "8 min",
    author:  "Blue Agent team",
    body: [
      "The Model Context Protocol (MCP) is the closest thing crypto has to a universal API discovery layer. Anthropic published the spec, every major AI client adopted it within months, and there's a growing index of public servers that ship with thousands of tools. For an API marketplace targeting AI agents, MCP isn't a feature — it's the front door.",
      "Here's the loop we care about: a user installs Claude Desktop, configures Blue Agent's MCP URL once, and now Claude can discover and call every API listed in our marketplace. No SDK, no API key, no per-tool integration. Multiply that by Cursor, Cline, Windsurf, and the long tail of MCP-compatible agents — that's our distribution.",
      "Most MCP servers ship 5-20 tools and call it a day. The Orbis team showed there's a different play: be the aggregator. Their MCP server has just 2 tools (browse_apis + call_api), but those 2 tools route to 24,000+ underlying APIs. The agent never touches an individual provider's API — Orbis brokers the call, settles the payment, returns the result.",
      "Blue Agent sits between those two patterns. We have ~50 first-party tools exposed directly (so tools/list returns real names AI agents can reason about), and we're opening up the registry to let external builders list. The hybrid is intentional: curated first-party gives Claude a strong starting palette, while the open marketplace adds long-tail discovery.",
      "Distribution checklist for the next 30 days: 1) submit to Smithery — the biggest MCP catalog, 2) submit to MCP.SO, 3) list on CDP x402 (Coinbase's x402 provider directory), 4) cross-list on Agentic Market as a service category, 5) ship llms.txt + /api/catalog so AI scrapers can index us. That's how we get to the front of every install snippet shared on X.",
      "If you're building an MCP server, the playbook is simple: pick a vertical, ship a tools/list that returns real domain-specific names, support Streamable HTTP (the 2025-03-26 spec), and submit to every catalog the day you launch. The barrier to entry is install-config, not API design.",
    ],
  },
];
