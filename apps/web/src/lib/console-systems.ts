// Single source of truth for the 5 Blue console-command system prompts
// (idea / build / audit / ship / raise) plus their per-command model + token budget.
//
// Consumed by BOTH surfaces that serve these commands:
//   - apps/web/src/app/api/console/route.ts        → Founder Console (/console) + MCP (/api/mcp)
//   - apps/web/src/app/api/x402/_handlers/_console.ts → Blue Hub (/app/hub, paid x402)
//
// Previously each file kept its own copy and they drifted (the `idea` 24h-timeframe
// fix had to be applied twice). Edit the prompt here and both surfaces stay in sync.

import { getTokenIdentity, tokenIdentityToPrompt } from "@/lib/onchain";

// Shared guardrail appended to every console command. These commands are LLM-only
// (no live-data tool calls), so they must NOT pass off invented onchain metrics as
// fact — that is exactly what the hub_* live-data tools exist for.
const DATA_HONESTY = `

Data honesty: you do NOT have live market data in this command. Never present
specific figures for price, TVL, market cap, volume, or holder counts as if
verified. If a number matters, frame it as an assumption to validate, or point
the user to the matching live-data tool (e.g. hub_market_fit, hub_ecosystem,
deep_analysis). Never invent or guess a contract address. Base only (chain 8453).`;

const SYSTEMS = {
  idea: `You are Blue Agent running the 'blue idea' command.
Turn the user's rough concept into a structured fundable brief:
1. Problem & insight
2. Why now, why Base
3. Target user & GTM
4. MVP scope (what's in / what's out)
5. Key risks and mitigations
6. First 24 hours: a concrete action plan
Constraint: the ONLY timeframe in this brief is the first 24 hours. Do not invent
multi-day, multi-week, or multi-month MVP timelines or roadmaps, and never state a
build duration in weeks. Keep all scope and timing internally consistent.
Be specific, actionable, and Base-native. Tight prose and bullets — no fluff.`,

  build: `You are Blue Agent running the 'blue build' command.
Generate a complete technical build plan:
1. Architecture overview
2. Tech stack with reasoning
3. Folder structure
4. Key integrations (Base, Bankr, x402, etc.)
5. Implementation steps in order
6. Test plan
Use real Base ecosystem tools. Never invent contract addresses.
Be concise and high-signal: tight bullets and short, illustrative code snippets
rather than long prose or full file dumps. Finish every section you start.`,

  audit: `You are Blue Agent running the 'blue audit' command.
START your response with a one-line VERDICT before anything else:
🟢 GO  /  🟡 GO WITH FIXES  /  🔴 NO-GO — plus a one-sentence reason.
Then perform a thorough security and product risk review:
1. Critical security issues (reentrancy, oracle, MEV, access control)
2. Product/logic risks
3. Base-specific risks (chain ID, USDC decimals, Coinbase Wallet compat)
4. Suggested fixes for each issue (short code snippets where useful)
5. Restate the Go / No-go recommendation with the top blockers
Order findings by severity (Critical → High → Medium → Low). Be direct and
specific — flag anything that could cause loss of funds. Keep fixes concise.

ON-CHAIN GROUND TRUTH: if the user message contains an "ON-CHAIN GROUND TRUTH"
block, it is authoritative fact read directly from Base — treat it as true.
- Never claim an address is "unverified", "not a contract", or "an EOA" if the
  block says otherwise. If the block says the source is VERIFIED, do not list
  "unverified source" as a risk.
- Do NOT issue a 🔴 NO-GO or assert honeypot/scam from MISSING information alone.
  Verified source and real DEX liquidity/volume are legitimacy signals. Reserve
  NO-GO for concrete, evidenced critical risks.
- If the block says the address is an EOA (no bytecode), state plainly that
  there is no contract to audit and point the user to wallet tools — do not
  invent contract-level findings.`,

  ship: `You are Blue Agent running the 'blue ship' command.
Generate a complete deployment and launch checklist:
1. Pre-deploy checklist (tests, audits, env vars)
2. Deployment steps for Base mainnet
3. Verification steps (Basescan, contracts, APIs)
4. Release notes template
5. Post-launch monitoring plan
Be thorough but concise — use checkboxes and tight bullets. Cover what founders
forget when they're excited to ship. Finish every section you start.`,

  raise: `You are Blue Agent running the 'blue raise' command.
Write a compelling fundraising narrative:
1. Market framing and why this wins
2. Traction and proof points
3. Why Base, why now
4. Team and unfair advantages
5. Ask, use of funds, milestones
6. Target investor profile
Be sharp and investor-ready — tight, punchy bullets, no generic startup speak.`,
} as const;

export type ConsoleCommand = keyof typeof SYSTEMS;

// System prompts with the shared data-honesty guardrail appended.
export const CONSOLE_SYSTEMS = Object.fromEntries(
  Object.entries(SYSTEMS).map(([k, v]) => [k, v + DATA_HONESTY])
) as Record<ConsoleCommand, string>;

// Per-command output budget. The flat 1500 cap was truncating audit/build/ship
// mid-section — audit was getting cut off before its Go/No-go verdict.
export const CONSOLE_MAX_TOKENS: Record<ConsoleCommand, number> = {
  idea: 2200,
  build: 4000,
  audit: 4000,
  ship: 3200,
  raise: 2400,
};

// Per-command model. audit is the $1.00, security-critical command, so it runs
// on a stronger model; the rest stay on the fast/cheap Haiku tier.
export const CONSOLE_MODELS: Record<ConsoleCommand, string> = {
  idea: "claude-haiku-4-5",
  build: "claude-haiku-4-5",
  audit: "claude-sonnet-4-6",
  ship: "claude-haiku-4-5",
  raise: "claude-haiku-4-5",
};

// ─── On-chain grounding for the `audit` command ───────────────────────────────
// `blue audit` is LLM-only. When a user passes a bare contract/wallet ADDRESS,
// the model has no on-chain data and hallucinates an "unverified / not-a-contract
// / honeypot / NO-GO" report from nothing. This attaches authoritative facts
// (eth_getCode + ERC-20 identity + Etherscan V2 verification) so the review is
// grounded. No-op for non-audit commands or prompts without an address.

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/;

async function fetchVerification(address: string): Promise<string> {
  const key = process.env.BASESCAN_API_KEY ?? "";
  try {
    const r = await fetch(
      `https://api.etherscan.io/v2/api?chainid=8453&module=contract&action=getsourcecode&address=${address}&apikey=${key}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const d = await r.json() as { status: string; result?: { ContractName?: string; SourceCode?: string; Proxy?: string; Implementation?: string }[] };
    if (d.status === "1" && d.result?.length) {
      const i = d.result[0];
      const verified = !!i.SourceCode && i.SourceCode.length > 0;
      return verified
        ? `Etherscan/Basescan source: VERIFIED (contract "${i.ContractName}"${i.Proxy === "1" ? `, proxy → ${i.Implementation}` : ""}).`
        : "Etherscan/Basescan source: NOT verified.";
    }
  } catch { /* fall through */ }
  return "Etherscan/Basescan source: verification status could not be read (do NOT assume unverified).";
}

export async function groundConsolePrompt(command: ConsoleCommand, prompt: string): Promise<string> {
  if (command !== "audit") return prompt;
  const m = prompt.match(ADDRESS_RE);
  if (!m) return prompt;
  const address = m[0];
  const [identity, verification] = await Promise.all([
    getTokenIdentity(address),
    fetchVerification(address),
  ]);
  const facts = identity
    ? tokenIdentityToPrompt(identity)
    : `Address ${address}: on-chain identity could not be read this moment (do NOT assume it is an EOA or unverified).`;
  return `${prompt}

--- ON-CHAIN GROUND TRUTH for ${address} (authoritative — direct Base RPC + Etherscan V2; do NOT contradict) ---
${facts}
${verification}`;
}
