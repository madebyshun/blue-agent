export async function callLLM(opts: {
  system: string
  user: string
  temperature?: number
  maxTokens?: number
}): Promise<string> {
  const response = await fetch('https://llm.bankr.bot/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.LLM_KEY ?? process.env.BANKR_API_KEY ?? process.env.BANKR_LLM_KEY ?? '',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5',
      system: opts.system,
      messages: [{ role: 'user', content: opts.user }],
      temperature: opts.temperature ?? 0.5,
      max_tokens: opts.maxTokens ?? 800,
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`LLM error: ${response.status} - ${err}`)
  }

  const data = await response.json()
  if (data.content?.[0]?.text) return data.content[0].text
  if (data.text) return data.text
  throw new Error('Invalid LLM response format')
}
