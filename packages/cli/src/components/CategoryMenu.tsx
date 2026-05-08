import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import type { Category } from '../App.js'

// Extract short count label from description e.g. "5 commands   idea · build..." → "5 commands"
function parseCount(description: string): { count: string; unit: string; hint: string } {
  const match = description.match(/^(\d+)\s+(\w+)\s+(.+)$/)
  if (!match) return { count: '', unit: '', hint: description }
  return { count: match[1], unit: match[2], hint: match[3] }
}

const HR = '─'.repeat(61)

interface Props {
  categories: Category[]
  onSelect: (category: Category) => void
}

export function CategoryMenu({ categories, onSelect }: Props) {
  const [cursor, setCursor] = useState(0)

  useInput((_, key) => {
    if (key.upArrow)   setCursor((c) => (c - 1 + categories.length) % categories.length)
    if (key.downArrow) setCursor((c) => (c + 1) % categories.length)
    if (key.return)    onSelect(categories[cursor])
  })

  return (
    <Box flexDirection="column">
      {categories.map((cat, i) => {
        const { count, unit, hint } = parseCount(cat.description)
        const selected = i === cursor
        return (
          <Box key={cat.label}>
            {/* Cursor */}
            <Text color="cyan">{selected ? '❯ ' : '  '}</Text>
            {/* Category name — fixed 12 chars */}
            <Text color={selected ? 'cyan' : undefined} bold={selected}>
              {cat.label.padEnd(10)}
            </Text>
            {/* Count */}
            <Text color="cyan">{count}</Text>
            <Text dimColor>{' ' + unit + '  '}</Text>
            {/* Short description */}
            <Text dimColor>{hint}</Text>
          </Box>
        )
      })}

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>{HR}</Text>
        <Box justifyContent="space-between">
          <Text dimColor> ↑↓ navigate  enter select  ctrl+c quit</Text>
          <Text dimColor>@blocky_agent </Text>
        </Box>
      </Box>
    </Box>
  )
}
