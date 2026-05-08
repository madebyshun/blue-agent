import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import TextInput from 'ink-text-input'
import type { Category, CategoryType, ToolItem } from '../App.js'
import { TOOL_PARAMS } from './ToolMenu.js'

interface Props {
  category: Category
  tool: ToolItem
  onRun: (inputs: Record<string, string>) => void
  onBack: () => void
  loading: boolean
  result: unknown
  error: string | null
}

function ResultDisplay({ result }: { result: unknown }) {
  if (typeof result === 'string') {
    // Builder text response — display as-is (may be multi-line markdown)
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text color="green" bold>✓ Result</Text>
        </Box>
        <Text>{result}</Text>
      </Box>
    )
  }

  if (Array.isArray(result)) {
    if (result.length === 0) {
      return <Text dimColor>(empty)</Text>
    }
    return (
      <Box flexDirection="column">
        <Text color="green" bold>✓ {result.length} items</Text>
        <Text>{JSON.stringify(result, null, 2)}</Text>
      </Box>
    )
  }

  // Score result — format nicely
  if (result && typeof result === 'object') {
    const obj = result as Record<string, unknown>

    // Builder score shape
    if ('score' in obj && 'tier' in obj && 'dimensions' in obj) {
      const dims = obj.dimensions as Record<string, number>
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="green" bold>✓ Builder Score — @{String(obj.handle)}</Text>
          <Text>
            Score: <Text color="blueBright" bold>{String(obj.score)}</Text>/100  ·  Tier: {String(obj.badge)} {String(obj.tier)}
          </Text>
          <Box flexDirection="column">
            {Object.entries(dims).map(([k, v]) => (
              <Text key={k} dimColor>
                {`  ${k.padEnd(14)} ${'█'.repeat(Math.round((v / 25) * 15)).padEnd(15)} ${v}`}
              </Text>
            ))}
          </Box>
          <Text dimColor>{String(obj.summary)}</Text>
        </Box>
      )
    }

    // Agent score shape
    if ('xp' in obj && 'tier' in obj && 'dimensions' in obj) {
      const dims = obj.dimensions as Record<string, number>
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="green" bold>✓ Agent Score — {String(obj.handle)}</Text>
          <Text>
            XP: <Text color="blueBright" bold>{String(obj.xp)}</Text>  ·  Tier: {String(obj.badge)} {String(obj.tier)}  ·  {String(obj.status).toUpperCase()}
          </Text>
          <Box flexDirection="column">
            {Object.entries(dims).map(([k, v]) => (
              <Text key={k} dimColor>
                {`  ${k.padEnd(18)} ${'█'.repeat(Math.round((v / 25) * 15)).padEnd(15)} ${v}`}
              </Text>
            ))}
          </Box>
          {Array.isArray(obj.strengths) && obj.strengths.length > 0 && (
            <Text dimColor>  strengths: {(obj.strengths as string[]).join(' · ')}</Text>
          )}
        </Box>
      )
    }

    // Generic JSON
    return (
      <Box flexDirection="column">
        <Text color="green" bold>✓ Result</Text>
        <Text>{JSON.stringify(result, null, 2)}</Text>
      </Box>
    )
  }

  return <Text>{String(result)}</Text>
}

function BankrHint({ toolName, inputs }: { toolName: string; inputs: Record<string, string> }) {
  const args = Object.values(inputs).filter(Boolean).join(' ')
  return (
    <Box flexDirection="column" gap={1}>
      <Text color="blueBright" bold>💎 Wallet — {toolName}</Text>
      <Text dimColor>Wallet operations run through the Bankr agent CLI.</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>Run in terminal:</Text>
        <Text color="yellow">  bankr agent {toolName}{args ? ` ${args}` : ''}</Text>
      </Box>
      <Text dimColor>Install Bankr: npm install -g bankr</Text>
    </Box>
  )
}

export function ToolRunner({ category, tool, onRun, onBack, loading, result, error }: Props) {
  const rawParams = TOOL_PARAMS[tool.name] ?? []
  const required = rawParams.filter((p) => !p.endsWith('?'))
  const optional = rawParams.filter((p) => p.endsWith('?')).map((p) => p.slice(0, -1))
  const allFields = [...required, ...optional]

  const [values, setValues] = useState<Record<string, string>>({})
  const [cursor, setCursor] = useState(0)
  const [ran, setRan] = useState(false)

  useInput((_, key) => {
    if (key.escape) {
      onBack()
      return
    }
    if (key.return) {
      if (cursor < allFields.length) {
        setCursor((c) => c + 1)
      } else if (!ran) {
        setRan(true)
        onRun(values)
      }
    }
  })

  const type: CategoryType = category.type

  // Bankr — skip input collection, show hint
  if (type === 'bankr' && !ran) {
    return (
      <Box flexDirection="column">
        <BankrHint toolName={tool.name} inputs={values} />
        <Box marginTop={1}>
          <Text dimColor>esc to go back</Text>
        </Box>
      </Box>
    )
  }

  // No-input tools (e.g. blue tasks, portfolio)
  if (allFields.length === 0 && !ran) {
    return (
      <Box flexDirection="column">
        <Text color="blueBright" bold>{tool.name}</Text>
        <Text dimColor>{tool.description}</Text>
        <Box marginTop={1}>
          <Text color="green">Press Enter to run  ·  esc to cancel</Text>
        </Box>
      </Box>
    )
  }

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color="blueBright">⏳ Running {tool.name}…</Text>
        {type === 'builder' && <Text dimColor> (calling Bankr LLM with skill grounding)</Text>}
        {type === 'x402' && <Text dimColor> (calling x402.bankr.bot)</Text>}
        {type === 'score' && <Text dimColor> (scoring via Bankr LLM)</Text>}
        {type === 'tasks' && <Text dimColor> (reading ~/.blue-agent/tasks.json)</Text>}
      </Box>
    )
  }

  if (result !== null && result !== undefined) {
    return (
      <Box flexDirection="column">
        <ResultDisplay result={result} />
        <Box marginTop={1}>
          <Text dimColor>esc to go back</Text>
        </Box>
      </Box>
    )
  }

  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✗ Error: {error}</Text>
        <Text dimColor>esc to go back</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      {/* Tool header */}
      <Box marginBottom={1}>
        <Text color="blueBright" bold>{tool.name}</Text>
        {tool.price && <Text dimColor>  {tool.price}</Text>}
        <Text dimColor>  {tool.description}</Text>
      </Box>

      {/* Input fields */}
      {allFields.map((field, i) => {
        const isOptional = optional.includes(field)
        return (
          <Box key={field} marginBottom={0}>
            <Text color={i === cursor ? 'blueBright' : 'white'}>
              {field}{isOptional ? ' (optional)' : ''}: {' '}
            </Text>
            {i === cursor ? (
              <TextInput
                value={values[field] ?? ''}
                onChange={(v) => setValues((prev) => ({ ...prev, [field]: v }))}
                onSubmit={() => setCursor((c) => c + 1)}
              />
            ) : (
              <Text dimColor>{values[field] || '—'}</Text>
            )}
          </Box>
        )
      })}

      {/* Run prompt */}
      {cursor >= allFields.length && (
        <Box marginTop={1}>
          <Text color="green">→ Press Enter to run  ·  esc to cancel</Text>
        </Box>
      )}
    </Box>
  )
}
