"use client";

import Link from "next/link";
import type { MicroTask } from "@/lib/micro-types";
import { MAX_MICROTASK_REWARD, PLATFORM_LABELS, PROOF_LABELS } from "@/lib/micro-types";
import {
  MicroStatusBadge,
  MicroApprovalBadge,
  MicroEscrowBadge,
  MicroPlatformBadge,
  MicroProofBadge,
  MicroSlotsBadge,
} from "./MicroStatusBadge";

interface Props {
  task: MicroTask;
  onAccept?: (taskId: string) => void;
  accepting?: boolean;
}

function daysUntil(deadline: string): string {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return "expired";
  if (diff === 0) return "today";
  if (diff === 1) return "1 day";
  return `${diff}d`;
}

export function MicroTaskCard({ task, onAccept, accepting }: Props) {
  const isOverLimit = task.reward_per_slot > MAX_MICROTASK_REWARD;
  const canAccept = task.slots_remaining > 0 &&
    (task.status === "open" || task.status === "active");

  return (
    <div className="card-surface rounded-xl p-4 border border-[#1A1A2E] hover:border-[#4FC3F7]/30 transition-all duration-300 group relative">
      {/* Oversize warning */}
      {isOverLimit && (
        <div className="mb-3 text-[10px] font-mono text-yellow-400 bg-yellow-400/10 border border-yellow-400/20 rounded px-2 py-1">
          ⚠ Task above $20 — consider gig marketplace
        </div>
      )}

      {/* Top row: status + reward */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex flex-wrap gap-1.5 items-center">
          <MicroStatusBadge status={task.status} />
          <MicroPlatformBadge platform={task.platform} />
          <MicroApprovalBadge mode={task.approval_mode} />
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-mono font-bold text-lg text-white leading-none">
            ${task.reward_per_slot.toFixed(2)}
          </div>
          <div className="font-mono text-[10px] text-slate-600 mt-0.5">per slot</div>
        </div>
      </div>

      {/* Title */}
      <Link href={`/micro/${task.id}`} className="block mb-3 group/title">
        <h3 className="font-mono text-sm text-slate-200 leading-snug group-hover/title:text-[#4FC3F7] transition-colors line-clamp-2">
          {task.title}
        </h3>
      </Link>

      {/* Meta row */}
      <div className="flex flex-wrap gap-1.5 items-center mb-3">
        <MicroSlotsBadge remaining={task.slots_remaining} total={task.slots_total} />
        <MicroProofBadge proof={task.proof_required} />
        <MicroEscrowBadge status={task.escrow.status} />
        {task.must_mention && (
          <span className="font-mono text-[10px] text-slate-500 border border-slate-800 px-1.5 py-0.5 rounded">
            @{task.must_mention}
          </span>
        )}
      </div>

      {/* Footer: creator + deadline + total budget */}
      <div className="flex items-center justify-between pt-3 border-t border-[#1A1A2E]">
        <div className="flex items-center gap-3">
          {task.creator_handle && (
            <span className="font-mono text-[10px] text-slate-600">
              @{task.creator_handle}
            </span>
          )}
          <span className="font-mono text-[10px] text-slate-700">
            {daysUntil(task.deadline)} left
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-slate-600">
            ${task.escrow.amount_total.toFixed(2)} budget
          </span>
          {onAccept && canAccept && (
            <button
              onClick={() => onAccept(task.id)}
              disabled={accepting}
              className="font-mono text-[10px] px-2.5 py-1 rounded bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20 transition-all disabled:opacity-50"
            >
              {accepting ? "…" : "Accept →"}
            </button>
          )}
          {!canAccept && task.slots_remaining === 0 && (
            <span className="font-mono text-[10px] text-slate-700">Full</span>
          )}
        </div>
      </div>
    </div>
  );
}
