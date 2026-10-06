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
import { CHAT_HIDDEN_TOOLS } from "@/lib/chat-hidden-tools";

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
  tool:        string;   // the chat tool (api/chat/route.ts) behind the chip
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
// ONE ENTRY IS A KNOWN OUTLIER AND IS DELIBERATELY LEFT IN PLACE: `builder-score`.
// It is NOT a fourth removal and must not be tidied into one. The tool is fine and
// live — `hub_builder_score` routes to the top-level `/api/builder-score`, not
// through x402 (see the FREE_DIRECT comment in api/chat/route.ts) — and it is
// outside the catalog ON PURPOSE, because it is free and internal. So the flatMap
// below drops its chip, and has since it was added.
//
// The two fixes that look obvious here are both wrong. Adding a catalog entry to
// make the chip render would drag an intentionally-internal tool into the paid
// x402 surface purely for a UI side effect. Hand-typing a name and description
// into this file would break the one property it exists to hold — that the label
// comes from AGENT_TOOLS — which is how the Hub and this tab drifted to 51-vs-72
// before. Whether the chip should exist at all is a separate clean-up decision,
// not a rider on a wiring fix.
//
// Enforced by scripts/curated-trigger-check.ts, which runs in CI and carries a
// self-justifying allowance for exactly this case.
//
// HIDDEN TOOLS DROP THEIR CHIP (2026-10-01). Since 2026-09-30 chat hides most of
// the builder/fundraise/DeFi-research tools (lib/chat-hidden-tools.ts): the
// model is not offered them and dispatch refuses them. This list kept all
// fourteen, so the Tools tab and /docs/blue-chat ("The model can call N curated
// Hub tools") advertised chips whose click got a refusal or an answer from the
// model's weights — the exact broken promise described above. Each entry now
// names its chat `tool` (the TOOL_ENDPOINT key that reaches `id`; the check
// verifies the pair), and HUB_SKILLS drops any entry whose tool is hidden. The
// entries stay so un-hiding a tool brings its chip back with no second edit.
const CURATED: { id: string; tool: string; category: SkillCategory; trigger: string }[] = [
  // Market Intel
  { id: "token-pick-signal",       tool: "hub_token_pick",       category: "Market Intel",  trigger: "/pick" },
  { id: "narrative-position",      tool: "hub_narrative",        category: "Market Intel",  trigger: "What narratives are running on Base right now?" },
  { id: "token-momentum-scanner",  tool: "hub_token_momentum",   category: "Market Intel",  trigger: "Scan top momentum tokens on Base" },
  // Due Diligence
  { id: "deep-analysis",           tool: "hub_deep_analysis",    category: "Due Diligence", trigger: "/audit " },
  { id: "honeypot-check",          tool: "hub_honeypot",         category: "Due Diligence", trigger: "/scan " },
  { id: "risk-gate",               tool: "hub_risk_gate",        category: "Due Diligence", trigger: "Run a risk gate on " },
  { id: "contract-trust",          tool: "hub_contract_trust",   category: "Due Diligence", trigger: "What's the trust score for contract " },
  { id: "protocol-risk-monitor",   tool: "hub_protocol_risk",    category: "Due Diligence", trigger: "Monitor risks for " },
  // Builder Tools
  { id: "market-fit",              tool: "hub_market_fit",       category: "Builder Tools", trigger: "/idea " },
  { id: "competitor-scan",         tool: "hub_competitor_scan",  category: "Builder Tools", trigger: "Who are the competitors for " },
  { id: "repo-health",             tool: "hub_repo_health",      category: "Builder Tools", trigger: "Check repo health for " },
  // Does not render — see the `builder-score` note above. Left in place on purpose.
  { id: "builder-score",           tool: "hub_builder_score",    category: "Builder Tools", trigger: "What's the builder score for " },
  // Fundraise
  // Trigger reworded 2026-09-23. The old one — "What are investors funding on
  // Base right now?" — MEASURED as routing to `hub_ecosystem`, not to this chip's
  // own tool, and the model was right: that sentence asks what the ecosystem is
  // doing, not how to pitch. It never matched the card either, which reads
  // "Transform your deck into investor-grade pitch intelligence". The tool returns
  // pitch_angles / one_liner / investor_thesis for ONE project, so the trigger now
  // names a project the way the other Fundraise chips do.
  { id: "base-grant-finder",       tool: "hub_base_grant",       category: "Fundraise",     trigger: "Find Base grants for " },
  // Launch
  { id: "token-launch-readiness",  tool: "hub_token_readiness",  category: "Launch",        trigger: "Is my token ready to launch? " },
  // Agent Network
  // Ecosystem
  { id: "ecosystem-digest",        tool: "hub_ecosystem",        category: "Ecosystem",     trigger: "What happened on Base today?" },
  { id: "base-protocol-comparison",tool: "hub_protocol_compare", category: "Ecosystem",     trigger: "Compare these Base protocols: " },
  { id: "defi-opportunity",        tool: "hub_defi_opportunity", category: "Ecosystem",     trigger: "Find DeFi opportunities on Base" },
];

const toolById = new Map(AGENT_TOOLS.map(t => [t.id, t]));

// Blue Chat surfaces ONLY this curated subset — tools with a hand-tuned trigger
// that actually do something useful in chat. The full Hub tool catalog still
// lives on the Hub page (/hub). Name + description come from AGENT_TOOLS so the
// two stay in sync; entries whose id isn't in AGENT_TOOLS are skipped, and so
// are entries whose chat tool is hidden (see the note above CURATED).
export const HUB_SKILLS: HubSkill[] = CURATED.flatMap((c) => {
  if (CHAT_HIDDEN_TOOLS.has(c.tool)) return [];
  const tool = toolById.get(c.id);
  if (!tool) return [];
  return [{
    id:          c.id,
    tool:        c.tool,
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
