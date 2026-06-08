/**
 * Sample API responses for the Try-it widget on /marketplace/[id].
 * These are demo outputs — real calls happen via MCP or paid x402.
 */

export interface SampleIO {
  input:  Record<string, string>;
  output: unknown;
}

export const SAMPLES: Record<string, SampleIO> = {

  "launch-simulator": {
    input: { project: "BlueMint", ticker: "$BMNT", description: "Onchain memecoin launchpad on Base" },
    output: {
      tier:           "deep",
      project:        "BlueMint",
      ticker:         "$BMNT",
      timestamp:      "2026-06-08T10:42:13Z",
      blue_agent:     { verdict: "WAIT", score: 6.2, summary: "Strong concept but narrative timing weak. Recommend 2-week delay for Base launchpad rotation to peak." },
      aeon:           { status: "live", ecosystem_health: "neutral", timing_score: 5, narrative_fit: "Launchpads cooled 2 weeks ago — sentiment recovering but not peak.", signals: ["base-launchpads ↓18% MoM", "memecoin volume rotation → AI agents"] },
      miroshark:      { status: "live", bull: 38, bear: 24, neutral: 38, recommendation: "alert_human", sentiment_summary: "Mixed — believers vs LP-fatigue camps split." },
      final_verdict:  "WAIT",
      confidence:     72,
      action_items:   ["Wait for launchpad narrative momentum to return", "Pre-seed community on X with builder content first", "Re-run simulator in 14 days"],
    },
  },

  "deep-analysis": {
    input: { token: "0xf895783b2931c919955e18b5e3343e7c7c456ba3" },
    output: {
      token:        "$BLUEAGENT",
      address:      "0xf895783b2931c919955e18b5e3343e7c7c456ba3",
      chain:        "base:8453",
      verdict:      "ACCUMULATE",
      score:        7.8,
      fundamentals: { utility: "high", token_holders: 1247, distribution_score: 8.1 },
      sentiment:    { x: "bullish", telegram: "active", community_growth: "+18% MoM" },
      onchain:      { volume_24h_usd: 4127, liquidity_usd: 102_400, holders_concentration_gini: 0.42 },
      risks:        ["Low liquidity on secondary DEXes", "Limited float — small sell pressure can move price"],
      strengths:    ["Real product backing token (50+ live APIs)", "Aligned incentives via staking tiers", "Multi-agent collab partners onboarding"],
    },
  },

  "honeypot-check": {
    input: { token: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    output: {
      token:         "USDC",
      address:       "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      honeypot:      false,
      confidence:    0.99,
      transfer_test: { simulate_buy: "OK", simulate_sell: "OK", tax_buy: 0, tax_sell: 0 },
      flags:         [],
      verdict:       "SAFE",
    },
  },

  "wallet-pnl": {
    input: { address: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", since: "2024-01-01" },
    output: {
      address:        "0xd8dA…6045",
      period:         "2024-01-01 → today",
      total_pnl_usd:  "+$2,847.12",
      realized:       "+$1,204.50",
      unrealized:     "+$1,642.62",
      win_rate:       "61%",
      best_trade:     { token: "AERO", pnl: "+$1,847" },
      worst_trade:    { token: "RANDOM", pnl: "-$412" },
      tax_lots:       12,
    },
  },

  "blue-idea": {
    input: { prompt: "USDC streaming payroll for Base DAOs" },
    output: {
      brief: {
        problem:      "DAOs on Base pay contributors monthly in USDC — irregular, slow, and tax-painful. No incumbent solves it well.",
        why_now:      "USDC native to Base + Superfluid token streams + DAO operations maturing past treasury phase.",
        why_base:     "USDC has cheapest settlement on Base (CDP integration). Aerodrome has liquidity for backstopping.",
        mvp_scope:    ["Streaming USDC payment to N contributors", "Pause/resume per stream", "CSV export for tax"],
        risks:        ["Superfluid integration complexity", "DAO governance for changing payment rates"],
        plan_24h:     "Ship landing page + smart-contract architecture spec. Get 3 DAO founders for feedback.",
      },
      confidence: 0.86,
    },
  },

  "blue-research": {
    input: { topic: "Aerodrome v3 slipstream pools on Base" },
    output: {
      topic:       "Aerodrome v3 slipstream pools on Base",
      generatedAt: "2026-06-08T10:42:13Z",
      mode:        "template",
      summary:     "Research on Aerodrome v3 slipstream pools. Drawing from 6 sources across the Blue Hub corpus.",
      sections: [
        {
          heading:   "What it is",
          content:   "Aerodrome is a ve(3,3) DEX on Base, the largest by TVL. Fork of Velodrome V2. Supports concentrated liquidity (Slipstream pools), stable + volatile pools, and vote-escrowed AERO tokens.",
          citations: [{ id: "aerodrome", title: "Aerodrome — Base's largest DEX", url: "https://aerodrome.finance" }],
        },
        {
          heading:   "How it works",
          content:   "AERO contract: 0x940181a94A35A4569E4529A3CDfB74e38FD98631. Most Base token pairs route through Aerodrome for best liquidity. Slipstream uses Uniswap v3-style concentrated liquidity with custom fee tiers.",
          citations: [{ id: "aerodrome", title: "Aerodrome — Base's largest DEX", url: "https://aerodrome.finance" }],
        },
      ],
      next_steps: [
        "Run `blue build` to design an Aerodrome LP integration",
        "Run `blue audit` if you're building on top of Aerodrome contracts",
        "Read primary source: https://aerodrome.finance",
      ],
      sources: [
        { id: "aerodrome",       title: "Aerodrome — Base's largest DEX",   url: "https://aerodrome.finance",                       relevance: 0.92 },
        { id: "uniswap-v4-base", title: "Uniswap v4 on Base",               url: "https://docs.uniswap.org/contracts/v4/overview",  relevance: 0.43 },
      ],
    },
  },

  "blue-search": {
    input: { query: "how to deploy a contract to Base mainnet" },
    output: {
      query: "how to deploy a contract to Base mainnet",
      mode:  "lexical",
      total: 3,
      results: [
        {
          id:        "deploy-base-mainnet",
          title:     "Deploy a contract to Base mainnet",
          url:       "https://docs.base.org/quickstart/deploy-with-foundry",
          snippet:   "To deploy to Base mainnet with Foundry: 1) Fund a wallet with ETH on Base. 2) forge create --rpc-url https://mainnet.base.org --private-key $KEY src/MyContract.sol:MyContract. 3) Verify with forge verify-contract.",
          score:     1.000,
          source:    "docs.base.org",
          updatedAt: "2026-05-01",
        },
        {
          id:        "foundry-base",
          title:     "Foundry for Base development",
          url:       "https://book.getfoundry.sh",
          snippet:   "Foundry is the recommended dev framework for Base smart contracts. Install: curl -L https://foundry.paradigm.xyz | bash && foundryup.",
          score:     0.812,
          source:    "getfoundry.sh",
          updatedAt: "2026-05-01",
        },
        {
          id:        "basescan",
          title:     "Basescan block explorer",
          url:      "https://basescan.org",
          snippet:   "Verify contracts, read transaction history, monitor token transfers. API at api.basescan.org requires free API key.",
          score:     0.687,
          source:    "basescan.org",
          updatedAt: "2026-05-20",
        },
      ],
      generatedAt: "2026-06-08T10:42:13Z",
    },
  },

  "blue-audit": {
    input: { code: "ERC-20 with permit + staking" },
    output: {
      verdict:   "PASS WITH WARNINGS",
      critical:  [],
      high:      [{ check: "permit replay protection", note: "Verify chainId binding in EIP-712 domain." }],
      medium:    [{ check: "staking reward overflow", note: "Use 96-bit rewards counter, multiply at withdraw time." }],
      low:       [{ check: "events for stake/unstake" }, { check: "natspec on public functions" }],
      passed:    ["reentrancy", "tx.origin auth", "selfdestruct", "delegatecall", "uninitialized storage"],
      score:     "8.4/10",
    },
  },
};

/** Return sample for a tool id, or a generic placeholder. */
export function sampleFor(id: string): SampleIO {
  return SAMPLES[id] ?? {
    input:  { prompt: "Your input here" },
    output: { message: "Sample output not available. Call via MCP for real results.", api: id },
  };
}
