// One share-card layout for the app pages (ShunTr 2026-11-18: "OG image for
// all 6 groups"). Same frame as /markets' card (#557): brand row, a two-line
// headline, a sentence, pills; the right column is the page's own object.
//
// No live price, record or count that moves by the hour goes on a card:
// X, Telegram and Discord cache a card for days, so a number drawn here is
// a number that will be wrong where people read it. Fixed facts only
// (a ticker, a job's own budget, an agent's name).
import { ImageResponse } from "next/og";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getBrandFonts, brandFonts, C, BG_IMAGE } from "@/lib/og-font";

export const OG_SIZE = { width: 1200, height: 630 };

export interface CardSpec {
  kicker: string;
  a: string;
  b: string;
  sub: string;
  pills?: string[];
  right?: (f: ReturnType<typeof brandFonts>) => ReactNode;
  foot?: string;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export async function renderCard(s: CardSpec) {
  const fonts = await getBrandFonts();
  const f = brandFonts(fonts.length > 0);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: C.bg, backgroundImage: BG_IMAGE, padding: "60px 64px", fontFamily: f.display, color: C.white }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: s.right ? 620 : 1072 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ display: "flex", width: 52, height: 52, borderRadius: 15, background: `linear-gradient(135deg, ${C.primary}, ${C.cyan})`, alignItems: "center", justifyContent: "center", gap: 6 }}>
              <div style={{ display: "flex", width: 8, height: 20, borderRadius: 3, backgroundColor: C.white }} />
              <div style={{ display: "flex", width: 8, height: 20, borderRadius: 3, backgroundColor: C.white }} />
            </div>
            <div style={{ display: "flex", fontFamily: f.mono, fontSize: 22, letterSpacing: 4, color: C.muted }}>{s.kicker}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700, lineHeight: 1.06, letterSpacing: -1 }}>{clip(s.a, 34)}</div>
            <div style={{ display: "flex", fontSize: 60, fontWeight: 700, lineHeight: 1.06, letterSpacing: -1, color: C.cyan }}>{clip(s.b, 34)}</div>
            <div style={{ display: "flex", fontSize: 25, color: C.muted, marginTop: 22, lineHeight: 1.35 }}>{clip(s.sub, 150)}</div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {(s.pills ?? []).map((t) => (
              <div key={t} style={{ display: "flex", alignItems: "center", height: 42, flexShrink: 0, whiteSpace: "nowrap", fontFamily: f.mono, fontSize: 18, color: C.cyan, border: `2px solid ${C.cyan}55`, borderRadius: 999, padding: "0 14px" }}>{t}</div>
            ))}
          </div>
        </div>
        {s.right && (
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", marginLeft: 40, flex: 1 }}>
            {s.right(f)}
            <div style={{ display: "flex", fontFamily: f.mono, fontSize: 20, color: C.muted, marginTop: 24 }}>{s.foot ?? "app.blueagent.dev"}</div>
          </div>
        )}
      </div>
    ),
    { ...OG_SIZE, fonts: fonts.length ? fonts : undefined },
  );
}

/** Ticker chips for a right column. */
export function Chips({ items, f }: { items: string[]; f: ReturnType<typeof brandFonts> }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 10, width: 440 }}>
      {items.map((t) => (
        <div key={t} style={{ display: "flex", fontFamily: f.mono, fontSize: 22, fontWeight: 700, color: C.white, backgroundColor: `${C.cyan}22`, border: `1px solid ${C.cyan}44`, borderRadius: 10, padding: "8px 14px" }}>{t}</div>
      ))}
    </div>
  );
}

/**
 * openGraph + twitter for a page with its own card. Both must be set on the
 * page: the root layout's `images` otherwise win (layout.tsx header), and a
 * partial `openGraph` would drop the root's url/siteName.
 * `path` is the app-host path ("/markets/weekend"); the card is served under
 * /app on blueagent.dev, which redirects to the app host.
 */
export function pageMeta(path: string, title: string, description: string): Metadata {
  const image = `/app${path}/opengraph-image`;
  return {
    title,
    description,
    openGraph: { title, description, type: "website", siteName: "Blue Agent", url: `https://app.blueagent.dev${path}`, images: [{ url: image, width: 1200, height: 630, alt: title }] },
    twitter: { card: "summary_large_image", title, description, site: "@blueagent_", creator: "@blueagent_", images: [image] },
  };
}
