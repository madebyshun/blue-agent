// Blue Agent x402 API — local dev server (separate surface from the apps/web Hub)
// Production paid x402 is self-hosted at blueagent.dev/api/x402.
// (The old x402.bankr.bot/builder-score endpoint is dead — do not point clients at it.)

// Load .env for local dev
import { config } from "dotenv";
config();

import http from 'http';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Quantum Security
import quantumPremium  from './x402/quantum-premium/index.js';
import quantumBatch    from './x402/quantum-batch/index.js';
import quantumMigrate  from './x402/quantum-migrate/index.js';
import quantumTimeline from './x402/quantum-timeline/index.js';
import keyExposure     from './x402/key-exposure/index.js';

// Agent Safety
import riskGate        from './x402/risk-gate/index.js';
import honeypotCheck   from './x402/honeypot-check/index.js';
import allowanceAudit  from './x402/allowance-audit/index.js';
import phishingScan    from './x402/phishing-scan/index.js';
import mevShield       from './x402/mev-shield/index.js';
import contractTrust   from './x402/contract-trust/index.js';
import circuitBreaker  from './x402/circuit-breaker/index.js';
import amlScreen       from './x402/aml-screen/index.js';

// Research
import deepAnalysis    from './x402/deep-analysis/index.js';
import launchAdvisor   from './x402/launch-advisor/index.js';
import grantEvaluator  from './x402/grant-evaluator/index.js';
import x402Readiness   from './x402/x402-readiness/index.js';
import baseDeployCheck from './x402/base-deploy-check/index.js';
import narrativePulse  from './x402/narrative-pulse/index.js';
import tokenomicsScore from './x402/tokenomics-score/index.js';
import whitepaperTldr  from './x402/whitepaper-tldr/index.js';
import vcTracker       from './x402/vc-tracker/index.js';

// Data & Alerts
import walletPnl       from './x402/wallet-pnl/index.js';
import whaleTracker    from './x402/whale-tracker/index.js';
import airdropCheck    from './x402/airdrop-check/index.js';
import dexFlow         from './x402/dex-flow/index.js';
import alertCheck      from './x402/alert-check/index.js';
import alertSubscribe  from './x402/alert-subscribe/index.js';

// Earn
import yieldOptimizer  from './x402/yield-optimizer/index.js';
import lpAnalyzer      from './x402/lp-analyzer/index.js';
import taxReport       from './x402/tax-report/index.js';

// Launch & Identity
import tokenLaunch       from './x402/token-launch/index.js';
import builderCard       from './x402/builder-card/index.js';
import agentCard         from './x402/agent-card/index.js';

// Collab
import launchSimulator       from './x402/launch-simulator/index.js';

// Trading & Alpha
import whaleCopySignal       from './x402/whale-copy-signal/index.js';
import tokenMomentumScanner  from './x402/token-momentum-scanner/index.js';
import portfolioRebalancer   from './x402/portfolio-rebalancer/index.js';

// Creator & Content
import threadIntelligence    from './x402/thread-intelligence/index.js';
import builderBrandScore     from './x402/builder-brand-score/index.js';
import communityGrowthPlaybook from './x402/community-growth-playbook/index.js';

// Agent Economy
import agentRevenueOptimizer from './x402/agent-revenue-optimizer/index.js';
import agentTokenStrategy    from './x402/agent-token-strategy/index.js';
import multiAgentWorkflow    from './x402/multi-agent-workflow/index.js';

// Base Ecosystem
import baseGrantFinder       from './x402/base-grant-finder/index.js';
import baseProtocolComparison from './x402/base-protocol-comparison/index.js';
import baseBuilderNetworkMatch from './x402/base-builder-network-match/index.js';

// On-chain Strategy
import walletStrategyAnalyzer from './x402/wallet-strategy-analyzer/index.js';
import protocolRiskMonitor   from './x402/protocol-risk-monitor/index.js';

// Intelligence Tools — Batch 1
import tokenPickSignal       from './x402/token-pick-signal/index.js';
import narrativePosition     from './x402/narrative-position/index.js';
import ecosystemDigest       from './x402/ecosystem-digest/index.js';
import marketFit             from './x402/market-fit/index.js';
import tokenLaunchReadiness  from './x402/token-launch-readiness/index.js';

// Intelligence Tools — Batch 3
import roadmapValidator      from './x402/roadmap-validator/index.js';
import competitorScan        from './x402/competitor-scan/index.js';
import pitchIntelligence     from './x402/pitch-intelligence/index.js';
import fundraiseTiming       from './x402/fundraise-timing/index.js';
import gtmBrief              from './x402/gtm-brief/index.js';
import stackRecommender      from './x402/stack-recommender/index.js';
import investorMemo          from './x402/investor-memo/index.js';
import tokenDistributionPlan from './x402/token-distribution-plan/index.js';
import agentPerformance      from './x402/agent-performance/index.js';
import agentCollabMatch      from './x402/agent-collab-match/index.js';
import repoHealth            from './x402/repo-health/index.js';
import communitySentiment    from './x402/community-sentiment/index.js';
import defiOpportunity       from './x402/defi-opportunity/index.js';
import builderDeepDd         from './x402/builder-deep-dd/index.js';

const PORT = parseInt(process.env.PORT ?? '3001', 10);

const HANDLERS: Record<string, (req: Request) => Promise<Response>> = {
  // Quantum Security
  'quantum-premium':  quantumPremium,
  'quantum-batch':    quantumBatch,
  'quantum-migrate':  quantumMigrate,
  'quantum-timeline': quantumTimeline,
  'key-exposure':     keyExposure,

  // Agent Safety
  'risk-gate':        riskGate,
  'honeypot-check':   honeypotCheck,
  'allowance-audit':  allowanceAudit,
  'phishing-scan':    phishingScan,
  'mev-shield':       mevShield,
  'contract-trust':   contractTrust,
  'circuit-breaker':  circuitBreaker,
  'aml-screen':       amlScreen,

  // Research
  'deep-analysis':    deepAnalysis,
  'launch-advisor':   launchAdvisor,
  'grant-evaluator':  grantEvaluator,
  'x402-readiness':   x402Readiness,
  'base-deploy-check': baseDeployCheck,
  'narrative-pulse':  narrativePulse,
  'tokenomics-score': tokenomicsScore,
  'whitepaper-tldr':  whitepaperTldr,
  'vc-tracker':       vcTracker,

  // Data & Alerts
  'wallet-pnl':       walletPnl,
  'whale-tracker':    whaleTracker,
  'airdrop-check':    airdropCheck,
  'dex-flow':         dexFlow,
  'alert-check':      alertCheck,
  'alert-subscribe':  alertSubscribe,

  // Earn
  'yield-optimizer':  yieldOptimizer,
  'lp-analyzer':      lpAnalyzer,
  'tax-report':       taxReport,

  // Launch & Identity
  'token-launch':       tokenLaunch,
  'builder-card':       builderCard,
  'agent-card':         agentCard,

  // Collab
  'launch-simulator':   launchSimulator,

  // Trading & Alpha
  'whale-copy-signal':        whaleCopySignal,
  'token-momentum-scanner':   tokenMomentumScanner,
  'portfolio-rebalancer':     portfolioRebalancer,

  // Creator & Content
  'thread-intelligence':        threadIntelligence,
  'builder-brand-score':        builderBrandScore,
  'community-growth-playbook':  communityGrowthPlaybook,

  // Agent Economy
  'agent-revenue-optimizer':    agentRevenueOptimizer,
  'agent-token-strategy':       agentTokenStrategy,
  'multi-agent-workflow':       multiAgentWorkflow,

  // Base Ecosystem
  'base-grant-finder':          baseGrantFinder,
  'base-protocol-comparison':   baseProtocolComparison,
  'base-builder-network-match': baseBuilderNetworkMatch,

  // On-chain Strategy
  'wallet-strategy-analyzer':   walletStrategyAnalyzer,
  'protocol-risk-monitor':      protocolRiskMonitor,

  // Intelligence Tools — Batch 1
  'token-pick-signal':       tokenPickSignal,
  'narrative-position':      narrativePosition,
  'ecosystem-digest':        ecosystemDigest,
  'market-fit':              marketFit,
  'token-launch-readiness':  tokenLaunchReadiness,

  // Intelligence Tools — Batch 3
  'roadmap-validator':       roadmapValidator,
  'competitor-scan':         competitorScan,
  'pitch-intelligence':      pitchIntelligence,
  'fundraise-timing':        fundraiseTiming,
  'gtm-brief':               gtmBrief,
  'stack-recommender':       stackRecommender,
  'investor-memo':           investorMemo,
  'token-distribution-plan': tokenDistributionPlan,
  'agent-performance':       agentPerformance,
  'agent-collab-match':      agentCollabMatch,
  'repo-health':             repoHealth,
  'community-sentiment':     communitySentiment,
  'defi-opportunity':        defiOpportunity,
  'builder-deep-dd':         builderDeepDd,
};

const __dir = dirname(fileURLToPath(import.meta.url));
let services: Record<string, unknown> = {};
try {
  services = JSON.parse(readFileSync(join(__dir, 'bankr.x402.json'), 'utf8'));
} catch {}

function setCors(res: http.ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Payment, x-api-key, Authorization');
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const toolId = url.pathname.split('/').filter(Boolean)[0];

  // Health / service list
  if (!toolId || req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      name: 'blue-agent-x402',
      version: '0.1.0',
      tools: Object.keys(HANDLERS),
      count: Object.keys(HANDLERS).length,
      services,
    }, null, 2));
    return;
  }

  const handler = HANDLERS[toolId];
  if (!handler) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Unknown tool: ${toolId}. Available: ${Object.keys(HANDLERS).join(', ')}` }));
    return;
  }

  // Collect request body
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks).toString();

  try {
    const webReq = new Request(`http://localhost:${PORT}${req.url}`, {
      method: req.method ?? 'GET',
      headers: req.headers as Record<string, string>,
      body: req.method !== 'GET' && req.method !== 'HEAD' && body ? body : null,
    });

    const webRes = await handler(webReq);
    const responseBody = await webRes.text();
    const ct = webRes.headers.get('content-type') ?? 'application/json';

    res.writeHead(webRes.status, { 'Content-Type': ct });
    res.end(responseBody);
  } catch (err) {
    console.error(`[${toolId}] Error:`, err);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal error', message: (err as Error).message }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🔵 Blue Agent x402 API — http://localhost:${PORT}`);
  console.log(`   ${Object.keys(HANDLERS).length} services: ${Object.keys(HANDLERS).join(', ')}\n`);
});
