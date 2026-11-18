import { renderCard, OG_SIZE } from "@/lib/og-card";
import { COINBASE_BASE_STOCKS } from "@/lib/base-stocks/coinbase-list";
import { C } from "@/lib/og-font";

export const runtime = "nodejs";
export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "Stock token on Blue Agent Markets";

// The token's identity only (ticker, name, logo, contract): no price.
export default async function Image({ params }: { params: Promise<{ chain: string; address: string }> }) {
  const { chain, address } = await params;
  const s = chain === "base" ? COINBASE_BASE_STOCKS.find((x) => x.token.toLowerCase() === address.toLowerCase()) : undefined;
  const chainName = chain === "base" ? "Base" : chain === "robinhood" ? "Robinhood Chain" : chain;
  const short = `${address.slice(0, 6)}…${address.slice(-4)}`;
  return renderCard({
    kicker: "BLUE AGENT MARKETS",
    a: s ? s.symbol : short,
    b: s ? s.name : `on ${chainName}`,
    sub: `${s ? `${s.name} stock token` : "Token"} on ${chainName}: candles from its own pool, every pool it trades in, recent trades and on-chain facts.`,
    pills: [chainName, "Pool candles", "On-chain facts"],
    right: (f) => (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 20 }}>
        {s?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={s.image} width={180} height={180} style={{ borderRadius: 90 }} alt="" />
        ) : (
          <div style={{ display: "flex", width: 180, height: 180, borderRadius: 90, backgroundColor: `${C.cyan}33`, alignItems: "center", justifyContent: "center", fontFamily: f.mono, fontSize: 48, fontWeight: 700 }}>{(s?.ticker ?? "?").slice(0, 4)}</div>
        )}
        <div style={{ display: "flex", fontFamily: f.mono, fontSize: 24, color: C.muted }}>{short}</div>
      </div>
    ),
    foot: "app.blueagent.dev/markets",
  });
}
