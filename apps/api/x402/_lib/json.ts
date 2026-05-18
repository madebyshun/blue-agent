export function extractJSON(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
  const s = cleaned.indexOf('{')
  const e = cleaned.lastIndexOf('}')
  if (s >= 0 && e > s) return JSON.parse(cleaned.slice(s, e + 1))
  throw new Error('No JSON object found in LLM response')
}

export function extractArray(raw: string): unknown[] {
  const cleaned = raw.replace(/```(?:json)?\n?/g, '').replace(/```/g, '').trim()
  const s = cleaned.indexOf('[')
  const e = cleaned.lastIndexOf(']')
  if (s >= 0 && e > s) return JSON.parse(cleaned.slice(s, e + 1))
  throw new Error('No JSON array found in LLM response')
}
