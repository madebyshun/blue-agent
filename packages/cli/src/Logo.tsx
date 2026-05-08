import React from 'react'
import { Box, Text } from 'ink'

// Box-drawing block chars are reliably single-width in all terminals
const ART = ` ██████╗ ██╗     ██╗   ██╗███████╗
 ██╔══██╗██║     ██║   ██║██╔════╝
 ██████╔╝██║     ██║   ██║█████╗
 ██╔══██╗██║     ██║   ██║██╔══╝
 ██████╔╝███████╗╚██████╔╝███████╗
 ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝`

const HR = '─'.repeat(58)

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text color="cyan" bold>{ART}</Text>
      <Box>
        <Text bold> AGENT</Text>
        <Text dimColor>  ·  v1.2.3  ·  AI development layer for Base builders</Text>
      </Box>
      <Text dimColor>{HR}</Text>
      <Text dimColor> 45 tools · 8 categories · x402 · Base</Text>
      <Text dimColor>{HR}</Text>
    </Box>
  )
}
