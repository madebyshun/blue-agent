import React from 'react'
import { Box, Text } from 'ink'

export function Logo() {
  // Design system colors (from design-system.md)
  const BLUE = '#4FC3F7'           // primary blue
  const TEXT_PRIMARY = '#E2E8F0'   // main text
  const TEXT_SECONDARY = '#94A3B8' // secondary text
  const BORDER = '#1A1A2E'         // border color

  return (
    <Box flexDirection="column" marginBottom={2}>
      {/* Top border - clean Claude Code style */}
      <Text color={BORDER}>────────────────────────────────────────────────────────────────</Text>
      
      {/* Spacer */}
      <Text>{' '}</Text>
      
      {/* BLUEAGENT Logo - full word, minimal Claude Code aesthetic */}
      <Box flexDirection="column" marginLeft={1}>
        {/* Row 1 - B L U E A G E N T */}
        <Box>
          <Text color={BLUE} bold>██████  ██      ██  ███████  █████   ███████  ███████ ██  ██ ████████</Text>
        </Box>
        
        {/* Row 2 */}
        <Box>
          <Text color={BLUE} bold>██   ██ ██      ██  ██      ██   ██ ██       ██      ██  ██    ██</Text>
        </Box>
        
        {/* Row 3 */}
        <Box>
          <Text color={BLUE} bold>██████  ██      ██  █████   ███████ █████    █████   ██████   ██</Text>
        </Box>
        
        {/* Row 4 */}
        <Box>
          <Text color={BLUE} bold>██   ██ ██      ██  ██      ██   ██ ██       ██      ██  ██    ██</Text>
        </Box>
        
        {/* Row 5 */}
        <Box>
          <Text color={BLUE} bold>██████  ███████ ██  ███████ ██   ██ ███████  ███████ ██  ██    ██</Text>
        </Box>
      </Box>
      
      {/* Spacer */}
      <Text>{' '}</Text>
      
      {/* Tagline */}
      <Box marginLeft={2}>
        <Text color={TEXT_PRIMARY}>Founder console for Base builders</Text>
      </Box>
      
      {/* Stats - clean minimal format */}
      <Box marginLeft={2} marginTop={1}>
        <Text color={BLUE}>›</Text>
        <Text color={TEXT_SECONDARY}> 45+ tools · 8 categories · Base native · x402 powered</Text>
      </Box>
      
      {/* Spacer */}
      <Text>{' '}</Text>
      
      {/* Bottom border */}
      <Text color={BORDER}>────────────────────────────────────────────────────────────────</Text>
    </Box>
  )
}
