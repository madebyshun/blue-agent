import { NextRequest } from "next/server";

export const runtime = "edge";

// Cache badge for 1 hour
export const revalidate = 3600;

const COLORS = {
  // Tier colors
  Bot:          { bg: "#475569", text: "#E2E8F0" },
  Agent:        { bg: "#0EA5E9", text: "#FFFFFF" },
  "Pro Agent":  { bg: "#7C3AED", text: "#FFFFFF" },
  "Elite Agent":{ bg: "#DB2777", text: "#FFFFFF" },
  Sovereign:    { bg: "#F59E0B", text: "#1A1A2E" },
  Explorer:     { bg: "#475569", text: "#E2E8F0" },
  Builder:      { bg: "#0EA5E9", text: "#FFFFFF" },
  Maker:        { bg: "#7C3AED", text: "#FFFFFF" },
  Legend:       { bg: "#DB2777", text: "#FFFFFF" },
  Founder:      { bg: "#F59E0B", text: "#1A1A2E" },
  // Fallback
  default:      { bg: "#4FC3F7", text: "#0F172A" },
} as const;

function scoreBadgeSvg({
  label,
  handle,
  score,
  tier,
}: {
  label: string;
  handle: string;
  score: number;
  tier: string;
}) {
  const color = COLORS[tier as keyof typeof COLORS] ?? COLORS.default;
  const displayHandle = decodeURIComponent(handle).replace(/^@/, "");
  const short = displayHandle.length > 18 ? displayHandle.slice(0, 16) + "…" : displayHandle;

  // Bar width: score/100 * 120px
  const barW = Math.round((score / 100) * 120);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56" role="img" aria-label="${label} score: ${score}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#1E293B"/>
      <stop offset="1" stop-color="#0F172A"/>
    </linearGradient>
    <clipPath id="r"><rect width="220" height="56" rx="6"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect width="220" height="56" fill="url(#bg)"/>
    <!-- left accent bar -->
    <rect width="3" height="56" fill="${color.bg}"/>
    <!-- label -->
    <text x="12" y="18" font-family="'Segoe UI',system-ui,sans-serif" font-size="9" fill="#94A3B8" letter-spacing="0.8" text-transform="uppercase">${label.toUpperCase()} SCORE</text>
    <!-- handle -->
    <text x="12" y="33" font-family="'Segoe UI',system-ui,sans-serif" font-size="12" font-weight="600" fill="#E2E8F0">${short}</text>
    <!-- score number -->
    <text x="208" y="33" font-family="'Segoe UI',system-ui,sans-serif" font-size="14" font-weight="700" fill="${color.bg}" text-anchor="end">${score}</text>
    <!-- tier pill -->
    <rect x="12" y="39" width="${tier.length * 6.5 + 10}" height="13" rx="3" fill="${color.bg}"/>
    <text x="${12 + tier.length * 3.25 + 5}" y="49" font-family="'Segoe UI',system-ui,sans-serif" font-size="8" font-weight="600" fill="${color.text}" text-anchor="middle">${tier}</text>
    <!-- score bar track -->
    <rect x="12" y="38" width="120" height="4" rx="2" fill="#1E293B" opacity="0"/>
    <!-- score bar fill -->
    <rect x="${12 + tier.length * 6.5 + 16}" y="41" width="${Math.max(0, barW - tier.length * 6.5 - 16)}" height="3" rx="1.5" fill="${color.bg}" opacity="0.5"/>
    <!-- /100 -->
    <text x="208" y="50" font-family="'Segoe UI',system-ui,sans-serif" font-size="8" fill="#475569" text-anchor="end">/100</text>
  </g>
</svg>`;
}

function errorBadgeSvg(message: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="56">
  <rect width="220" height="56" rx="6" fill="#1E293B"/>
  <rect width="3" height="56" fill="#EF4444"/>
  <text x="12" y="20" font-family="system-ui" font-size="9" fill="#94A3B8">BLUE AGENT SCORE</text>
  <text x="12" y="38" font-family="system-ui" font-size="11" fill="#EF4444">${message.slice(0, 28)}</text>
</svg>`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ type: string; handle: string }> }
) {
  const { type, handle } = await params;

  const svgHeaders = {
    "Content-Type": "image/svg+xml",
    "Cache-Control": "public, max-age=3600, s-maxage=3600",
    "Access-Control-Allow-Origin": "*",
  };

  if (!["builder", "agent"].includes(type)) {
    return new Response(errorBadgeSvg("invalid type"), { headers: svgHeaders });
  }

  const apiKey = process.env.BANKR_API_KEY;
  if (!apiKey) {
    return new Response(errorBadgeSvg("no API key"), { headers: svgHeaders });
  }

  try {
    const decodedHandle = decodeURIComponent(handle);

    // Call internal score API
    const baseUrl = req.nextUrl.origin;
    const scoreUrl =
      type === "builder"
        ? `${baseUrl}/api/builder-score`
        : `${baseUrl}/api/agent-score`;

    const res = await fetch(scoreUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        type === "builder"
          ? { handle: decodedHandle }
          : { input: decodedHandle }
      ),
    });

    if (!res.ok) {
      return new Response(errorBadgeSvg("score unavailable"), { headers: svgHeaders });
    }

    const data = await res.json() as any;
    // builder-score uses `score`, agent-score web API uses `xp`
    const score = data.score ?? data.xp ?? 0;
    const tier  = data.tier  ?? "Bot";

    const svg = scoreBadgeSvg({
      label: type === "builder" ? "Builder" : "Agent",
      handle,
      score,
      tier,
    });

    return new Response(svg, { headers: svgHeaders });
  } catch {
    return new Response(errorBadgeSvg("error"), { headers: svgHeaders });
  }
}
