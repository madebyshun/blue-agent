// Blue Chat "Tools" tab catalog.
//
// SINGLE SOURCE OF TRUTH: this list is DERIVED from lib/agent-tools.ts
// (AGENT_TOOLS) — the exact same catalog the Hub page (/hub) renders. That
// keeps the chat Tools tab and the Hub in sync (no more 51-vs-72 drift).
//
// Each Hub tool still needs two chat-specific bits the raw AGENT_TOOLS don't
// carry: a display `category` bucket and a `trigger` (the prompt inserted into
// the composer on click). We preserve the hand-tuned values for the tools that
// had them (CURATED, keyed by id) and fall back to a sensible derivation for
// the rest.

import { AGENT_TOOLS } from "@/lib/agent-tools";

export type SkillCategory =
  | "Market Intel"
  | "Due Diligence"
  | "Builder Tools"
  | "Fundraise"
  | "Launch"
  | "Agent Network"
  | "Ecosystem"
  | "On-chain"
  | "Base Native";

export interface HubSkill {
  id:          string;
  name:        string;
  description: string;
  trigger:     string;   // inserted into chat input on click
  category:    SkillCategory;
}

export const CATEGORY_ICONS: Record<SkillCategory, string> = {
  "Market Intel":  "📈",
  "Due Diligence": "🔍",
  "Builder Tools": "🏗️",
  "Fundraise":     "💰",
  "Launch":        "🚀",
  "Agent Network": "🤝",
  "Ecosystem":     "🌐",
  "On-chain":      "⛓",
  "Base Native":   "🔵",
};

// Canonical display order. SKILL_CATEGORIES (exported below) is filtered down to
// only the buckets that actually contain tools.
const CATEGORY_ORDER: SkillCategory[] = [
  "Market Intel", "Due Diligence", "Builder Tools",
  "Fundraise", "Launch", "Agent Network", "Ecosystem",
  "On-chain", "Base Native",
];

// Hand-tuned category + chat trigger for the tools that are genuinely useful
// IN CHAT (slash commands + prompts the model can actually action). Keyed by id
// (shared with AGENT_TOOLS).
//
// EVERY id here MUST have a chat tool behind it. A chip is a promise: clicking
// it drops `trigger` into the composer, so the user sends a prompt having just
// clicked a card titled with a Hub tool's name and description. Until 2026-09-23
// eleven of these had no entry in TOOL_ENDPOINT (api/chat/route.ts) and the model
// answered them from its own weights — a "DeFi Opportunity Scanner" chip that
// produced invented APYs. Eight were wired; three were removed and are recorded
// below so they are not re-added by someone reading the Hub catalog:
//
//   community-sentiment  — the handler carries a STATIC_KNOWLEDGE_DISCLAIMER and
//                          has no social feed behind it. "What's the sentiment
//                          around X" asks for a measurement, so there is no
//                          honest way to label the answer inside a chat bubble.
//   agent-collab-match   — LLM-only, and it does not know who is registered.
//                          The builder registry is empty; matching against it
//                          would be matching against nothing.
//   base-builder-network — in NEITHER HANDLERS nor AGENT_TOOLS, so the flatMap
//                          below already dropped it. Dead config, never rendered.
//
// The first two remain on the Hub and on /api/mcp, where they are bought
// deliberately rather than suggested by a chip.
//
// A fourth, `builder-score`, came out for a different reason and is worth
// spelling out because the tool itself is FINE. Its chat tool `hub_builder_score`
// is live and wired — but to the top-level `/api/builder-score` route, because
// `_handlers/builder-score.ts` was never registered in HANDLERS and the id is in
// neither HANDLERS nor AGENT_TOOLS (so `/api/x402/builder-score` answers 501; see
// the FREE_DIRECT comment in api/chat/route.ts). The flatMap below has therefore
// been dropping this chip since it was added. Asking for a builder score in plain
// language still works and always has. Re-adding the chip means giving the tool a
// real catalog entry first — this list takes its name and description from
// AGENT_TOOLS on purpose, and hand-typing them here is how the Hub and the chat
// Tools tab drifted to 51-vs-72 in the first place.
//
// Enforced by scripts/curated-trigger-check.ts, which runs in CI.
const CURATED: { id: string; category: SkillCategory; trigger: string }[] = [
  // Market Intel
  { id: "token-pick-signal",       category: "Market Intel",  trigger: "/pick" },
  { id: "narrative-position",      category: "Market Intel",  trigger: "What narratives are running on Base right now?" },
  { id: "whale-copy-signal",       category: "Market Intel",  trigger: "Show me whale signals for " },
  { id: "token-momentum-scanner",  category: "Market Intel",  trigger: "Scan top momentum tokens on Base" },
  // Due Diligence
  { id: "deep-analysis",           category: "Due Diligence", trigger: "/audit " },
  { id: "honeypot-check",          category: "Due Diligence", trigger: "/scan " },
  { id: "risk-gate",               category: "Due Diligence", trigger: "Run a risk gate on " },
  { id: "contract-trust",          category: "Due Diligence", trigger: "What's the trust score for contract " },
  { id: "protocol-risk-monitor",   category: "Due Diligence", trigger: "Monitor risks for " },
  // Builder Tools
  { id: "market-fit",              category: "Builder Tools", trigger: "/idea " },
  { id: "competitor-scan",         category: "Builder Tools", trigger: "Who are the competitors for " },
  { id: "gtm-brief",               category: "Builder Tools", trigger: "/ship " },
  { id: "stack-recommender",       category: "Builder Tools", trigger: "/build " },
  { id: "repo-health",             category: "Builder Tools", trigger: "Check repo health for " },
  // Fundraise
  { id: "investor-memo",           category: "Fundraise",     trigger: "/raise " },
  { id: "fundraise-timing",        category: "Fundraise",     trigger: "Is now a good time to raise for " },
  { id: "pitch-intelligence",      category: "Fundraise",     trigger: "What are investors funding on Base right now?" },
  { id: "base-grant-finder",       category: "Fundraise",     trigger: "Find Base grants for " },
  // Launch
  { id: "token-launch-readiness",  category: "Launch",        trigger: "Is my token ready to launch? " },
  // Agent Network
  { id: "multi-agent-workflow",    category: "Agent Network", trigger: "Design a multi-agent workflow for " },
  // Ecosystem
  { id: "ecosystem-digest",        category: "Ecosystem",     trigger: "What happened on Base today?" },
  { id: "base-protocol-comparison",category: "Ecosystem",     trigger: "Compare these Base protocols: " },
  { id: "defi-opportunity",        category: "Ecosystem",     trigger: "Find DeFi opportunities on Base" },
];

const toolById = new Map(AGENT_TOOLS.map(t => [t.id, t]));

// Blue Chat surfaces ONLY this curated subset — tools with a hand-tuned trigger
// that actually do something useful in chat. The full Hub tool catalog still
// lives on the Hub page (/hub). Name + description come from AGENT_TOOLS so the
// two stay in sync; entries whose id isn't in AGENT_TOOLS are skipped.
export const HUB_SKILLS: HubSkill[] = CURATED.flatMap((c) => {
  const tool = toolById.get(c.id);
  if (!tool) return [];
  return [{
    id:          c.id,
    name:        tool.name,
    description: tool.description,
    category:    c.category,
    trigger:     c.trigger,
  }];
});

// Only categories that actually contain tools, in canonical order — so the
// Tools tab never renders an empty bucket.
export const SKILL_CATEGORIES: SkillCategory[] = CATEGORY_ORDER.filter(
  (c) => HUB_SKILLS.some((s) => s.category === c),
);
