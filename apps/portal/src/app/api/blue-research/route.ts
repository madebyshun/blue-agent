/**
 * POST /api/blue-research — Base ecosystem deep-dive
 *
 * Takes a topic, runs Blue Search internally, formats sources into a
 * structured research report. Optional LLM synthesis when BANKR_API_KEY
 * is set; otherwise returns a deterministic template-based deep-dive.
 *
 * Free tier today. x402-gated at $0.10/call when payment wiring lands.
 */

import { NextRequest, NextResponse } from "next/server";
import { search } from "@/lib/blue-search/search";

export const runtime = "nodejs";

interface Body {
  topic: string;
  depth?: "quick" | "standard" | "deep";   // affects # sources used
}

interface Section {
  heading: string;
  content: string;
  citations: { id: string; title: string; url: string }[];
}

interface Report {
  topic:      string;
  generatedAt:string;
  mode:       "template" | "llm";
  summary:    string;
  sections:   Section[];
  next_steps: string[];
  sources:    { id: string; title: string; url: string; relevance: number }[];
}

export async function POST(req: NextRequest) {
  let body: Body;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const topic = (body.topic ?? "").trim();
  if (!topic) return NextResponse.json({ error: "Missing topic" }, { status: 400 });
  if (topic.length > 300) return NextResponse.json({ error: "Topic too long (max 300 chars)" }, { status: 400 });

  const depth = body.depth ?? "standard";
  const sourceLimit = depth === "quick" ? 3 : depth === "deep" ? 12 : 8;

  // Step 1 — gather sources via Blue Search
  const searchResp = await search(topic, sourceLimit);
  if (searchResp.results.length === 0) {
    return NextResponse.json({
      topic,
      error:    "No sources found in Blue Hub corpus for this topic",
      hint:     "Try a broader topic, or check spelling. Topics related to Base / x402 / MCP / Aerodrome / Morpho / Uniswap v4 work best.",
    }, { status: 404 });
  }

  const report = synthesize(topic, searchResp.results);

  return NextResponse.json(report, {
    headers: {
      "Cache-Control":              "public, s-maxage=60, stale-while-revalidate=300",
      "Access-Control-Allow-Origin":"*",
    },
  });
}

// GET helper for easy testing in browser
export async function GET(req: NextRequest) {
  const topic = req.nextUrl.searchParams.get("topic") ?? "";
  if (!topic) {
    return NextResponse.json({
      endpoint: "/api/blue-research",
      usage:    "POST { topic, depth? } or GET ?topic=...",
      example:  "/api/blue-research?topic=how+to+deploy+to+base+mainnet",
    });
  }
  const searchResp = await search(topic, 8);
  if (searchResp.results.length === 0) {
    return NextResponse.json({ topic, error: "No sources found" }, { status: 404 });
  }
  return NextResponse.json(synthesize(topic, searchResp.results), {
    headers: { "Access-Control-Allow-Origin": "*" },
  });
}

// ─── Synthesis (template-based for now; LLM hook reserved) ──────────────────

function synthesize(
  topic: string,
  results: Awaited<ReturnType<typeof search>>["results"],
): Report {
  // Group sources by approximate "section topic" via keyword heuristics
  const byCategory: Record<string, typeof results> = {
    overview:  [],
    technical: [],
    docs:      [],
    other:     [],
  };

  for (const r of results) {
    const u = r.url.toLowerCase();
    const t = (r.title + " " + r.snippet).toLowerCase();
    if (u.includes("docs.") || u.includes("/docs/") || u.includes("book.")) byCategory.docs.push(r);
    else if (t.match(/\b(how|what|overview|guide|intro|getting started)\b/)) byCategory.overview.push(r);
    else if (t.match(/\b(contract|address|api|sdk|protocol|spec|eip|technical)\b/)) byCategory.technical.push(r);
    else byCategory.other.push(r);
  }

  // Build sections, only including ones with sources
  const sections: Section[] = [];

  if (byCategory.overview.length > 0 || byCategory.other.length > 0) {
    const sources = [...byCategory.overview, ...byCategory.other];
    sections.push({
      heading:   "What it is",
      content:   sources.map(s => `${s.snippet}`).join("\n\n"),
      citations: sources.slice(0, 4).map(s => ({ id: s.id, title: s.title, url: s.url })),
    });
  }

  if (byCategory.technical.length > 0) {
    sections.push({
      heading:   "How it works",
      content:   byCategory.technical.map(s => s.snippet).join("\n\n"),
      citations: byCategory.technical.slice(0, 4).map(s => ({ id: s.id, title: s.title, url: s.url })),
    });
  }

  if (byCategory.docs.length > 0) {
    sections.push({
      heading:   "Documentation & references",
      content:   byCategory.docs.map(s => s.snippet).join("\n\n"),
      citations: byCategory.docs.slice(0, 4).map(s => ({ id: s.id, title: s.title, url: s.url })),
    });
  }

  // Always include "Open questions" section to flag gaps
  sections.push({
    heading: "Areas the corpus is thin on",
    content: results.length < 5
      ? `Only ${results.length} relevant source(s) found. The Blue Hub research corpus may not cover this topic deeply yet — verify with primary sources before deciding.`
      : `The Blue Hub corpus is curated for Base ecosystem; consider cross-referencing primary sources for pricing data, real-time onchain metrics, or legal/regulatory specifics.`,
    citations: [],
  });

  const next_steps = pickNextSteps(topic, results);

  return {
    topic,
    generatedAt: new Date().toISOString(),
    mode:        "template",
    summary:     buildSummary(topic, results),
    sections,
    next_steps,
    sources: results.map(r => ({ id: r.id, title: r.title, url: r.url, relevance: r.score })),
  };
}

function buildSummary(topic: string, results: Awaited<ReturnType<typeof search>>["results"]): string {
  const top = results[0];
  return [
    `Research on "${topic}". Top match: ${top.title} (relevance ${(top.score * 100).toFixed(0)}%).`,
    `Drawing from ${results.length} sources across the Blue Hub Base ecosystem corpus.`,
    top.snippet,
  ].join(" ");
}

function pickNextSteps(topic: string, results: Awaited<ReturnType<typeof search>>["results"]): string[] {
  const t = topic.toLowerCase();
  const steps: string[] = [];

  if (t.match(/\b(deploy|launch|ship|mainnet|production)\b/)) {
    steps.push("Run `blue ship` to generate a deployment checklist with monitoring plan");
    steps.push("Run `blue audit` to scan for security issues before going live");
  }
  if (t.match(/\b(audit|security|vulnerability|risk|exploit)\b/)) {
    steps.push("Run `blue audit` for 500+ security checks across 13 categories");
    steps.push("Run `blue gate` for CI/CD-friendly pre-deploy policy check (coming soon)");
  }
  if (t.match(/\b(idea|concept|validate|product|market)\b/)) {
    steps.push("Run `blue idea` to turn the concept into a fundable brief");
    steps.push("Run `blue build` to get architecture + integration plan");
  }
  if (t.match(/\b(raise|fund|investor|pitch|seed)\b/)) {
    steps.push("Run `blue raise` for narrative + smart-money investor map");
  }
  if (t.match(/\b(token|launch|memecoin|liquidity)\b/)) {
    steps.push("Browse `/marketplace?cat=Trading` for token signal + liquidity tools");
  }

  // Default fallbacks if nothing matched
  if (steps.length === 0) {
    steps.push("Browse related APIs at api.blueagent.dev/marketplace");
    steps.push("Run `blue idea` to scope this into a concrete project");
  }

  // Always recommend further reading
  if (results[0]?.url) {
    steps.push(`Read primary source: ${results[0].url}`);
  }

  return steps.slice(0, 4);
}
