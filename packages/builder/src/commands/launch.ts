import * as readline from "readline";
import { callBankr, extractJson } from "../bankr";
import { printHeader, printError } from "../print";

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, (ans) => resolve(ans.trim())));
}

// ── Token launch ──────────────────────────────────────────────────────────────

interface TokenLaunchPlan {
  name: string;
  symbol: string;
  description: string;
  pool_type: string;
  fee_structure: string;
  creator_share: string;
  bankr_command: string;
  checklist: string[];
}

const TOKEN_SYSTEM = `You are Blue Agent's token launch advisor for Base.

Given token details, produce a launch plan with the Bankr/Clanker execution command.

Return ONLY valid JSON:
{
  "name": "<token name>",
  "symbol": "<SYMBOL>",
  "description": "<finalized description>",
  "pool_type": "Uniswap V3 on Base (via Clanker)",
  "fee_structure": "1% swap fee: 40% creator / 40% Bankr / 20% Clanker",
  "creator_share": "40% of 1% on every swap → your wallet",
  "bankr_command": "bankr agent prompt \\"Launch a token called [name] ([SYMBOL]) on Base...\\"",
  "checklist": ["<step1>", "<step2>", ...]
}

The bankr_command should be a complete, ready-to-run prompt that the user can paste directly.
Include website and Twitter in the command if provided.`;

// ── Agent launch ──────────────────────────────────────────────────────────────

interface AgentLaunchPlan {
  name: string;
  slug: string;
  persona: string;
  system_prompt_excerpt: string;
  model: string;
  skills: string[];
  pricing: string;
  publish_checklist: string[];
  bankr_command: string;
}

const AGENT_SYSTEM = `You are Blue Agent's agent launch advisor for the Bankr marketplace.

Given agent details, produce a launch plan to publish on Bankr.

Return ONLY valid JSON:
{
  "name": "<agent name>",
  "slug": "<url-safe-slug>",
  "persona": "<one paragraph persona description>",
  "system_prompt_excerpt": "<first 2-3 sentences of recommended system prompt>",
  "model": "<recommended model>",
  "skills": ["<skill1>", "<skill2>"],
  "pricing": "<suggested pricing per session in USDC>",
  "publish_checklist": ["<step1>", "<step2>", ...],
  "bankr_command": "bankr agent prompt \\"Publish agent [name]...\\"  (or manual Bankr dashboard URL)"
}`;

// ── Main ──────────────────────────────────────────────────────────────────────

export async function runLaunch(mode: string | undefined) {
  printHeader("launch", "Launch wizard");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    // If mode not given, ask
    let launchMode = mode ?? "";
    if (!["token", "agent"].includes(launchMode)) {
      launchMode = await ask(rl, "  What are you launching? (token/agent) [token]: ");
      if (!launchMode) launchMode = "token";
    }

    if (launchMode === "token") {
      await launchToken(rl);
    } else if (launchMode === "agent") {
      await launchAgent(rl);
    } else {
      printError(`Unknown mode: ${launchMode}. Use: token | agent`);
    }
  } finally {
    rl.close();
  }
}

async function launchToken(rl: readline.Interface) {
  process.stdout.write(`\n  ── Token Launch on Base (Clanker + Bankr) ──\n\n`);
  const name        = await ask(rl, "  Token name: ");
  const symbol      = await ask(rl, "  Symbol (TICKER): ");
  const description = await ask(rl, "  Description (one line): ");
  const twitter     = await ask(rl, "  Twitter/X handle (optional): ");
  const website     = await ask(rl, "  Website URL (optional): ");

  if (!name || !symbol) { printError("Name and symbol are required."); return; }

  process.stdout.write(`\n  Generating launch plan...\n`);

  try {
    const raw = await callBankr(TOKEN_SYSTEM,
      `Token: ${name} (${symbol.toUpperCase()})\nDescription: ${description}\nTwitter: ${twitter || "none"}\nWebsite: ${website || "none"}`
    );

    let plan: TokenLaunchPlan;
    try { plan = extractJson(raw) as TokenLaunchPlan; }
    catch { process.stdout.write("\n" + raw + "\n\n"); return; }

    const line = "─".repeat(54);
    process.stdout.write(`\n${line}\n`);
    process.stdout.write(`  🚀 ${plan.name} (${plan.symbol})\n`);
    process.stdout.write(`  ${plan.description}\n\n`);
    process.stdout.write(`  Pool:    ${plan.pool_type}\n`);
    process.stdout.write(`  Fees:    ${plan.fee_structure}\n`);
    process.stdout.write(`  Earn:    ${plan.creator_share}\n\n`);
    process.stdout.write(`  Launch checklist:\n`);
    for (const step of plan.checklist) process.stdout.write(`    ☐ ${step}\n`);
    process.stdout.write(`\n  Execute via Bankr:\n`);
    process.stdout.write(`    ${plan.bankr_command}\n`);
    process.stdout.write(`\n  Note: No gas fees. 1 token launch/day (10/day for Bankr Club).\n`);
    process.stdout.write(`${line}\n\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}

async function launchAgent(rl: readline.Interface) {
  process.stdout.write(`\n  ── Agent Launch on Bankr Marketplace ──\n\n`);
  const name    = await ask(rl, "  Agent name: ");
  const persona = await ask(rl, "  Persona (one line): ");
  const skills  = await ask(rl, "  Skills/tools (comma-separated, optional): ");
  const pricing = await ask(rl, "  Pricing per session in USDC (optional): ");

  if (!name || !persona) { printError("Name and persona are required."); return; }

  process.stdout.write(`\n  Generating agent launch plan...\n`);

  try {
    const raw = await callBankr(AGENT_SYSTEM,
      `Name: ${name}\nPersona: ${persona}\nSkills: ${skills || "none"}\nPricing: ${pricing || "suggest"} USDC`
    );

    let plan: AgentLaunchPlan;
    try { plan = extractJson(raw) as AgentLaunchPlan; }
    catch { process.stdout.write("\n" + raw + "\n\n"); return; }

    const line = "─".repeat(54);
    process.stdout.write(`\n${line}\n`);
    process.stdout.write(`  🤖 ${plan.name}  (bankr.bot/agent/${plan.slug})\n\n`);
    process.stdout.write(`  Persona:\n  ${plan.persona}\n\n`);
    process.stdout.write(`  Model:   ${plan.model}\n`);
    process.stdout.write(`  Skills:  ${plan.skills.join(", ")}\n`);
    process.stdout.write(`  Price:   ${plan.pricing}\n\n`);
    process.stdout.write(`  System prompt (excerpt):\n  "${plan.system_prompt_excerpt}"\n\n`);
    process.stdout.write(`  Publish checklist:\n`);
    for (const step of plan.publish_checklist) process.stdout.write(`    ☐ ${step}\n`);
    process.stdout.write(`\n  Execute:\n    ${plan.bankr_command}\n`);
    process.stdout.write(`${line}\n\n`);
  } catch (err) {
    printError(err instanceof Error ? err.message : String(err));
  }
}
