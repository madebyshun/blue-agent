import { createHash } from "node:crypto";
import { kvGetProbe, kvSetOrThrow, isKVEnabled } from "@/lib/kv";
import type { Draft } from "./compose";
import { STOCK_OBSERVATION_VERSION } from "../../../../../packages/core/src/stock-observations";

export const draftSnapshotKey = (id: string) => `stocks:draft:evidence:v1:${id}`;
export const validSnapshotId = (id: string) => /^[a-f0-9]{64}$/.test(id);

export function buildDraftSnapshot(d: Draft, now: Date) {
  if (!d.evidence) throw new Error("draft has no source evidence");
  if (d.problems.length) throw new Error("draft failed copy checks");
  const snapshot = {
    version: STOCK_OBSERVATION_VERSION,
    template_version: 2,
    chain: "base", chain_id: 8453,
    generated_at: now.toISOString(),
    kind: d.kind, text: d.text, shot: d.shot,
    evidence: d.evidence,
  };
  const id = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return { id, snapshot };
}

export async function saveDraftSnapshot(d: Draft, now: Date): Promise<string> {
  if (process.env.NODE_ENV === "production" && !isKVEnabled()) throw new Error("durable draft evidence storage unavailable");
  const { id, snapshot } = buildDraftSnapshot(d, now);
  // Content-addressed, no TTL: a later poll cannot change the published proof.
  // A failed write MUST stop draft delivery rather than create a broken link.
  await kvSetOrThrow(draftSnapshotKey(id), snapshot);
  return id;
}

export async function readDraftSnapshot(id: string) {
  return kvGetProbe<ReturnType<typeof buildDraftSnapshot>["snapshot"]>(draftSnapshotKey(id));
}
