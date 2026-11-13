import React, { useState } from 'react'
import { Box } from 'ink'
import { Logo } from './Logo.js'
import { CategoryMenu } from './components/CategoryMenu.js'
import { ToolMenu } from './components/ToolMenu.js'
import { ToolRunner } from './components/ToolRunner.js'

export type CategoryType = 'builder' | 'x402' | 'score' | 'tasks'

export type ToolItem = {
  name: string
  description: string
  price?: string
}

export type Category = {
  label: string
  icon: string
  description: string
  type: CategoryType
  items: ToolItem[]
}

export const CATEGORIES: Category[] = [
  {
    label: 'Build',
    icon: '🏗️',
    description: '5 commands   idea · build · audit · ship · raise',
    type: 'builder',
    items: [
      { name: 'blue idea',  description: 'concept → fundable brief' },
      { name: 'blue build', description: 'brief → architecture + stack' },
      { name: 'blue audit', description: 'code → security review' },
      { name: 'blue ship',  description: 'project → deploy checklist' },
      { name: 'blue raise', description: 'idea → fundraising narrative' },
    ],
  },
  {
    label: 'Setup',
    icon: '⚙️',
    description: '4 commands   init · new · doctor · validate',
    type: 'builder',
    items: [
      { name: 'blue init',     description: 'install 34 skill files to ~/.blue-agent/skills/' },
      { name: 'blue new',      description: 'scaffold a new Base project from template' },
      { name: 'blue doctor',   description: 'check environment health' },
      { name: 'blue validate', description: 'validate project structure' },
    ],
  },
  {
    label: 'Chat',
    icon: '💬',
    description: '1 command   interactive AI chat',
    type: 'builder',
    items: [
      { name: 'blue chat', description: 'interactive chat with the Blue Agent LLM (Virtuals)' },
    ],
  },
  {
    label: 'Score',
    icon: '📊',
    description: '2 commands   score · compare',
    type: 'builder',
    items: [
      { name: 'blue score',       description: 'Builder Score for a wallet or X handle' },
      { name: 'blue compare',     description: 'compare two builders or agents side by side' },
    ],
  },
  // The Discovery (search · trending · watch · history) and Launch (launch · market)
  // groups were removed 2026-09-18 along with the commands themselves. Each one asked an
  // LLM to produce market facts with no data source behind it — `market` went as far as
  // inventing a price, an install count and a trust badge per listing. Four of them also
  // ended by telling the user to run `bankr agent prompt "..."`, which 403s for everyone.
  {
    label: 'Alerts',
    icon: '🔔',
    description: '1 command   alert',
    type: 'builder',
    items: [
      { name: 'blue alert', description: 'record a threshold alert locally (no delivery yet)' },
    ],
  },
  {
    label: 'Microtasks',
    icon: '⚡',
    description: '6 commands   post · list · accept · submit · approve · profile',
    type: 'builder',
    items: [
      { name: 'blue micro post',    description: 'post a new microtask with a stated reward' },
      { name: 'blue micro list',    description: 'browse open microtasks' },
      { name: 'blue micro accept',  description: 'claim a slot on an open microtask' },
      { name: 'blue micro submit',  description: 'submit proof for a claimed slot' },
      { name: 'blue micro approve', description: 'approve or reject a submission' },
      { name: 'blue micro profile', description: 'view approved value and reputation' },
    ],
  },
  {
    label: 'Checks',
    icon: '🔒',
    description: '9 tools   wallet · honeypot · pre-trade',
    type: 'x402',
    items: [
      { name: 'wallet-risk', price: '$0.05', description: 'what a wallet touches, scored' },
      { name: 'honeypot-check', price: '$0.10', description: 'buy/sell tax and honeypot, read on-chain' },
      { name: 'liquidity-depth', price: '$0.03', description: 'depth and price impact of the pool' },
      { name: 'risk-gate', price: '$0.20', description: 'one verdict before money moves' },
      { name: 'contract-trust', price: '$0.15', description: 'contract risk score with context' },
      { name: 'pre-trade-check', description: 'dry-run a transfer, swap or approve — free' },
      { name: 'sign-check', description: 'what a signature would authorise — free' },
      { name: 'approval-audit', description: 'existing token approvals — free' },
      { name: 'rh-rwa-verify', description: 'is this Robinhood Chain token the real wrapper — free' },
    ],
  },
  {
    label: 'Stocks',
    icon: '📈',
    description: '10 tools   Base B20 · Robinhood Chain',
    type: 'x402',
    items: [
      { name: 'base-stock-quote', price: '$0.02', description: 'Coinbase stock token quote, DEX vs oracle' },
      { name: 'base-stock-movers', price: '$0.03', description: 'today's tokenized-stock gainers and losers' },
      { name: 'stock-screen', price: '$0.02', description: 'all nine stocks filtered by your own thresholds' },
      { name: 'safe-trending', price: '$0.15', description: 'what is moving on Base, tax-checked' },
      { name: 'rh-stock-quote', price: '$0.03', description: 'Robinhood Chain stock token quote' },
      { name: 'rh-stock-ohlc', price: '$0.05', description: 'OHLC candles for a stock token' },
      { name: 'rh-stock-liquidity', price: '$0.05', description: 'pool depth for a stock token' },
      { name: 'rh-stock-holders', price: '$0.05', description: 'holder list and concentration' },
      { name: 'rh-stock-movers', price: '$0.05', description: 'today's movers on Robinhood Chain' },
      { name: 'rh-stock-agent-brief', price: '$0.20', description: 'drift, oracle age, holdings in one call' },
    ],
  },
  {
    label: 'Tokens',
    icon: '🪙',
    description: '5 tools   price · pool · holdings · gas',
    type: 'x402',
    items: [
      { name: 'token-price', price: '$0.01', description: 'price, market cap and liquidity on Base' },
      { name: 'pool-scan', price: '$0.02', description: 'every Base pool for a token' },
      { name: 'wallet-holdings', price: '$0.02', description: 'what a wallet holds, valued' },
      { name: 'gas-tracker', price: '$0.01', description: 'current Base gas' },
      { name: 'rh-stock-arb', price: '$0.05', description: 'oracle-vs-pool gap on a stock token' },
    ],
  },
  {
    label: 'Trading',
    icon: '🔁',
    description: '2 tools   quote before you swap',
    type: 'x402',
    items: [
      { name: 'rh-stock-swap-quote', price: '$0.05', description: 'expected fill and price impact' },
      { name: 'rh-stock-swap-prepare', price: '$0.05', description: 'unsigned swap tx for the user to sign' },
    ],
  },
  {
    label: 'Health',
    icon: '🩺',
    description: '4 tools   doctor · live · gaps · registry',
    type: 'x402',
    items: [
      { name: 'blue-doctor', description: 'is the source down or the request wrong — free' },
      { name: 'hood-live', description: 'the live hood desk snapshot — free' },
      { name: 'weekend-scorecard', description: 'weekend gap scorecard — free' },
      { name: 'blue-registry', price: '$0.05', description: 'builder and agent registry lookup' },
    ],
  },
  // The 'Wallet' category (swap · transfer · portfolio · launch-token) was removed
  // 2026-09-18. It ran nothing: every entry printed `bankr agent <op>` and told the user
  // to `npm install -g bankr`. Bankr 403-bans this project on every write verb, so those
  // were four money-touching instructions that fail — the worst kind to leave standing.
  // Blue Agent has its own non-custodial wallet at blueagent.dev/app/wallet; a TUI
  // passthrough to someone else's banned CLI is not a substitute for it.
]

type Screen = 'home' | 'tools' | 'runner'

const X402_BASE = 'https://blueagent.dev/api/x402'

export function App() {
  const [screen, setScreen] = useState<Screen>('home')
  const [selectedCategory, setSelectedCategory] = useState<Category>(CATEGORIES[0])
  const [selectedTool, setSelectedTool] = useState<ToolItem>(CATEGORIES[0].items[0])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)

  async function runTool(inputs: Record<string, string>) {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const type = selectedCategory.type
      const toolName = selectedTool.name

      if (type === 'builder') {
        // Interactive commands — must be run directly in terminal
        const INTERACTIVE = ['blue chat', 'blue new']
        if (INTERACTIVE.includes(toolName)) {
          const cmd = toolName.replace(/^blue\s+/, '')
          const hint = toolName === 'blue new'
            ? `blue new <name> --template base-agent`
            : toolName
          setResult(`Run in terminal:\n\n  ${hint}\n\n(Interactive command — cannot run inside TUI)`)
          return
        }

        const { spawn } = await import('child_process')
        const { createRequire } = await import('module')
        const { resolve, dirname } = await import('path')

        const require = createRequire(import.meta.url)
        const builderPkg = require.resolve('@blueagent/builder/package.json')
        const builderBin = resolve(dirname(builderPkg), 'bin/blue.js')

        // Parse "blue micro post" → ["micro", "post"], "blue idea" → ["idea"]
        const cmdArgs = toolName.replace(/^blue\s+/, '').split(/\s+/)
        const prompt = inputs.prompt ?? inputs.handle ?? inputs.taskId ?? inputs.name ?? ''
        const fullArgs = prompt ? [...cmdArgs, prompt] : cmdArgs

        await new Promise<void>((resolve_p, reject) => {
          const child = spawn(process.execPath, [builderBin, ...fullArgs], {
            stdio: 'inherit',
            env: process.env,
          })
          child.on('exit', (code) => {
            if (code === 0) resolve_p()
            else reject(new Error(`Command exited with code ${code}`))
          })
        })
        setResult('✓ Done')

      } else if (type === 'x402') {
        const endpoint = toolName
        const body = Object.fromEntries(
          Object.entries(inputs).filter(([, v]) => v.trim() !== '')
        )
        const res = await fetch(`${X402_BASE}/${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json()
        if (!res.ok && res.status === 402) {
          setError(`Payment required. Set WALLET_PRIVATE_KEY env var and use @blueagent/sdk for paid tools.`)
        } else {
          setResult(data)
        }

      } else if (type === 'score') {
        const { scoreBuilder, scoreAgent } = await import('@blueagent/reputation')
        if (toolName === 'builder-score') {
          const handle = inputs['X handle (e.g. madebyshun)'] ?? inputs.handle ?? ''
          const score = await scoreBuilder(handle)
          setResult(score)
        } else {
          const raw = inputs['github URL, npm:pkg, or @handle (e.g. github.com/user/repo)']
            ?? inputs.handle ?? ''
          const score = await scoreAgent(raw)
          setResult(score)
        }

      } else if (type === 'tasks') {
        const { listTasks, createTask, acceptTask, submitTask } = await import('@blueagent/tasks')
        const cmd = toolName.replace('blue ', '')

        if (cmd === 'tasks') {
          const tasks = listTasks()
          setResult(tasks.length === 0 ? '(no open tasks)' : tasks)

        } else if (cmd === 'post-task') {
          const task = createTask({
            title: inputs.title ?? 'Untitled task',
            description: inputs.description ?? '',
            reward: parseFloat(inputs['reward (USDC)'] ?? '0'),
            category: (inputs['category'] ?? 'dev') as 'audit' | 'content' | 'art' | 'data' | 'dev',
            difficulty: 'medium',
            poster: inputs.handle ?? 'anonymous',
            deadline: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            proof_required: 'url',
          })
          setResult(task)

        } else if (cmd === 'accept') {
          const task = acceptTask(inputs.taskId ?? '', inputs.handle ?? 'anonymous')
          setResult(task)

        } else if (cmd === 'submit') {
          const out = submitTask(inputs.taskId ?? '', inputs['proof URL'] ?? '')
          setResult(out)
        }
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box flexDirection="column" padding={1}>
      <Logo />
      {screen === 'home' && (
        <CategoryMenu
          categories={CATEGORIES}
          onSelect={(cat) => {
            setSelectedCategory(cat)
            setResult(null)
            setError(null)
            setScreen('tools')
          }}
        />
      )}
      {screen === 'tools' && (
        <ToolMenu
          category={selectedCategory}
          onSelect={(tool) => {
            setSelectedTool(tool)
            setResult(null)
            setError(null)
            setScreen('runner')
          }}
          onBack={() => setScreen('home')}
        />
      )}
      {screen === 'runner' && (
        <ToolRunner
          category={selectedCategory}
          tool={selectedTool}
          onRun={runTool}
          onBack={() => setScreen('tools')}
          loading={loading}
          result={result}
          error={error}
        />
      )}
    </Box>
  )
}
