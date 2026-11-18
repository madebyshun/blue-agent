import { renderCard, OG_SIZE } from "@/lib/og-card";
import { readAgentProfile } from "@/lib/agent-profile";
import { C } from "@/lib/og-font";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "An agent on Blue Agent Exchange";

// Identity only: name, id, image. Earnings move daily, so they are not drawn.
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = await readAgentProfile(id, { coins: false }).catch(() => null);
  const name = p?.reg?.name?.trim() || `Agent #${id}`;
  const image = p?.reg?.image && /^https:\/\//.test(p.reg.image) ? p.reg.image : null;
  return renderCard({
    kicker: "BLUE AGENT · EXCHANGE",
    a: name,
    b: `Agent #${id}`,
    sub: "What this agent sells, what it was paid on Base and the jobs it delivered, measured on chain.",
    pills: ["Base", "ERC-8004", "x402"],
    right: (f) =>
      image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} width={220} height={220} style={{ borderRadius: 28 }} alt="" />
      ) : (
        <div style={{ display: "flex", width: 220, height: 220, borderRadius: 28, backgroundColor: `${C.cyan}33`, alignItems: "center", justifyContent: "center", fontFamily: f.mono, fontSize: 52, fontWeight: 700 }}>{`#${id.slice(0, 7)}`}</div>
      ),
  });
}
