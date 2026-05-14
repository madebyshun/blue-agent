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

// W must cover the command strip:
// "idea · build · audit · ship · raise · micro · chat · validate" = 61 chars
const W   = 62
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

      {/* ── Diamond mark (solo line = visual weight) ─── */}
      <Text color={C.blue} bold>◆</Text>

      <Text>{' '}</Text>

      {/* ── Wide-spaced wordmark ─────────────────────── */}
      {/* 3 spaces between letters gives "big" feel       */}
      {/* BLUE in accent · AGENT in primary text          */}
      <Box>
        <Text color={C.blue} bold>{'B   L   U   E'}</Text>
        <Text color={C.dim}  bold>{'   ·   '}</Text>
        <Text color={C.text} bold>{'A   G   E   N   T'}</Text>
      </Box>

      {/* ── Full-width rule under wordmark ───────────── */}
      <Box marginTop={1}>
        <Text dimColor>{SEP}</Text>
      </Box>

      {/* ── Tagline + version ────────────────────────── */}
      <Box>
        <Text color={C.muted}>AI-native founder console for Base</Text>
        <Text color={C.dim}>{'  ·  v' + VERSION + '  ·  x402'}</Text>
      </Box>

      {/* ── Rule above commands ──────────────────────── */}
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
