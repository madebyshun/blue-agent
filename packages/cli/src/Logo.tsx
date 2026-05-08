import React from 'react'
import { Box, Text } from 'ink'

const HR = '─'.repeat(40)

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="white" bold>BLUE </Text>
        <Text color="#4FC3F7" bold>AGENT</Text>
        <Text dimColor>  v1.2.4</Text>
      </Box>
      <Text dimColor>{HR}</Text>
      <Text dimColor>AI development layer for Base builders</Text>
      <Text dimColor>45 tools · 8 categories · x402 · Base</Text>
      <Text dimColor>{HR}</Text>
    </Box>
  )
}
