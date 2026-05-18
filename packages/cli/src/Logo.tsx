import React from 'react'
import { Box, Text } from 'ink'

const C = {
  blue:   '#4FC3F7',
  purple: '#A78BFA',
  muted:  '#94A3B8',
  dim:    '#475569',
}

const BLUE_ART = ` ██████╗ ██╗     ██╗   ██╗███████╗
 ██╔══██╗██║     ██║   ██║██╔════╝
 ██████╔╝██║     ██║   ██║█████╗
 ██╔══██╗██║     ██║   ██║██╔══╝
 ██████╔╝███████╗╚██████╔╝███████╗
 ╚═════╝ ╚══════╝ ╚═════╝ ╚══════╝`

const AGENT_ART = `  █████╗  ██████╗ ███████╗███╗   ██╗████████╗
 ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝
 ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║
 ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║
 ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║
 ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝`

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
      <Text color={C.blue} bold>{BLUE_ART}</Text>

      {/* ── AGENT ────────────────────────────────────── */}
      <Text color={C.blue} bold>{AGENT_ART}</Text>

      {/* ── Tagline ──────────────────────────────────── */}
      <Box marginLeft={2} marginTop={1} gap={1}>
        <Text color={C.muted}>AI-native founder console for Base</Text>
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
