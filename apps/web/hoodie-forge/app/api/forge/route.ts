import { NextRequest, NextResponse } from "next/server";

// ── Blue Forge — bản TEST model rẻ ────────────────────────────────
// Đặt ở: app/api/forge/route.ts
//
// Chain: Surplus (chợ đang chết) → Venice nano-banana-2-edit (RẺ, ~nửa giá Pro)
// Test xong nếu 2-edit không đạt → sửa dòng VENICE_MODEL bên dưới thành
// "seedream-v4-edit" (rẻ hơn nữa) hoặc quay lại "nano-banana-pro-edit".
//
// Env cần có (.env.local):
//   SURPLUS_API_KEY=inf_...
//   VENICE_API_KEY=VENICE_INFERENCE_KEY_...
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_KEY=eyJ...

const SURPLUS_URL = "https://api.surplusintelligence.ai/v1/chat/completions";
const SURPLUS_MODEL = "nano-banana-2-edit";

const VENICE_URL = "https://api.venice.ai/api/v1/image/edit";
const VENICE_MODEL = "nano-banana-2-edit"; // ← ĐỔI MODEL TEST Ở DÒNG NÀY

const HOODIE_PROMPT = `Edit this image with MINIMAL changes: add a pullover hoodie in dark forest green (hex #4F6A35, muted moss green) with the hood up, worn naturally over the subject's existing clothing area.

This is a clothing-only edit, NOT a redraw:
- Treat everything outside the clothing area as locked pixels: face, eyes, hair, expression, skin, accessories, held objects, pose, body proportions and the entire background must remain pixel-identical to the original
- Do not reinterpret, restyle or redraw the character — the original artwork must stay recognizable as the exact same image, only with a hoodie added
- Match the hoodie rendering to the original art style precisely: same line weight, same shading technique, same color treatment, same resolution (pixel art stays the same pixel grid, photo stays photorealistic)
- The hoodie fits naturally on the torso only, normal fit, arms and hands fully visible
- Plain hoodie: no logos, no text. Drawstrings and kangaroo pocket visible
- Square output, same composition and framing as the original

Return the edited image.`;

// ── Rate limit: 2 / IP / 24h (bypass khi dev local) ───────────────
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 2;
const WINDOW = 1000 * 60 * 60 * 24;

function rateLimit(ip: string): boolean {
  if (process.env.NODE_ENV === "development") return true;
  const now = Date.now();
  const rec = hits.get(ip);
  if (!rec || now - rec.t > WINDOW) {
    hits.set(ip, { n: 1, t: now });
    return true;
  }
  if (rec.n >= LIMIT) return false;
  rec.n++;
  return true;
}

type ImagePart = {
  image_url?: { url?: string };
  url?: string;
  type?: string;
  data?: string;
};
type ChatMessage = {
  images?: ImagePart[];
  content?: string | ImagePart[];
};
type ChatResponse = { choices?: [{ message?: ChatMessage }] };

function extractImageB64(data: ChatResponse): string | null {
  const msg = data?.choices?.[0]?.message;
  if (!msg) return null;
  const fromDataUrl = (s: string) => {
    const m = s.match(/data:image\/[a-zA-Z]+;base64,([A-Za-z0-9+/=]+)/);
    return m ? m[1] : null;
  };
  if (Array.isArray(msg.images) && msg.images.length > 0) {
    const u = msg.images[0]?.image_url?.url ?? msg.images[0]?.url;
    if (typeof u === "string") {
      const b64 = fromDataUrl(u);
      if (b64) return b64;
    }
  }
  if (Array.isArray(msg.content)) {
    for (const part of msg.content) {
      const u = part?.image_url?.url ?? part?.url;
      if (typeof u === "string") {
        const b64 = fromDataUrl(u);
        if (b64) return b64;
      }
      if (part?.type === "image" && typeof part?.data === "string")
        return part.data;
    }
  }
  if (typeof msg.content === "string") {
    const b64 = fromDataUrl(msg.content);
    if (b64) return b64;
  }
  return null;
}

// ── Tầng 1: Surplus ───────────────────────────────────────────────
async function forgeSurplus(
  image: string,
  mime: string
): Promise<string | null> {
  if (!process.env.SURPLUS_API_KEY) return null;
  try {
    const res = await fetch(SURPLUS_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SURPLUS_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: SURPLUS_MODEL,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mime};base64,${image}` },
              },
              { type: "text", text: HOODIE_PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("Surplus down → Venice:", res.status, await res.text());
      return null;
    }
    const b64 = extractImageB64(await res.json());
    if (b64) console.log("Forged via: Surplus");
    return b64;
  } catch (e) {
    console.error("Surplus fetch error → Venice:", e);
    return null;
  }
}

// ── Tầng 2: Venice (model rẻ) ─────────────────────────────────────
async function forgeVenice(image: string): Promise<string | null> {
  if (!process.env.VENICE_API_KEY) return null;
  try {
    const res = await fetch(VENICE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.VENICE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VENICE_MODEL,
        prompt: HOODIE_PROMPT,
        image,
        aspect_ratio: "1:1",
        output_format: "png",
        safe_mode: false,
      }),
    });
    if (!res.ok) {
      console.error("Venice error:", res.status, await res.text());
      return null;
    }
    console.log(`Forged via: Venice (${VENICE_MODEL})`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (e) {
    console.error("Venice fetch error:", e);
    return null;
  }
}

// ── Lưu gallery (Supabase) ────────────────────────────────────────
// Uploads forged image + original (for the before/after slider), then inserts
// a row. If the schema doesn't have `original_url` yet, we retry the insert
// without it — safe to run before the migration lands.
//
// SQL migration once:
//   ALTER TABLE forges ADD COLUMN original_url text;
async function uploadToStorage(
  base: string,
  key: string,
  path: string,
  bytes: Uint8Array,
  mime: string
): Promise<string | null> {
  const up = await fetch(`${base}/storage/v1/object/forges/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": mime,
      "x-upsert": "true",
    },
    body: bytes as unknown as BodyInit,
  });
  if (!up.ok) {
    console.error("Storage upload failed:", path, up.status, await up.text());
    return null;
  }
  return `${base}/storage/v1/object/public/forges/${path}`;
}

async function saveToGallery(
  forgedB64: string,
  originalB64: string,
  originalMime: string,
  serial: string
) {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return;
  try {
    const forgedUrl = await uploadToStorage(
      base,
      key,
      `${serial}.png`,
      Buffer.from(forgedB64, "base64"),
      "image/png"
    );
    if (!forgedUrl) return;

    const ext = originalMime.includes("jpeg")
      ? "jpg"
      : originalMime.includes("webp")
      ? "webp"
      : "png";
    const originalUrl = await uploadToStorage(
      base,
      key,
      `originals/${serial}.${ext}`,
      Buffer.from(originalB64, "base64"),
      originalMime
    );

    const insert = async (body: Record<string, string>) =>
      fetch(`${base}/rest/v1/forges`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify(body),
      });

    const row: Record<string, string> = { serial, url: forgedUrl };
    if (originalUrl) row.original_url = originalUrl;
    let ins = await insert(row);
    if (!ins.ok && originalUrl) {
      // Column likely missing — retry without it so the forge still appears.
      console.warn(
        "Gallery insert with original_url failed, retrying without:",
        ins.status
      );
      ins = await insert({ serial, url: forgedUrl });
    }
    if (!ins.ok)
      console.error("Gallery insert failed:", ins.status, await ins.text());
  } catch (e) {
    console.error("Gallery save error:", e);
  }
}

// ── Handler ───────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: "Daily limit reached — come back tomorrow." },
        { status: 429 }
      );
    }

    const { image, mimeType } = await req.json();
    if (!image || typeof image !== "string" || image.length > 8_000_000) {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }
    const mime = mimeType || "image/png";

    let b64 = await forgeSurplus(image, mime);
    if (!b64) b64 = await forgeVenice(image);

    if (!b64) {
      return NextResponse.json(
        { error: "Forge is overloaded — try again in a minute." },
        { status: 502 }
      );
    }

    const serial = `BF-${String(Math.floor(Math.random() * 100000)).padStart(5, "0")}`;
    await saveToGallery(b64, image, mime, serial);

    return NextResponse.json({ image: b64, serial });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
