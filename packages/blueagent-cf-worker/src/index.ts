import { Hono } from 'hono'
import { paymentMiddleware } from '@x402/hono'
import { type Env, askJSON } from './llm'

const FACILITATOR = 'https://x402.org/facilitator'
const TREASURY = '0xf31f59e7b8b58555f7871f71973a394c8f1bffe5'

const app = new Hono<{ Bindings: Env }>()

// ── x402 Payment Middleware ────────────────────────────────
app.use(paymentMiddleware(TREASURY, {
  // DATA
  'POST /whale-tracker':    { price: '$0.10', network: 'base', description: 'Whale & smart money tracker on Base' },
  'POST /dex-flow':         { price: '$0.15', network: 'base', description: 'DEX trading flow & market data' },
  'POST /unlock-alert':     { price: '$0.20', network: 'base', description: 'Token unlock & vesting schedule' },
  // SECURITY
  'POST /honeypot-check':   { price: '$0.05', network: 'base', description: 'Honeypot & smart contract safety check' },
  'POST /aml-screen':       { price: '$0.25', network: 'base', description: 'AML compliance screening' },
  'POST /mev-shield':       { price: '$0.30', network: 'base', description: 'MEV & sandwich attack analysis' },
  'POST /phishing-scan':    { price: '$0.10', network: 'base', description: 'Phishing & scam detection' },
  // RESEARCH
  'POST /tokenomics-score': { price: '$0.50', network: 'base', description: 'Tokenomics deep analysis & score' },
  'POST /narrative-pulse':  { price: '$0.40', network: 'base', description: 'Crypto narrative trend momentum' },
  'POST /vc-tracker':       { price: '$1.00', network: 'base', description: 'VC investment activity & signals' },
  'POST /whitepaper-tldr':  { price: '$0.20', network: 'base', description: 'Whitepaper 5-bullet summary' },
  // EARN
  'POST /yield-optimizer':  { price: '$0.15', network: 'base', description: 'Best yield farming on Base' },
  'POST /airdrop-check':    { price: '$0.10', network: 'base', description: 'Airdrop eligibility checker' },
  'POST /lp-analyzer':      { price: '$0.30', network: 'base', description: 'LP position & impermanent loss' },
  'POST /tax-report':       { price: '$2.00', network: 'base', description: 'Crypto tax summary & liability' },
}, { facilitatorUrl: FACILITATOR }))

// ── Discovery (free) ───────────────────────────────────────
app.get('/', (c) => c.json({
  name: 'BlueAgent x402',
  description: '15 AI-powered DeFi tools on Base — pay-per-use USDC',
  treasury: TREASURY,
  network: 'base',
  currency: 'USDC',
  tools: [
    { path: '/whale-tracker',    price: '$0.10', input: 'address' },
    { path: '/dex-flow',         price: '$0.15', input: 'token' },
    { path: '/unlock-alert',     price: '$0.20', input: 'token' },
    { path: '/honeypot-check',   price: '$0.05', input: 'token' },
    { path: '/aml-screen',       price: '$0.25', input: 'address' },
    { path: '/mev-shield',       price: '$0.30', input: 'action' },
    { path: '/phishing-scan',    price: '$0.10', input: 'target' },
    { path: '/tokenomics-score', price: '$0.50', input: 'token' },
    { path: '/narrative-pulse',  price: '$0.40', input: 'query' },
    { path: '/vc-tracker',       price: '$1.00', input: 'query' },
    { path: '/whitepaper-tldr',  price: '$0.20', input: 'url' },
    { path: '/yield-optimizer',  price: '$0.15', input: 'token' },
    { path: '/airdrop-check',    price: '$0.10', input: 'address' },
    { path: '/lp-analyzer',      price: '$0.30', input: 'address' },
    { path: '/tax-report',       price: '$2.00', input: 'address' },
  ],
}))

// ── DATA ───────────────────────────────────────────────────
app.post('/whale-tracker', async (c) => {
  const { address } = await c.req.json<{ address: string }>()
  if (!address) return c.json({ error: 'address required' }, 400)
  return c.json(await askJSON(
    `Analyze whale and smart money activity for: ${address} on Base.
     Return JSON: { address, recentMoves: [{ wallet, action, value, time }] (up to 5), smartMoneyScore (0-100), summary }`,
    'You are an onchain analyst tracking whale wallets and smart money flows on Base.',
    c.env
  ))
})

app.post('/dex-flow', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  if (!token) return c.json({ error: 'token required' }, 400)
  return c.json(await askJSON(
    `Analyze DEX trading flow for token: ${token} on Base.
     Return JSON: { token, priceUSD, volume24h, liquidity, priceChange24h, buyPressure: "STRONG BUY"|"MILD BUY"|"MILD SELL"|"STRONG SELL", verdict }`,
    'You are a DEX market analyst on Base covering Aerodrome, Uniswap v3, BaseSwap.',
    c.env
  ))
})

app.post('/unlock-alert', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  if (!token) return c.json({ error: 'token required' }, 400)
  return c.json(await askJSON(
    `Research token unlock schedule for: ${token}.
     Return JSON: { token, nextUnlock: { date, amount, recipient, percentSupply }, totalLocked, unlockSchedule: [{ date, amount, category }], riskLevel: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", summary }`,
    'You are a tokenomics analyst specializing in vesting and unlock schedules.',
    c.env
  ))
})

// ── SECURITY ───────────────────────────────────────────────
app.post('/honeypot-check', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  if (!token) return c.json({ error: 'token required' }, 400)
  return c.json(await askJSON(
    `Honeypot and security check for token: ${token} on Base.
     Return JSON: { token, isHoneypot, canSell, buyTax, sellTax, isVerified, hasBlacklist, hasMint, verdict: "SAFE"|"WARNING"|"DANGER", reasons }`,
    'You are a smart contract security auditor specializing in honeypot detection on Base.',
    c.env
  ))
})

app.post('/aml-screen', async (c) => {
  const { address } = await c.req.json<{ address: string }>()
  if (!address) return c.json({ error: 'address required' }, 400)
  return c.json(await askJSON(
    `AML compliance check for wallet: ${address} on Base.
     Return JSON: { address, riskLevel: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", complianceScore (0-100), flags, sanctioned, mixerUsed, darknetLinked, recommendation }`,
    'You are a blockchain AML compliance analyst.',
    c.env
  ))
})

app.post('/mev-shield', async (c) => {
  const { action } = await c.req.json<{ action: string }>()
  if (!action) return c.json({ error: 'action required' }, 400)
  return c.json(await askJSON(
    `Analyze MEV risk for transaction: "${action}" on Base.
     Return JSON: { action, mevRisk: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", sandwichProbability, estimatedLoss, recommendations, safeSlippage, preferredRouter }`,
    'You are an MEV protection expert on Base.',
    c.env
  ))
})

app.post('/phishing-scan', async (c) => {
  const { target } = await c.req.json<{ target: string }>()
  if (!target) return c.json({ error: 'target required' }, 400)
  const type = /^0x[0-9a-fA-F]{40}$/.test(target) ? 'contract/wallet' : target.startsWith('http') ? 'URL' : 'domain/handle'
  return c.json(await askJSON(
    `Scan for phishing/scam: "${target}" (type: ${type}).
     Return JSON: { target, verdict: "SAFE"|"SUSPICIOUS"|"PHISHING"|"SCAM", riskScore (0-100), flags, recommendation }`,
    'You are a Web3 security expert specializing in phishing and scam detection.',
    c.env
  ))
})

// ── RESEARCH ───────────────────────────────────────────────
app.post('/tokenomics-score', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  if (!token) return c.json({ error: 'token required' }, 400)
  return c.json(await askJSON(
    `Analyze tokenomics of: ${token}.
     Return JSON: { token, score (0-100), supplyStructure: { total, circulating, locked }, inflationRate, vestingCliff, distributionHealth: "HEALTHY"|"MODERATE"|"RISKY", strengths, risks, verdict }`,
    'You are a tokenomics expert. Be specific with numbers.',
    c.env
  ))
})

app.post('/narrative-pulse', async (c) => {
  const { query } = await c.req.json<{ query: string }>()
  if (!query) return c.json({ error: 'query required' }, 400)
  return c.json(await askJSON(
    `Analyze narrative momentum for: "${query}" in Base ecosystem.
     Return JSON: { query, heatScore (0-100), trending (top 3), momentum: "RISING"|"PEAK"|"FADING"|"EMERGING", keyPlayers, catalysts, timeframe, summary }`,
    'You are a crypto narrative analyst specializing in Base ecosystem trends.',
    c.env
  ))
})

app.post('/vc-tracker', async (c) => {
  const { query } = await c.req.json<{ query: string }>()
  if (!query) return c.json({ error: 'query required' }, 400)
  return c.json(await askJSON(
    `Research VC activity for: "${query}" in crypto/Web3 2024-2026.
     Return JSON: { query, recentDeals: [{ project, vc, amount, date, stage }] (up to 5), hotThemes, activeVCs, marketSignal: "BULLISH"|"NEUTRAL"|"BEARISH", summary }`,
    'You are a crypto VC research analyst.',
    c.env
  ))
})

app.post('/whitepaper-tldr', async (c) => {
  const { url, projectName = '' } = await c.req.json<{ url: string; projectName?: string }>()
  if (!url) return c.json({ error: 'url required' }, 400)
  let content = ''
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'BlueAgent/1.0' } })
    const html = await r.text()
    content = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 5000)
  } catch { content = 'Could not fetch URL' }
  return c.json(await askJSON(
    `Summarize whitepaper for ${projectName || 'this project'}. URL: ${url}. Content: ${content}
     Return JSON: { url, projectName, bullets (5 key points), techStack, tokenRole, verdict, readTime }`,
    'You are a crypto research analyst. Cut through the hype.',
    c.env
  ))
})

// ── EARN ───────────────────────────────────────────────────
app.post('/yield-optimizer', async (c) => {
  const { token } = await c.req.json<{ token: string }>()
  if (!token) return c.json({ error: 'token required' }, 400)
  return c.json(await askJSON(
    `Best yield opportunities for: ${token} on Base.
     Return JSON: { token, topOpportunities: [{ protocol, pair, apy, tvl, risk: "LOW"|"MEDIUM"|"HIGH" }] (up to 5), bestAPY, recommendation }`,
    'You are a DeFi yield optimization expert on Base. Focus on Aerodrome, Moonwell, Compound, ExtraFi.',
    c.env
  ))
})

app.post('/airdrop-check', async (c) => {
  const { address } = await c.req.json<{ address: string }>()
  if (!address) return c.json({ error: 'address required' }, 400)
  return c.json(await askJSON(
    `Airdrop eligibility for wallet: ${address} on Base and Ethereum.
     Return JSON: { address, eligible: [{ project, amount, valueUSD, deadline, claimUrl }], totalEstimatedValue, missedAirdrops, tip }`,
    'You are an airdrop research expert specializing in Base ecosystem 2025-2026.',
    c.env
  ))
})

app.post('/lp-analyzer', async (c) => {
  const { address, pool = '' } = await c.req.json<{ address: string; pool?: string }>()
  if (!address) return c.json({ error: 'address required' }, 400)
  return c.json(await askJSON(
    `Analyze LP positions for wallet: ${address} on Base. ${pool ? 'Focus pool: ' + pool : ''}
     Return JSON: { address, positions: [{ pool, value, feesEarned, impermanentLoss, daysActive, health: "GOOD"|"OK"|"REBALANCE" }], totalValue, totalIL, totalFees, recommendation }`,
    'You are a DeFi LP strategy expert on Base covering Aerodrome, Uniswap v3.',
    c.env
  ))
})

app.post('/tax-report', async (c) => {
  const { address, year = '' } = await c.req.json<{ address: string; year?: string }>()
  if (!address) return c.json({ error: 'address required' }, 400)
  const taxYear = year || String(new Date().getFullYear() - 1)
  return c.json(await askJSON(
    `Tax summary for wallet: ${address} for tax year ${taxYear} on Base.
     Return JSON: { address, year: "${taxYear}", totalTrades, realizedGains, realizedLosses, netPnL, incomeEvents: [{ type, amount, date }], taxableEvents, estimatedTaxLiability, recommendation }`,
    'You are a crypto tax expert. Clarify this is an estimate.',
    c.env
  ))
})

export default app
