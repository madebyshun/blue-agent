import React from 'react'
import { Box, Text } from 'ink'

const VERSION = '0.1.10'

// Design tokens — mirrors design-system.md
const C = {
  blue:    '#4FC3F7',
  purple:  '#A78BFA',
  text:    '#E2E8F0',
  muted:   '#94A3B8',
  dim:     '#475569',
  emerald: '#34D399',
}

const COMMANDS = [
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
    <Box flexDirection="column" marginBottom={1}>

      {/* ── Wordmark row ─────────────────────────────── */}
      <Box marginLeft={1} marginTop={1} gap={1}>
        <Text color={C.blue} bold>◆</Text>
        <Text color={C.text} bold>Blue Agent</Text>
        <Text color={C.dim}>v{VERSION}</Text>
      </Box>

      {/* ── Tagline ───────────────────────────────────── */}
      <Box marginLeft={4}>
        <Text color={C.dim}>AI-native founder console for Base</Text>
      </Box>

      {/* ── Separator ────────────────────────────────── */}
      <Box marginLeft={1} marginTop={1}>
        <Text dimColor>{'─'.repeat(44)}</Text>
      </Box>

      {/* ── Command strip ────────────────────────────── */}
      <Box marginLeft={2} gap={0}>
        {COMMANDS.map((cmd, i) => (
          <React.Fragment key={cmd.label}>
            <Text color={cmd.color}>{cmd.label}</Text>
            {i < COMMANDS.length - 1 && (
              <Text color={C.dim}> · </Text>
            )}
          </React.Fragment>
        ))}
      </Box>

      {/* ── Bottom rule ──────────────────────────────── */}
      <Box marginLeft={1} marginTop={1}>
        <Text dimColor>{'─'.repeat(44)}</Text>
      </Box>

    </Box>
  )
}
