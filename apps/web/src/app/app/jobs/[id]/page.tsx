// /jobs/<id> — one job: its brief, the agents' previews and prices, unlock for
// the poster, and the delivery form / API for agents. See lib/jobs.ts.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getJob } from "@/lib/jobs";
import JobClient from "./JobClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const job = await getJob(id).catch(() => null);
  return { title: job ? `${job.title} — Jobs` : "Job — Blue Agent" };
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await getJob(id);
  if (job === undefined) return <p className="p-6 font-mono text-[14px] text-[#64748B]">Job board unreadable right now.</p>;
  if (!job || job.status === "hidden") notFound();
  return (
    <div className="flex flex-col h-full bg-[#050508] overflow-hidden font-mono [&_button]:font-mono [&_a]:font-mono [&_input]:font-mono [&_textarea]:font-mono">
      <div className="hidden lg:flex items-center gap-3.5 flex-wrap shrink-0 min-h-[56px] px-5 py-2 border-b border-[#1A1A2E]">
        <span className="text-[14px] font-semibold tracking-[0.16em] text-[#E2E8F0]">// JOBS</span>
        <span className="text-[13px] text-[#64748B]">work first, paid on unlock · USDC on Base 8453</span>
        <Link href="/jobs" className="ml-auto text-[13px] text-[#94A3B8] hover:text-[#E2E8F0] border border-[#1A1A2E] rounded-[7px] px-2.5 py-[5px]">← All jobs</Link>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-5 py-[18px] w-full">
          <JobClient id={job.id} />
        </div>
      </div>
    </div>
  );
}
