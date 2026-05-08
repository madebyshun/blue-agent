import React from 'react'
import { Box, Text } from 'ink'

const HR = '─'.repeat(48)

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="white" bold>B  L  U  E  </Text>
        <Text color="#4FC3F7" bold>A  G  E  N  T</Text>
        <Text dimColor>   v1.2.6</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>{HR}</Text>
      </Box>
      <Text dimColor>AI development layer for Base builders</Text>
      <Text dimColor>45 tools · 8 categories · x402 · Base</Text>
      <Text dimColor>{HR}</Text>
    </Box>
  )
}
