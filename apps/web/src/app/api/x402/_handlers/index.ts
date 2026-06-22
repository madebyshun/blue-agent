// AUTO-GENERATED — self-hosted x402 handler registry (copied from apps/api/x402).
import hTokenPrice from "./token-price";
import hPoolScan from "./pool-scan";
import hWalletHoldings from "./wallet-holdings";
import hNewPools from "./new-pools";
import hGasTracker from "./gas-tracker";
import hQuickSafety from "./quick-safety";
import hWalletRisk from "./wallet-risk";
import hB20Check from "./b20-check";
import hB20Analyze from "./b20-analyze";
import hB20Launch from "./b20-launch";
import hB20Tracker from "./b20-tracker";
import hLiquidityDepth from "./liquidity-depth";
import hTokenDistribution from "./token-distribution";
import hBaseAlpha from "./base-alpha";
import hTokenAlpha from "./token-alpha";
import hProtocolHealth from "./protocol-health";
import hFounderCheck from "./founder-check";
import hNarrativePulse from "./narrative-pulse";
import hBaseActivity from "./base-activity-score";
import hScamDetector from "./scam-detector";
import hCrossYield from "./cross-protocol-yield";
import hAgentReadiness from "./agent-readiness";
import hBasePulse from "./base-pulse";
import hBankrPulse from "./bankr-pulse";
import hBlueIdea      from "./blue-idea";
import hBlueBuild     from "./blue-build";
import hBlueAudit     from "./blue-audit";
import hBlueShip      from "./blue-ship";
import hBlueRaise     from "./blue-raise";
import hContractTrust from "./contract-trust";
import hHoneypotCheck from "./honeypot-check";
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
import h9 from "./community-growth-playbook";
import h10 from "./community-sentiment";
import h11 from "./competitor-scan";
import h12 from "./defi-opportunity";
import h13 from "./ecosystem-digest";
import h14 from "./fundraise-timing";
import h15 from "./gtm-brief";
import h16 from "./investor-memo";
import h18 from "./market-fit";
import h19 from "./multi-agent-workflow";
import h20 from "./narrative-position";
import h21 from "./pitch-intelligence";
import h23 from "./protocol-risk-monitor";
import h24 from "./repo-health";
import h25 from "./roadmap-validator";
import h26 from "./stack-recommender";
import h27 from "./thread-intelligence";
import h29 from "./token-launch-readiness";
import h30 from "./token-momentum-scanner";
import h31 from "./token-pick-signal";
import h33 from "./whale-copy-signal";
import h40 from "./aml-screen";
import h41 from "./airdrop-check";
import h42 from "./whale-tracker";
import h43 from "./dex-flow";
import h45 from "./lp-analyzer";
import h49 from "./launch-simulator-2";
import h50 from "./launch-simulator-3";
import h52 from "./grant-evaluator";
import h53 from "./key-exposure";
import h54 from "./launch-simulator-1";

export const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  "token-price": hTokenPrice,
  "pool-scan": hPoolScan,
  "wallet-holdings": hWalletHoldings,
  "new-pools": hNewPools,
  "gas-tracker": hGasTracker,
  "quick-safety": hQuickSafety,
  "wallet-risk": hWalletRisk,
  "b20-check":   hB20Check,
  "b20-analyze": hB20Analyze,
  "b20-launch":  hB20Launch,
  "b20-tracker": hB20Tracker,
  "liquidity-depth": hLiquidityDepth,
  "token-distribution": hTokenDistribution,
  "base-alpha": hBaseAlpha,
  "token-alpha": hTokenAlpha,
  "protocol-health": hProtocolHealth,
  "founder-check": hFounderCheck,
  "narrative-pulse": hNarrativePulse,
  "base-activity-score": hBaseActivity,
  "scam-detector": hScamDetector,
  "cross-protocol-yield": hCrossYield,
  "agent-readiness": hAgentReadiness,
  "base-pulse": hBasePulse,
  "bankr-pulse": hBankrPulse,
  "agent-collab-match": h0,
  "agent-performance": h1,
  "base-grant-finder": h5,
  "base-protocol-comparison": h6,
  "builder-deep-dd": h8,
  "community-growth-playbook": h9,
  "community-sentiment": h10,
  "competitor-scan": h11,
  "defi-opportunity": h12,
  "ecosystem-digest": h13,
  "fundraise-timing": h14,
  "gtm-brief": h15,
  "investor-memo": h16,
  "market-fit": h18,
  "multi-agent-workflow": h19,
  "narrative-position": h20,
  "pitch-intelligence": h21,
  "protocol-risk-monitor": h23,
  "repo-health": h24,
  "roadmap-validator": h25,
  "stack-recommender": h26,
  "thread-intelligence": h27,
  "token-launch-readiness": h29,
  "token-momentum-scanner": h30,
  "token-pick-signal": h31,
  "whale-copy-signal": h33,
  "blue-idea":      hBlueIdea,
  "blue-build":     hBlueBuild,
  "blue-audit":     hBlueAudit,
  "blue-ship":      hBlueShip,
  "blue-raise":     hBlueRaise,
  "contract-trust": hContractTrust,
  "honeypot-check": hHoneypotCheck,
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




  "aml-screen":      h40,
  "airdrop-check":   h41,
  "whale-tracker":   h42,
  "dex-flow":        h43,
  "lp-analyzer":     h45,
  "launch-simulator-2": h49,
  "launch-simulator-3": h50,
  "grant-evaluator": h52,
  "key-exposure":    h53,
  "launch-simulator-1": h54,
};
