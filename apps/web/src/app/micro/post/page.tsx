"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import { MicroStatusBadge, MicroApprovalBadge, MicroPlatformBadge, MicroProofBadge, MicroSlotsBadge } from "@/components/micro/MicroStatusBadge";
import type { MicroPlatform, MicroProof, MicroApproval } from "@/lib/micro-types";
import { PLATFORM_FEE, MAX_MICROTASK_REWARD, MIN_MICROTASK_REWARD } from "@/lib/micro-types";

const GRID_BG = {
  backgroundImage:
    "linear-gradient(rgba(79,195,247,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(79,195,247,0.03) 1px,transparent 1px)",
  backgroundSize: "40px 40px",
};

const PLATFORMS: { value: MicroPlatform; label: string }[] = [
  { value: "x", label: "𝕏 Twitter" },
  { value: "farcaster", label: "Farcaster" },
  { value: "telegram", label: "Telegram" },
  { value: "web", label: "Web" },
];

const PROOFS: { value: MicroProof; label: string; hint: string }[] = [
  { value: "reply", label: "Reply", hint: "Reply to a specific post" },
  { value: "quote", label: "Quote", hint: "Quote-post with commentary" },
  { value: "screenshot", label: "Screenshot", hint: "Screenshot URL as proof" },
  { value: "url", label: "URL", hint: "Any URL as proof" },
  { value: "video", label: "Video", hint: "Video URL as proof" },
  { value: "text", label: "Text", hint: "Free-form text response" },
];

const APPROVALS: { value: MicroApproval; label: string; desc: string; color: string }[] = [
  { value: "auto", label: "Auto ✓", desc: "Payment releases instantly on submit", color: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400" },
  { value: "manual", label: "Manual", desc: "You review and approve each submission", color: "border-yellow-400/30 bg-yellow-400/10 text-yellow-400" },
  { value: "hybrid", label: "Hybrid", desc: "Auto for trusted handles, manual otherwise", color: "border-purple-400/30 bg-purple-400/10 text-purple-400" },
];

const INPUT_CLS = "w-full bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 font-mono text-xs text-white placeholder-slate-700 focus:outline-none focus:border-[#4FC3F7]/50 transition-colors";
const LABEL_CLS = "font-mono text-[10px] text-slate-500 block mb-1.5";

function minDeadline(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default function MicroPostPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [platform, setPlatform] = useState<MicroPlatform>("x");
  const [proof, setProof] = useState<MicroProof>("reply");
  const [mustMention, setMustMention] = useState("");
  const [rewardStr, setRewardStr] = useState("1.00");
  const [slotsStr, setSlotsStr] = useState("5");
  const [approval, setApproval] = useState<MicroApproval>("auto");
  const [deadline, setDeadline] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [handle, setHandle] = useState("");
  const [address, setAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [newTaskId, setNewTaskId] = useState<string | null>(null);

  const reward = parseFloat(rewardStr) || 0;
  const slots = parseInt(slotsStr) || 0;
  const totalBudget = reward * slots;
  const platformFee = totalBudget * PLATFORM_FEE;
  const escrowNeeded = totalBudget + platformFee;

  const overLimit = reward > MAX_MICROTASK_REWARD;
  const underLimit = reward < MIN_MICROTASK_REWARD && reward > 0;

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required";
    if (!description.trim()) e.description = "Description is required";
    if (reward <= 0) e.reward = "Enter a reward amount";
    if (overLimit) e.reward = `Max $${MAX_MICROTASK_REWARD} per slot — use gig marketplace for larger tasks`;
    if (underLimit) e.reward = `Minimum $${MIN_MICROTASK_REWARD} per slot`;
    if (slots < 1) e.slots = "At least 1 slot required";
    if (slots > 100) e.slots = "Max 100 slots";
    if (!deadline) e.deadline = "Deadline is required";
    if (deadline < minDeadline()) e.deadline = "Deadline must be at least tomorrow";
    if (!handle.trim()) e.handle = "Your handle is required";
    if (!address.trim()) e.address = "Wallet address is required";
    if (address && !address.startsWith("0x")) e.address = "Must be a 0x address";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await fetch("/api/microtasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          creator_handle: handle.trim(),
          creator_address: address.trim(),
          platform,
          proof_required: proof,
          must_mention: mustMention.trim().replace(/^@/, "") || undefined,
          reward_per_slot: reward,
          slots_total: slots,
          approval_mode: approval,
          deadline: new Date(deadline).toISOString(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrors({ _: data.error ?? "Failed to create task" });
      } else {
        setNewTaskId(data.task.id);
        setSubmitted(true);
      }
    } catch {
      setErrors({ _: "Network error — try again" });
    } finally {
      setLoading(false);
    }
  }

  if (submitted && newTaskId) {
    return (
      <>
        <Navbar />
        <main className="bg-[#050508] font-mono min-h-screen pt-16" style={GRID_BG}>
          <div className="max-w-lg mx-auto px-4 py-20 text-center">
            <div className="text-4xl mb-4">✓</div>
            <h1 className="font-mono text-xl font-bold text-white mb-2">Task posted!</h1>
            <p className="font-mono text-sm text-slate-500 mb-6">
              Your microtask is now live. Fund the escrow to activate it.
            </p>
            <div className="card-surface rounded-xl border border-[#1A1A2E] p-4 mb-6 text-left">
              <div className="font-mono text-[10px] text-slate-600 mb-1">Total escrow needed</div>
              <div className="font-mono text-xl font-bold text-[#4FC3F7]">${escrowNeeded.toFixed(2)} USDC</div>
              <div className="font-mono text-[10px] text-slate-700 mt-1">
                ${totalBudget.toFixed(2)} rewards + ${platformFee.toFixed(2)} platform fee (5%)
              </div>
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => router.push(`/micro/${newTaskId}`)}
                className="font-mono text-xs px-5 py-2.5 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20 transition-all"
              >
                View task →
              </button>
              <button
                onClick={() => router.push("/micro")}
                className="font-mono text-xs px-5 py-2.5 rounded-lg text-slate-500 hover:text-white transition-colors"
              >
                Marketplace
              </button>
            </div>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <main className="bg-[#050508] font-mono min-h-screen pt-16" style={GRID_BG}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12">

          {/* Header */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <div className="glow-dot" />
              <span className="font-mono text-[10px] text-slate-600 tracking-widest uppercase">post a microtask</span>
            </div>
            <h1 className="text-2xl font-mono font-bold text-white">
              New <span className="text-[#4FC3F7]">Microtask</span>
            </h1>
            <p className="font-mono text-xs text-slate-500 mt-1">$0.10–$20 per slot · USDC · auto or manual approval</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Form */}
            <form onSubmit={submit} className="lg:col-span-3 space-y-5">

              {/* Title */}
              <div>
                <label className={LABEL_CLS}>Task title *</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Reply to our announcement with #BlueAgent"
                  className={INPUT_CLS}
                  maxLength={120}
                />
                {errors.title && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.title}</p>}
              </div>

              {/* Description */}
              <div>
                <label className={LABEL_CLS}>Description / instructions *</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed instructions for doers — what to do, what counts as valid proof, any examples..."
                  rows={5}
                  className={`${INPUT_CLS} resize-none`}
                />
                {errors.description && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.description}</p>}
              </div>

              {/* Platform + Proof */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Platform *</label>
                  <select
                    value={platform}
                    onChange={(e) => setPlatform(e.target.value as MicroPlatform)}
                    className={INPUT_CLS}
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={LABEL_CLS}>Proof required *</label>
                  <select
                    value={proof}
                    onChange={(e) => setProof(e.target.value as MicroProof)}
                    className={INPUT_CLS}
                  >
                    {PROOFS.map((p) => (
                      <option key={p.value} value={p.value}>{p.label} — {p.hint}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Must mention */}
              <div>
                <label className={LABEL_CLS}>Must mention handle (optional)</label>
                <div className="flex items-center gap-2 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 focus-within:border-[#4FC3F7]/50 transition-colors">
                  <span className="font-mono text-[10px] text-slate-600">@</span>
                  <input
                    value={mustMention}
                    onChange={(e) => setMustMention(e.target.value.replace(/^@/, ""))}
                    placeholder="handle (no @)"
                    className="bg-transparent font-mono text-xs text-white flex-1 focus:outline-none placeholder-slate-700"
                  />
                </div>
              </div>

              {/* Reward + Slots */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Reward per slot (USDC) *</label>
                  <div className="flex items-center gap-2 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 focus-within:border-[#4FC3F7]/50 transition-colors">
                    <span className="font-mono text-[10px] text-slate-600">$</span>
                    <input
                      type="number"
                      min="0.10"
                      max="20"
                      step="0.01"
                      value={rewardStr}
                      onChange={(e) => setRewardStr(e.target.value)}
                      className="bg-transparent font-mono text-xs text-white flex-1 focus:outline-none"
                    />
                  </div>
                  {errors.reward && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.reward}</p>}
                  {overLimit && (
                    <p className="font-mono text-[10px] text-yellow-400 mt-1">
                      ⚠ Over $20 — consider <a href="/gig" className="underline">gig marketplace</a>
                    </p>
                  )}
                </div>
                <div>
                  <label className={LABEL_CLS}>Number of slots *</label>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    value={slotsStr}
                    onChange={(e) => setSlotsStr(e.target.value)}
                    className={INPUT_CLS}
                  />
                  {errors.slots && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.slots}</p>}
                </div>
              </div>

              {/* Deadline */}
              <div>
                <label className={LABEL_CLS}>Deadline *</label>
                <input
                  type="date"
                  value={deadline}
                  min={minDeadline()}
                  onChange={(e) => setDeadline(e.target.value)}
                  className={INPUT_CLS}
                />
                {errors.deadline && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.deadline}</p>}
              </div>

              {/* Approval mode */}
              <div>
                <label className={LABEL_CLS}>Approval mode *</label>
                <div className="grid grid-cols-3 gap-2">
                  {APPROVALS.map((a) => (
                    <button
                      key={a.value}
                      type="button"
                      onClick={() => setApproval(a.value)}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        approval === a.value
                          ? a.color
                          : "border-[#1A1A2E] text-slate-600 hover:border-slate-600"
                      }`}
                    >
                      <div className="font-mono text-[10px] font-bold mb-0.5">{a.label}</div>
                      <div className="font-mono text-[9px] leading-tight opacity-80">{a.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Your handle + address */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={LABEL_CLS}>Your handle *</label>
                  <div className="flex items-center gap-2 bg-[#050508] border border-[#1A1A2E] rounded-lg px-3 py-2 focus-within:border-[#4FC3F7]/50 transition-colors">
                    <span className="font-mono text-[10px] text-slate-600">@</span>
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="yourhandle"
                      className="bg-transparent font-mono text-xs text-white flex-1 focus:outline-none placeholder-slate-700"
                    />
                  </div>
                  {errors.handle && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.handle}</p>}
                </div>
                <div>
                  <label className={LABEL_CLS}>Wallet address *</label>
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="0x…"
                    className={INPUT_CLS}
                  />
                  {errors.address && <p className="font-mono text-[10px] text-red-400 mt-1">{errors.address}</p>}
                </div>
              </div>

              {errors._ && (
                <div className="font-mono text-[11px] text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-4 py-3">
                  {errors._}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || overLimit}
                className="w-full font-mono text-sm py-3 rounded-lg bg-[#4FC3F7]/10 text-[#4FC3F7] border border-[#4FC3F7]/30 hover:bg-[#4FC3F7]/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Posting…" : "Post Microtask →"}
              </button>
            </form>

            {/* Preview */}
            <div className="lg:col-span-2">
              <div className="sticky top-20">
                <div className="font-mono text-[10px] text-slate-600 mb-3 tracking-widest uppercase">Live preview</div>

                <div className="card-surface rounded-xl p-4 border border-[#1A1A2E] mb-4">
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <MicroStatusBadge status="open" />
                    <MicroPlatformBadge platform={platform} />
                    <MicroApprovalBadge mode={approval} />
                  </div>

                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1">
                      <h3 className="font-mono text-sm text-slate-200 leading-snug line-clamp-2">
                        {title || <span className="text-slate-700">Task title…</span>}
                      </h3>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="font-mono text-lg font-bold text-white">
                        ${reward > 0 ? reward.toFixed(2) : "0.00"}
                      </div>
                      <div className="font-mono text-[10px] text-slate-600">per slot</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5 mb-3">
                    <MicroSlotsBadge remaining={slots || 0} total={slots || 0} />
                    <MicroProofBadge proof={proof} />
                    {mustMention && (
                      <span className="font-mono text-[10px] text-slate-500 border border-slate-800 px-1.5 py-0.5 rounded">
                        @{mustMention}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-[#1A1A2E]">
                    <span className="font-mono text-[10px] text-slate-600">
                      {handle ? `@${handle}` : "you"}
                    </span>
                    <span className="font-mono text-[10px] text-slate-600">
                      ${totalBudget > 0 ? totalBudget.toFixed(2) : "0.00"} budget
                    </span>
                  </div>
                </div>

                {/* Budget breakdown */}
                <div className="card-surface rounded-xl border border-[#1A1A2E] p-4">
                  <div className="font-mono text-[10px] text-slate-600 mb-3">Escrow summary</div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-mono text-[11px] text-slate-500">{slots || 0} × ${reward > 0 ? reward.toFixed(2) : "0.00"}</span>
                      <span className="font-mono text-[11px] text-white">${totalBudget.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-mono text-[11px] text-slate-500">Platform fee (5%)</span>
                      <span className="font-mono text-[11px] text-slate-400">${platformFee.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t border-[#1A1A2E]">
                      <span className="font-mono text-[11px] text-slate-400">Total escrow</span>
                      <span className="font-mono text-sm font-bold text-[#4FC3F7]">${escrowNeeded.toFixed(2)} USDC</span>
                    </div>
                  </div>
                  <p className="font-mono text-[9px] text-slate-700 mt-3 leading-relaxed">
                    Funds locked in escrow. Released to doers on approval. Refunded if task expires with unfilled slots.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
