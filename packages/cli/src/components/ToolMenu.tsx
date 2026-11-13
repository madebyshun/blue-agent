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

  // Security, stocks, tokens, trading and health x402
  // x402 tools — one line per tool, labels come from the 402 input schema
  'token-price': ['token'],
  'pool-scan': ['limit'],
  'hood-live': ['chain'],
  'weekend-scorecard': ['ticker', 'weekends'],
  'wallet-holdings': ['address'],
  'wallet-risk': ['address'],
  'liquidity-depth': ['token'],
  'pre-trade-check': ['token', 'chain', 'kind', 'recipient', 'sender'],
  'sign-check': ['from', 'tx', 'typed_data', 'chain'],
  'approval-audit': ['wallet', 'chain'],
  'honeypot-check': ['token'],
  'risk-gate': ['to', 'action', 'value'],
  'contract-trust': ['address', 'context'],
  'blue-registry': ['query', 'category'],
  'rh-rwa-verify': ['contract', 'expected_ticker'],
  'rh-stock-quote': ['ticker'],
  'base-stock-quote': ['ticker'],
  'base-stock-movers': ['limit', 'min_liquidity_usd'],
  'rh-stock-liquidity': ['ticker'],
  'rh-stock-movers': ['limit', 'min_tvl_usd', 'min_volume_24h_usd'],
  'rh-stock-holders': ['ticker', 'contract', 'limit'],
  'safe-trending': ['min_liquidity_usd', 'limit'],
  'rh-stock-agent-brief': ['ticker'],
  'rh-stock-arb': ['ticker'],
  'rh-stock-ohlc': ['ticker', 'timeframe', 'limit'],
  'rh-stock-swap-prepare': ['ticker', 'side', 'amount', 'recipient', 'denom', 'slippage_bps'],
  'rh-stock-swap-quote': ['ticker', 'side', 'amount', 'denom', 'slippage_bps'],

  // Score
  'builder-score': ['X handle (e.g. madebyshun)'],

  // Tasks
  'blue tasks':     [],
  'blue post-task': ['title', 'description', 'reward (USDC)', 'category (audit|content|art|dev)', 'handle'],
  'blue accept':    ['taskId', 'handle'],
  'blue submit':    ['taskId', 'proof URL'],

  'risk-gate':   ['action (transfer|swap|approve)', 'contractAddress (0x...)?', 'amount?'],


  // `swap`, `transfer`, `portfolio` and `launch-token` had param specs here until
  // 2026-09-18. They belonged to the Wallet category, which never ran anything — it
  // printed `bankr agent <op>` for the user to run elsewhere, and Bankr 403-bans this
  // project on every write verb. Blue Agent's own non-custodial wallet is at
  // blueagent.dev/app/wallet; it is not a TUI passthrough to someone else's CLI.
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
