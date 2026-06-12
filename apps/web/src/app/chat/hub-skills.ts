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

// AGENT_TOOLS category slug → display bucket (fallback when a tool isn't curated).
const CATEGORY_MAP: Record<string, SkillCategory> = {
  "intelligence":   "Market Intel",
  "trading":        "Market Intel",
  "security":       "Due Diligence",
  "builder":        "Builder Tools",
  "content":        "Builder Tools",
  "earn":           "Ecosystem",
  "agent-economy":  "Agent Network",
  "base-ecosystem": "Ecosystem",
  "Base DeFi":      "Ecosystem",
  "alerts":         "On-chain",
  "on-chain":       "On-chain",
};

// Hand-tuned category + chat trigger for the tools that have them. Keyed by id
// (shared with AGENT_TOOLS). Entries whose id isn't in AGENT_TOOLS are ignored.
const CURATED: { id: string; category: SkillCategory; trigger: string }[] = [
  // Market Intel
  { id: "token-pick-signal",       category: "Market Intel",  trigger: "/pick" },
  { id: "narrative-position",      category: "Market Intel",  trigger: "What narratives are running on Base right now?" },
  { id: "whale-copy-signal",       category: "Market Intel",  trigger: "Show me whale signals for " },
  { id: "token-momentum-scanner",  category: "Market Intel",  trigger: "Scan top momentum tokens on Base" },
  { id: "community-sentiment",     category: "Market Intel",  trigger: "What's the sentiment around " },
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
  { id: "builder-score",           category: "Builder Tools", trigger: "What's the builder score for " },
  // Fundraise
  { id: "investor-memo",           category: "Fundraise",     trigger: "/raise " },
  { id: "fundraise-timing",        category: "Fundraise",     trigger: "Is now a good time to raise for " },
  { id: "pitch-intelligence",      category: "Fundraise",     trigger: "What are investors funding on Base right now?" },
  { id: "base-grant-finder",       category: "Fundraise",     trigger: "Find Base grants for " },
  // Launch
  { id: "token-launch-readiness",  category: "Launch",        trigger: "Is my token ready to launch? " },
  { id: "launch-advisor",          category: "Launch",        trigger: "Give me a launch plan for " },
  { id: "token-distribution-plan", category: "Launch",        trigger: "Design a token distribution plan for " },
  { id: "agent-token-strategy",    category: "Launch",        trigger: "How should I structure my agent token?" },
  // Agent Network
  { id: "agent-collab-match",      category: "Agent Network", trigger: "Which agents should I collaborate with for " },
  { id: "multi-agent-workflow",    category: "Agent Network", trigger: "Design a multi-agent workflow for " },
  { id: "agent-revenue-optimizer", category: "Agent Network", trigger: "How can my agent earn more revenue?" },
  { id: "base-builder-network",    category: "Agent Network", trigger: "Who should I connect with on Base for " },
  // Ecosystem
  { id: "ecosystem-digest",        category: "Ecosystem",     trigger: "What happened on Base today?" },
  { id: "base-protocol-comparison",category: "Ecosystem",     trigger: "Compare these Base protocols: " },
  { id: "defi-opportunity",        category: "Ecosystem",     trigger: "Find DeFi opportunities on Base" },
  { id: "wallet-strategy-analyzer",category: "Ecosystem",     trigger: "/wallet " },
];

const curatedById = new Map(CURATED.map(c => [c.id, c]));

type AnyAgentTool = (typeof AGENT_TOOLS)[number];

// Fallback trigger for tools without a curated one: a fill-in-the-blank prompt
// using the first (required) input, or a standalone "Run <name>".
function deriveTrigger(t: AnyAgentTool): string {
  const req = t.inputs?.find(i => i.required) ?? t.inputs?.[0];
  return req ? `${t.name} — ${req.label}: ` : `Run ${t.name}`;
}

export const HUB_SKILLS: HubSkill[] = AGENT_TOOLS.map((t) => {
  const curated = curatedById.get(t.id);
  return {
    id:          t.id,
    name:        t.name,
    description: t.description,
    category:    curated?.category ?? CATEGORY_MAP[t.category] ?? "Ecosystem",
    trigger:     curated?.trigger  ?? deriveTrigger(t),
  };
});

// Only categories that actually contain tools, in canonical order — so the
// Tools tab never renders an empty bucket.
export const SKILL_CATEGORIES: SkillCategory[] = CATEGORY_ORDER.filter(
  (c) => HUB_SKILLS.some((s) => s.category === c),
);
