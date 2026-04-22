#!/usr/bin/env node
import { Command } from 'commander'
import { exec, spawnSync } from 'child_process'
import { promisify } from 'util'
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const execP = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))

const TREASURY = '0xf31f59e7b8b58555f7871f71973a394c8f1bffe5'
const BASE_URL = `https://x402.bankr.bot/${TREASURY}`
const BANKR_BIN = process.env.BANKR_BIN ?? 'bankr'
const DEMO_MODE = process.env.DEMO_MODE === 'true'
const CONFIG_DIR = join(homedir(), '.blueagent')
const CONFIG_PATH = join(CONFIG_DIR, 'config.json')

// ── ANSI helpers ──────────────────────────────────────────────
const c = {
  cyan:    (s: string) => `\x1b[36m${s}\x1b[0m`,
  bold:    (s: string) => `\x1b[1m${s}\x1b[0m`,
  gray:    (s: string) => `\x1b[90m${s}\x1b[0m`,
  green:   (s: string) => `\x1b[32m${s}\x1b[0m`,
  yellow:  (s: string) => `\x1b[33m${s}\x1b[0m`,
  red:     (s: string) => `\x1b[31m${s}\x1b[0m`,
  blue:    (s: string) => `\x1b[34m${s}\x1b[0m`,
  magenta: (s: string) => `\x1b[35m${s}\x1b[0m`,
}

// ── Config ────────────────────────────────────────────────────
interface Config { bankrApiKey?: string }

function loadConfig(): Config {
  if (!existsSync(CONFIG_PATH)) return {}
  try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as Config }
  catch { return {} }
}

function saveConfig(cfg: Config) {
  mkdirSync(CONFIG_DIR, { recursive: true })
  writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2))
}

function getApiKey(): string | undefined {
  return process.env.BANKR_API_KEY ?? loadConfig().bankrApiKey
}

// ── Tool Registry ─────────────────────────────────────────────
interface Tool {
  name: string
  endpoint: string
  price: number
  inputKey: string
  category: string
  desc: string
}

const TOOLS: Tool[] = [
  { name: 'pnl',             endpoint: 'wallet-pnl',      price: 1.00, inputKey: 'address',     category: 'data',     desc: 'Wallet PnL & trading analysis' },
  { name: 'whale-tracker',   endpoint: 'whale-tracker',   price: 0.10, inputKey: 'address',     category: 'data',     desc: 'Whale & smart money flows' },
  { name: 'dex-flow',        endpoint: 'dex-flow',        price: 0.15, inputKey: 'token',       category: 'data',     desc: 'DEX volume & buy/sell pressure' },
  { name: 'unlock-alert',    endpoint: 'unlock-alert',    price: 0.20, inputKey: 'token',       category: 'data',     desc: 'Token unlock & vesting schedule' },
  { name: 'risk-gate',       endpoint: 'risk-gate',       price: 0.05, inputKey: 'action',      category: 'security', desc: 'Pre-tx safety — APPROVE/WARN/BLOCK' },
  { name: 'honeypot-check',  endpoint: 'honeypot-check',  price: 0.05, inputKey: 'token',       category: 'security', desc: 'Detect honeypot or rug pull' },
  { name: 'phishing-scan',   endpoint: 'phishing-scan',   price: 0.10, inputKey: 'target',      category: 'security', desc: 'Scan URL or handle for scams' },
  { name: 'aml-screen',      endpoint: 'aml-screen',      price: 0.25, inputKey: 'address',     category: 'security', desc: 'AML compliance screening' },
  { name: 'mev-shield',      endpoint: 'mev-shield',      price: 0.30, inputKey: 'action',      category: 'security', desc: 'MEV sandwich attack risk' },
  { name: 'quantum',         endpoint: 'quantum-premium', price: 1.50, inputKey: 'address',     category: 'security', desc: 'Quantum vulnerability score' },
  { name: 'analyze',         endpoint: 'deep-analysis',   price: 0.35, inputKey: 'projectName', category: 'research', desc: 'Deep due diligence' },
  { name: 'whitepaper-tldr', endpoint: 'whitepaper-tldr', price: 0.20, inputKey: 'url',         category: 'research', desc: '5-bullet whitepaper summary' },
  { name: 'tokenomics',      endpoint: 'tokenomics-score',price: 0.50, inputKey: 'token',       category: 'research', desc: 'Supply, inflation, unlock analysis' },
  { name: 'narrative',       endpoint: 'narrative-pulse', price: 0.40, inputKey: 'query',       category: 'research', desc: 'Trending narratives in crypto' },
  { name: 'vc-tracker',      endpoint: 'vc-tracker',      price: 1.00, inputKey: 'query',       category: 'research', desc: 'VC investment activity' },
  { name: 'advisor',         endpoint: 'launch-advisor',  price: 3.00, inputKey: 'description', category: 'research', desc: 'Full token launch playbook' },
  { name: 'grant',           endpoint: 'grant-evaluator', price: 5.00, inputKey: 'description', category: 'research', desc: 'Base grant scoring' },
  { name: 'airdrop-check',   endpoint: 'airdrop-check',   price: 0.10, inputKey: 'address',     category: 'earn',     desc: 'Airdrop eligibility & value' },
  { name: 'yield',           endpoint: 'yield-optimizer', price: 0.15, inputKey: 'token',       category: 'earn',     desc: 'Best APY on Base DeFi' },
  { name: 'lp-analyzer',     endpoint: 'lp-analyzer',     price: 0.30, inputKey: 'address',     category: 'earn',     desc: 'LP health & impermanent loss' },
  { name: 'tax-report',      endpoint: 'tax-report',      price: 2.00, inputKey: 'address',     category: 'earn',     desc: 'On-chain tax report' },
]

// ── x402 Call ─────────────────────────────────────────────────
async function callX402(endpoint: string, body: Record<string, string>, price: number): Promise<unknown> {
  if (DEMO_MODE) {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400))
    return getMock(endpoint)
  }

  const apiKey = getApiKey()
  if (!apiKey) {
    console.error(c.red('✖  No BANKR_API_KEY. Run: blueagent setup'))
    process.exit(1)
  }

  const url = `${BASE_URL}/${endpoint}`
  const bodyStr = JSON.stringify(body).replace(/'/g, "'\\''")
  const maxPayment = Math.ceil(price * 2)
  const cmd = `${BANKR_BIN} x402 call "${url}" -X POST -d '${bodyStr}' -y --max-payment ${maxPayment} --raw`

  const { stdout } = await execP(cmd, {
    timeout: 60000,
    env: { ...process.env, BANKR_API_KEY: apiKey },
  })

  const match = stdout.match(/"response"\s*:\s*(\{[\s\S]*?\})\s*,\s*"paymentMade"/)
  if (match) return JSON.parse(match[1])
  const jsonStart = stdout.indexOf('{')
  const parsed = JSON.parse((jsonStart >= 0 ? stdout.slice(jsonStart) : stdout).trim()) as Record<string, unknown>
  return parsed['response'] ?? parsed
}

// ── Mock data ─────────────────────────────────────────────────
const MOCKS: Record<string, unknown> = {
  'honeypot-check':  { verdict: 'SAFE', isHoneypot: false, canSell: true, buyTax: '0%', sellTax: '0%', isVerified: true },
  'risk-gate':       { decision: 'BLOCK', riskScore: 94, riskLevel: 'CRITICAL', recommendation: 'Use exact amount instead of unlimited approval.' },
  'wallet-pnl':      { estimatedPnL: '+$42,300', winRate: '68%', tradingStyle: 'Swing Trader', smartMoneyScore: 82, summary: 'Consistent gains on ETH and Base.' },
  'airdrop-check':   { totalEstimatedValue: '$340–$820 USDC', eligible: ['Aerodrome Season 3', 'Base Name Service', 'Zora'], deadline: '2026-05-15' },
  'yield-optimizer': { bestAPY: '18.4%', topOpportunities: [{ protocol: 'Aerodrome', pair: 'USDC/ETH', apy: '18.4%' }, { protocol: 'Moonwell', asset: 'USDC', apy: '9.2%' }] },
  'whale-tracker':   { smartMoneyScore: 75, recentMoves: [{ wallet: '0xd8dA...045', action: 'BUY 250k BLUEAGENT', value: '$8,500', time: '12m ago' }] },
  'aml-screen':      { riskLevel: 'LOW', complianceScore: 92, sanctioned: false, mixerUsed: false, recommendation: 'Wallet appears clean.' },
  'phishing-scan':   { verdict: 'SAFE', riskScore: 5, flags: [], recommendation: 'No phishing indicators found.' },
  'dex-flow':        { priceUSD: '$0.042', volume24h: '$1.2M', buyPressure: 'STRONG BUY', priceChange24h: '+12.4%' },
  'deep-analysis':   { overallScore: 78, riskScore: 35, recommendation: 'BUY', summary: 'Strong community + real x402 revenue. Native Base ecosystem play.', keyRisks: ['Small float', 'Telegram-dependent'] },
  'narrative-pulse': { heatScore: 92, momentum: 'RISING', trending: ['AI Agents on Base', 'x402 pay-per-use', 'RWA tokenization'] },
}

function getMock(endpoint: string): unknown {
  return MOCKS[endpoint] ?? { status: 'ok', timestamp: new Date().toISOString() }
}

// ── Display ───────────────────────────────────────────────────
const STATUS_COLORS: Record<string, (s: string) => string> = {
  SAFE: c.green, APPROVE: c.green, LOW: c.green, HEALTHY: c.green, RISING: c.green,
  WARN: c.yellow, MEDIUM: c.yellow, WARNING: c.yellow, MODERATE: c.yellow,
  BLOCK: c.red, DANGER: c.red, HIGH: c.red, CRITICAL: c.red, SCAM: c.red, PHISHING: c.red,
}

function colorVal(val: string): string {
  return (STATUS_COLORS[val] ?? ((s: string) => s))(val)
}

function prettyPrint(label: string, data: unknown, price?: number) {
  console.log()
  const priceTag = price != null ? c.gray(`  ·  $${price.toFixed(2)} USDC`) : ''
  console.log(c.bold(c.cyan(`◆ ${label}`)) + priceTag)
  console.log(c.gray('─'.repeat(50)))

  if (typeof data !== 'object' || data === null) { console.log(String(data)); return }

  for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      console.log(`  ${c.bold(key)}:`)
      val.forEach((item, i) => {
        const str = typeof item === 'object' ? JSON.stringify(item) : String(item)
        console.log(`    ${c.gray(`${i + 1}.`)} ${str}`)
      })
    } else if (typeof val === 'object' && val !== null) {
      console.log(`  ${c.bold(key)}:`)
      for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
        console.log(`    ${c.gray(k)}: ${v}`)
      }
    } else {
      console.log(`  ${c.bold(key)}: ${colorVal(String(val))}`)
    }
  }
  console.log()
}

// ── Spinner ───────────────────────────────────────────────────
function makeSpinner(label: string): () => void {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
  let i = 0
  const id = setInterval(() => {
    process.stdout.write(`\r${c.cyan(frames[i++ % frames.length])}  ${c.gray(label)}`)
  }, 80)
  return () => { clearInterval(id); process.stdout.write('\r\x1b[2K') }
}

// ── Run tool ──────────────────────────────────────────────────
async function runTool(tool: Tool, inputValue: string, opts: { json?: boolean }) {
  const stop = makeSpinner(`${tool.name}  ·  $${tool.price.toFixed(2)} USDC...`)
  try {
    const result = await callX402(tool.endpoint, { [tool.inputKey]: inputValue }, tool.price)
    stop()
    if (opts.json) { console.log(JSON.stringify(result, null, 2)); return }
    prettyPrint(tool.name, result, tool.price)
  } catch (e) {
    stop()
    console.error(c.red(`✖  ${e instanceof Error ? e.message : String(e)}`))
    process.exit(1)
  }
}

// ── Commands ──────────────────────────────────────────────────
const program = new Command()
  .name('blueagent')
  .description('AI-powered DeFi intelligence on Base · 21 tools · pay-per-use USDC')
  .version('1.0.0')

// setup
program
  .command('setup')
  .description('Configure BlueAgent (API key)')
  .action(async () => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    const prompt = (q: string) => new Promise<string>(r => rl.question(q, r))

    console.log(`\n${c.bold(c.cyan('◆ BlueAgent Setup'))}\n`)
    const key = await prompt('Enter your BANKR_API_KEY: ')
    rl.close()

    if (!key.trim()) { console.log(c.red('✖  No key entered.')); return }
    saveConfig({ bankrApiKey: key.trim() })
    console.log(c.green('✔  Saved to ~/.blueagent/config.json'))
    console.log(c.gray('Run: blueagent status\n'))
  })

// status
program
  .command('status')
  .description('Show config and connection status')
  .action(() => {
    const apiKey = getApiKey()
    console.log(`\n${c.bold(c.cyan('◆ BlueAgent Status'))}`)
    console.log(c.gray('─'.repeat(40)))
    console.log(`  BANKR_API_KEY   ${apiKey ? c.green('✔  ' + apiKey.slice(0, 8) + '...') : c.red('✖  not set')}`)
    console.log(`  Treasury        ${c.gray(TREASURY.slice(0, 10) + '...')}`)
    console.log(`  Tools loaded    ${c.cyan(String(TOOLS.length))}`)
    console.log(`  Network         ${c.gray('Base (USDC)')}`)
    console.log(`  Mode            ${DEMO_MODE ? c.yellow('DEMO') : c.green('LIVE')}`)
    console.log()
    if (!apiKey) console.log(c.yellow('  Run: blueagent setup\n'))
  })

// tools
program
  .command('tools')
  .description('List all 21 available tools')
  .option('-c, --category <cat>', 'Filter: data | security | research | earn')
  .action((opts: { category?: string }) => {
    const filtered = opts.category ? TOOLS.filter(t => t.category === opts.category) : TOOLS
    const cats = [...new Set(filtered.map(t => t.category))]
    const catColor: Record<string, (s: string) => string> = {
      data: c.blue, security: c.red, research: c.magenta, earn: c.green,
    }
    console.log()
    for (const cat of cats) {
      const col = catColor[cat] ?? c.cyan
      console.log(c.bold(col(cat.toUpperCase())))
      for (const t of filtered.filter(t => t.category === cat)) {
        console.log(`  ${c.cyan(t.name.padEnd(20))}${c.gray(`$${t.price.toFixed(2)}`.padStart(6))}  ${t.desc}`)
      }
      console.log()
    }
  })

// run <tool> <input>
program
  .command('run <tool> <input>')
  .description('Run any tool directly by name')
  .option('--json', 'Raw JSON output')
  .action(async (toolName: string, inputValue: string, opts: { json?: boolean }) => {
    const tool = TOOLS.find(t => t.name === toolName || t.endpoint === toolName)
    if (!tool) {
      console.error(c.red(`✖  Unknown tool: ${toolName}`))
      console.log(c.gray('Run: blueagent tools'))
      process.exit(1)
    }
    await runTool(tool, inputValue, opts)
  })

// ask <question...>
program
  .command('ask <question...>')
  .description('Natural language — BlueAgent picks the right tool automatically')
  .option('--json', 'Raw JSON output')
  .action(async (words: string[], opts: { json?: boolean }) => {
    const question = words.join(' ')
    const apiKey = getApiKey()

    if (!apiKey && !DEMO_MODE) {
      console.error(c.red('✖  Run: blueagent setup'))
      process.exit(1)
    }

    if (DEMO_MODE) {
      const stop = makeSpinner(`Thinking: "${question}"...`)
      await new Promise(r => setTimeout(r, 1200))
      stop()
      const tool = TOOLS.find(t => t.name === 'analyze') ?? TOOLS[0]
      console.log(c.gray(`  → routing to: ${c.cyan(tool.name)}`))
      await runTool(tool, 'BlueAgent', opts)
      return
    }

    const stop = makeSpinner(`Thinking: "${question}"...`)

    try {
      const toolList = TOOLS.map(t => `${t.name} (${t.inputKey}): ${t.desc}`).join('\n')
      const res = await fetch('https://llm.bankr.bot/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': apiKey!,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5',
          max_tokens: 128,
          system: `Route user questions to the best BlueAgent tool. Reply ONLY with JSON: {"tool":"name","input":"value"}.\n\nTools:\n${toolList}`,
          messages: [{ role: 'user', content: question }],
        }),
      })

      const data = await res.json() as { content: Array<{ text: string }> }
      const text = data.content[0]?.text ?? '{}'
      const match = text.match(/\{[^}]+\}/)
      const { tool: toolName, input: inputVal } = JSON.parse(match?.[0] ?? '{}') as { tool?: string; input?: string }

      const tool = TOOLS.find(t => t.name === toolName)
      if (!tool || !inputVal) {
        stop()
        console.error(c.red('✖  Could not route. Try: blueagent run <tool> <input>'))
        process.exit(1)
      }

      stop()
      console.log(c.gray(`  → ${c.cyan(tool.name)}  "${inputVal}"`))
      await runTool(tool, inputVal, opts)
    } catch (e) {
      stop()
      console.error(c.red(`✖  ${e instanceof Error ? e.message : String(e)}`))
      process.exit(1)
    }
  })

// wallet <address> — compound report
program
  .command('wallet <address>')
  .description('Full wallet report: PnL + airdrops + AML  ($1.35 total)')
  .option('--json', 'Raw JSON output')
  .action(async (address: string, opts: { json?: boolean }) => {
    console.log(`\n${c.bold(c.cyan('◆ Wallet Report'))}  ${c.gray(address.slice(0, 10) + '...')}\n`)

    const jobs = [
      TOOLS.find(t => t.endpoint === 'wallet-pnl')!,
      TOOLS.find(t => t.endpoint === 'airdrop-check')!,
      TOOLS.find(t => t.endpoint === 'aml-screen')!,
    ].filter(Boolean)

    const combined: Record<string, unknown> = {}
    for (const tool of jobs) {
      const stop = makeSpinner(`${tool.name}...`)
      try {
        const result = await callX402(tool.endpoint, { [tool.inputKey]: address }, tool.price)
        stop()
        combined[tool.name] = result
        if (!opts.json) prettyPrint(tool.name, result, tool.price)
      } catch (e) {
        stop()
        console.error(c.red(`✖  ${tool.name}: ${e instanceof Error ? e.message : String(e)}`))
      }
    }

    if (opts.json) console.log(JSON.stringify(combined, null, 2))
  })

// ui — existing TUI
program
  .command('ui')
  .description('Launch interactive terminal UI')
  .action(() => {
    spawnSync(process.execPath, [join(__dirname, 'index.js')], {
      stdio: 'inherit',
      env: process.env,
    })
  })

// Shortcuts for the most-used tools
const SHORTCUTS = ['honeypot-check', 'risk-gate', 'pnl', 'analyze', 'yield', 'airdrop-check', 'aml-screen', 'dex-flow', 'narrative']
for (const name of SHORTCUTS) {
  const tool = TOOLS.find(t => t.name === name)
  if (!tool) continue
  program
    .command(`${name} <input>`)
    .description(`${tool.desc}  ·  $${tool.price.toFixed(2)}`)
    .option('--json', 'Raw JSON output')
    .action(async (input: string, opts: { json?: boolean }) => {
      await runTool(tool, input, opts)
    })
}

program.parse()
