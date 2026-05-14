"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import { MicroStatusBadge, MicroApprovalBadge, MicroEscrowBadge, MicroPlatformBadge, MicroProofBadge, MicroSlotsBadge } from "@/components/micro/MicroStatusBadge";
import { MicroSubmitDialog } from "@/components/micro/MicroSubmitDialog";
import type { MicroTask, MicroClaim } from "@/lib/micro-types";
import { PROOF_LABELS, CLAIM_STATUS_COLORS } from "@/lib/micro-types";

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

function daysUntil(deadline: string): string {
  const diff = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return "Expired";
  if (diff === 0) return "Today";
  if (diff === 1) return "1 day left";
  return `${diff} days left`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface ClaimRowProps {
  claim: MicroClaim;
  isCreator: boolean;
  taskId: string;
  onApprove: (claimId: string, action: "approve" | "reject") => void;
  acting: string | null;
}

function ClaimRow({ claim, isCreator, onApprove, acting }: ClaimRowProps) {
  const color = CLAIM_STATUS_COLORS[claim.status];
  return (
    <div className="border border-[#1A1A2E] rounded-lg p-3 bg-[#0D0D14]">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border ${color}`}>
            {claim.status}
          </span>
          <span className="font-mono text-xs text-slate-300">@{claim.claimant_handle}</span>
        </div>
        <span className="font-mono text-[10px] text-slate-600">{formatTime(claim.accepted_at)}</span>
      </div>

      {claim.proof && (
        <div className="mt-2 pl-1">
          <div className="font-mono text-[10px] text-slate-600 mb-1">Proof submitted:</div>
          {claim.proof.startsWith("http") ? (
            <a href={claim.proof} target="_blank" rel="noopener noreferrer"
              className="font-mono text-xs text-[#4FC3F7] hover:underline break-all">
              {claim.proof}
            </a>
          ) : (
            <p className="font-mono text-xs text-slate-400 break-words whitespace-pre-wrap">{claim.proof}</p>
          )}
          {claim.proof_note && (
            <p className="font-mono text-[10px] text-slate-600 mt-1 italic">{claim.proof_note}</p>
          )}
        </div>
      )}

      {claim.payout_tx && (
        <div className="mt-2 font-mono text-[10px] text-emerald-400">
          ✓ Paid · tx: {claim.payout_tx.slice(0, 10)}…
        </div>
      )}

      {isCreator && claim.status === "submitted" && (
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => onApprove(claim.id, "approve")}
            disabled={acting === claim.id}
            className="font-mono text-[10px] px-3 py-1.5 rounded bg-emerald-400/10 text-emerald-400 border border-emerald-400/30 hover:bg-emerald-400/20 disabled:opacity-50"
          >
            {acting === claim.id ? "…" : "✓ Approve"}
          </button>
          <button
            onClick={() => onApprove(claim.id, "reject")}
            disabled={acting === claim.id}
            className="font-mono text-[10px] px-3 py-1.5 rounded bg-red-400/10 text-red-400 border border-red-400/30 hover:bg-red-400/20 disabled:opacity-50"
          >
            Reject
          </button>
        </div>
      )}
    </div>
  );
}

export default function MicroDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);

  const [task, setTask] = useState<MicroTask | null>(null);
  const [claims, setClaims] = useState<MicroClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [handle, setHandle] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [creatorHandle, setCreatorHandle] = useState("");

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  async function load() {
    const res = await fetch(`/api/microtasks/${id}`);
    if (res.status === 404) { setNotFound(true); setLoading(false); return; }
    const data = await res.json();
    setTask(data.task);
    setClaims(data.claims ?? []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [id]);

  async function acceptTask() {
    if (!handle.trim()) { showToast("Enter your handle first"); return; }
    setAccepting(true);
    try {
      const res = await fetch(`/api/microtasks/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast("✅ Slot accepted! Submit your proof below.");
        load();
      } else {
        showToast(`❌ ${data.error}`);
      }
    } finally {
      setAccepting(false);
    }
  }

  async function handleApprove(claimId: string, action: "approve" | "reject") {
    if (!creatorHandle.trim()) { showToast("Enter your creator handle"); return; }
    setActing(claimId);
    try {
      const res = await fetch(`/api/microtasks/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id: claimId, action, handle: creatorHandle }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(action === "approve" ? "✅ Approved and payment released!" : "❌ Rejected — slot reopened");
        load();
      } else {
        showToast(`❌ ${data.error}`);
      }
    } finally {
      setActing(null);
    }
  }

  function onSubmitSuccess(_proof: string, autoApproved: boolean, net?: number) {
    setShowSubmit(false);
    if (autoApproved && net != null) {
      showToast(`✅ Auto-approved! $${net.toFixed(2)} USDC released.`);
    } else {
      showToast("✅ Proof submitted — awaiting review.");
    }
    load();
  }

  if (loading) {
    return (
      <>
        <Navbar />
        <main className="bg-[#050508] min-h-screen pt-16 font-mono" style={GRID_BG}>
          <div className="max-w-3xl mx-auto px-4 py-12">
            <div className="card-surface rounded-xl p-6 border border-[#1A1A2E] animate-pulse-slow h-64" />
          </div>
        </main>
      </>
    );
  }

  if (notFound || !task) {
    return (
      <>
        <Navbar />
        <main className="bg-[#050508] min-h-screen pt-16 font-mono" style={GRID_BG}>
          <div className="max-w-3xl mx-auto px-4 py-12 text-center">
            <p className="font-mono text-slate-500 mb-4">Task not found</p>
            <Link href="/micro" className="font-mono text-xs text-[#4FC3F7] hover:underline">← Back to marketplace</Link>
          </div>
        </main>
      </>
    );
  }

  const canAccept = task.slots_remaining > 0 && (task.status === "open" || task.status === "active");
  const myClaim = handle ? claims.find(c => c.claimant_handle === handle) : null;
  const canSubmit = myClaim && myClaim.status === "accepted";
  const pendingClaims = claims.filter(c => c.status === "submitted");
  const isCreatorMode = !!creatorHandle && creatorHandle === task.creator_handle;

  return (
    <>
      <Navbar />
      <main className="bg-[#050508] font-mono min-h-screen pt-16" style={GRID_BG}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12">

          {/* Breadcrumb */}
          <div className="mb-6">
            <Link href="/micro" className="font-mono text-[11px] text-slate-600 hover:text-slate-400 transition-colors">
              ← Microtasks
            </Link>
          </div>

          {/* Main card */}
          <div className="card-surface rounded-xl border border-[#1A1A2E] p-6 mb-4">
            {/* Status row */}
            <div className="flex flex-wrap gap-1.5 items-center mb-4">
              <MicroStatusBadge status={task.status} />
              <MicroPlatformBadge platform={task.platform} />
              <MicroApprovalBadge mode={task.approval_mode} />
              <MicroEscrowBadge status={task.escrow.status} />
            </div>

            {/* Title + reward */}
            <div className="flex items-start justify-between gap-4 mb-4">
              <h1 className="font-mono text-xl font-bold text-white leading-snug flex-1">{task.title}</h1>
              <div className="text-right flex-shrink-0">
                <div className="font-mono text-2xl font-bold text-[#4FC3F7]">${task.reward_per_slot.toFixed(2)}</div>
                <div className="font-mono text-[10px] text-slate-600">per slot</div>
              </div>
            </div>

            {/* Description */}
            <p className="font-mono text-sm text-slate-400 leading-relaxed mb-5 whitespace-pre-wrap">{task.description}</p>

            {/* Meta grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-5">
              <div className="bg-[#0D0D14] rounded-lg px-3 py-2 border border-[#1A1A2E]">
                <div className="font-mono text-[10px] text-slate-600 mb-0.5">Slots</div>
                <MicroSlotsBadge remaining={task.slots_remaining} total={task.slots_total} />
              </div>
              <div className="bg-[#0D0D14] rounded-lg px-3 py-2 border border-[#1A1A2E]">
                <div className="font-mono text-[10px] text-slate-600 mb-0.5">Proof required</div>
                <MicroProofBadge proof={task.proof_required} />
              </div>
              <div className="bg-[#0D0D14] rounded-lg px-3 py-2 border border-[#1A1A2E]">
                <div className="font-mono text-[10px] text-slate-600 mb-0.5">Deadline</div>
                <div className="font-mono text-xs text-slate-300">{daysUntil(task.deadline)}</div>
                <div className="font-mono text-[9px] text-slate-700">{formatDate(task.deadline)}</div>
              </div>
              <div className="bg-[#0D0D14] rounded-lg px-3 py-2 border border-[#1A1A2E]">
                <div className="font-mono text-[10px] text-slate-600 mb-0.5">Total budget</div>
                <div className="font-mono text-xs text-white">${task.escrow.amount_total.toFixed(2)} USDC</div>
              </div>
              <div className="bg-[#0D0D14] rounded-lg px-3 py-2 border border-[#1A1A2E]">
                <div className="font-mono text-[10px] text-slate-600 mb-0.5">Released</div>
                <div className="font-mono text-xs text-emerald-400">${task.escrow.amount_released.toFixed(2)} USDC</div>
              </div>
              {task.must_mention && (
                <div className="bg-[#0D0D14] rounded-lg px-3 py-2 border border-[#1A1A2E]">
                  <div className="font-mono text-[10px] text-slate-600 mb-0.5">Must mention</div>
                  <div className="font-mono text-xs text-slate-300">@{task.must_mention}</div>
                </div>
              )}
            </div>

            {/* Creator */}
            {task.creator_handle && (
              <div className="flex items-center gap-2 pt-4 border-t border-[#1A1A2E]">
                <span className="font-mono text-[10px] text-slate-600">Posted by</span>
                <Link href={`/micro/profile/${task.creator_handle}`}
                  className="font-mono text-[11px] text-slate-400 hover:text-[#4FC3F7] transition-colors">
                  @{task.creator_handle}
                </Link>
                <span className="font-mono text-[10px] text-slate-700">· {formatDate(task.created_at)}</span>
              </div>
            )}
          </div>

          {/* Auto-approval notice */}
          {task.approval_mode === "auto" && (
            <div className="mb-4 font-mono text-[11px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-lg px-4 py-3">
              ✓ Auto-approval enabled — payment releases instantly on valid proof submission
            </div>
          )}

          {/* Accept / Submit panel */}
          <div className="card-surface rounded-xl border border-[#1A1A2E] p-5 mb-4">
            <div className="font-mono text-xs text-slate-400 mb-3">Your handle</div>
            <div className="flex flex-wrap gap-3 items-center mb-4">
              <div className="flex items-center gap-2 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2">
                <span className="font-mono text-[10px] text-slate-600">@</span>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="yourhandle"
                  className="bg-transparent font-mono text-xs text-white w-32 focus:outline-none placeholder-slate-700"
                />
              </div>

              {myClaim ? (
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-[10px] px-2 py-1 rounded border ${CLAIM_STATUS_COLORS[myClaim.status]}`}>
                    Your slot: {myClaim.status}
                  </span>
                  {canSubmit && (
                    <button
                      onClick={() => setShowSubmit(true)}
                      className="font-mono text-xs px-4 py-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20 transition-all"
                    >
                      Submit Proof →
                    </button>
                  )}
                </div>
              ) : canAccept ? (
                <button
                  onClick={acceptTask}
                  disabled={accepting}
                  className="font-mono text-xs px-4 py-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20 transition-all disabled:opacity-50"
                >
                  {accepting ? "Accepting…" : "Accept Slot →"}
                </button>
              ) : (
                <span className="font-mono text-[11px] text-slate-600">
                  {task.slots_remaining === 0 ? "All slots filled" : "Task no longer accepting"}
                </span>
              )}
            </div>
            <p className="font-mono text-[10px] text-slate-700">
              Proof type: <span className="text-slate-500">{PROOF_LABELS[task.proof_required]}</span>
              {task.must_mention && <> · Must mention: <span className="text-slate-500">@{task.must_mention}</span></>}
            </p>
          </div>

          {/* Creator management */}
          {pendingClaims.length > 0 && (
            <div className="card-surface rounded-xl border border-[#1A1A2E] p-5 mb-4">
              <div className="font-mono text-xs text-white mb-3">
                Creator review ({pendingClaims.length} pending)
              </div>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex items-center gap-2 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2">
                  <span className="font-mono text-[10px] text-slate-600">@</span>
                  <input
                    value={creatorHandle}
                    onChange={(e) => setCreatorHandle(e.target.value)}
                    placeholder="your creator handle"
                    className="bg-transparent font-mono text-xs text-white w-36 focus:outline-none placeholder-slate-700"
                  />
                </div>
                {isCreatorMode && (
                  <span className="font-mono text-[10px] text-emerald-400">✓ Creator mode</span>
                )}
              </div>
              <div className="space-y-3">
                {pendingClaims.map((claim) => (
                  <ClaimRow
                    key={claim.id}
                    claim={claim}
                    isCreator={isCreatorMode}
                    taskId={id}
                    onApprove={handleApprove}
                    acting={acting}
                  />
                ))}
              </div>
            </div>
          )}

          {/* All claims */}
          {claims.length > 0 && (
            <div className="card-surface rounded-xl border border-[#1A1A2E] p-5">
              <div className="font-mono text-xs text-slate-400 mb-3">
                Submissions ({claims.length})
              </div>
              <div className="space-y-3">
                {claims.map((claim) => (
                  <ClaimRow
                    key={claim.id}
                    claim={claim}
                    isCreator={isCreatorMode}
                    taskId={id}
                    onApprove={handleApprove}
                    acting={acting}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Submit dialog */}
      {showSubmit && task && handle && (
        <MicroSubmitDialog
          task={task}
          handle={handle}
          onSuccess={onSubmitSuccess}
          onCancel={() => setShowSubmit(false)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#0D0D14] border border-[#1A1A2E] rounded-lg px-4 py-3 font-mono text-xs text-white max-w-sm text-center shadow-lg">
          {toast}
        </div>
      )}
    </>
  );
}
