import React from 'react'
import { Box, Text } from 'ink'

const VERSION = '0.1.10'

const C = {
  blue:   '#4FC3F7',
  purple: '#A78BFA',
  muted:  '#94A3B8',
  dim:    '#475569',
}

// ── Pixel block art — 5 rows × 4 cols per letter, 2-space gap ─────────────
//
// B:████  L:█     U:█  █  E:████
//   █  █    █       █  █    █
//   ████    █       █  █    ███
//   █  █    █       █  █    █
//   ████    ████    ████    ████
//
const BLUE_ART = [
  '████  █     █  █  ████',
  '█  █  █     █  █  █   ',
  '████  █     █  █  ███ ',
  '█  █  █     █  █  █   ',
  '████  ████  ████  ████',
]

// A: ██   G: ███  E:████  N:█  █  T:████
//   █  █    █      █        ██ █    █
//   ████    █ ██   ███      █ ██    █
//   █  █    █  █   █        █  █    █
//   █  █     ███   ████     █  █    █
//
const AGENT_ART = [
  ' ██    ███  ████  █  █  ████',
  '█  █  █     █     ██ █   █  ',
  '████  █ ██  ███   █ ██   █  ',
  '█  █  █  █  █     █  █   █  ',
  '█  █   ███  ████  █  █   █  ',
]

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

const SEP = '─'.repeat(44)

export function Logo() {
  return (
    <Box flexDirection="column" marginBottom={1}>

      <Text>{' '}</Text>

      {/* ── BLUE ─────────────────────────────────────── */}
      {BLUE_ART.map((row, i) => (
        <Box key={`b${i}`} marginLeft={2}>
          <Text color={C.blue} bold>{row}</Text>
        </Box>
      ))}

      {/* ── AGENT ────────────────────────────────────── */}
      {AGENT_ART.map((row, i) => (
        <Box key={`a${i}`} marginLeft={2}>
          <Text color={C.blue} bold>{row}</Text>
        </Box>
      ))}

      {/* ── Tagline ──────────────────────────────────── */}
      <Box marginLeft={2} marginTop={1} gap={1}>
        <Text color={C.muted}>AI-native console for Base</Text>
        <Text color={C.dim}>·</Text>
        <Text color={C.dim}>Base</Text>
        <Text color={C.dim}>·</Text>
        <Text color={C.dim}>x402</Text>
      </Box>

      {/* ── Separator ────────────────────────────────── */}
      <Box marginLeft={2} marginTop={1}>
        <Text dimColor>{SEP}</Text>
      </Box>

      {/* ── Command strip ────────────────────────────── */}
      <Box marginLeft={2}>
        {CMDS.map((cmd, i) => (
          <React.Fragment key={cmd.label}>
            <Text color={cmd.color}>{cmd.label}</Text>
            {i < CMDS.length - 1 && <Text color={C.dim}> · </Text>}
          </React.Fragment>
        ))}
      </Box>

      {/* ── Bottom rule ──────────────────────────────── */}
      <Box marginLeft={2}>
        <Text dimColor>{SEP}</Text>
      </Box>

      <Text>{' '}</Text>

    </Box>
  )
}
