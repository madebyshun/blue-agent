import React from 'react'
import { Box, Text } from 'ink'

const HR = '─'.repeat(46)

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>BLUE</Text>
        <Text bold> AGENT</Text>
        <Text dimColor> · v1.2.1 {HR}</Text>
      </Box>
      <Text dimColor> AI development layer for Base builders</Text>
      <Text dimColor> 45 tools · 8 categories · x402 · Base</Text>
      <Text dimColor>{'─'.repeat(58)}</Text>
    </Box>
  )
}
