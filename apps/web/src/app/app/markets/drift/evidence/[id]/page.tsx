import Link from "next/link";
import { notFound } from "next/navigation";
import { readDraftSnapshot, validSnapshotId } from "@/lib/xdrafts/snapshots";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock draft evidence — Blue Agent" };

export default async function DraftEvidencePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validSnapshotId(id)) notFound();
  const p = await readDraftSnapshot(id);
  if (p.status === "miss") notFound();
  if (p.status === "error") return <p className="p-6 text-amber-400">Evidence storage is unavailable. Try again shortly.</p>;
  const s = p.value;
  return (
    <main className="h-full overflow-y-auto bg-[#050508] px-5 py-8 text-[#E2E8F0]">
      <div className="mx-auto max-w-[1000px] space-y-5">
        <Link href="/markets/drift" className="text-sm text-[#4FC3F7]">Back to Drift · Base 8453</Link>
        <h1 className="text-2xl font-semibold">The evidence behind this draft</h1>
        <p className="text-sm text-[#94A3B8]">Saved {s.generated_at}. Source observation: {s.evidence.as_of}. This is a historical snapshot, not a live quote.</p>
        <blockquote className="rounded-xl border border-[#1A1A2E] bg-[#0B0F1E] p-5 leading-relaxed">{s.text}</blockquote>
        <p className="text-sm">{s.evidence.method}</p>
        <p className="text-sm text-[#94A3B8]">Source: {s.evidence.source}. The inputs below preserve the tracked sample and reference times used for this draft.</p>
        <a href={`https://blueagent.dev/api/stocks/drafts/${id}`} className="block text-sm text-[#4FC3F7]">Open evidence JSON</a>
        <details className="rounded-xl border border-[#1A1A2E] p-4">
          <summary className="cursor-pointer">Inspect source inputs</summary>
          <pre className="mt-4 overflow-x-auto whitespace-pre text-xs text-[#94A3B8]">{JSON.stringify(s.evidence.inputs, null, 2)}</pre>
        </details>
      </div>
    </main>
  );
}
