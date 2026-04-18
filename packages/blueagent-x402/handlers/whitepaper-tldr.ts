import { askJSON } from '../lib/llm.js'

interface Input { url: string; projectName?: string }
interface Output {
  url: string
  projectName: string
  bullets: string[]
  techStack: string[]
  tokenRole: string
  verdict: string
  readTime: string
}

export default async function handler({ url, projectName = '' }: Input): Promise<Output> {
  let content = ''
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'BlueAgent/1.0' } })
    const text = await res.text()
    content = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 6000)
  } catch {
    content = `Could not fetch URL: ${url}`
  }

  return askJSON<Output>(`
    Summarize this whitepaper/documentation for ${projectName || 'this project'}.
    URL: ${url}
    Content excerpt: ${content}
    Return JSON: {
      url,
      projectName,
      bullets (5 key points — what it does, how it works, why it matters),
      techStack (main technologies),
      tokenRole (what the token does in the ecosystem),
      verdict (1 sentence: is this worth reading fully?),
      readTime (estimate, e.g. "12 min read")
    }
  `, 'You are a crypto research analyst. Be concise, specific, and cut through the hype.')
}
