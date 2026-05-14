import React from 'react'
import { Box, Text } from 'ink'

const VERSION = '0.1.10'

const C = {
  blue:   '#4FC3F7',
  purple: '#A78BFA',
  muted:  '#94A3B8',
  dim:    '#475569',
}

// ── ANSI Shadow figlet — BLUE ─────────────────────────────────────────────
// Each row is 33 chars: B(8) + L(8) + U(9) + E(8)
const BLUE_ART = [
  '██████╗ ██╗     ██╗   ██╗███████╗',
  '██╔══██╗██║     ██║   ██║██╔════╝',
  '██████╔╝██║     ██║   ██║█████╗  ',
  '██╔══██╗██║     ██║   ██║██╔══╝  ',
  '███████╗███████╗╚██████╔╝███████╗',
  '╚══════╝╚══════╝ ╚═════╝ ╚══════╝',
]

// ── ANSI Shadow figlet — AGENT ────────────────────────────────────────────
// Each row is 44 chars: A(8) + G(9) + E(8) + N(10) + T(9)
const AGENT_ART = [
  ' █████╗  ██████╗ ███████╗███╗   ██╗████████╗',
  '██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝',
  '███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ',
  '██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ',
  '██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ',
  '╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ',
]

const SEP = '─'.repeat(46)

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

      {/* ── BLUE ─────────────────────────────────────── */}
      {BLUE_ART.map((row, i) => (
        <Box key={`b${i}`}>
          <Text color={C.blue} bold>{row}</Text>
        </Box>
      ))}

      {/* ── AGENT ────────────────────────────────────── */}
      {AGENT_ART.map((row, i) => (
        <Box key={`a${i}`}>
          <Text color={C.blue} bold>{row}</Text>
        </Box>
      ))}

      {/* ── Tagline ──────────────────────────────────── */}
      <Box marginTop={1} gap={1}>
        <Text color={C.muted}>AI-native founder console for Base</Text>
        <Text color={C.dim}>·  Base  ·  x402</Text>
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
            {i < CMDS.length - 1 && <Text color={C.dim}> · </Text>}
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
