// Blue Agent x402 API — local dev server
// Production: handlers are deployed to x402.bankr.bot infrastructure

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
import tokenLaunch     from './x402/token-launch/index.js';
import builderCard     from './x402/builder-card/index.js';
import agentCard       from './x402/agent-card/index.js';

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
  'token-launch':     tokenLaunch,
  'builder-card':     builderCard,
  'agent-card':       agentCard,
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
