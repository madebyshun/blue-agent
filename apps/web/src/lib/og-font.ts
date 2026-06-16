// Shared brand-font loader + design tokens for OG images.
//
// Satori (next/og) ships no usable web fonts — you must hand it real font data.
// We fetch the BlueAgent brand fonts as TTF from Google Fonts:
//   • DM Sans       — geometric display/body font (wordmark, headings)
//   • JetBrains Mono — code/data font (prices, scores, addresses, tags)
//
// GOTCHA: an *old* IE User-Agent makes Google return a `/l/font?kit=…` URL with
// no `.ttf` extension — the old regex missed it, so every OG silently fell back
// to Satori's default sans. A bare macOS UA returns a clean `…​.ttf
// format('truetype')` URL that Satori can parse. Cached per process; on any
// failure we return [] so the OG still renders (in the default font) instead of
// throwing.

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

// Modern desktop UA → Google serves TTF (not WOFF2, which Satori can't parse).
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)";

async function fetchTtf(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=${family}:wght@${weight}`, {
      headers: { "User-Agent": UA },
    }).then(r => r.text());
    // Prefer the explicit truetype src; fall back to any .ttf url.
    const url =
      css.match(/url\((https:\/\/[^)]+)\)\s*format\(['"]truetype['"]\)/)?.[1] ??
      css.match(/url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then(r => r.arrayBuffer());
  } catch {
    return null;
  }
}

let cache: OgFont[] | null = null;

/**
 * BlueAgent brand fonts for ImageResponse `fonts`: DM Sans 400/700 (display) +
 * JetBrains Mono 400/700 (code/data). Empty array on failure (OG still renders).
 */
export async function getBrandFonts(): Promise<OgFont[]> {
  if (cache) return cache;
  const specs: [name: string, family: string, weight: 400 | 700][] = [
    ["DM Sans", "DM+Sans", 400],
    ["DM Sans", "DM+Sans", 700],
    ["JetBrains Mono", "JetBrains+Mono", 400],
    ["JetBrains Mono", "JetBrains+Mono", 700],
  ];
  const datas = await Promise.all(specs.map(([, family, weight]) => fetchTtf(family, weight)));
  const fonts: OgFont[] = [];
  specs.forEach(([name, , weight], i) => {
    const data = datas[i];
    if (data) fonts.push({ name, data, weight, style: "normal" });
  });
  cache = fonts;
  return fonts;
}

/** Resolved font-family names — pass `loaded` (fonts.length > 0) to pick the brand font or a safe fallback. */
export function brandFonts(loaded: boolean) {
  return {
    display: loaded ? "DM Sans" : "sans-serif",   // wordmark, headings
    mono: loaded ? "JetBrains Mono" : "monospace", // prices, scores, tags
  };
}

// ── BlueAgent design tokens (mirrors the brand design system) ────────────────
export const C = {
  bg:        "#0A1628", // deep navy base
  surface:   "#0F1C35", // card/panel
  surfaceMid:"#162040", // elevated
  border:    "#1E3050",
  primary:   "#1A52FF", // electric cobalt
  cyan:      "#33C3FF", // bright cyan accent
  white:     "#FFFFFF",
  muted:     "#7A8FAE", // secondary/metadata
  success:   "#22C55E",
  warning:   "#F59E0B",
  danger:    "#EF4444",
  violet:    "#A78BFA", // Aeon
  green:     "#34D399", // MiroShark
} as const;

/** Subtle cobalt→cyan radial glow over the navy base (image-3 depth, no grid). */
export const BG_IMAGE =
  "radial-gradient(900px 520px at 100% 100%, rgba(26,82,255,0.28), transparent 62%), " +
  "radial-gradient(720px 420px at 0% 0%, rgba(51,195,255,0.10), transparent 58%)";

/** Verdict → accent color (LAUNCH/BUY green, WAIT/WATCH amber, ABORT/SKIP red, else cyan). */
export function verdictColor(verdict: string): string {
  const v = verdict.toUpperCase();
  if (/(LAUNCH|BUY|GO|SHIP|STRONG|PASS\b)/.test(v)) return C.success;
  if (/(WAIT|WATCH|HOLD|NEUTRAL|REVISE|MAYBE)/.test(v)) return C.warning;
  if (/(ABORT|SKIP|AVOID|NO|EXIT|FAIL|HIGH RISK)/.test(v)) return C.danger;
  return C.cyan;
}
