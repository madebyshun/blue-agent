import { ImageResponse } from "next/og";
import { AGENT_TOOLS } from "@/lib/agent-tools";

export const runtime = "nodejs";
export const alt = "Blue Hub — AI agent tools for Base builders";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  const count = AGENT_TOOLS.filter(t => t.x402Url).length;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", flexDirection: "column",
          justifyContent: "center", backgroundColor: "#050508", padding: "72px",
          fontFamily: "monospace", color: "#fff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 34, fontWeight: 700, marginBottom: 28 }}>
          <span style={{ color: "#fff" }}>BLUE</span>
          <span style={{ color: "#A78BFA" }}>HUB</span>
        </div>
        <div style={{ display: "flex", fontSize: 82, fontWeight: 800, lineHeight: 1.05, maxWidth: "1050px" }}>
          {count} AI agent tools for Base builders
        </div>
        <div style={{ display: "flex", fontSize: 32, color: "#9aa0aa", marginTop: 28 }}>
          Pay per call in USDC · no subscription · no API key
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 40 }}>
          {[["Blue", "#4FC3F7"], ["Aeon", "#A78BFA"], ["MiroShark", "#34D399"]].map(([label, color]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", fontSize: 26, color, border: `2px solid ${color}55`, borderRadius: 999, padding: "8px 22px" }}>
              {label}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size }
  );
}
