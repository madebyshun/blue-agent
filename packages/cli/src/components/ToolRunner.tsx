import React, { useState, useEffect } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import type { Category, CategoryType, ToolItem } from '../App.js'
import { TOOL_PARAMS } from './ToolMenu.js'

const HR = '─'.repeat(61)

interface Props {
  category: Category
  tool: ToolItem
  onRun: (inputs: Record<string, string>) => void
  onBack: () => void
  loading: boolean
  result: unknown
  error: string | null
}

// ── Score display ─────────────────────────────────────────────────────────────

function ScoreBar({ label, score, max }: { label: string; score: number; max: number }) {
  const filled = Math.round((score / max) * 20)
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
  return (
    <Box>
      <Text dimColor>{label.padEnd(20)}</Text>
      <Text color="cyan">{bar}</Text>
      <Text dimColor>  {score}/{max}</Text>
    </Box>
  )
}

function BuilderScoreResult({ data }: { data: Record<string, unknown> }) {
  const dims = data.dimensions as Record<string, number>
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2}>
        <Text color="cyan" bold>{String(data.score)}</Text>
        <Text dimColor>/100</Text>
        <Text bold>{String(data.badge)} {String(data.tier)}</Text>
        <Text dimColor>@{String(data.handle)}</Text>
      </Box>
      <Box flexDirection="column">
        <ScoreBar label="activity"   score={dims.activity}   max={25} />
        <ScoreBar label="social"     score={dims.social}     max={25} />
        <ScoreBar label="uniqueness" score={dims.uniqueness} max={20} />
        <ScoreBar label="thesis"     score={dims.thesis}     max={20} />
        <ScoreBar label="community"  score={dims.community}  max={10} />
      </Box>
      <Text dimColor>{String(data.summary)}</Text>
    </Box>
  )
}

function AgentScoreResult({ data }: { data: Record<string, unknown> }) {
  const dims = data.dimensions as Record<string, number>
  return (
    <Box flexDirection="column" gap={1}>
      <Box gap={2}>
        <Text color="cyan" bold>{String(data.score)}</Text>
        <Text dimColor>/100</Text>
        <Text bold>{String(data.tier)}</Text>
        <Text dimColor>{String(data.handle)}</Text>
      </Box>
      <Box flexDirection="column">
        <ScoreBar label="skill depth"       score={dims.skillDepth}       max={25} />
        <ScoreBar label="onchain activity"  score={dims.onchainActivity}  max={25} />
        <ScoreBar label="reliability"       score={dims.reliability}      max={20} />
        <ScoreBar label="interoperability"  score={dims.interoperability} max={20} />
        <ScoreBar label="reputation"        score={dims.reputation}       max={10} />
      </Box>
      {Array.isArray(data.strengths) && data.strengths.length > 0 && (
        <Text dimColor>strengths: {(data.strengths as string[]).join(' · ')}</Text>
      )}
      {Array.isArray(data.gaps) && data.gaps.length > 0 && (
        <Text dimColor>gaps: {(data.gaps as string[]).join(' · ')}</Text>
      )}
    </Box>
  )
}

function ResultDisplay({ result }: { result: unknown }) {
  if (typeof result === 'string') {
    return <Text>{result}</Text>
  }
  if (Array.isArray(result)) {
    if (result.length === 0) return <Text dimColor>(no results)</Text>
    return <Text>{JSON.stringify(result, null, 2)}</Text>
  }
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>
    if ('score' in obj && 'dimensions' in obj && 'tier' in obj && 'summary' in obj) {
      return <BuilderScoreResult data={obj} />
    }
    if ('score' in obj && 'dimensions' in obj && 'tier' in obj && 'strengths' in obj) {
      return <AgentScoreResult data={obj} />
    }
    return <Text>{JSON.stringify(result, null, 2)}</Text>
  }
  return <Text>{String(result)}</Text>
}

// ── Main ToolRunner ───────────────────────────────────────────────────────────

export function ToolRunner({ category, tool, onRun, onBack, loading, result, error }: Props) {
  const rawParams = TOOL_PARAMS[tool.name] ?? []
  const required = rawParams.filter((p) => !p.endsWith('?'))
  const optional = rawParams.filter((p) => p.endsWith('?')).map((p) => p.slice(0, -1))
  const allFields = [...required, ...optional]

  const [values, setValues] = useState<Record<string, string>>({})
  const [cursor, setCursor] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  const type: CategoryType = category.type

  useInput((_, key) => {
    if (key.escape) { onBack(); return }
    if (key.return) {
      if (cursor < allFields.length) {
        setCursor((c) => c + 1)
      } else if (!submitted) {
        setSubmitted(true)
        onRun(values)
      }
    }
  })

  // Auto-run tools with no inputs
  useEffect(() => {
    if (allFields.length === 0 && type !== 'bankr' && !submitted) {
      setSubmitted(true)
      onRun({})
    }
  }, [])

  // ── Loading ──
  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">● running <Text bold>{tool.name}</Text>…</Text>
      </Box>
    )
  }

  // ── Result ──
  if (result !== null && result !== undefined) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="green">✓ complete</Text>
        <ResultDisplay result={result} />
        <Text dimColor>{HR}</Text>
        <Text dimColor> esc to go back</Text>
      </Box>
    )
  }

  // ── Error ──
  if (error) {
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="red">✗ {error}</Text>
        <Text dimColor>{HR}</Text>
        <Text dimColor> esc to go back</Text>
      </Box>
    )
  }

  // ── Bankr — show command hint ──
  if (type === 'bankr') {
    const args = Object.values(values).filter(Boolean).join(' ')
    return (
      <Box flexDirection="column" gap={1}>
        <Text color="cyan" bold>{tool.name}</Text>
        <Text dimColor>{HR}</Text>
        <Text dimColor>Wallet operations run via the Bankr agent CLI.</Text>
        <Box marginTop={1}>
          <Text dimColor>run:  </Text>
          <Text color="cyan">bankr agent {tool.name}{args ? ` ${args}` : ''}</Text>
        </Box>
        <Text dimColor>install: npm install -g bankr</Text>
        <Text dimColor>{HR}</Text>
        <Text dimColor> esc to go back</Text>
      </Box>
    )
  }

  // ── Input form ──
  return (
    <Box flexDirection="column">
      {/* Header */}
      <Text color="cyan" bold>{tool.name}</Text>
      <Text dimColor>{HR}</Text>

      {/* Fields */}
      <Box flexDirection="column" marginTop={1}>
        {allFields.map((field, i) => {
          const isOptional = optional.includes(field)
          const active = i === cursor
          return (
            <Box key={field} marginBottom={0}>
              {active ? (
                <Box>
                  <Text dimColor>Enter {isOptional ? '(optional) ' : ''}{field}: </Text>
                  <Text color="cyan">❯ </Text>
                  <TextInput
                    value={values[field] ?? ''}
                    onChange={(v) => setValues((prev) => ({ ...prev, [field]: v }))}
                    onSubmit={() => setCursor((c) => c + 1)}
                  />
                </Box>
              ) : (
                <Box>
                  <Text dimColor>
                    {(isOptional ? '(optional) ' : '') + field + ': '}
                  </Text>
                  <Text dimColor>{values[field] || '—'}</Text>
                </Box>
              )}
            </Box>
          )
        })}
      </Box>

      {/* Run prompt */}
      {cursor >= allFields.length && !submitted && (
        <Box marginTop={1}>
          <Text color="cyan">❯ </Text>
          <Text>press enter to run</Text>
          <Text dimColor>  (ctrl+c to cancel)</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>{HR}</Text>
      </Box>
      <Text dimColor> esc to go back  ctrl+c quit</Text>
    </Box>
  )
}
