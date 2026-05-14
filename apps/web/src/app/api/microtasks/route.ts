import { NextRequest, NextResponse } from "next/server";
import { loadTasks, createTask } from "@/lib/micro-storage";
import { MAX_MICROTASK_REWARD, MIN_MICROTASK_REWARD } from "@/lib/micro-types";
import type { MicroPlatform, MicroProof, MicroApproval } from "@/lib/micro-types";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const platform = searchParams.get("platform");
  const status = searchParams.get("status");
  const proof = searchParams.get("proof");
  const sort = searchParams.get("sort") ?? "created_at";
  const limit = parseInt(searchParams.get("limit") ?? "50", 10);

  let tasks = loadTasks();

  if (platform) tasks = tasks.filter((t) => t.platform === platform);
  if (status) {
    tasks = tasks.filter((t) => t.status === status);
  } else {
    tasks = tasks.filter((t) => t.status === "open" || t.status === "active");
  }
  if (proof) tasks = tasks.filter((t) => t.proof_required === proof);

  tasks.sort((a, b) => {
    if (sort === "reward") return b.reward_per_slot - a.reward_per_slot;
    if (sort === "deadline") return a.deadline.localeCompare(b.deadline);
    if (sort === "slots") return b.slots_remaining - a.slots_remaining;
    return b.created_at.localeCompare(a.created_at);
  });

  tasks = tasks.slice(0, Math.min(limit, 100));

  return NextResponse.json({ tasks });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      title, description, platform, proof_required, must_mention,
      reward_per_slot, slots_total, approval_mode, deadline,
      creator_address, creator_handle,
    } = body;

    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    if (!description?.trim()) return NextResponse.json({ error: "description required" }, { status: 400 });

    const reward = parseFloat(reward_per_slot);
    if (isNaN(reward) || reward < MIN_MICROTASK_REWARD || reward > MAX_MICROTASK_REWARD) {
      return NextResponse.json(
        { error: `Reward must be between $${MIN_MICROTASK_REWARD} and $${MAX_MICROTASK_REWARD}` },
        { status: 400 }
      );
    }

    const slots = parseInt(slots_total, 10);
    if (isNaN(slots) || slots < 1 || slots > 100) {
      return NextResponse.json({ error: "Slots must be 1–100" }, { status: 400 });
    }

    if (!deadline?.match(/^\d{4}-\d{2}-\d{2}$/) || new Date(deadline) < new Date()) {
      return NextResponse.json({ error: "Deadline must be a future date (YYYY-MM-DD)" }, { status: 400 });
    }

    const VALID_PLATFORMS: MicroPlatform[] = ["x", "farcaster", "telegram", "web"];
    const VALID_PROOFS: MicroProof[] = ["reply", "quote", "screenshot", "url", "video", "text"];
    const VALID_APPROVALS: MicroApproval[] = ["auto", "manual", "hybrid"];

    if (!VALID_PLATFORMS.includes(platform)) {
      return NextResponse.json({ error: `Invalid platform` }, { status: 400 });
    }
    if (!VALID_PROOFS.includes(proof_required)) {
      return NextResponse.json({ error: `Invalid proof type` }, { status: 400 });
    }
    if (!VALID_APPROVALS.includes(approval_mode)) {
      return NextResponse.json({ error: `Invalid approval mode` }, { status: 400 });
    }

    const task = createTask({
      title: title.trim(),
      description: description.trim(),
      creator_address: creator_address ?? "0x" + "0".repeat(40),
      creator_handle: creator_handle?.replace(/^@/, ""),
      platform,
      proof_required,
      must_mention: must_mention?.replace(/^@/, "") || undefined,
      reward_per_slot: reward,
      slots_total: slots,
      approval_mode,
      deadline,
    });

    return NextResponse.json({ task }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}
