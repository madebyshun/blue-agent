import { ImageResponse } from "next/og";
import { AGENT_TOOLS } from "@/lib/agent-tools";
import { getBrandFonts, brandFonts, C, BG_IMAGE } from "@/lib/og-font";

export const runtime = "nodejs";
export const alt = "Blue Hub tool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const fonts = await getBrandFonts();
  const f = brandFonts(fonts.length > 0);
  const t = AGENT_TOOLS.find(x => x.id === tool);
  const name = t?.name ?? "Blue Hub";
  const desc = t?.description ?? "AI agent tools for Base builders";
  const price = t?.price ?? "";
  const agents: [string, string][] = [["BlueAgent", C.cyan]];

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: C.bg, backgroundImage: BG_IMAGE, padding: "64px", fontFamily: f.display, color: C.white }}>
        {/* Top: brand + price */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
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

        {/* Middle: tool name + desc */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 74, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, color: C.white, maxWidth: "1000px" }}>{name}</div>
          <div style={{ display: "flex", fontSize: 30, color: C.muted, marginTop: 24, maxWidth: "1000px", lineHeight: 1.4 }}>{desc.length > 140 ? desc.slice(0, 140) + "…" : desc}</div>
        </div>

        {/* Bottom: agents + tagline */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {agents.map(([label, color]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", fontFamily: f.mono, fontSize: 23, color, border: `2px solid ${color}55`, borderRadius: 999, padding: "6px 18px" }}>{label}</div>
            ))}
          </div>
          <div style={{ display: "flex", fontFamily: f.mono, fontSize: 23, color: C.muted }}>Pay per call · USDC on Base · no API key</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
