import React from 'react'
import { Box, Text } from 'ink'

// 2-row block font — BLUE (cyan) · AGENT (white bold)
const BLUE_1  = '█▄▄ █░░ █░█ █▀▀'
const BLUE_2  = '█▄█ █▄▄ █▄█ ██▄'
const AGENT_1 = '▄▀█ █▀▀ █▀▀ █▄░█ ▀█▀'
const AGENT_2 = '█▀█ █▄█ ██▄ █░▀█ ░█░'

const HR = '─'.repeat(52)

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color="cyan" bold>{BLUE_1}</Text>
        <Text dimColor>    </Text>
        <Text bold>{AGENT_1}</Text>
      </Box>
      <Box>
        <Text color="cyan" bold>{BLUE_2}</Text>
        <Text dimColor>    </Text>
        <Text bold>{AGENT_2}</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>v1.2.2 · AI development layer for Base builders</Text>
      </Box>
      <Text dimColor>45 tools · 8 categories · x402 · Base</Text>
      <Text dimColor>{HR}</Text>
    </Box>
  )
}
