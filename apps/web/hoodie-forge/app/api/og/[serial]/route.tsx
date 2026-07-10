import { ImageResponse } from "next/og";

export const runtime = "edge";

const SIZE = { width: 1200, height: 630 };

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ serial: string }> }
) {
  const { serial } = await ctx.params;
  const supa = process.env.SUPABASE_URL;
  const forgedUrl = supa
    ? `${supa}/storage/v1/object/public/forges/${serial}.png`
    : "";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#050508",
          color: "#EDEDF2",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
          padding: 48,
          gap: 48,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                color: "#EDEDF2",
                letterSpacing: 4,
                fontSize: 20,
              }}
            >
              <span style={{ color: "#0052FF", fontSize: 24 }}>■</span>
              <span>BLUEAGENT</span>
            </div>
            <div
              style={{
                color: "#4A4A55",
                letterSpacing: 4,
                fontSize: 16,
                marginTop: 4,
              }}
            >
              {"// BLUE FORGE · 0.1"}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div
              style={{
                fontSize: 90,
                fontWeight: 700,
                lineHeight: 1,
                color: "#EDEDF2",
                letterSpacing: -2,
              }}
            >
              Hood up.
            </div>
            <div
              style={{
                fontSize: 90,
                fontWeight: 700,
                lineHeight: 1,
                color: "#0052FF",
                letterSpacing: -2,
              }}
            >
              Stay based.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ color: "#4A4A55", letterSpacing: 4, fontSize: 16 }}>
              FORGE ID
            </div>
            <div
              style={{
                color: "#0052FF",
                fontSize: 44,
                letterSpacing: 2,
              }}
            >
              {serial}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            width: 500,
            height: 500,
            alignSelf: "center",
            border: "2px solid #1A1A22",
            background: "#0A0A10",
          }}
        >
          {forgedUrl && (
            <img
              src={forgedUrl}
              width={500}
              height={500}
              style={{ objectFit: "cover" }}
            />
          )}
        </div>
      </div>
    ),
    SIZE
  );
}
