import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { Category, ToolItem } from '../App.js'

// Required input fields for each tool (optional fields end with ?)
export const TOOL_PARAMS: Record<string, string[]> = {
  // Builder commands — single prompt
  'blue idea':  ['prompt'],
  'blue build': ['prompt'],
  'blue audit': ['prompt'],
  'blue ship':  ['prompt'],
  'blue raise': ['prompt'],

  // Security x402
  'honeypot-check':    ['token (0x...)'],
  'contract-trust':    ['contractAddress (0x...)'],
  'allowance-audit':   ['address (0x...)'],
  'phishing-scan':     ['url or address'],
  'mev-shield':        ['tokenIn (0x...)', 'tokenOut (0x...)', 'amountIn'],
  'circuit-breaker':   ['agentId', 'action?'],
  'aml-screen':        ['address (0x...)'],
  'key-exposure':      ['address (0x...)'],
  'quantum-premium':   ['address (0x...)'],
  'quantum-batch':     ['addresses (comma-separated 0x...)'],
  'quantum-migrate':   ['address (0x...)'],
  'quantum-timeline':  ['address (0x...)?'],
  'base-deploy-check': ['contractAddress (0x...)'],

  // Research x402
  'deep-analysis':    ['token (0x... or symbol)'],
  'whale-tracker':    ['token (0x...)'],
  'narrative-pulse':  ['topic?'],
  'dex-flow':         ['token (0x... or pair)'],
  'vc-tracker':       ['sector or address'],
  'tokenomics-score': ['token (0x... or symbol)'],
  'whitepaper-tldr':  ['url (https://...)'],
  'x402-readiness':   ['apiUrl (https://...)'],
  'grant-evaluator':  ['projectUrl or description'],

  // Score
  'builder-score': ['X handle (e.g. madebyshun)'],
  'agent-score':   ['github URL, npm:pkg, or @handle (e.g. github.com/user/repo)'],

  // Tasks
  'blue tasks':     [],
  'blue post-task': ['title', 'description', 'reward (USDC)', 'category (audit|content|art|dev)', 'handle'],
  'blue accept':    ['taskId', 'handle'],
  'blue submit':    ['taskId', 'proof URL'],

  // Data x402
  'wallet-pnl':  ['address (0x...)'],
  'lp-analyzer': ['address (0x...)'],
  'risk-gate':   ['action (transfer|swap|approve)', 'contractAddress (0x...)?', 'amount?'],

  // Earn x402
  'yield-optimizer': ['address (0x...)?'],
  'airdrop-check':   ['address (0x...)'],
  'tax-report':      ['address (0x...)', 'year'],
  'alert-subscribe': ['address (0x...)', 'webhookUrl (https://...)'],

  // Bankr wallet
  'swap':         ['from (token symbol)', 'to (token symbol)', 'amount'],
  'transfer':     ['to (address 0x...)', 'amount', 'token (USDC|ETH)'],
  'portfolio':    [],
  'launch-token': ['name', 'symbol', 'description'],
}

const HR = '─'.repeat(61)

interface Props {
  category: Category
  onSelect: (tool: ToolItem) => void
  onBack: () => void
}

export function ToolMenu({ category, onSelect, onBack }: Props) {
  const [cursor, setCursor] = useState(0)
  const tools = category.items

  useInput((_, key) => {
    if (key.escape)    { onBack(); return }
    if (key.upArrow)   setCursor((c) => (c - 1 + tools.length) % tools.length)
    if (key.downArrow) setCursor((c) => (c + 1) % tools.length)
    if (key.return)    onSelect(tools[cursor])
  })

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginBottom={1}>
        <Text dimColor>← </Text>
        <Text dimColor>{category.label}</Text>
        <Text dimColor>  </Text>
        <Text color="cyan">{tools.length}</Text>
        <Text dimColor> tools</Text>
      </Box>

      {/* Tool list */}
      {tools.map((tool, i) => {
        const selected = i === cursor
        const isFree = tool.price === 'free' || !tool.price
        return (
          <Box key={tool.name}>
            <Text color="cyan">{selected ? '❯ ' : '  '}</Text>
            {/* Tool name — fixed 24 chars */}
            <Text color={selected ? 'white' : undefined} bold={selected}>
              {tool.name.padEnd(24)}
            </Text>
            {/* Price */}
            {isFree ? (
              <Text color="green" dimColor>{'free    '}</Text>
            ) : (
              <Text color="cyan" dimColor>{(tool.price ?? '').padEnd(8)}</Text>
            )}
            {/* Description */}
            <Text dimColor>{tool.description}</Text>
          </Box>
        )
      })}

      {/* Footer */}
      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{HR}</Text>
        <Text dimColor> ↑↓ navigate  enter select  ← back  ctrl+c quit</Text>
      </Box>
    </Box>
  )
}
