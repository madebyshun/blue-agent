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

/* 🔴 This keyed off `isComposite` until 2026-09-26 and painted three persona
   badges on every composite tool. `isComposite` means multi-STEP, not
   multi-AGENT — it is true for 63 of 110 tools, including `gas-tracker`,
   `token-price` and `pool-scan`, which are single on-chain reads that never
   prompt Aeon or MiroShark.
   MEASURED: 59 of 110 share cards rendered the wrong badge set, and every one
   of the 59 was an OVER-claim — the old branch could add a persona that never
   ran but could never drop one that did. This is the share card, so it is the
   version of the claim that leaves the site and gets embedded in a feed.
   Now derived from `agentName`, mirroring `agentsFor()` in api/catalog/route.ts
   so the badge set and the catalog's `agents` field cannot disagree. Real
   distribution: Blue-only 76, +Aeon 26, +MiroShark 4, all three 4.
   ⚠ These are PERSONAS — a system-prompt prefix plus an injected skill file on
   one Virtuals endpoint. Never re-word these badges into a "consensus" claim;
   see the note above agentsFor() for why that phrasing was retired. */
function agentsOf(t?: { agentName?: string }): [string, string][] {
  const n = (t?.agentName ?? "").toLowerCase();
  const out: [string, string][] = [["Blueagent", C.cyan]];
  if (n.includes("aeon")) out.push(["Aeon", C.violet]);
  if (n.includes("miroshark")) out.push(["MiroShark", C.green]);
  return out;
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
  // "for Base builders" until 2026-09-26 — the same one-chain framing corrected
  // in llms.txt and plugin.md. This is the fallback for an unknown/expired share
  // id, so it describes the Hub as a whole, which reads both chains.
  const desc = t?.description ?? "AI agent tools for onchain builders";
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
