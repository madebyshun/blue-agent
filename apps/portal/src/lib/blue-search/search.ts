/**
 * Blue Search engine.
 *
 * Today: BM25-style lexical retrieval over the static curated corpus + a
 *   topic-tag boost. Works without any external infrastructure.
 *
 * Path to vector search:
 *   - Set OPENAI_API_KEY (or DEEPSEEK_API_KEY) → embeddings generated lazily.
 *   - Set DATABASE_URL pointing at a pgvector-enabled Postgres → embeddings
 *     persisted there + cosine similarity used instead of BM25.
 *   - Crawler (apps/portal/src/lib/blue-search/crawler.ts) fills the table.
 *
 * Both paths return the same `SearchResult` shape so callers don't change.
 */

import { CORPUS, tokenize, type Doc } from "./corpus";

export interface SearchResult {
  id:        string;
  title:     string;
  url:       string;
  snippet:   string;          // ~200 char excerpt with matched terms
  score:     number;          // 0..1 — relative relevance
  source:    string;
  updatedAt: string;
}

export interface SearchResponse {
  query:       string;
  mode:        "lexical" | "vector";
  total:       number;
  results:     SearchResult[];
  answer?:     string;        // optional LLM-summarized answer (Phase next)
  generatedAt: string;
}

// ─── Lexical retrieval (BM25-lite) ────────────────────────────────────────────

const K1 = 1.5;
const B  = 0.75;

// Precompute corpus-level stats once.
const DOC_TOKENS = CORPUS.map(d => tokenize(`${d.title} ${d.content} ${d.topics.join(" ")}`));
const AVG_LEN    = DOC_TOKENS.reduce((s, t) => s + t.length, 0) / DOC_TOKENS.length;
const DOC_FREQ   = (() => {
  const df: Record<string, number> = {};
  DOC_TOKENS.forEach(toks => {
    new Set(toks).forEach(t => { df[t] = (df[t] ?? 0) + 1; });
  });
  return df;
})();
const N = CORPUS.length;

function idf(term: string): number {
  const df = DOC_FREQ[term] ?? 0;
  // Smoothed IDF, clamped at 0 so common terms don't hurt scoring
  return Math.max(0, Math.log((N - df + 0.5) / (df + 0.5) + 1));
}

function bm25Score(queryTokens: string[], docTokens: string[]): number {
  const len = docTokens.length;
  const tf: Record<string, number> = {};
  docTokens.forEach(t => { tf[t] = (tf[t] ?? 0) + 1; });

  let score = 0;
  queryTokens.forEach(q => {
    const f      = tf[q] ?? 0;
    if (f === 0) return;
    const norm   = 1 - B + B * (len / AVG_LEN);
    score += idf(q) * (f * (K1 + 1)) / (f + K1 * norm);
  });
  return score;
}

function topicBoost(queryTokens: string[], doc: Doc): number {
  const topicSet = new Set(doc.topics.map(t => t.toLowerCase()));
  const hits = queryTokens.filter(q => topicSet.has(q)).length;
  return hits * 1.5; // each topic-tag hit adds significant boost
}

function snippetOf(doc: Doc, queryTokens: string[]): string {
  // Find the sentence with the most query-term hits
  const sentences = doc.content.split(/(?<=[.!?])\s+/);
  let best = sentences[0] ?? doc.content;
  let bestHits = 0;
  for (const s of sentences) {
    const toks = tokenize(s);
    const hits = queryTokens.filter(q => toks.includes(q)).length;
    if (hits > bestHits) { best = s; bestHits = hits; }
  }
  return best.length > 240 ? best.slice(0, 237) + "…" : best;
}

// ─── Public search API ───────────────────────────────────────────────────────

export async function search(query: string, limit = 8): Promise<SearchResponse> {
  const tokens = tokenize(query);
  if (tokens.length === 0) {
    return { query, mode: "lexical", total: 0, results: [], generatedAt: new Date().toISOString() };
  }

  // Score every doc
  const scored = CORPUS.map((doc, i) => {
    const lex   = bm25Score(tokens, DOC_TOKENS[i]);
    const boost = topicBoost(tokens, doc);
    return { doc, score: lex + boost };
  })
  .filter(s => s.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, limit);

  // Normalize to 0..1
  const max = scored[0]?.score ?? 1;
  const results: SearchResult[] = scored.map(({ doc, score }) => ({
    id:        doc.id,
    title:     doc.title,
    url:       doc.url,
    snippet:   snippetOf(doc, tokens),
    score:     Number((score / max).toFixed(3)),
    source:    doc.source,
    updatedAt: doc.updatedAt,
  }));

  return {
    query,
    mode:        "lexical",
    total:       results.length,
    results,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Future: vector upgrade hook ──────────────────────────────────────────────
//
// When OPENAI_API_KEY + DATABASE_URL are set, replace the BM25 path with:
//
//   const queryVec = await embed(query);          // OpenAI or local model
//   const rows     = await pg`SELECT id, title, url, content,
//                                    1 - (embedding <=> ${queryVec}) AS score
//                              FROM docs ORDER BY embedding <=> ${queryVec} LIMIT ${limit}`;
//
// Same SearchResult shape returned, mode: "vector".
