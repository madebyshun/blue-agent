import { ImageResponse } from "next/og";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { getBrandFonts, brandFonts, C, BG_IMAGE } from "@/lib/og-font";

export const runtime = "nodejs";
export const alt = "Blue Agent Markets — every stock token on Base, read live";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card for /markets. The count is the synced catalog's length, so the
// card moves with the list and never carries a number the page doesn't. One
// square per listed stock token; no other figure is drawn, because a share
// card is cached by every platform that reads it and a live price would age.
export default async function Image() {
  const count = COINBASE_BASE_STOCKS.length;
  const fonts = await getBrandFonts();
  const f = brandFonts(fonts.length > 0);
  const COLS = 29;
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: C.bg, backgroundImage: BG_IMAGE, padding: "60px 64px", fontFamily: f.display, color: C.white }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: 600 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", width: 52, height: 52, borderRadius: 15, background: `linear-gradient(135deg, ${C.primary}, ${C.cyan})`, alignItems: "center", justifyContent: "center", gap: 6 }}>
              <div style={{ display: "flex", width: 8, height: 20, borderRadius: 3, backgroundColor: C.white }} />
              <div style={{ display: "flex", width: 8, height: 20, borderRadius: 3, backgroundColor: C.white }} />
            </div>
            <div style={{ display: "flex", fontFamily: f.mono, fontSize: 24, letterSpacing: 4, color: C.muted }}>BLUE AGENT MARKETS</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1 }}>The market</div>
            <div style={{ display: "flex", fontSize: 64, fontWeight: 700, lineHeight: 1.05, letterSpacing: -1, color: C.cyan }}>never closes.</div>
            <div style={{ display: "flex", fontSize: 26, color: C.muted, marginTop: 22, lineHeight: 1.35 }}>Every stock token on Base, priced from its own pool, with the gap to its oracle and a graded weekend lab.</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {["Board", "Oracle drift", "Weekend lab", "Coverage"].map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", height: 42, flexShrink: 0, whiteSpace: "nowrap", fontFamily: f.mono, fontSize: 18, color: C.cyan, border: `2px solid ${C.cyan}55`, borderRadius: 999, padding: "0 14px" }}>{t}</div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 40, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <div style={{ display: "flex", fontFamily: f.mono, fontSize: 96, fontWeight: 700, letterSpacing: -3 }}>{count}</div>
            <div style={{ display: "flex", fontSize: 24, color: C.muted }}>stock tokens</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", width: COLS * 15, gap: 3, marginTop: 18 }}>
            {Array.from({ length: count }, (_, i) => (
              <div key={i} style={{ display: "flex", width: 12, height: 12, borderRadius: 3, backgroundColor: C.cyan, opacity: 0.55 }} />
            ))}
          </div>
          <div style={{ display: "flex", fontFamily: f.mono, fontSize: 22, color: C.muted, marginTop: 22 }}>app.blueagent.dev/markets</div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined }
  );
}
