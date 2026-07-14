import { NextRequest, NextResponse } from "next/server";
import { MASCOT_BASE64 } from "@/app/lib/mascot";

// ── Blue Render — cinematic scene generator cho BlueAgent mascot ──
// Mặc định dùng mascot hardcode; upload ảnh sẽ ghi đè cho lượt đó.
// Chain: Surplus (nano-banana-2-edit) → Venice (fallback)

const SURPLUS_URL = "https://api.surplusintelligence.ai/v1/chat/completions";
const SURPLUS_MODEL = "nano-banana-2-edit";

const VENICE_URL = "https://api.venice.ai/api/v1/image/edit";
const VENICE_MODEL = "nano-banana-2-edit";

// ── Base prompt v3 — thêm constraint CẤU TRÚC (đầu/thân tách biệt
// bằng khớp cổ) + constraint PHỦ ĐỊNH (liệt kê rõ những gì KHÔNG
// được thêm vào). Bản v2 chỉ mô tả tích cực nên khi pose lạ (sitting,
// action) model tự "vẽ thêm" tai to, visor liền khối để hợp lý hoá
// pose — cần cấm thẳng các lỗi đã quan sát được.
const BASE_PROMPT = `Re-render this character in a cinematic, painterly 3D style — think Pixar/Netflix concept art: soft atmospheric lighting, realistic metal and plastic material textures with subtle wear and scratches, shallow depth of field, volumetric light rays, painterly rendered environment.

CHARACTER STRUCTURE — lock this exact anatomy, no matter what the scene or pose calls for:
- TWO separate body parts connected by a visible short neck joint: (1) a round dome-shaped HEAD, and (2) a smaller rounded TORSO below it. The head and torso are never a single merged/continuous blob — there is always a visible neck segment between them, even when sitting, bending, or in action poses.
- Chibi proportions: head is roughly the same size as the whole body, torso and limbs are short and stubby. Never elongate into athletic or humanoid proportions.
- Head/face: smooth light-colored dome (white or pale blue-grey), with a thin teal/cyan accent line running across the top of the head. Two circular camera-lens eyes (metallic ring outer edge, glowing cyan/teal iris) positioned on the front of the face. A simple thin curved smile line below the eyes. NO other facial features.
- Antenna: one thin vertical rod on top of the head, topped with a small red ball.
- Torso: has a visible rectangular screen/panel on the chest with a soft teal glowing readout — this panel must remain visible in most compositions.
- Arms and legs: short and stubby, light grey with darker blue-grey joints at shoulders/hips/knees, rounded hands and feet.

EXPLICITLY DO NOT ADD, under any circumstances:
- Do NOT add ears, ear-like disks, or circular protrusions on the sides of the head.
- Do NOT turn the face into a solid dark/black visor — the face must stay light-colored with the two distinct lens eyes described above.
- Do NOT merge the head and torso into one continuous rounded shape — the neck joint must remain visible.
- Do NOT change the body's base color palette (no green, no dark colors as the primary body color) — body stays white/light-grey with cyan/teal accents only.

This must clearly read as the SAME character reimagined in high-fidelity cinematic 3D, not a redesign — verify the head-neck-torso structure and face details match before finalizing.

Scene direction: `;

// ── Rate limit nhẹ — tool nội bộ ───────────────────────────────────
const hits = new Map<string, { n: number; t: number }>();
const LIMIT = 30;
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

function extractImageB64(data: any): string | null {
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

async function renderSurplus(
  prompt: string,
  refImage: string,
  refMime: string
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
                image_url: { url: `data:${refMime};base64,${refImage}` },
              },
              { type: "text", text: prompt },
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
    if (b64) console.log("Rendered via: Surplus");
    return b64;
  } catch (e) {
    console.error("Surplus fetch error → Venice:", e);
    return null;
  }
}

async function renderVenice(
  prompt: string,
  refImage: string
): Promise<string | null> {
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
        prompt,
        image: refImage,
        aspect_ratio: "1:1",
        output_format: "png",
        safe_mode: false,
      }),
    });
    if (!res.ok) {
      console.error("Venice error:", res.status, await res.text());
      return null;
    }
    console.log(`Rendered via: Venice (${VENICE_MODEL})`);
    return Buffer.from(await res.arrayBuffer()).toString("base64");
  } catch (e) {
    console.error("Venice fetch error:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    if (!rateLimit(ip)) {
      return NextResponse.json(
        { error: "Daily limit reached." },
        { status: 429 }
      );
    }

    const { scene, image, mimeType } = await req.json();
    if (!scene || typeof scene !== "string" || scene.length > 500) {
      return NextResponse.json({ error: "Invalid scene prompt" }, { status: 400 });
    }

    const refImage: string =
      image && typeof image === "string" ? image : MASCOT_BASE64;
    const refMime: string = mimeType || "image/png";

    const fullPrompt = BASE_PROMPT + scene.trim();

    let b64 = await renderSurplus(fullPrompt, refImage, refMime);
    if (!b64) b64 = await renderVenice(fullPrompt, refImage);

    if (!b64) {
      return NextResponse.json(
        { error: "Render is overloaded — try again in a minute." },
        { status: 502 }
      );
    }

    return NextResponse.json({ image: b64 });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
