import { ImageResponse } from "next/og";
import { AGENT_TOOLS } from "@/lib/agent-tools";

export const runtime = "nodejs";
export const alt = "Blue Hub tool";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ tool: string }> }) {
  const { tool } = await params;
  const t = AGENT_TOOLS.find(x => x.id === tool);
  const name = t?.name ?? "Blue Hub";
  const desc = t?.description ?? "AI agent tools for Base builders";
  const price = t?.price ?? "";
  const agents = t?.isComposite
    ? [["Blue", "#4FC3F7"], ["Aeon", "#A78BFA"], ["MiroShark", "#34D399"]]
    : t?.agentName === "Aeon" ? [["Aeon", "#A78BFA"]]
    : t?.agentName === "MiroShark" ? [["MiroShark", "#34D399"]]
    : [["Blue", "#4FC3F7"]];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "space-between", backgroundColor: "#050508", padding: "64px",
          fontFamily: "monospace", color: "#fff",
        }}
      >
        {/* Top: brand + price */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", fontSize: 30, fontWeight: 700 }}>
            <span style={{ color: "#fff" }}>BLUE</span>
            <span style={{ color: "#A78BFA" }}>HUB</span>
          </div>
          {price ? (
            <div style={{ display: "flex", fontSize: 28, color: "#4FC3F7", border: "2px solid #4FC3F7", borderRadius: 14, padding: "8px 20px" }}>
              {price} / run
            </div>
          ) : <div style={{ display: "flex" }} />}
        </div>

        {/* Middle: tool name + desc */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 76, fontWeight: 800, lineHeight: 1.05, color: "#fff", maxWidth: "1000px" }}>
            {name}
          </div>
          <div style={{ display: "flex", fontSize: 30, color: "#9aa0aa", marginTop: 24, maxWidth: "1000px", lineHeight: 1.35 }}>
            {desc.length > 140 ? desc.slice(0, 140) + "…" : desc}
          </div>
        </div>

        {/* Bottom: agents + tagline */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {agents.map(([label, color]) => (
              <div key={label} style={{ display: "flex", alignItems: "center", fontSize: 24, color, border: `2px solid ${color}55`, borderRadius: 999, padding: "6px 18px" }}>
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#6b6b7e" }}>
            Pay per call · USDC on Base · no API key
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
