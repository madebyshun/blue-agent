const LLM_URL = 'https://llm.bankr.bot/v1/chat/completions'
const LLM_KEY = process.env.BANKR_LLM_KEY ?? ''

export async function ask(prompt: string, systemPrompt?: string): Promise<string> {
  const messages = []
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })
  messages.push({ role: 'user', content: prompt })

  const res = await fetch(LLM_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${LLM_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-6', messages })
  })

  const data = await res.json() as { choices: { message: { content: string } }[] }
  return data.choices[0].message.content
}

export async function askJSON<T>(prompt: string, systemPrompt?: string): Promise<T> {
  const raw = await ask(prompt + '\n\nRespond with valid JSON only, no markdown.', systemPrompt)
  const match = raw.match(/\{[\s\S]*\}/)
  return JSON.parse(match ? match[0] : raw) as T
}
