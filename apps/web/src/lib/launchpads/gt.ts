/**
 * GeckoTerminal's keyless API, with ONE retry on 429. Measured 2026-10-01: it
 * answers 429 after about six quick calls, and a single chat turn
 * (check_token, new_tokens) makes two or three — the test share showed
 * "market data could not be read" for a token whose pools were fine.
 * Returns null on any failure; callers say "could not be read".
 */
export async function gtJson<T>(path: string): Promise<{ status: number; body: T | null }> {
  const url = `https://api.geckoterminal.com/api/v2${path}`;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, { headers: { Accept: "application/json" }, signal: AbortSignal.timeout(6_000), cache: "no-store" });
      if (r.status === 429 && attempt === 0) { await new Promise((res) => setTimeout(res, 1_500)); continue; }
      if (!r.ok) return { status: r.status, body: null };
      return { status: r.status, body: (await r.json()) as T };
    } catch {
      if (attempt === 1) return { status: 0, body: null };
    }
  }
  return { status: 429, body: null };
}
