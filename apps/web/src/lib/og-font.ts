// Shared mono-font loader for OG images.
//
// Satori (next/og) has no built-in "monospace" — you must hand it real font
// data. We fetch JetBrains Mono (the Blue Agent UI font) as TTF from Google
// Fonts (an old User-Agent forces TTF; Satori can't parse WOFF2), cached per
// process. On any failure we return [] so the OG still renders in the default
// font instead of throwing.

type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

let cache: OgFont[] | null = null;

async function fetchTtf(weight: number): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(`https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@${weight}`, {
      headers: { "User-Agent": "Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)" },
    }).then(r => r.text());
    const url = css.match(/src:\s*url\((https:\/\/[^)]+\.ttf)\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then(r => r.arrayBuffer());
  } catch {
    return null;
  }
}

/** JetBrains Mono 400 + 700 for ImageResponse `fonts`. Empty array on failure. */
export async function getMonoFonts(): Promise<OgFont[]> {
  if (cache) return cache;
  const [regular, bold] = await Promise.all([fetchTtf(400), fetchTtf(700)]);
  const fonts: OgFont[] = [];
  if (regular) fonts.push({ name: "JetBrains Mono", data: regular, weight: 400, style: "normal" });
  if (bold)    fonts.push({ name: "JetBrains Mono", data: bold,    weight: 700, style: "normal" });
  cache = fonts;
  return fonts;
}

/** Verdict → accent color for the badge (LAUNCH/BUY green, WAIT/WATCH amber, ABORT/SKIP red). */
export function verdictColor(verdict: string): string {
  const v = verdict.toUpperCase();
  if (/(LAUNCH|BUY|GO|SHIP|STRONG|PASS\b)/.test(v)) return "#34D399";
  if (/(WAIT|WATCH|HOLD|NEUTRAL|REVISE|MAYBE)/.test(v)) return "#F59E0B";
  if (/(ABORT|SKIP|AVOID|NO|EXIT|FAIL|HIGH RISK)/.test(v)) return "#EF4444";
  return "#4FC3F7";
}
