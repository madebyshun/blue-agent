/** Shared types for the microtask marketplace — mirrors CLI storage.ts */

export type MicroPlatform = "x" | "farcaster" | "telegram" | "web";
export type MicroProof = "reply" | "quote" | "screenshot" | "url" | "video" | "text";
export type MicroApproval = "auto" | "manual" | "hybrid";
export type MicroStatus =
  | "open" | "active" | "submitted" | "approved" | "completed" | "expired" | "cancelled";
export type MicroClaimStatus = "accepted" | "submitted" | "approved" | "rejected" | "expired";
export type EscrowStatus = "pending" | "funded" | "released" | "refunded";

export interface MicroTask {
  id: string;
  title: string;
  description: string;
  creator_address: string;
  creator_handle?: string;

  platform: MicroPlatform;
  proof_required: MicroProof;
  must_mention?: string;

  reward_per_slot: number;
  slots_total: number;
  slots_filled: number;
  slots_remaining: number;

  approval_mode: MicroApproval;
  deadline: string;
  status: MicroStatus;

  escrow: {
    amount_total: number;
    amount_locked: number;
    amount_released: number;
    amount_refunded: number;
    tx_hash?: string;
    status: EscrowStatus;
  };

  created_at: string;
  updated_at: string;
}

export interface MicroClaim {
  id: string;
  task_id: string;
  claimant_address: string;
  claimant_handle: string;
  accepted_at: string;
  submitted_at?: string;
  proof?: string;
  proof_note?: string;
  status: MicroClaimStatus;
  payout_tx?: string;
}

export interface MicroReputation {
  address: string;
  handle: string;
  score: number;
  completed: number;
  rejected: number;
  approved_rate: number;
  total_earned_usdc: number;
  avg_turnaround_minutes: number;
  last_activity: string;
}

export const PLATFORM_FEE = 0.05;
export const MAX_MICROTASK_REWARD = 20;
export const MIN_MICROTASK_REWARD = 0.1;

export const PLATFORM_LABELS: Record<MicroPlatform, string> = {
  x: "𝕏",
  farcaster: "Farcaster",
  telegram: "Telegram",
  web: "Web",
};

export const PROOF_LABELS: Record<MicroProof, string> = {
  reply: "Reply",
  quote: "Quote",
  screenshot: "Screenshot",
  url: "URL",
  video: "Video",
  text: "Text",
};

export const STATUS_COLORS: Record<MicroStatus, string> = {
  open: "text-[#4FC3F7] border-[#4FC3F7]/30 bg-[#4FC3F7]/10",
  active: "text-purple-accent border-purple-accent/30 bg-purple-accent/10",
  submitted: "text-yellow-400 border-yellow-400/30 bg-yellow-400/10",
  approved: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  completed: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  expired: "text-slate-500 border-slate-500/30 bg-slate-500/10",
  cancelled: "text-red-400 border-red-400/30 bg-red-400/10",
};

export const CLAIM_STATUS_COLORS: Record<MicroClaimStatus, string> = {
  accepted: "text-[#4FC3F7] border-[#4FC3F7]/30",
  submitted: "text-yellow-400 border-yellow-400/30",
  approved: "text-emerald-400 border-emerald-400/30",
  rejected: "text-red-400 border-red-400/30",
  expired: "text-slate-500 border-slate-500/30",
};
