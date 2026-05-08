import React from 'react'
import { Box, Text } from 'ink'
import SelectInput from 'ink-select-input'
import type { Category } from '../App.js'

interface Props {
  categories: Category[]
  onSelect: (category: Category) => void
}

export function CategoryMenu({ categories, onSelect }: Props) {
  const items = categories.map((cat) => ({
    label: `${cat.icon}  ${cat.label.padEnd(10)} — ${cat.description}`,
    value: cat.label,
  }))

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text dimColor>{'─'.repeat(62)}</Text>
      </Box>
      <SelectInput
        items={items}
        onSelect={(item) => {
          const cat = categories.find((c) => c.label === item.value)!
          onSelect(cat)
        }}
      />
      <Box marginTop={1}>
        <Text dimColor>{'─'.repeat(62)}</Text>
      </Box>
      <Text dimColor> ctrl+c quit · ↑↓ navigate · enter select</Text>
    </Box>
  )
}
