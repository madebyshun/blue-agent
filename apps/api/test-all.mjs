#!/usr/bin/env node
/**
 * Blue Agent x402 — Full test suite
 * Usage: node test-all.mjs [host]
 * Default: http://localhost:3001
 */

const HOST = process.argv[2] ?? "http://localhost:3001";

// ── Test cases — multiple per tool ───────────────────────────────────────────

const TESTS = [
  // risk-gate — approve, warn, block cases
  {
    tool: "risk-gate", label: "risk-gate: normal swap",
    body: { action: "swap 0.05 ETH to USDC on Uniswap", amount: "$80", context: "portfolio rebalancing" },
  },
  {
    tool: "risk-gate", label: "risk-gate: large amount (warn)",
    body: { action: "approve contract for unlimited USDC spending", contractAddress: "0xf895783b2931c919955e18b5e3343e7c7c456ba3", amount: "$5000" },
  },
  {
    tool: "risk-gate", label: "risk-gate: with agent context",
    body: { action: "buy BLUEAGENT token", contractAddress: "0xf895783b2931c919955e18b5e3343e7c7c456ba3", amount: "$50", agentId: "blue-agent-v1", context: "regular token purchase on Uniswap v4 Base" },
  },

  // deep-analysis — by contract, by name
  {
    tool: "deep-analysis", label: "deep-analysis: BLUEAGENT contract",
    body: { projectName: "Blue Agent", ticker: "BLUEAGENT", contractAddress: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" },
  },
  {
    tool: "deep-analysis", label: "deep-analysis: name only (no contract)",
    body: { projectName: "Uniswap", ticker: "UNI" },
  },
  {
    tool: "deep-analysis", label: "deep-analysis: USDC on Base",
    body: { projectName: "USD Coin", ticker: "USDC", contractAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
  },

  // wallet-pnl
  {
    tool: "wallet-pnl", label: "wallet-pnl: treasury wallet",
    body: { address: "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5" },
  },
  {
    tool: "wallet-pnl", label: "wallet-pnl: Coinbase wallet",
    body: { address: "0x71660c4005BA85c37ccec55d0C4493E66Fe775d3" },
  },

  // token-launch
  {
    tool: "token-launch", label: "token-launch: AI agent token",
    body: { tokenName: "Blue Agent", tokenSymbol: "BLUE", description: "AI agent layer on Base — idea, build, audit, ship, raise", twitter: "blocky_agent" },
  },
  {
    tool: "token-launch", label: "token-launch: DeFi protocol",
    body: { tokenName: "BaseSwap Pro", tokenSymbol: "BSWP", description: "Concentrated liquidity DEX on Base with MEV protection and gasless swaps" },
  },

  // launch-advisor
  {
    tool: "launch-advisor", label: "launch-advisor: AI project",
    body: { projectName: "Blue Agent", description: "AI-native founder console for Base builders", targetAudience: "Base builders and crypto founders" },
  },
  {
    tool: "launch-advisor", label: "launch-advisor: DeFi project",
    body: { projectName: "YieldBase", description: "Auto-compounding yield optimizer for Base DeFi protocols", targetAudience: "DeFi users and yield farmers", budget: "$50,000" },
  },

  // grant-evaluator
  {
    tool: "grant-evaluator", label: "grant-evaluator: strong application",
    body: { projectName: "Blue Agent", description: "AI-native founder console for Base — idea to ship pipeline powered by Bankr LLM and x402 micropayments", teamBackground: "Solo founder, 10+ shipped products on Base", requestedAmount: "$25,000", milestones: "1) Launch x402 API (done) 2) 100 paying users by Q3 3) $10k MRR by Q4", githubUrl: "https://github.com/madebyshun/blue-agent" },
  },
  {
    tool: "grant-evaluator", label: "grant-evaluator: weak application",
    body: { projectName: "CryptoApp", description: "A new DeFi app on Base", requestedAmount: "$100,000" },
  },

  // quantum-premium
  {
    tool: "quantum-premium", label: "quantum-premium: treasury wallet",
    body: { address: "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5" },
  },

  // quantum-batch
  {
    tool: "quantum-batch", label: "quantum-batch: 3 wallets",
    body: { addresses: [
      "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5",
      "0xf895783b2931c919955e18b5e3343e7c7c456ba3",
      "0x71660c4005BA85c37ccec55d0C4493E66Fe775d3",
    ]},
  },

  // builder-card
  {
    tool: "builder-card", label: "builder-card: @madebyshun",
    body: { handle: "madebyshun" },
    timeout: 40000,
  },
  {
    tool: "builder-card", label: "builder-card: @jessepollak",
    body: { handle: "jessepollak" },
    timeout: 40000,
  },

  // agent-card
  {
    tool: "agent-card", label: "agent-card: blue-agent repo",
    body: { handle: "github.com/madebyshun/blue-agent" },
    timeout: 60000,
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const DIM    = "\x1b[2m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

async function runTest({ tool, label, body, timeout = 30000 }) {
  const start = Date.now();
  try {
    const res = await fetch(`${HOST}/${tool}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });
    const ms   = Date.now() - start;
    const data = await res.json();
    const ok   = res.status === 200 && !data.error;
    return { tool, label, ok, ms, status: res.status, data };
  } catch (err) {
    return { tool, label, ok: false, ms: Date.now() - start, status: 0, error: err.message, data: null };
  }
}

function summarize(data) {
  const fields = ["verdict", "decision", "score", "risk", "rug", "tier", "style", "pnl", "grant", "name", "project", "scanned", "exposed"];
  const parts = [];
  for (const f of fields) {
    if (data[f] !== undefined && data[f] !== null) {
      parts.push(`${DIM}${f}${RESET}: ${data[f]}`);
    }
  }
  return parts.slice(0, 4).join("  ") || JSON.stringify(data).slice(0, 80);
}

async function main() {
  console.log(`\n${BOLD}🔵 Blue Agent x402 — ${TESTS.length} tests${RESET}`);
  console.log(`   Host: ${HOST}\n`);
  console.log("─".repeat(72));

  // Group by tool, run each group in parallel
  const results = await Promise.all(TESTS.map(runTest));

  let passed = 0;
  let failed = 0;
  let lastTool = "";

  for (const r of results) {
    // Section divider between tools
    if (r.tool !== lastTool) {
      if (lastTool) console.log();
      lastTool = r.tool;
    }

    const icon  = r.ok ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    const ms    = `${YELLOW}${r.ms}ms${RESET}`;
    const lbl   = `${CYAN}${(r.label ?? r.tool).padEnd(38)}${RESET}`;

    if (r.ok) {
      console.log(`  ${icon}  ${lbl}  ${ms.padEnd(14)}  ${summarize(r.data)}`);
      passed++;
    } else {
      const errMsg = r.error ?? r.data?.error ?? r.data?.message ?? "unknown";
      console.log(`  ${icon}  ${lbl}  ${ms.padEnd(14)}  ${RED}[${r.status || "ERR"}] ${errMsg.slice(0, 55)}${RESET}`);
      failed++;
    }
  }

  console.log("\n" + "─".repeat(72));
  console.log(`\n  ${GREEN}${BOLD}${passed} passed${RESET}  ${failed > 0 ? RED + BOLD : ""}${failed} failed${RESET}  of ${TESTS.length} total\n`);

  if (failed > 0) {
    for (const r of results.filter(r => !r.ok && r.data)) {
      console.log(`${RED}--- ${r.label} ---${RESET}`);
      console.log(JSON.stringify(r.data, null, 2));
    }
  }
}

main();
