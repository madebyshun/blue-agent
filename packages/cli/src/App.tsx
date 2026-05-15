import React, { useState } from 'react'
import { Box } from 'ink'
import { Logo } from './Logo.js'
import { CategoryMenu } from './components/CategoryMenu.js'
import { ToolMenu } from './components/ToolMenu.js'
import { ToolRunner } from './components/ToolRunner.js'

export type CategoryType = 'builder' | 'x402' | 'score' | 'tasks' | 'bankr'

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
    label: 'Security',
    icon: '🔒',
    description: '13 tools   honeypot · contract audit · quantum',
    type: 'x402',
    items: [
      { name: 'honeypot-check',    price: '$0.05',  description: 'Detect honeypot tokens' },
      { name: 'contract-trust',    price: '$0.05',  description: 'Contract risk score' },
      { name: 'allowance-audit',   price: '$0.20',  description: 'Dangerous approvals check' },
      { name: 'phishing-scan',     price: '$0.10',  description: 'Phishing & scam detection' },
      { name: 'mev-shield',        price: '$0.05',  description: 'MEV exposure analysis' },
      { name: 'circuit-breaker',   price: '$0.05',  description: 'Emergency stop check' },
      { name: 'aml-screen',        price: '$0.15',  description: 'AML compliance screen' },
      { name: 'key-exposure',      price: '$0.10',  description: 'Private key exposure check' },
      { name: 'quantum-premium',   price: '$1.50',  description: 'Quantum wallet security' },
      { name: 'quantum-batch',     price: '$3.00',  description: 'Batch quantum check' },
      { name: 'quantum-migrate',   price: '$2.00',  description: 'Quantum migration guide' },
      { name: 'quantum-timeline',  price: '$1.00',  description: 'Quantum threat timeline' },
      { name: 'base-deploy-check', price: '$0.05',  description: 'Base deployment safety' },
    ],
  },
  {
    label: 'Research',
    icon: '🔍',
    description: '9 tools   deep analysis · whale · narrative',
    type: 'x402',
    items: [
      { name: 'deep-analysis',    price: '$0.001', description: 'Deep token + project analysis' },
      { name: 'whale-tracker',    price: '$0.005', description: 'Whale wallet activity' },
      { name: 'narrative-pulse',  price: '$0.003', description: 'Social narrative signals' },
      { name: 'dex-flow',         price: '$0.003', description: 'DEX pressure analysis' },
      { name: 'vc-tracker',       price: '$0.01',  description: 'VC wallet tracking' },
      { name: 'tokenomics-score', price: '$0.01',  description: 'Tokenomics evaluation' },
      { name: 'whitepaper-tldr',  price: '$0.005', description: 'Whitepaper summary' },
      { name: 'x402-readiness',   price: '$0.005', description: 'x402 integration audit' },
      { name: 'grant-evaluator',  price: '$0.01',  description: 'Grant proposal audit' },
    ],
  },
  {
    label: 'Score',
    icon: '📊',
    description: '2 tools   builder score · agent score',
    type: 'score',
    items: [
      { name: 'builder-score', price: '$0.001', description: 'Score any X handle' },
      { name: 'agent-score',   price: '$0.01',  description: 'Score any agent' },
    ],
  },
  {
    label: 'Tasks',
    icon: '⚡',
    description: '4 tools   post · list · accept · submit',
    type: 'tasks',
    items: [
      { name: 'blue tasks',     price: 'free', description: 'Browse open tasks' },
      { name: 'blue post-task', price: 'free', description: 'Post a task + escrow USDC' },
      { name: 'blue accept',    price: 'free', description: 'Accept a task' },
      { name: 'blue submit',    price: 'free', description: 'Submit proof + earn XP' },
    ],
  },
  {
    label: 'Data',
    icon: '📈',
    description: '4 tools   PnL · whale flow · DEX',
    type: 'x402',
    items: [
      { name: 'wallet-pnl',  price: '$0.005', description: 'Wallet P&L breakdown' },
      { name: 'lp-analyzer', price: '$0.01',  description: 'LP position analysis' },
      { name: 'risk-gate',   price: '$0.05',  description: 'Full risk assessment' },
      { name: 'dex-flow',    price: '$0.003', description: 'DEX flow analysis' },
    ],
  },
  {
    label: 'Earn',
    icon: '💰',
    description: '4 tools   yield · airdrop · LP · tax',
    type: 'x402',
    items: [
      { name: 'yield-optimizer', price: '$0.005', description: 'Best yield opportunities' },
      { name: 'airdrop-check',   price: '$0.003', description: 'Airdrop eligibility' },
      { name: 'tax-report',      price: '$0.05',  description: 'Tax calculation report' },
      { name: 'alert-subscribe', price: '$0.01',  description: 'Subscribe to alerts' },
    ],
  },
  {
    label: 'Wallet',
    icon: '💎',
    description: '4 tools   swap · transfer · portfolio · launch',
    type: 'bankr',
    items: [
      { name: 'swap',         price: 'free', description: 'Swap tokens on Base' },
      { name: 'transfer',     price: 'free', description: 'Send USDC/ETH' },
      { name: 'portfolio',    price: 'free', description: 'View wallet balance' },
      { name: 'launch-token', price: 'free', description: 'Deploy ERC-20 via Clanker' },
    ],
  },
]

type Screen = 'home' | 'tools' | 'runner'

const X402_BASE = 'https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5'

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
        // Dynamically import to avoid ESM/CJS issues at module load
        const { callWithGrounding } = await import('@blueagent/core')
        const task = toolName.replace('blue ', '') as 'idea' | 'build' | 'audit' | 'ship' | 'raise'
        const text = await callWithGrounding(task, inputs.prompt ?? '')
        setResult(text)

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

      } else if (type === 'bankr') {
        // Show the bankr CLI command to run
        const args = Object.entries(inputs)
          .filter(([, v]) => v.trim() !== '')
          .map(([, v]) => v)
          .join(' ')
        setResult(`Run in terminal:\n\n  bankr agent ${toolName} ${args}\n\nInstall: npm install -g bankr`)
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
