/** Worker types — mirrors CLI storage.ts and web micro-types.ts */

export type MicroPlatform = "x" | "farcaster" | "telegram" | "web";
export type MicroProof = "reply" | "quote" | "screenshot" | "url" | "video" | "text";
export type MicroApproval = "auto" | "manual" | "hybrid";
export type MicroStatus =
  | "open" | "active" | "submitted" | "approved" | "completed" | "expired" | "cancelled";
export type MicroClaimStatus =
  | "accepted" | "submitted" | "approved" | "rejected" | "expired";
export type EscrowStatus = "pending" | "funded" | "released" | "refunded";

export interface MicroEscrow {
  amount_total: number;
  amount_locked: number;
  amount_released: number;
  amount_refunded: number;
  tx_hash?: string;
  status: EscrowStatus;
}

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
  escrow: MicroEscrow;
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

/** Worker state — tracked in worker-state.json */
export interface WorkerState {
  last_run_at: string | null;
  runs_total: number;
  runs_succeeded: number;
  runs_failed: number;
  last_job_counts: Record<string, number>;
  reminded_tasks: Record<string, string>; // taskId → ISO timestamp last reminded
}

/** Job result returned by each job function */
export interface JobResult {
  job: string;
  processed: number;
  skipped: number;
  failed: number;
  errors: string[];
  mutations: string[];
}

/** Notification event */
export interface NotifyEvent {
  type:
    | "microtask.expired"
    | "microtask.autoApproved"
    | "microtask.refunded"
    | "microtask.reminded"
    | "claim.expired"
    | "claim.approved"
    | "claim.rejected"
    | "gig.expired"
    | "gig.reminded"
    | "cleanup.fixed"
    | "reputation.synced";
  taskId?: string;
  claimId?: string;
  handle?: string;
  creatorHandle?: string;
  amount?: number;
  message: string;
}

export type Notifier = (event: NotifyEvent) => void;
