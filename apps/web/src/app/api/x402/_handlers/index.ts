// Self-hosted x402 handler registry — the live tool surface, hand-maintained.
//
// This header used to read "AUTO-GENERATED … (copied from apps/api/x402)". Both
// halves were false: `apps/api` has been deleted, and no generator ever existed
// (`_gen.mjs`, named as the source of truth, is in no commit on any branch). So
// edit this file directly — nothing regenerates it.
//
// Adding a tool means TWO registrations: the `HANDLERS` map below, and
// `AGENT_TOOLS` in `@/lib/agent-tools`. A tool in only one is not live, and the
// two counts must stay equal (115 == 115 today).
import hSafeTrending from "./safe-trending";
import hRhStockAgentBrief    from "./rh-stock-agent-brief";
import hRhStockArb       from "./rh-stock-arb";
import hRhStockOhlc      from "./rh-stock-ohlc";
import hRhStockSwapPrepare from "./rh-stock-swap-prepare";
import hRhStockSwapQuote   from "./rh-stock-swap-quote";
import hTokenPrice from "./token-price";
import hPoolScan from "./pool-scan";
import hBlueDoctor from "./blue-doctor";
import hHoodLive from "./hood-live";
import hWeekendScorecard from "./weekend-scorecard";
import hWalletHoldings from "./wallet-holdings";
import hGasTracker from "./gas-tracker";
import hWalletRisk from "./wallet-risk";
import hLiquidityDepth from "./liquidity-depth";
import hContractTrust from "./contract-trust";
import hHoneypotCheck from "./honeypot-check";
import hPreTradeCheck from "./pre-trade-check";
import hSignCheck from "./sign-check";
import hApprovalAudit from "./approval-audit";
import hRiskGate      from "./risk-gate";
import hBlueRegistry  from "./blue-registry";
// RH RWA Phase 1 (L1·L2·L3·L4·M1) — Robinhood Chain tokenized-stock skills
import hRhRwaVerify    from "./rh-rwa-verify";
import hRhStockQuote   from "./rh-stock-quote";
// Base stocks (2026-11-03) — every Coinbase Tokenized Stock on Base 8453
import hBaseStockQuote     from "./base-stock-quote";
import hBaseStockMovers    from "./base-stock-movers";
// RH RWA Phase 2 (M2·M3·M4·M5) — market analytics
import hRhStockLiquidity from "./rh-stock-liquidity";
import hRhStockMovers    from "./rh-stock-movers";
// RH RWA Phase 3 (X1·X2·X3) — trading execution
// RH RWA Phase 4 (P1·P2·P3·P4) — portfolio
// RH RWA Phase 5 (D1·D2·D3·D4·D5) — discovery & analytics
import hRhStockHolders       from "./rh-stock-holders";
// RH RWA Phase 6 (A1·A2·A3·A4) — agent skills
// RH RWA Phase 7 (B1·B2·E1·E2·E3) — bridge & builder kit (final)

export const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  "token-price": hTokenPrice,
  "pool-scan": hPoolScan,
  "blue-doctor": hBlueDoctor,
  "hood-live": hHoodLive,
  "weekend-scorecard": hWeekendScorecard,
  "wallet-holdings": hWalletHoldings,
  "gas-tracker": hGasTracker,
  "wallet-risk": hWalletRisk,
  "liquidity-depth": hLiquidityDepth,
  "contract-trust": hContractTrust,
  "honeypot-check": hHoneypotCheck,
  "pre-trade-check": hPreTradeCheck,
  "sign-check": hSignCheck,
  "approval-audit": hApprovalAudit,
  "risk-gate":      hRiskGate,
  "blue-registry":  hBlueRegistry,

  "rh-rwa-verify":      hRhRwaVerify,
  "rh-stock-quote":     hRhStockQuote,
  "base-stock-quote":     hBaseStockQuote,
  "base-stock-movers":    hBaseStockMovers,
  "rh-stock-liquidity": hRhStockLiquidity,
  "rh-stock-movers":    hRhStockMovers,
  "rh-stock-holders":       hRhStockHolders,
  "safe-trending": hSafeTrending,
  "rh-stock-agent-brief":   hRhStockAgentBrief,
  "rh-stock-arb":       hRhStockArb,
  "rh-stock-ohlc":      hRhStockOhlc,
  "rh-stock-swap-prepare": hRhStockSwapPrepare,
  "rh-stock-swap-quote":   hRhStockSwapQuote,
};
