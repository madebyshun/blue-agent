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

function agentsOf(t?: { isComposite?: boolean; agentName?: string }): [string, string][] {
  if (t?.isComposite) return [["Blueagent", C.cyan], ["Aeon", C.violet], ["MiroShark", C.green]];
  if (t?.agentName === "Aeon") return [["Aeon", C.violet]];
  if (t?.agentName === "MiroShark") return [["MiroShark", C.green]];
  return [["Blueagent", C.cyan]];
}

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
  const desc = t?.description ?? "AI agent tools for Base builders";
  const price = t?.price ?? "";
  const agents = agentsOf(t);

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
          <div style={{ display: "flex", fontFamily: f.mono, fontSize: 23, color: C.muted }}>{verdict ? "3-agent consensus · Base" : "Pay per call · USDC on Base · no API key"}</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined },
  );
}
