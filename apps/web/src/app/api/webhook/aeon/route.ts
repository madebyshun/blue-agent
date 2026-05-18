// app/api/webhook/aeon/route.ts
// Receives Aeon skill outputs via A2A gateway or webhook notify
// Aaron configures Aeon to POST here after each relevant skill run

import { NextRequest, NextResponse } from "next/server";
import { storeAeonOutput, type AeonOutput } from "@/lib/aeon-cache";

const AEON_WEBHOOK_SECRET = process.env.AEON_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  // Optional: verify shared secret
  if (AEON_WEBHOOK_SECRET) {
    const secret = req.headers.get("x-aeon-secret") ?? req.headers.get("authorization");
    if (secret !== AEON_WEBHOOK_SECRET && secret !== `Bearer ${AEON_WEBHOOK_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  let body: Partial<AeonOutput>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate required fields
  const { id, skill, output, quality_score, timestamp } = body;
  if (!id || !skill || !output || quality_score == null || !timestamp) {
    return NextResponse.json(
      { error: "Missing required fields: id, skill, output, quality_score, timestamp" },
      { status: 400 }
    );
  }

  const aeonOutput: AeonOutput = {
    id,
    skill,
    output,
    quality_score,
    flags:          body.flags,
    source_repo:    body.source_repo,
    timestamp,
    notify_channel: body.notify_channel,
  };

  storeAeonOutput(aeonOutput);

  console.log(`[Aeon webhook] skill=${skill} quality=${quality_score} id=${id}`);

  return NextResponse.json({
    ok: true,
    received: { id, skill, quality_score, timestamp },
    actionable: quality_score >= 3 && (body.flags?.includes("actionable") ?? true),
  });
}

// GET — health check + view cached outputs (dev only)
export async function GET() {
  const { getAllAeonOutputs } = await import("@/lib/aeon-cache");
  const outputs = getAllAeonOutputs();
  return NextResponse.json({
    endpoint: "blueagent.dev/api/webhook/aeon",
    cached_outputs: outputs.length,
    outputs,
  });
}
