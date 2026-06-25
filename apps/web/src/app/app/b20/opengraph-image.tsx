import { ImageResponse } from "next/og";
import { getBrandFonts, brandFonts, C, BG_IMAGE } from "@/lib/og-font";

export const runtime = "nodejs";
export const alt = "B20 Token Hub — BlueAgent";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const GREEN = "#34D399"; // Beryl / B20 accent

export default async function Image() {
  const fonts = await getBrandFonts();
  const f = brandFonts(fonts.length > 0);

  return new ImageResponse(
    (
      <div style={{
        width: "100%", height: "100%", display: "flex", flexDirection: "column",
        justifyContent: "space-between", backgroundColor: C.bg,
        backgroundImage: BG_IMAGE, padding: "64px",
        fontFamily: f.display, color: C.white,
      }}>
        {/* Top: brand + Beryl badge */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ display: "flex", width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${C.primary}, ${GREEN})`, alignItems: "center", justifyContent: "center", gap: 6 }}>
              <div style={{ display: "flex", width: 8, height: 22, borderRadius: 3, backgroundColor: C.white }} />
              <div style={{ display: "flex", width: 8, height: 22, borderRadius: 3, backgroundColor: C.white }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", fontFamily: f.display, fontSize: 30, fontWeight: 700, letterSpacing: 1 }}>
              <span style={{ color: C.white }}>BLUEAGENT</span>
              <span style={{ color: C.muted, margin: "0 10px" }}>/</span>
              <span style={{ color: GREEN }}>B20</span>
            </div>
          </div>
          <div style={{ display: "flex", fontFamily: f.mono, fontSize: 22, color: GREEN, border: `2px solid ${GREEN}55`, borderRadius: 12, padding: "8px 20px" }}>
            Base Beryl
          </div>
        </div>

        {/* Middle: title + description */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, color: C.white }}>
            B20 Token Hub
          </div>
          <div style={{ display: "flex", fontSize: 30, color: C.muted, marginTop: 24, maxWidth: "1000px", lineHeight: 1.4 }}>
            Launch, inspect &amp; manage Base Beryl tokens. Registry, roles, policies, supply caps — all on-chain.
          </div>
        </div>

        {/* Bottom: feature badges + tagline */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <div style={{ display: "flex", gap: 14 }}>
            {(["Scanner", "Registry", "Launch", "Manage"] as string[]).map((label) => (
              <div key={label} style={{ display: "flex", alignItems: "center", fontFamily: f.mono, fontSize: 22, color: GREEN, border: `2px solid ${GREEN}55`, borderRadius: 999, padding: "6px 18px" }}>
                {label}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", fontFamily: f.mono, fontSize: 22, color: C.muted }}>
            Zero LLM · Real on-chain data
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
