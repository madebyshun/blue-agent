import React from 'react'
import { Box, Text } from 'ink'

const VERSION = '0.1.10'

const C = {
  blue:   '#4FC3F7',
  purple: '#A78BFA',
  text:   '#E2E8F0',
  muted:  '#94A3B8',
  dim:    '#475569',
}

const CMDS = [
  { label: 'idea',     color: C.blue   },
  { label: 'build',    color: C.muted  },
  { label: 'audit',    color: C.muted  },
  { label: 'ship',     color: C.muted  },
  { label: 'raise',    color: C.muted  },
  { label: 'micro',    color: C.purple },
  { label: 'chat',     color: C.muted  },
  { label: 'validate', color: C.muted  },
]

const SEP = '─'.repeat(52)

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>

      {/* ── Top spacer ─────────────────────────────── */}
      <Text>{' '}</Text>

      {/* ── Diamond mark ───────────────────────────── */}
      <Box marginLeft={2}>
        <Text color={C.blue} bold>◆  </Text>
        <Text color={C.blue} bold dimColor>◆  </Text>
        <Text color={C.blue} bold dimColor>◆</Text>
      </Box>

      {/* ── Big wordmark ───────────────────────────── */}
      <Box marginLeft={2} marginTop={1}>
        <Text color={C.blue} bold>{'B L U E'}</Text>
        <Text color={C.dim} bold>{'  ·  '}</Text>
        <Text color={C.text} bold>{'A G E N T'}</Text>
      </Box>

      {/* ── Accent underline ───────────────────────── */}
      <Box marginLeft={2}>
        <Text color={C.blue}>{'─────────'}</Text>
        <Text color={C.dim}>{'─────────────────────'}</Text>
      </Box>

      {/* ── Version + tagline ──────────────────────── */}
      <Box marginLeft={2} marginTop={1} gap={1}>
        <Text color={C.dim}>v{VERSION}</Text>
        <Text color={C.dim}>·</Text>
        <Text color={C.muted}>AI-native founder console for Base</Text>
      </Box>

      {/* ── Spacer ─────────────────────────────────── */}
      <Text>{' '}</Text>

      {/* ── Separator ──────────────────────────────── */}
      <Box marginLeft={2}>
        <Text dimColor>{SEP}</Text>
      </Box>

      {/* ── Command strip ──────────────────────────── */}
      <Box marginLeft={2} marginTop={0} gap={0}>
        {CMDS.map((cmd, i) => (
          <React.Fragment key={cmd.label}>
            <Text color={cmd.color}>{cmd.label}</Text>
            {i < CMDS.length - 1 && <Text color={C.dim}> · </Text>}
          </React.Fragment>
        ))}
      </Box>

      {/* ── Bottom rule ────────────────────────────── */}
      <Box marginLeft={2}>
        <Text dimColor>{SEP}</Text>
      </Box>

      {/* ── Bottom spacer ──────────────────────────── */}
      <Text>{' '}</Text>

    </Box>
  )
}
