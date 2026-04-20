#!/usr/bin/env node
// Run from inside blueagent-x402-services/ directory
import fs from 'fs'
import path from 'path'

const HELPER = `
async function callLLM(system, userContent) {
  const response = await fetch('https://llm.bankr.bot/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.BANKR_API_KEY,
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      system,
      messages: [{ role: 'user', content: userContent }],
      temperature: 0.5,
      max_tokens: 1200,
    }),
  })
  if (!response.ok) throw new Error('LLM error: ' + response.status)
  const data = await response.json()
  if (data.content && Array.isArray(data.content)) return data.content[0].text
  throw new Error('Invalid LLM response')
}

function parseJSON(raw) {
  const start = raw.indexOf('{'), end = raw.lastIndexOf('}')
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1))
  throw new Error('No JSON found')
}
`

const services = [
  {
    name: 'whale-tracker',
    price: 0.10,
    description: 'Whale & smart money tracker on Base',
    input: 'address',
    system: 'You are an onchain analyst tracking whale wallets and smart money flows on Base. Return ONLY valid JSON.',
    prompt: (v) => `Analyze whale and smart money activity for: ${v} on Base.
Return JSON: { address, recentMoves: [{ wallet, action, value, time }] (up to 5), smartMoneyScore (0-100), summary }`,
    paramName: 'address',
  },
  {
    name: 'dex-flow',
    price: 0.15,
    description: 'DEX trading flow & market data for any token on Base',
    input: 'token',
    system: 'You are a DEX market analyst on Base covering Aerodrome, Uniswap v3, BaseSwap. Return ONLY valid JSON.',
    prompt: (v) => `Analyze DEX trading flow for token: ${v} on Base.
Return JSON: { token, priceUSD, volume24h, liquidity, priceChange24h, buyPressure: "STRONG BUY"|"MILD BUY"|"MILD SELL"|"STRONG SELL", verdict }`,
    paramName: 'token',
  },
  {
    name: 'unlock-alert',
    price: 0.20,
    description: 'Token unlock schedule & vesting cliff alerts',
    input: 'token',
    system: 'You are a tokenomics analyst specializing in vesting and unlock schedules. Return ONLY valid JSON.',
    prompt: (v) => `Research token unlock schedule for: ${v}.
Return JSON: { token, nextUnlock: { date, amount, recipient, percentSupply }, totalLocked, unlockSchedule: [{ date, amount, category }] (up to 5), riskLevel: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", summary }`,
    paramName: 'token',
  },
  {
    name: 'honeypot-check',
    price: 0.05,
    description: 'Honeypot & smart contract safety check',
    input: 'token',
    system: 'You are a smart contract security auditor specializing in honeypot detection on Base. Return ONLY valid JSON.',
    prompt: (v) => `Honeypot and security check for token: ${v} on Base.
Return JSON: { token, isHoneypot, canSell, buyTax, sellTax, isVerified, hasBlacklist, hasMint, verdict: "SAFE"|"WARNING"|"DANGER", reasons }`,
    paramName: 'token',
  },
  {
    name: 'aml-screen',
    price: 0.25,
    description: 'AML compliance screening for wallet addresses',
    input: 'address',
    system: 'You are a blockchain AML compliance analyst. Return ONLY valid JSON.',
    prompt: (v) => `AML compliance check for wallet: ${v} on Base.
Return JSON: { address, riskLevel: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", complianceScore (0-100), flags, sanctioned, mixerUsed, darknetLinked, recommendation }`,
    paramName: 'address',
  },
  {
    name: 'mev-shield',
    price: 0.30,
    description: 'MEV & sandwich attack risk analysis',
    input: 'action',
    system: 'You are an MEV protection expert on Base. Return ONLY valid JSON.',
    prompt: (v) => `Analyze MEV risk for transaction: "${v}" on Base.
Return JSON: { action, mevRisk: "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", sandwichProbability, estimatedLoss, recommendations, safeSlippage, preferredRouter }`,
    paramName: 'action',
  },
  {
    name: 'phishing-scan',
    price: 0.10,
    description: 'Phishing & scam detection for addresses, URLs, domains',
    input: 'target',
    system: 'You are a Web3 security expert specializing in phishing and scam detection. Return ONLY valid JSON.',
    prompt: (v) => `Scan for phishing/scam: "${v}".
Return JSON: { target, verdict: "SAFE"|"SUSPICIOUS"|"PHISHING"|"SCAM", riskScore (0-100), flags, recommendation }`,
    paramName: 'target',
  },
  {
    name: 'tokenomics-score',
    price: 0.50,
    description: 'Deep tokenomics analysis & health score',
    input: 'token',
    system: 'You are a tokenomics expert. Be specific with numbers. Return ONLY valid JSON.',
    prompt: (v) => `Analyze tokenomics of: ${v}.
Return JSON: { token, score (0-100), supplyStructure: { total, circulating, locked }, inflationRate, vestingCliff, distributionHealth: "HEALTHY"|"MODERATE"|"RISKY", strengths, risks, verdict }`,
    paramName: 'token',
  },
  {
    name: 'narrative-pulse',
    price: 0.40,
    description: 'Crypto narrative & trend momentum on Base',
    input: 'query',
    system: 'You are a crypto narrative analyst specializing in Base ecosystem trends. Return ONLY valid JSON.',
    prompt: (v) => `Analyze narrative momentum for: "${v}" in Base ecosystem.
Return JSON: { query, heatScore (0-100), trending (top 3), momentum: "RISING"|"PEAK"|"FADING"|"EMERGING", keyPlayers, catalysts, timeframe, summary }`,
    paramName: 'query',
  },
  {
    name: 'vc-tracker',
    price: 1.00,
    description: 'VC investment activity & fundraising signals',
    input: 'query',
    system: 'You are a crypto VC research analyst with deep knowledge of Web3 fundraising. Return ONLY valid JSON.',
    prompt: (v) => `Research VC activity for: "${v}" in crypto/Web3.
Return JSON: { query, recentDeals: [{ project, vc, amount, date, stage }] (up to 5), hotThemes, activeVCs, marketSignal: "BULLISH"|"NEUTRAL"|"BEARISH", summary }`,
    paramName: 'query',
  },
  {
    name: 'whitepaper-tldr',
    price: 0.20,
    description: 'Whitepaper & docs summarizer — 5 key bullets',
    input: 'url',
    system: 'You are a crypto research analyst. Cut through the hype. Return ONLY valid JSON.',
    prompt: (v) => `Summarize whitepaper at URL: ${v}.
Return JSON: { url, projectName, bullets (5 key points), techStack, tokenRole, verdict, readTime }`,
    paramName: 'url',
    extra: true,
  },
  {
    name: 'yield-optimizer',
    price: 0.15,
    description: 'Best yield farming opportunities on Base',
    input: 'token',
    system: 'You are a DeFi yield optimization expert on Base covering Aerodrome, Moonwell, Compound, ExtraFi. Return ONLY valid JSON.',
    prompt: (v) => `Best yield opportunities for: ${v} on Base.
Return JSON: { token, topOpportunities: [{ protocol, pair, apy, tvl, risk: "LOW"|"MEDIUM"|"HIGH" }] (up to 5), bestAPY, recommendation }`,
    paramName: 'token',
  },
  {
    name: 'airdrop-check',
    price: 0.10,
    description: 'Airdrop eligibility checker for Base & Ethereum',
    input: 'address',
    system: 'You are an airdrop research expert specializing in Base ecosystem 2025-2026. Return ONLY valid JSON.',
    prompt: (v) => `Airdrop eligibility for wallet: ${v} on Base and Ethereum.
Return JSON: { address, eligible: [{ project, amount, valueUSD, deadline, claimUrl }], totalEstimatedValue, missedAirdrops, tip }`,
    paramName: 'address',
  },
  {
    name: 'lp-analyzer',
    price: 0.30,
    description: 'LP position health & impermanent loss analysis',
    input: 'address',
    system: 'You are a DeFi LP strategy expert on Base covering Aerodrome, Uniswap v3. Return ONLY valid JSON.',
    prompt: (v) => `Analyze LP positions for wallet: ${v} on Base.
Return JSON: { address, positions: [{ pool, value, feesEarned, impermanentLoss, daysActive, health: "GOOD"|"OK"|"REBALANCE" }], totalValue, totalIL, totalFees, recommendation }`,
    paramName: 'address',
  },
  {
    name: 'tax-report',
    price: 2.00,
    description: 'Crypto tax summary & estimated liability',
    input: 'address',
    system: 'You are a crypto tax expert. Clarify this is an estimate. Return ONLY valid JSON.',
    prompt: (v) => `Tax summary for wallet: ${v} for the previous tax year on Base.
Return JSON: { address, year, totalTrades, realizedGains, realizedLosses, netPnL, incomeEvents: [{ type, amount, date }], taxableEvents, estimatedTaxLiability, recommendation }`,
    paramName: 'address',
  },
]

// Create service files
for (const svc of services) {
  const dir = `x402/${svc.name}`
  fs.mkdirSync(dir, { recursive: true })

  const promptStr = svc.prompt('${' + svc.paramName + '}')
  const extraParse = svc.name === 'whitepaper-tldr' ? `
    let content = ''
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'BlueAgent/1.0' } })
      const html = await res.text()
      content = html.replace(/<[^>]+>/g, ' ').replace(/\\s+/g, ' ').slice(0, 5000)
    } catch { content = 'Could not fetch URL' }
` : ''

  const extraParam = svc.name === 'whitepaper-tldr'
    ? `const { url = '', projectName = '' } = body`
    : svc.name === 'lp-analyzer'
    ? `const { address = '', pool = '' } = body`
    : svc.name === 'tax-report'
    ? `const { address = '', year = '' } = body`
    : `const { ${svc.paramName} = '' } = body`

  const promptVar = svc.name === 'whitepaper-tldr'
    ? `\`Summarize whitepaper at URL: \${url}. Content: \${content}\\nReturn JSON: { url, projectName, bullets (5 key points), techStack, tokenRole, verdict, readTime }\``
    : svc.name === 'lp-analyzer'
    ? `\`Analyze LP positions for wallet: \${address} on Base. \${pool ? 'Focus on pool: ' + pool : 'Check all LP positions.'}\\nReturn JSON: { address, positions: [{ pool, value, feesEarned, impermanentLoss, daysActive, health: "GOOD"|"OK"|"REBALANCE" }], totalValue, totalIL, totalFees, recommendation }\``
    : svc.name === 'tax-report'
    ? `\`Tax summary for wallet: \${address} for tax year \${year || String(new Date().getFullYear() - 1)} on Base.\\nReturn JSON: { address, year, totalTrades, realizedGains, realizedLosses, netPnL, incomeEvents: [{ type, amount, date }], taxableEvents, estimatedTaxLiability, recommendation }\``
    : `\`${promptStr}\``

  const code = `// x402/${svc.name}/index.ts — $${svc.price.toFixed(2)} USDC
// ${svc.description}
${HELPER}
export default async function handler(req) {
  try {
    const text = await req.text()
    const body = text ? JSON.parse(text) : {}
    ${extraParam}
    if (!${svc.paramName === 'url' ? 'url' : svc.paramName}) return Response.json({ error: '${svc.paramName} required' }, { status: 400 })
${extraParse}
    const system = \`${svc.system}\`
    const prompt = ${promptVar}
    const result = parseJSON(await callLLM(system, prompt))
    return Response.json(result)
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
`
  fs.writeFileSync(`${dir}/index.ts`, code)
  console.log(`  ✅ ${svc.name}`)
}

// Update bankr.x402.json
const config = JSON.parse(fs.readFileSync('bankr.x402.json', 'utf8'))
for (const svc of services) {
  config.services[svc.name] = {
    price: svc.price,
    description: svc.description,
    inputSchema: {
      type: 'object',
      properties: { [svc.paramName]: { type: 'string' } },
      required: [svc.paramName],
    },
  }
}
fs.writeFileSync('bankr.x402.json', JSON.stringify(config, null, 2))

console.log(`\n✅ Done! Total services: ${Object.keys(config.services).length}`)
console.log('\nNext:')
console.log('  git add . && git commit -m "feat: add 15 new x402 services" && git push')
console.log('  bankr x402 deploy')
