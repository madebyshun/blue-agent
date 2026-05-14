"use client";

import { useState } from "react";
import type { MicroTask } from "@/lib/micro-types";
import { PROOF_LABELS } from "@/lib/micro-types";

interface Props {
  task: MicroTask;
  handle: string;
  onSuccess: (proof: string, autoApproved: boolean, net?: number) => void;
  onCancel: () => void;
}

function isUrl(s: string): boolean {
  try { new URL(s); return true; } catch { return false; }
}

export function MicroSubmitDialog({ task, handle, onSuccess, onCancel }: Props) {
  const [proof, setProof] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const urlProof = ["url", "reply", "quote", "screenshot", "video"].includes(task.proof_required);
  const label = PROOF_LABELS[task.proof_required];

  async function submit() {
    setError(null);
    if (!proof.trim()) { setError("Proof is required"); return; }
    if (urlProof && !isUrl(proof)) { setError("Must be a valid URL"); return; }

    setLoading(true);
    try {
      const res = await fetch(`/api/microtasks/${task.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proof: proof.trim(), proof_note: note.trim() || undefined, handle }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? "Submission failed"); return; }
      onSuccess(proof, data.auto_approved, data.payout?.net);
    } catch {
      setError("Network error — try again");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="card-surface rounded-xl border border-[#1A1A2E] w-full max-w-md p-6">
        <h2 className="font-mono text-sm text-white mb-1">Submit Proof</h2>
        <p className="font-mono text-[11px] text-slate-600 mb-4">
          Task requires: <span className="text-slate-400">{label}</span>
        </p>

        {urlProof ? (
          <div className="mb-3">
            <label className="font-mono text-[10px] text-slate-500 block mb-1">
              {label} URL *
            </label>
            <input
              type="url"
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              placeholder={`https://`}
              className="w-full bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/50"
            />
          </div>
        ) : (
          <div className="mb-3">
            <label className="font-mono text-[10px] text-slate-500 block mb-1">
              Your response *
            </label>
            <textarea
              value={proof}
              onChange={(e) => setProof(e.target.value)}
              rows={4}
              className="w-full bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/50 resize-none"
              placeholder="Paste your text response here…"
            />
          </div>
        )}

        <div className="mb-4">
          <label className="font-mono text-[10px] text-slate-500 block mb-1">
            Note (optional)
          </label>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Any context for the reviewer"
            className="w-full bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/50"
          />
        </div>

        {task.approval_mode === "auto" && (
          <p className="font-mono text-[10px] text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded px-3 py-2 mb-4">
            ✓ Auto-approval — payment released instantly on submit
          </p>
        )}

        {error && (
          <p className="font-mono text-[10px] text-red-400 bg-red-400/10 border border-red-400/20 rounded px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="font-mono text-xs px-4 py-2 rounded-lg text-slate-500 hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={loading}
            className="font-mono text-xs px-4 py-2 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20 transition-all disabled:opacity-50"
          >
            {loading ? "Submitting…" : "Submit Proof"}
          </button>
        </div>
      </div>
    </div>
  );
}
