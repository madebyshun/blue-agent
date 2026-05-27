/**
 * /api/aeon-feed — Receives real Aeon skill outputs via Discord webhook format
 *
 * Aeon runs on GitHub Actions daily and sends skill outputs to this endpoint.
 * We store them in Vercel KV so Hub tools can serve real data instead of
 * a simulated pipeline.
 *
 * Auth: ?token=<AEON_FEED_TOKEN> query param
 *
 * Request body (Discord webhook format):
 *   { "content": "...", "username": "Aeon | token-pick" }
 *   OR with explicit skill:
 *   { "content": "...", "username": "Aeon", "embeds": [...] }
 *
 * The `skill` query param is preferred — set per-skill webhook URLs in Aeon:
 *   DISCORD_WEBHOOK_URL=https://blueagent.dev/api/aeon-feed?token=SECRET&skill=token-pick
 */

import { NextRequest, NextResponse } from "next/server";
import { setAeonOutput, listAeonSkills } from "@/app/api/_lib/aeon-kv";

const AEON_FEED_TOKEN = process.env.AEON_FEED_TOKEN ?? "";

// Map content/username patterns to skill IDs
const SKILL_PATTERNS: Array<[RegExp, string]> = [
  [/token.?pick|🎯.*pick|pick.*signal/i,       "token-pick"],
  [/top movers|token movers|🏆.*movers/i,       "token-movers"],
  [/narrative.*track|🌊|ct.*narrative/i,         "narrative-tracker"],
  [/morning.*brief|☀️.*brief|gm.*base/i,         "morning-brief"],
  [/defi.*monitor|yield.*opport|📈.*defi/i,      "defi-monitor"],
  [/deal.*flow|🤝.*deal|investment.*deal/i,      "deal-flow"],
  [/github.*trend|trending.*repo|💻.*trend/i,    "github-trending"],
  [/security.*digest|🔐|vulnerabilit/i,          "security-digest"],
  [/deep.*research|research.*report|🔬/i,        "deep-research"],
];

function detectSkill(username: string, content: string, skillParam: string | null): string {
  // 1. Explicit skill query param — most reliable
  if (skillParam) return skillParam;

  // 2. Username field (e.g. "Aeon | token-pick" or "Aeon:narrative-tracker")
  const usernameLower = (username ?? "").toLowerCase();
  for (const [, id] of SKILL_PATTERNS) {
    if (usernameLower.includes(id)) return id;
  }

  // 3. Pattern-match first 300 chars of content
  const preview = (content ?? "").slice(0, 300);
  for (const [pattern, id] of SKILL_PATTERNS) {
    if (pattern.test(preview)) return id;
  }

  return "unknown";
}

// ── POST: receive Aeon skill output ─────────────────────────────────────────
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token     = req.nextUrl.searchParams.get("token");
  const skillParam = req.nextUrl.searchParams.get("skill");

  if (!AEON_FEED_TOKEN || token !== AEON_FEED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const username = (body.username as string) ?? "";
  const content  = (body.content  as string) ?? "";

  if (!content) {
    return NextResponse.json({ error: "No content" }, { status: 400 });
  }

  const skill = detectSkill(username, content, skillParam);

  await setAeonOutput(skill, content, username);

  console.log(`[aeon-feed] stored skill=${skill} len=${content.length} username="${username}"`);

  return NextResponse.json({ ok: true, skill, stored: true });
}

// ── GET: inspect stored Aeon outputs (admin debug) ──────────────────────────
export async function GET(req: NextRequest): Promise<NextResponse> {
  const token = req.nextUrl.searchParams.get("token");

  if (!AEON_FEED_TOKEN || token !== AEON_FEED_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const skill = req.nextUrl.searchParams.get("skill");

  if (skill) {
    // Return specific skill output
    const { getAeonOutput } = await import("@/app/api/_lib/aeon-kv");
    const data = await getAeonOutput(skill);
    return NextResponse.json({ skill, found: !!data, data });
  }

  // List all stored skills
  const skills = await listAeonSkills();
  return NextResponse.json({ skills, count: skills.length });
}
