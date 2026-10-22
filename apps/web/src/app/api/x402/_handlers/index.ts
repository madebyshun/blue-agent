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
import hTokenPrice from "./token-price";
import hPoolScan from "./pool-scan";
import hSafeTrending from "./safe-trending";
import hBlueDoctor from "./blue-doctor";
import hHoodLive from "./hood-live";
import hHoodTrackRecord from "./hood-track-record";
import hWalletHoldings from "./wallet-holdings";
import hGasTracker from "./gas-tracker";
import hWalletRisk from "./wallet-risk";
import hB20Analyze from "./b20-analyze";
import hB20Inspect from "./b20-inspect";
import hLiquidityDepth from "./liquidity-depth";
import hNarrativePulse from "./narrative-pulse";
import hBlueIdea      from "./blue-idea";
import hBlueBuild     from "./blue-build";
import hBlueAudit     from "./blue-audit";
import hBlueShip      from "./blue-ship";
import hBlueRaise     from "./blue-raise";
import hContractTrust from "./contract-trust";
import hHoneypotCheck from "./honeypot-check";
import hPreTradeCheck from "./pre-trade-check";
import hSignCheck from "./sign-check";
import hApprovalAudit from "./approval-audit";
import hRiskGate      from "./risk-gate";
import hDeepAnalysis  from "./deep-analysis";
import hAgentScore    from "./agent-score";
import hBlueMonitor   from "./blue-monitor";
import hBlueRegistry  from "./blue-registry";
import hBlueResearch  from "./blue-research";
import hBlueCompose   from "./blue-compose";
import hBlueDeploy    from "./blue-deploy";
import hBlueAnalytics from "./blue-analytics";
import hBlueSimulate  from "./blue-simulate";
import hBlueStream    from "./blue-stream";
import h0 from "./agent-collab-match";
import h1 from "./agent-performance";
import h5 from "./base-grant-finder";
import h6 from "./base-protocol-comparison";
import h8 from "./builder-deep-dd";
import h11 from "./competitor-scan";
import h12 from "./defi-opportunity";
import h13 from "./ecosystem-digest";
import h18 from "./market-fit";
import h20 from "./narrative-position";
import h23 from "./protocol-risk-monitor";
import h24 from "./repo-health";
import h29 from "./token-launch-readiness";
import h30 from "./token-momentum-scanner";
import h31 from "./token-pick-signal";
import h43 from "./dex-flow";
import h53 from "./key-exposure";
// RH RWA Phase 1 (L1·L2·L3·L4·M1) — Robinhood Chain tokenized-stock skills
import hRhRwaIndex     from "./rh-rwa-index";
import hRhStockSearch  from "./rh-stock-search";
import hRhRwaVerify    from "./rh-rwa-verify";
import hRhTokenScan    from "./rh-token-scan";
import hRhStockQuote   from "./rh-stock-quote";
// RH RWA Phase 2 (M2·M3·M4·M5) — market analytics
import hRhStockOhlc      from "./rh-stock-ohlc";
import hRhStockLiquidity from "./rh-stock-liquidity";
import hRhStockMovers    from "./rh-stock-movers";
import hRhStockArb       from "./rh-stock-arb";
// RH RWA Phase 3 (X1·X2·X3) — trading execution
import hRhStockSwapQuote   from "./rh-stock-swap-quote";
import hRhStockSwapPrepare from "./rh-stock-swap-prepare";
// RH RWA Phase 4 (P1·P2·P3·P4) — portfolio
// RH RWA Phase 5 (D1·D2·D3·D4·D5) — discovery & analytics
import hRhStockHolders       from "./rh-stock-holders";
import hRhStockNewListings   from "./rh-stock-new-listings";
// RH RWA Phase 6 (A1·A2·A3·A4) — agent skills
import hRhStockAgentBrief    from "./rh-stock-agent-brief";
// RH RWA Phase 7 (B1·B2·E1·E2·E3) — bridge & builder kit (final)

export const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  "token-price": hTokenPrice,
  "pool-scan": hPoolScan,
  "safe-trending": hSafeTrending,
  "blue-doctor": hBlueDoctor,
  "hood-live": hHoodLive,
  "hood-track-record": hHoodTrackRecord,
  "wallet-holdings": hWalletHoldings,
  "gas-tracker": hGasTracker,
  "wallet-risk": hWalletRisk,
  "b20-analyze": hB20Analyze,
  "b20-inspect": hB20Inspect,
  "liquidity-depth": hLiquidityDepth,
  "narrative-pulse": hNarrativePulse,
  "agent-collab-match": h0,
  "agent-performance": h1,
  "base-grant-finder": h5,
  "base-protocol-comparison": h6,
  "builder-deep-dd": h8,
  "competitor-scan": h11,
  "defi-opportunity": h12,
  "ecosystem-digest": h13,
  "market-fit": h18,
  "narrative-position": h20,
  "protocol-risk-monitor": h23,
  "repo-health": h24,
  "token-launch-readiness": h29,
  "token-momentum-scanner": h30,
  "token-pick-signal": h31,
  "blue-idea":      hBlueIdea,
  "blue-build":     hBlueBuild,
  "blue-audit":     hBlueAudit,
  "blue-ship":      hBlueShip,
  "blue-raise":     hBlueRaise,
  "contract-trust": hContractTrust,
  "honeypot-check": hHoneypotCheck,
  "pre-trade-check": hPreTradeCheck,
  "sign-check": hSignCheck,
  "approval-audit": hApprovalAudit,
  "risk-gate":      hRiskGate,
  "deep-analysis":  hDeepAnalysis,
  "agent-score":    hAgentScore,
  "blue-monitor":   hBlueMonitor,
  "blue-registry":  hBlueRegistry,
  "blue-research":  hBlueResearch,
  "blue-compose":   hBlueCompose,
  "blue-deploy":    hBlueDeploy,
  "blue-analytics": hBlueAnalytics,
  "blue-simulate":  hBlueSimulate,
  "blue-stream":    hBlueStream,




  "dex-flow":        h43,
  "key-exposure":    h53,
  // ── RH RWA Phase 1 ────────────────────────────────────────────────────
  "rh-rwa-index":       hRhRwaIndex,
  "rh-stock-search":    hRhStockSearch,
  "rh-rwa-verify":      hRhRwaVerify,
  "rh-token-scan":      hRhTokenScan,
  "rh-stock-quote":     hRhStockQuote,
  // ── RH RWA Phase 2 — Market Analytics ─────────────────────────────────
  "rh-stock-ohlc":      hRhStockOhlc,
  "rh-stock-liquidity": hRhStockLiquidity,
  "rh-stock-movers":    hRhStockMovers,
  "rh-stock-arb":       hRhStockArb,
  // ── RH RWA Phase 3 — Trading Execution ────────────────────────────────
  "rh-stock-swap-quote":   hRhStockSwapQuote,
  "rh-stock-swap-prepare": hRhStockSwapPrepare,
  // ── RH RWA Phase 4 — Portfolio ────────────────────────────────────────
  // ── RH RWA Phase 5 — Discovery & Analytics ────────────────────────────
  "rh-stock-holders":       hRhStockHolders,
  "rh-stock-new-listings":  hRhStockNewListings,
  // ── RH RWA Phase 6 — Agent Skills ─────────────────────────────────────
  "rh-stock-agent-brief":   hRhStockAgentBrief,
  // ── RH RWA Phase 7 — Bridge & Builder Kit ─────────────────────────────
};
