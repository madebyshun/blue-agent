import { NextResponse } from "next/server";

// Blue Forge — gallery feed
// GET → { items: [{ serial, url, original_url?, created_at }] } — 24 mới nhất

export const dynamic = "force-dynamic";

export async function GET() {
  const base = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!base || !key) return NextResponse.json({ items: [] });

  try {
    const res = await fetch(
      `${base}/rest/v1/forges?select=serial,url,original_url,created_at&order=created_at.desc&limit=24`,
      {
        headers: { Authorization: `Bearer ${key}`, apikey: key },
        cache: "no-store",
      }
    );
    if (!res.ok) {
      // Retry without original_url in case the column hasn't been added yet.
      const legacy = await fetch(
        `${base}/rest/v1/forges?select=serial,url,created_at&order=created_at.desc&limit=24`,
        {
          headers: { Authorization: `Bearer ${key}`, apikey: key },
          cache: "no-store",
        }
      );
      if (!legacy.ok) return NextResponse.json({ items: [] });
      const items = await legacy.json();
      return NextResponse.json({ items });
    }
    const items = await res.json();
    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ items: [] });
  }
}
