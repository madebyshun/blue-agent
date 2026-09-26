// GET /api/og/hub-result?s=<shareId>
//
// Dynamic OG image for a shared Hub result. The file-based opengraph-image can't
// see ?s= (Next doesn't pass query strings to it), so /app/hub/[tool] sets its
// og:image to THIS route when a result is shared (see that page's
// generateMetadata). Reads the shared result from KV, renders the verdict +
// confidence; falls back to a static tool card when there's no verdict.

import { ImageResponse } from "next/og";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { kvGet } from "@/lib/kv";
import { getBrandFonts, brandFonts, verdictColor, C, BG_IMAGE } from "@/lib/og-font";

export const runtime = "nodejs";
const size = { width: 1200, height: 630 };

/* One badge, always. Aeon and MiroShark were retired 2026-09-27 (ShunTr).
   ⚠ This is the share card — the one version of the claim that LEAVES the site
   and gets embedded in someone else's feed, where nobody can check it against
   the catalog. Any over-claim here is the most expensive one in the codebase,
   which is why it has now been narrowed twice:
     • Until 2026-09-26 it keyed off `isComposite` and painted three persona
       badges on every composite tool. `isComposite` means multi-STEP, not
       multi-AGENT, and is true for 63 of 110 tools — including `gas-tracker`,
       `token-price` and `pool-scan`, single on-chain reads that never prompt
       an LLM at all. MEASURED: 59 of 110 cards rendered the wrong badge set,
       and all 59 erred the same direction. The branch could ADD a persona that
       never ran but could never DROP one that did — a bug that can only
       over-claim is not a bug you get to discover from user reports.
     • Then derived from `agentName`, mirroring the catalog so the two could
       not disagree. Correct, and moot once `agentName` became constant.
   Keep it a constant. If badges ever vary again, drive them from what the
   handler RAN, not from a catalog label. */
const AGENT_BADGES: [string, string][] = [["Blueagent", C.cyan]];

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("s") ?? "";
  const fonts = await getBrandFonts();
  const f = brandFonts(fonts.length > 0);

  type SharePayload = { toolId?: string; result?: Record<string, unknown> };
  let payload: SharePayload | null = null;
  if (/^[a-f0-9]{6,32}$/.test(id)) {
    payload = await kvGet<SharePayload>(`share:${id}`).catch(() => null);
  }

  const t = AGENT_TOOLS.find(x => x.id === payload?.toolId);
  const name = t?.name ?? "Blue Hub";
  // "for Base builders" until 2026-09-26 — the same one-chain framing corrected
  // in llms.txt and plugin.md. This is the fallback for an unknown/expired share
  // id, so it describes the Hub as a whole, which reads both chains.
  const desc = t?.description ?? "AI agent tools for onchain builders";
  const price = t?.price ?? "";
  const agents = AGENT_BADGES;

  const r = (payload?.result ?? {}) as Record<string, unknown>;
  const blue = (r.blue_agent ?? {}) as Record<string, unknown>;
  const verdictRaw = r.final_verdict ?? r.blue_verdict ?? r.verdict ?? blue.verdict ?? null;
  const verdict = typeof verdictRaw === "string" && verdictRaw.trim() ? verdictRaw.trim() : null;
  const confRaw = r.confidence ?? blue.score ?? null;
  const confidence = typeof confRaw === "number" ? Math.round(confRaw) : null;
  const vColor = verdict ? verdictColor(verdict) : C.cyan;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: C.bg, backgroundImage: BG_IMAGE, padding: "64px", fontFamily: f.display, color: C.white }}>
        {/* Top: brand + price */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* Logo mark: cobalt→cyan rounded square + pause bars */}
            <div style={{ display: "flex", width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${C.primary}, ${C.cyan})`, alignItems: "center", justifyContent: "center", gap: 6 }}>
              <div style={{ display: "flex", width: 8, height: 22, borderRadius: 3, backgroundColor: C.white }} />
              <div style={{ display: "flex", width: 8, height: 22, borderRadius: 3, backgroundColor: C.white }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", fontFamily: f.display, fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
              <span style={{ color: C.white }}>BLUEAGENT</span>
              <span style={{ color: C.muted, margin: "0 10px" }}>/</span>
              <span style={{ color: C.cyan }}>HUB</span>
            </div>
          </div>
          {price ? (
            <div style={{ display: "flex", fontFamily: f.mono, fontSize: 26, color: C.cyan, border: `2px solid ${C.cyan}`, borderRadius: 12, padding: "8px 20px" }}>{price} / run</div>
          ) : <div style={{ display: "flex" }} />}
        </div>

        {/* Middle: tool name + (verdict + confidence | description) */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, color: C.white, maxWidth: "1000px" }}>{name}</div>
          {verdict ? (
            <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 28 }}>
              <div style={{ display: "flex", alignItems: "center", fontFamily: f.mono, fontSize: 42, fontWeight: 700, color: vColor, border: `3px solid ${vColor}`, borderRadius: 14, padding: "10px 28px" }}>{verdict.toUpperCase()}</div>
              {confidence != null && (
                <div style={{ display: "flex", fontFamily: f.mono, fontSize: 34, color: C.muted }}>{confidence}<span style={{ display: "flex", color: "#52607a" }}>/100 confidence</span></div>
              )}
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 30, color: C.muted, marginTop: 24, maxWidth: "1000px", lineHeight: 1.4 }}>{desc.length > 140 ? desc.slice(0, 140) + "…" : desc}</div>
          )}
        </div>

        {/* Bottom: agents + tagline */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {agents.map(([label, color]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", fontFamily: f.mono, fontSize: 23, color, border: `2px solid ${color}55`, borderRadius: 999, padding: "6px 18px" }}>{label}</div>
            ))}
          </div>
          {/* Was `verdict ? "3-agent consensus · Base" : <payment line>`. That
              printed the exact Hub-wide phrasing api/catalog/route.ts retired,
              on ANY tool that returned a verdict — including the 76 that run
              the Blue persona alone. The badges to the left already say which
              personas ran, so the tagline does not need to restate a count, and
              restating it is how the count went wrong. The payment line is true
              of every tool on every card, so it is now unconditional. */}
          <div style={{ display: "flex", fontFamily: f.mono, fontSize: 23, color: C.muted }}>Pay per call · USDC on Base · no API key</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
