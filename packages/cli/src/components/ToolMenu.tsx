import React from 'react'
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
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
  'builder-score': ['handle (@username)'],
  'agent-score':   ['handle (@username, npm:pkg, or github.com/repo)'],

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

  // Bankr wallet — inputs shown as hints
  'swap':         ['from (token symbol)', 'to (token symbol)', 'amount'],
  'transfer':     ['to (address 0x...)', 'amount', 'token (USDC|ETH)'],
  'portfolio':    [],
  'launch-token': ['name', 'symbol', 'description'],
}

interface Props {
  category: Category
  onSelect: (tool: ToolItem) => void
  onBack: () => void
}

export function ToolMenu({ category, onSelect, onBack }: Props) {
  useInput((_, key) => { if (key.escape) onBack() })

  const items = category.items.map((t) => {
    const priceTag = t.price ? ` ${t.price.padStart(6)}` : '       '
    return {
      label: `${t.name.padEnd(22)}${priceTag}  ${t.description}`,
      value: t.name,
    }
  })

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text color="blueBright" bold>
          {category.icon} {category.label.toUpperCase()}
        </Text>
        <Text dimColor>  esc to go back</Text>
      </Box>
      <SelectInput
        items={items}
        onSelect={(item) => {
          const tool = category.items.find((t) => t.name === item.value)!
          onSelect(tool)
        }}
      />
    </Box>
  )
}
