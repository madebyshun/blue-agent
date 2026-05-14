import React from 'react'
import { Box, Text } from 'ink'

const VERSION = '0.1.10'

// Design system tokens
const C = {
  blue:   '#4FC3F7',
  purple: '#A78BFA',
  text:   '#E2E8F0',
  muted:  '#94A3B8',
  dim:    '#475569',
}

const W = 58 // layout width
const SEP = '─'.repeat(W)

const CMDS: { label: string; color: string }[] = [
  { label: 'idea',     color: C.blue   },
  { label: 'build',    color: C.muted  },
  { label: 'audit',    color: C.muted  },
  { label: 'ship',     color: C.muted  },
  { label: 'raise',    color: C.muted  },
  { label: 'micro',    color: C.purple },
  { label: 'chat',     color: C.muted  },
  { label: 'validate', color: C.muted  },
]

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1} marginLeft={2}>

      <Text>{' '}</Text>

      {/* ── Wordmark + version ───────────────────────── */}
      <Box width={W} justifyContent="space-between">
        <Box gap={1}>
          <Text color={C.blue} bold>◆</Text>
          <Text color={C.text} bold>Blue Agent</Text>
        </Box>
        <Text color={C.dim}>v{VERSION}</Text>
      </Box>

      {/* ── Tagline ──────────────────────────────────── */}
      <Box marginLeft={3}>
        <Text color={C.dim}>AI-native founder console for Base  ·  x402</Text>
      </Box>

      {/* ── Separator ────────────────────────────────── */}
      <Box marginTop={1}>
        <Text dimColor>{SEP}</Text>
      </Box>

      {/* ── Command strip ────────────────────────────── */}
      <Box>
        {CMDS.map((cmd, i) => (
          <React.Fragment key={cmd.label}>
            <Text color={cmd.color}>{cmd.label}</Text>
            {i < CMDS.length - 1 && (
              <Text color={C.dim}> · </Text>
            )}
          </React.Fragment>
        ))}
      </Box>

      {/* ── Bottom rule ──────────────────────────────── */}
      <Box>
        <Text dimColor>{SEP}</Text>
      </Box>

      <Text>{' '}</Text>

    </Box>
  )
}
