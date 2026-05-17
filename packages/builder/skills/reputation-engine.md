# Reputation Engine — Blue Agent Grounding Skill

**Purpose:** Grounding for Claude when executing `blue build`, `blue audit`, `blue validate`, and `blue chat` commands that involve reputation scoring, worker trust, marketplace integrity, and profile rendering on the Blue Agent Work Hub. This file defines exact scoring math, tier boundaries, anti-gaming rules, dispute handling, and idempotent recompute patterns. All examples target Base (chain ID 8453) with USDC rewards.

---

## 1. Core Concepts — What Reputation Means for Marketplace Trust

A reputation score is not a vanity metric. On a permissionless gig marketplace, it is the primary trust primitive that replaces the legal contracts and background checks available in traditional labor markets. Without it, every transaction is a blind leap.

### 1.1 The Trust Problem

When a poster publishes a $200 USDC dev task and a pseudonymous address accepts it, the poster has no way to know:

- Has this worker completed tasks before, or is this their first attempt?
- Do they deliver on time, or do they ghost and let deadlines pass?
- When they submit, is the proof real or a recycled link?
- Have they been rejected before, and why?

Reputation answers these questions by compressing the full history of a worker's interactions into a single score and a set of auditable dimensions. The score is not a judgment — it is a summary of observable, on-chain-verifiable facts.

### 1.2 What Reputation Is (and Isn't)

Reputation IS:

- A compressed summary of completed work, rejections, speed, and volume
- A gating mechanism for high-value tasks (Gold tier required to accept $1,000+ tasks)
- A signal to posters for auto-accept or auto-reject logic
- A foundation for staking and bonding requirements (future)

Reputation IS NOT:

- A measure of raw skill or intelligence
- A measure of how much USDC someone has earned in total (that is volume, not quality)
- Permanent — it decays slowly when inactive and recovers when work resumes
- Immune to dispute — any approved task can be challenged within a dispute window

### 1.3 The Five Trust Dimensions

Every reputation score is built from five observable dimensions. These are not abstract — each has a concrete data source.

```
Dimension             Source                              Weight
────────────────────────────────────────────────────────────────
Completion rate       completed / (completed + rejected)  35%
Volume of work        count of completed tasks            20%
Penalty signal        count of rejections                 20%
Speed / reliability   avg_turnaround_minutes              15%
Earned volume         total_earned_usdc                   10%
```

The weights sum to 100%. Speed and earned volume are secondary signals — they confirm that the work had real stakes and real time pressure. Completion rate and volume are primary.

### 1.4 Marketplace Trust Tiers

Trust tiers gate what work a worker can accept. A worker at Bronze cannot accept a $500 task. A worker at Diamond is eligible for bounties, audits, and priority assignment. Tiers create a natural on-ramp: do small work well, earn the right to larger stakes.

---

## 2. Score Components — Inputs to the Formula

### 2.1 completed (integer, ≥ 0)

Count of tasks that were submitted AND approved by the poster. A task is not counted as completed until the poster explicitly approves the submission. Auto-expiry after deadline does not count as completion.

Data source: claims table, `status = 'completed'` AND `approved_at IS NOT NULL`.

### 2.2 rejected (integer, ≥ 0)

Count of tasks where the submitted proof was explicitly rejected by the poster OR where the worker was flagged for policy violation. Rejections carry more weight per event than completions because they signal a failure mode that damages poster trust.

Data source: claims table, `status = 'rejected'` OR `status = 'disputed'` with resolution `against_worker`.

### 2.3 approvalRate (float, 0.0–1.0)

```
approvalRate = completed / (completed + rejected)
```

When `completed + rejected === 0`, `approvalRate = 0.5` (neutral prior, not 0 or 1). This prevents new workers from starting at a score of 0 or 100.

The approval rate is the strongest signal in the formula because it normalizes for volume — a worker who has completed 1,000 tasks with a 60% rate is worse than one who has completed 10 with a 100% rate.

### 2.4 turnaroundMinutes (float, ≥ 0)

Average minutes from task acceptance to first valid submission across all completed tasks. Lower is better, but extremely low values (under 5 minutes) should be flagged as suspicious — they may indicate copy-pasting recycled work.

```typescript
// Compute turnaround from a single claim
function claimTurnaroundMinutes(acceptedAt: string, submittedAt: string): number {
  const accepted = new Date(acceptedAt).getTime();
  const submitted = new Date(submittedAt).getTime();
  return Math.max(0, (submitted - accepted) / 60_000);
}
```

For scoring, turnaround is normalized against a reference baseline of 2,880 minutes (48 hours). Tasks completed in under 48 hours score full points on this dimension. Tasks taking longer incur a logarithmic penalty.

### 2.5 totalEarned (float, USDC)

Total USDC released from escrow to this worker across all approved tasks. This is a secondary signal only — it confirms that the worker has real economic skin in the game and that their completions had monetary stakes. A worker with 50 completions of $1 tasks has lower stake-weighted trust than one with 10 completions of $100 tasks.

Do not use earned volume as a primary quality signal. A worker who completes many cheap tasks quickly may still have low skill depth.

---

## 3. Scoring Formula — Exact Math, Weights, Clamping

### 3.1 Why the Old Formula Falls Short

The existing formula in the worker:

```typescript
function computeScore(completed: number, rejected: number, approvalRate: number): number {
  const raw = 50 + completed * 2 - rejected * 5 + Math.round(approvalRate * 30);
  return Math.min(100, Math.max(0, raw));
}
```

Problems:

1. **Linear unboundedness on `completed`.** A worker with 30 completions and 0% approval rate scores `50 + 60 - 0 + 0 = 110`, clamped to 100. They appear perfect despite never being approved.
2. **No turnaround signal.** Speed is not factored in at all.
3. **No earned volume signal.** Economic stake is ignored.
4. **Approval rate has low ceiling.** `approvalRate * 30` maxes at 30 points, but completion count can contribute up to an uncapped amount before clamping.
5. **Starting score of 50 with zero activity.** A fresh address scores 50 before doing anything, which means new workers appear as credible as mid-tier workers.
6. **No diminishing returns on volume.** Each additional completion is worth the same 2 points regardless of whether the worker has done 5 or 500 tasks.

### 3.2 The Improved Formula

The improved formula uses five weighted sub-scores, each normalized to its own range, then summed and clamped. Diminishing returns apply to volume and earned USDC via square root scaling.

```typescript
/**
 * computeScore — Blue Agent reputation scoring formula.
 *
 * Inputs:
 *   completed          — count of approved completions (integer ≥ 0)
 *   rejected           — count of rejections (integer ≥ 0)
 *   approvalRate       — completed / (completed + rejected), 0.0–1.0
 *                        pass 0.5 if no history yet
 *   turnaroundMinutes  — average minutes from accept to submit (float ≥ 0)
 *                        pass 2880 (48h) if no history yet
 *   totalEarned        — total USDC earned across all approved tasks (float ≥ 0)
 *
 * Returns: integer 0–100
 */
export function computeScore(
  completed: number,
  rejected: number,
  approvalRate: number,
  turnaroundMinutes: number,
  totalEarned: number
): number {
  // --- Weight constants (must sum to 1.0) ---
  const W_APPROVAL   = 0.35;
  const W_VOLUME     = 0.20;
  const W_REJECTION  = 0.20;
  const W_SPEED      = 0.15;
  const W_EARNED     = 0.10;

  // --- Sub-score: approval rate (0–100) ---
  // Linear. 1.0 = 100, 0.5 = 50, 0.0 = 0.
  const approvalSub = approvalRate * 100;

  // --- Sub-score: volume (0–100) with diminishing returns ---
  // sqrt(completed) / sqrt(50) * 100, capped at 100.
  // Worker with 50 completions scores 100. Worker with 10 scores ~45.
  // Prevents a worker with 500 completions from inflating score via raw count alone.
  const volumeSub = Math.min(100, (Math.sqrt(Math.max(0, completed)) / Math.sqrt(50)) * 100);

  // --- Sub-score: rejection penalty (0–100) ---
  // High rejections push this sub-score down.
  // Each rejection reduces this sub-score by a diminishing amount.
  // 0 rejections = 100. 5 rejections = 60. 20 rejections = 0.
  // Formula: max(0, 100 - sqrt(rejected) * 22.4)
  // Rationale: sqrt(20) * 22.4 ≈ 100, so 20 rejections = floor of 0.
  const rejectionSub = Math.max(0, 100 - Math.sqrt(Math.max(0, rejected)) * 22.4);

  // --- Sub-score: speed (0–100) ---
  // Reference baseline: 2880 minutes (48h) = full score.
  // Faster than 48h = full 100. Slower = logarithmic decay.
  // turnaroundMinutes = 0 would be suspicious — treated as 10 minutes minimum.
  const clampedTurnaround = Math.max(10, turnaroundMinutes);
  const speedSub = clampedTurnaround <= 2880
    ? 100
    : Math.max(0, 100 - Math.log10(clampedTurnaround / 2880) * 80);

  // --- Sub-score: earned USDC (0–100) with diminishing returns ---
  // sqrt(totalEarned) / sqrt(500) * 100, capped at 100.
  // Worker who has earned $500 USDC scores 100. $50 USDC scores ~45.
  const earnedSub = Math.min(100, (Math.sqrt(Math.max(0, totalEarned)) / Math.sqrt(500)) * 100);

  // --- Weighted sum ---
  const raw =
    approvalSub  * W_APPROVAL  +
    volumeSub    * W_VOLUME    +
    rejectionSub * W_REJECTION +
    speedSub     * W_SPEED     +
    earnedSub    * W_EARNED;

  // --- Clamp and round ---
  return Math.min(100, Math.max(0, Math.round(raw)));
}
```

### 3.3 Score Interpretation Table

```
Score   Meaning
──────────────────────────────────────────────────
0–9     No history or catastrophic rejection record
10–24   Very new or unreliable — Bronze, small tasks only
25–44   Some history, moderate approval rate
45–64   Solid mid-tier worker — Silver, trusted for $100–$500 tasks
65–79   Experienced, high approval — Gold, eligible for complex work
80–89   Elite, fast + reliable — Diamond, eligible for audits/bounties
90–100  Exceptional — reserved for workers with 50+ completions at 95%+ rate
```

### 3.4 Score Worked Examples

```
Worker A: New, 0 completed, 0 rejected
  approvalRate = 0.5 (neutral prior), turnaround = 2880 (default), earned = 0
  approvalSub  = 50
  volumeSub    = 0
  rejectionSub = 100
  speedSub     = 100
  earnedSub    = 0
  raw = 50*0.35 + 0*0.20 + 100*0.20 + 100*0.15 + 0*0.10
      = 17.5 + 0 + 20 + 15 + 0 = 52.5 → 53
  BUT: new workers start at a bootstrapped floor of 10 (see Section 6.3)
  ACTUAL score = max(10, computed) only if completed + rejected === 0
  Wait — with the neutral prior, new workers naturally score ~52 before clamping.
  This is intentional: neutral prior prevents starting at 0.
  Recommendation: do not show scores to public until completed ≥ 1.

Worker B: 10 completed, 2 rejected, 83% approval, 1440 min avg, $150 earned
  approvalSub  = 0.83 * 100 = 83
  volumeSub    = sqrt(10)/sqrt(50)*100 = 3.16/7.07*100 = 44.7
  rejectionSub = max(0, 100 - sqrt(2)*22.4) = 100 - 31.7 = 68.3
  speedSub     = 1440 <= 2880, so 100
  earnedSub    = sqrt(150)/sqrt(500)*100 = 12.25/22.36*100 = 54.8
  raw = 83*0.35 + 44.7*0.20 + 68.3*0.20 + 100*0.15 + 54.8*0.10
      = 29.1 + 8.9 + 13.7 + 15.0 + 5.5 = 72.2 → 72

Worker C: 30 completed, 10 rejected, 75% approval, 720 min avg, $800 earned
  approvalSub  = 75
  volumeSub    = sqrt(30)/sqrt(50)*100 = 5.48/7.07*100 = 77.5
  rejectionSub = max(0, 100 - sqrt(10)*22.4) = 100 - 70.8 = 29.2
  speedSub     = 720 <= 2880, so 100
  earnedSub    = sqrt(800)/sqrt(500)*100 = 28.3/22.4*100 = 126 → clamped to 100
  raw = 75*0.35 + 77.5*0.20 + 29.2*0.20 + 100*0.15 + 100*0.10
      = 26.3 + 15.5 + 5.8 + 15.0 + 10.0 = 72.6 → 73
  Note: despite high volume and earnings, the 10 rejections hurt significantly.
```

---

## 4. Tier System — Bronze / Silver / Gold / Diamond

### 4.1 Tier Boundaries

```typescript
export type ReputationTier = "Unranked" | "Bronze" | "Silver" | "Gold" | "Diamond";

export function getTier(score: number, completed: number): ReputationTier {
  // Require at least 1 real completion to leave Unranked.
  // This prevents the neutral-prior score from granting Bronze to inactive wallets.
  if (completed === 0) return "Unranked";

  if (score >= 80) return "Diamond";
  if (score >= 65) return "Gold";
  if (score >= 45) return "Silver";
  if (score >= 25) return "Bronze";
  return "Bronze"; // score < 25 but has completions — keep them in Bronze, not Unranked
}
```

### 4.2 Tier Privileges and Restrictions

```
Tier      Min Score  Min Completed  Task Reward Cap  Notes
────────────────────────────────────────────────────────────────────────
Unranked  any        0              $25 USDC         First task only
Bronze    25         1              $100 USDC        Starter tasks
Silver    45         3              $500 USDC        Mid-complexity work
Gold      65         10             $2,000 USDC      Complex tasks, bounties
Diamond   80         25             No cap           Audits, multi-slot bounties
```

A Gold-tier worker attempting to accept a task above their tier cap receives:

```
Error: Task requires Diamond tier (score ≥ 80, completed ≥ 25).
Your current tier: Gold (score: 72, completed: 15).
Run `blue reputation @yourhandle` to see your full profile.
```

### 4.3 Tier Downgrade Rules

Tiers do not downgrade instantly. To prevent volatility from a single bad event:

- Downgrade only occurs when the worker's score remains below the tier threshold for 3 consecutive recomputes OR their approvalRate drops below 0.6 for more than 10 tasks in rolling history.
- Downgrade is always one tier at a time (Diamond → Gold, never Diamond → Bronze).
- Downgrade is logged with a reason string for audit trail.

```typescript
export function shouldDowngrade(
  currentTier: ReputationTier,
  newScore: number,
  completedSinceTierGrant: number,
  consecutiveLowScoreRecomputes: number
): boolean {
  const newTier = getTier(newScore, completedSinceTierGrant);
  if (tierRank(newTier) >= tierRank(currentTier)) return false;
  return consecutiveLowScoreRecomputes >= 3;
}

function tierRank(t: ReputationTier): number {
  return { Unranked: 0, Bronze: 1, Silver: 2, Gold: 3, Diamond: 4 }[t];
}
```

---

## 5. Anti-Gaming and Anti-Farming Rules

### 5.1 Why Gaming Happens

A reputation system with economic consequences will be gamed. The attack surface includes:

1. **Sybil attacks** — deploying multiple wallets to accept and approve each other's work, inflating completion counts with fake tasks.
2. **Task farming** — creating many low-value tasks ($0.01 USDC) with a controlled approver address to run up completion counts cheaply.
3. **Burst submission** — submitting identical or near-identical proof links across multiple task slots to count one piece of work as many completions.
4. **Collusion rings** — small groups of wallets that mutually approve all each other's work regardless of quality.

### 5.2 Cooldown Between Submissions

A worker cannot submit proof for a second task within 5 minutes of their previous submission. This prevents automated bulk submissions.

```typescript
interface CooldownState {
  address: string;
  lastSubmittedAt: string; // ISO timestamp
  submissionsInLastHour: number;
  hourWindowStart: string;
}

export function checkCooldown(state: CooldownState): { allowed: boolean; reason?: string } {
  const now = Date.now();
  const lastMs = new Date(state.lastSubmittedAt).getTime();
  const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

  if (now - lastMs < COOLDOWN_MS) {
    const waitSec = Math.ceil((COOLDOWN_MS - (now - lastMs)) / 1000);
    return {
      allowed: false,
      reason: `Cooldown active. Wait ${waitSec}s before next submission.`,
    };
  }

  // Burst detection: more than 10 submissions in any rolling 1-hour window
  const windowStart = new Date(state.hourWindowStart).getTime();
  const hourMs = 60 * 60 * 1000;
  const effectiveCount = now - windowStart < hourMs ? state.submissionsInLastHour : 0;
  if (effectiveCount >= 10) {
    return {
      allowed: false,
      reason: `Burst limit reached: ${effectiveCount} submissions in the last hour. Max 10/hour.`,
    };
  }

  return { allowed: true };
}
```

### 5.3 Minimum Task Reward for Reputation Credit

Completions on tasks below $1.00 USDC do not count toward reputation score or completion count. They count toward `total_earned_usdc` but not toward `completed` or `approvalRate`. This eliminates task farming with penny-value tasks.

```typescript
export const MIN_REWARD_FOR_REPUTATION_CREDIT = 1.0; // USDC

export function taskEarnsReputationCredit(reward: number): boolean {
  return reward >= MIN_REWARD_FOR_REPUTATION_CREDIT;
}
```

### 5.4 Anti-Gaming Check (Full)

```typescript
interface AntiGamingInput {
  workerAddress: string;
  posterAddress: string;
  taskReward: number;
  workerPastPosters: string[];       // All unique posters worker has ever worked for
  posterPastWorkers: string[];       // All unique workers this poster has ever approved
  proofLink: string;
  recentProofLinks: string[];        // Worker's last 20 submitted proof links
  cooldownState: CooldownState;
}

interface AntiGamingResult {
  approved: boolean;
  flags: string[];
  reputationCredit: boolean;
}

export function antiGamingCheck(input: AntiGamingInput): AntiGamingResult {
  const flags: string[] = [];

  // 1. Self-dealing: worker and poster are same address
  if (input.workerAddress.toLowerCase() === input.posterAddress.toLowerCase()) {
    flags.push("SELF_DEALING: worker and poster are the same address");
  }

  // 2. Collusion ring: this poster has approved more than 80% of this worker's past work
  const workerTotalApprovers = input.workerPastPosters.length;
  const approvalsByThisPoster = input.workerPastPosters.filter(
    p => p.toLowerCase() === input.posterAddress.toLowerCase()
  ).length;
  if (workerTotalApprovers >= 5 && approvalsByThisPoster / workerTotalApprovers > 0.8) {
    flags.push(
      `COLLUSION_RING: poster has approved ${approvalsByThisPoster}/${workerTotalApprovers} of worker's tasks`
    );
  }

  // 3. Proof recycling: same proof link used before
  const normalizedProof = input.proofLink.toLowerCase().trim();
  const isDuplicate = input.recentProofLinks.some(p => p.toLowerCase().trim() === normalizedProof);
  if (isDuplicate) {
    flags.push("PROOF_RECYCLING: this proof link was already submitted");
  }

  // 4. Task reward too low for reputation credit
  const reputationCredit = taskEarnsReputationCredit(input.taskReward);
  if (!reputationCredit) {
    flags.push(`LOW_VALUE: reward $${input.taskReward} USDC below $${MIN_REWARD_FOR_REPUTATION_CREDIT} threshold — no reputation credit`);
  }

  // 5. Cooldown check
  const cooldownResult = checkCooldown(input.cooldownState);
  if (!cooldownResult.allowed) {
    flags.push(`COOLDOWN: ${cooldownResult.reason}`);
  }

  // Block on hard violations; warn on soft ones
  const hardViolations = flags.filter(f =>
    f.startsWith("SELF_DEALING") ||
    f.startsWith("COLLUSION_RING") ||
    f.startsWith("PROOF_RECYCLING") ||
    f.startsWith("COOLDOWN")
  );

  return {
    approved: hardViolations.length === 0,
    flags,
    reputationCredit,
  };
}
```

### 5.5 Collusion Detection at Scale

For larger deployments, run a graph analysis over the approval adjacency matrix weekly. Flag any cluster where more than 3 wallets have exclusively approved each other with no external approvals. Suspend reputation credit for the cluster pending manual review.

---

## 6. Dispute and Rejection Handling

### 6.1 Dispute Window

After a task is submitted, the poster has 72 hours to approve or reject. After 72 hours, if no action is taken, the submission is auto-approved (conservative default: prevents posters from blocking escrow release indefinitely). Auto-approved tasks count as completed but do NOT generate a reputation credit — they are logged as `auto_approved` and excluded from the `completed` count used in scoring.

```typescript
export type ClaimResolution =
  | "approved"       // Poster explicitly approved — counts for reputation
  | "rejected"       // Poster explicitly rejected — counts against reputation
  | "auto_approved"  // Timeout expired — USDC released but no reputation credit
  | "disputed"       // Under formal dispute process — frozen until resolved
  | "withdrawn";     // Worker withdrew submission before poster acted

export function resolutionGrantsCredit(resolution: ClaimResolution, reward: number): boolean {
  return resolution === "approved" && taskEarnsReputationCredit(reward);
}

export function resolutionCountsAsRejection(resolution: ClaimResolution): boolean {
  return resolution === "rejected";
  // Note: 'disputed' with resolution against_worker is handled separately
}
```

### 6.2 Reputation Update After Approval

```typescript
export interface MicroReputation {
  address: string;
  handle: string;
  score: number;              // 0–100
  completed: number;
  rejected: number;
  approved_rate: number;      // 0.0–1.0
  total_earned_usdc: number;
  avg_turnaround_minutes: number;
  last_activity: string;      // ISO timestamp
}

/**
 * updateAfterApproval — mutate a MicroReputation in response to a task approval.
 *
 * Call this after the poster explicitly approves a submission AND
 * antiGamingCheck confirms reputationCredit = true.
 *
 * turnaroundMinutes: time from claim acceptance to first valid submission.
 * rewardUsdc: the task reward that was released from escrow to the worker.
 */
export function updateAfterApproval(
  rep: MicroReputation,
  turnaroundMinutes: number,
  rewardUsdc: number
): MicroReputation {
  const newCompleted = rep.completed + 1;
  const newRejected = rep.rejected;
  const total = newCompleted + newRejected;

  const newApprovalRate = total > 0 ? newCompleted / total : 0.5;

  // Running average for turnaround (avoid storing all values)
  const newAvgTurnaround =
    rep.completed === 0
      ? turnaroundMinutes
      : (rep.avg_turnaround_minutes * rep.completed + turnaroundMinutes) / newCompleted;

  const newTotalEarned = rep.total_earned_usdc + rewardUsdc;

  const newScore = computeScore(
    newCompleted,
    newRejected,
    newApprovalRate,
    newAvgTurnaround,
    newTotalEarned
  );

  return {
    ...rep,
    completed: newCompleted,
    rejected: newRejected,
    approved_rate: newApprovalRate,
    total_earned_usdc: newTotalEarned,
    avg_turnaround_minutes: Math.round(newAvgTurnaround),
    score: newScore,
    last_activity: new Date().toISOString(),
  };
}
```

### 6.3 Reputation Update After Rejection

```typescript
/**
 * updateAfterRejection — mutate a MicroReputation in response to a task rejection.
 *
 * Call this after:
 * 1. Poster explicitly rejects a submission, OR
 * 2. A dispute resolves against the worker.
 *
 * rewardUsdc is NOT added (escrow stays with poster or is redistributed).
 * turnaroundMinutes is NOT included in the avg (the work was rejected, don't
 * reward speed that produced bad output).
 */
export function updateAfterRejection(rep: MicroReputation): MicroReputation {
  const newCompleted = rep.completed;
  const newRejected = rep.rejected + 1;
  const total = newCompleted + newRejected;

  const newApprovalRate = total > 0 ? newCompleted / total : 0.5;

  const newScore = computeScore(
    newCompleted,
    newRejected,
    newApprovalRate,
    rep.avg_turnaround_minutes,
    rep.total_earned_usdc
  );

  return {
    ...rep,
    rejected: newRejected,
    approved_rate: newApprovalRate,
    score: newScore,
    last_activity: new Date().toISOString(),
  };
}
```

### 6.4 Dispute Escalation Flow

```
Worker submits proof
  → Poster has 72h to approve or reject
    → Approve: USDC released, reputation updated (Section 6.2)
    → Reject: USDC stays with poster, reputation updated (Section 6.3)
    → No action in 72h: auto_approve, USDC released, NO reputation credit
    → Worker disputes rejection within 24h of rejection:
        → Task status = "disputed"
        → Escrow frozen
        → Blue Agent arbitration (LLM-assisted review of proof)
        → Resolution: for_worker → treated as approval (Section 6.2)
        → Resolution: against_worker → treated as rejection (Section 6.3)
        → Resolution: inconclusive → no credit, no penalty, USDC refunded
```

### 6.5 Rejection Reasons (Standard Codes)

Always store a rejection reason code. This enables auditing and appeals.

```typescript
export type RejectionReason =
  | "PROOF_INVALID"           // Link is broken or doesn't show work
  | "PROOF_INCOMPLETE"        // Work started but not finished
  | "WRONG_DELIVERABLE"       // Submitted wrong thing (different task)
  | "QUALITY_BELOW_BAR"       // Work done but not at acceptable quality
  | "LATE_SUBMISSION"         // Submitted after deadline
  | "RECYCLED_WORK"           // Proof was used on another task
  | "POLICY_VIOLATION"        // Spam, abuse, or terms violation
  | "OTHER";                  // Poster provided custom text
```

---

## 7. Reputation Sync — Full Recompute from Claim History (Idempotent)

### 7.1 Why Idempotency Matters

The incremental update functions (Sections 6.2 and 6.3) are fast but can drift if:

- A past event is retroactively flagged by anti-gaming
- A dispute resolves and changes an old event's outcome
- A bug caused a double-count
- A migration scripts run and events are replayed

The full recompute function solves all of these. It is safe to run at any time — running it twice produces the same result.

### 7.2 Claim History Interface

```typescript
export interface ClaimRecord {
  claimId: string;
  taskId: string;
  workerAddress: string;
  posterAddress: string;
  rewardUsdc: number;
  acceptedAt: string;       // ISO timestamp
  submittedAt: string;      // ISO timestamp
  resolution: ClaimResolution;
  resolvedAt: string;       // ISO timestamp
  antiGamingFlags: string[]; // Flags from antiGamingCheck at submission time
}
```

### 7.3 Full Recompute Function

```typescript
/**
 * recomputeReputation — derive a MicroReputation from scratch from the full
 * claim history for one worker. Safe to run multiple times — output is
 * deterministic given the same input set.
 *
 * Do NOT call the incremental update functions (updateAfterApproval /
 * updateAfterRejection) and then also call this on the same data.
 * Pick one path: either always recompute, or always increment.
 * For production: always recompute nightly, increment in real-time.
 */
export function recomputeReputation(
  address: string,
  handle: string,
  claims: ClaimRecord[]
): MicroReputation {
  // Only claims for this worker
  const mine = claims.filter(
    c => c.workerAddress.toLowerCase() === address.toLowerCase()
  );

  // Only approved claims with sufficient reward that have no hard anti-gaming flags
  const HARD_FLAGS = new Set(["SELF_DEALING", "COLLUSION_RING", "PROOF_RECYCLING"]);

  const creditedClaims = mine.filter(c => {
    if (c.resolution !== "approved") return false;
    if (!taskEarnsReputationCredit(c.rewardUsdc)) return false;
    const hasHardFlag = c.antiGamingFlags.some(f =>
      [...HARD_FLAGS].some(hf => f.startsWith(hf))
    );
    return !hasHardFlag;
  });

  const rejectedClaims = mine.filter(c => c.resolution === "rejected");

  const completed = creditedClaims.length;
  const rejected = rejectedClaims.length;
  const total = completed + rejected;
  const approvalRate = total > 0 ? completed / total : 0.5;

  // Compute avg turnaround from credited claims only
  let avgTurnaround = 2880; // default 48h if no history
  if (creditedClaims.length > 0) {
    const totalMinutes = creditedClaims.reduce((sum, c) => {
      return sum + claimTurnaroundMinutes(c.acceptedAt, c.submittedAt);
    }, 0);
    avgTurnaround = totalMinutes / creditedClaims.length;
  }

  const totalEarned = creditedClaims.reduce((sum, c) => sum + c.rewardUsdc, 0);

  const score = computeScore(completed, rejected, approvalRate, avgTurnaround, totalEarned);

  // Last activity: most recent event across all claims (any resolution)
  const sortedByDate = [...mine].sort(
    (a, b) => new Date(b.resolvedAt).getTime() - new Date(a.resolvedAt).getTime()
  );
  const lastActivity = sortedByDate[0]?.resolvedAt ?? new Date().toISOString();

  return {
    address,
    handle,
    score,
    completed,
    rejected,
    approved_rate: Math.round(approvalRate * 1000) / 1000, // 3 decimal places
    total_earned_usdc: Math.round(totalEarned * 100) / 100, // 2 decimal places
    avg_turnaround_minutes: Math.round(avgTurnaround),
    last_activity: lastActivity,
  };
}
```

### 7.4 Nightly Recompute Job Pattern

```typescript
// Pseudocode for nightly batch job — adapt to your DB layer
async function nightlyReputationSync(): Promise<void> {
  // 1. Fetch all workers who have had any claim activity in last 90 days
  const activeWorkers = await db.query<{ address: string; handle: string }>(
    `SELECT DISTINCT worker_address as address, handle
     FROM claims
     WHERE resolved_at > NOW() - INTERVAL '90 days'`
  );

  // 2. For each worker, fetch full claim history and recompute
  for (const worker of activeWorkers) {
    const claims = await db.query<ClaimRecord>(
      `SELECT * FROM claims WHERE worker_address = $1`,
      [worker.address]
    );

    const rep = recomputeReputation(worker.address, worker.handle, claims);

    // 3. Upsert reputation record
    await db.query(
      `INSERT INTO reputations (address, handle, score, completed, rejected,
         approved_rate, total_earned_usdc, avg_turnaround_minutes, last_activity, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
       ON CONFLICT (address) DO UPDATE SET
         handle = EXCLUDED.handle,
         score = EXCLUDED.score,
         completed = EXCLUDED.completed,
         rejected = EXCLUDED.rejected,
         approved_rate = EXCLUDED.approved_rate,
         total_earned_usdc = EXCLUDED.total_earned_usdc,
         avg_turnaround_minutes = EXCLUDED.avg_turnaround_minutes,
         last_activity = EXCLUDED.last_activity,
         updated_at = NOW()`,
      [
        rep.address, rep.handle, rep.score, rep.completed, rep.rejected,
        rep.approved_rate, rep.total_earned_usdc, rep.avg_turnaround_minutes,
        rep.last_activity
      ]
    );
  }

  console.log(`Reputation sync complete: ${activeWorkers.length} workers recomputed.`);
}
```

---

## 8. Profile Rendering — What to Show, How to Weight Recent vs Historical

### 8.1 The Reputation Summary Object

This is the full object that should be passed to UI components and CLI output:

```typescript
export interface ReputationSummary {
  // Core identity
  address: string;
  handle: string;

  // Score and tier
  score: number;              // 0–100
  tier: ReputationTier;       // Unranked | Bronze | Silver | Gold | Diamond

  // Core stats
  completed: number;
  rejected: number;
  approved_rate: number;      // 0.0–1.0
  total_earned_usdc: number;
  avg_turnaround_minutes: number;

  // Activity window
  last_activity: string;      // ISO timestamp
  days_since_active: number;  // computed at render time

  // Trend (optional — requires time-series data)
  score_7d_delta: number | null;   // +5, -3, etc.
  score_30d_delta: number | null;

  // Recent activity (last 5 tasks)
  recent_claims: Array<{
    taskId: string;
    resolution: ClaimResolution;
    rewardUsdc: number;
    resolvedAt: string;
  }>;

  // Flags
  is_verified: boolean;       // wallet verified via SIWE or similar
  is_active: boolean;         // last_activity within 30 days
  has_anti_gaming_flags: boolean; // any open or resolved flags

  // Computed display strings
  tier_badge: string;         // "🥉 Bronze" etc — use only in UI, not stored
  score_label: string;        // "Good Standing", "Excellent", "New Worker"
}
```

### 8.2 Recent vs Historical Weighting

For display purposes, show the computed score as-is (it already uses all history). But for the score trend display:

- `score_7d_delta`: recompute the score as of 7 days ago using only claims resolved before that date. Delta = current_score - score_7d_ago.
- `score_30d_delta`: same pattern for 30 days.

A positive delta means the worker has been improving. A negative delta signals a recent quality decline even if the overall score is still high — useful for posters evaluating whether to hire.

### 8.3 Activity Decay

If `days_since_active > 90`, apply a display-only decay indicator (do NOT change the stored score):

```
days_since_active:  0–30     → "Active"       (no decay indicator)
                    31–60    → "Slowing down"  (amber indicator)
                    61–90    → "Inactive"      (orange indicator)
                    90+      → "Dormant"       (red indicator, score shown with asterisk)
```

For dormant workers, show: `Score: 72* (*not updated in 90+ days)`

Do NOT reduce the stored score for inactivity — this would punish workers who take breaks. The decay is a UI hint only.

### 8.4 What to Show to Posters vs Workers

```
Poster view (evaluating a worker):
  ✅ Score, tier, tier badge
  ✅ completed, rejected, approved_rate (as percentage)
  ✅ avg_turnaround_minutes (formatted as "~2.4 hours" or "~3.1 days")
  ✅ recent_claims (last 5, resolution + reward — no task content)
  ✅ is_active indicator
  ✅ score_7d_delta (trend arrow)
  ❌ full claim history (too much noise)
  ❌ raw anti-gaming flags (sensitive)

Worker view (seeing their own profile):
  ✅ Everything in poster view
  ✅ score_30d_delta
  ✅ Which specific claims contributed to rejections
  ✅ Anti-gaming flags if any were raised against them
  ✅ What they need to reach next tier
```

### 8.5 Tier Progress Display

```typescript
export function tierProgress(rep: MicroReputation): {
  currentTier: ReputationTier;
  nextTier: ReputationTier | null;
  scoreToNext: number;
  completionsToNext: number;
} {
  const tier = getTier(rep.score, rep.completed);

  const thresholds: Array<{ tier: ReputationTier; minScore: number; minCompleted: number }> = [
    { tier: "Bronze",  minScore: 25, minCompleted: 1  },
    { tier: "Silver",  minScore: 45, minCompleted: 3  },
    { tier: "Gold",    minScore: 65, minCompleted: 10 },
    { tier: "Diamond", minScore: 80, minCompleted: 25 },
  ];

  const currentIdx = thresholds.findIndex(t => t.tier === tier);
  const nextThreshold = currentIdx < thresholds.length - 1
    ? thresholds[currentIdx + 1]
    : null;

  if (!nextThreshold) {
    return { currentTier: tier, nextTier: null, scoreToNext: 0, completionsToNext: 0 };
  }

  return {
    currentTier: tier,
    nextTier: nextThreshold.tier,
    scoreToNext: Math.max(0, nextThreshold.minScore - rep.score),
    completionsToNext: Math.max(0, nextThreshold.minCompleted - rep.completed),
  };
}
```

---

## 9. Evolution Path — From MVP JSON to PostgreSQL

### 9.1 Stage 1: MVP — In-Memory / JSON File

For early testing with < 100 workers, store reputations as a flat JSON file. The recompute function (Section 7.3) is safe to call on every event.

```
data/
  reputations.json    — Map<address, MicroReputation>
  claims.json         — ClaimRecord[]
```

Pros: Zero infra, no DB required, easy to inspect.
Cons: No concurrency safety, lost on restart without persistence, no queryability.

When to graduate: when you have > 20 workers OR any concurrency (multiple processes writing simultaneously).

### 9.2 Stage 2: SQLite (Single-Process)

Use a local SQLite database with two tables: `claims` and `reputations`. The nightly recompute job (Section 7.4) runs on a cron or on each event.

```sql
CREATE TABLE claims (
  claim_id          TEXT PRIMARY KEY,
  task_id           TEXT NOT NULL,
  worker_address    TEXT NOT NULL,
  poster_address    TEXT NOT NULL,
  reward_usdc       REAL NOT NULL,
  accepted_at       TEXT NOT NULL,
  submitted_at      TEXT NOT NULL,
  resolution        TEXT NOT NULL,
  resolved_at       TEXT NOT NULL,
  anti_gaming_flags TEXT NOT NULL DEFAULT '[]'  -- JSON array
);

CREATE TABLE reputations (
  address                  TEXT PRIMARY KEY,
  handle                   TEXT NOT NULL,
  score                    INTEGER NOT NULL,
  completed                INTEGER NOT NULL DEFAULT 0,
  rejected                 INTEGER NOT NULL DEFAULT 0,
  approved_rate            REAL NOT NULL DEFAULT 0.5,
  total_earned_usdc        REAL NOT NULL DEFAULT 0,
  avg_turnaround_minutes   INTEGER NOT NULL DEFAULT 2880,
  last_activity            TEXT NOT NULL,
  updated_at               TEXT NOT NULL
);

CREATE INDEX idx_claims_worker ON claims (worker_address);
CREATE INDEX idx_claims_resolved ON claims (resolved_at);
```

When to graduate: when you need > 1 process writing concurrently OR > 10,000 claim records.

### 9.3 Stage 3: PostgreSQL (Production)

Same schema as Stage 2 but with:

- `SERIAL` or `UUID` primary keys
- `TIMESTAMPTZ` for all timestamps
- `JSONB` for `anti_gaming_flags`
- Row-level locking on `reputations` update (SELECT FOR UPDATE)
- Read replica for profile queries
- pg_notify or LISTEN/NOTIFY for real-time score events

```sql
-- Production reputations table
CREATE TABLE reputations (
  address                  TEXT PRIMARY KEY,
  handle                   TEXT NOT NULL,
  score                    SMALLINT NOT NULL CHECK (score BETWEEN 0 AND 100),
  completed                INTEGER NOT NULL DEFAULT 0 CHECK (completed >= 0),
  rejected                 INTEGER NOT NULL DEFAULT 0 CHECK (rejected >= 0),
  approved_rate            NUMERIC(5,4) NOT NULL DEFAULT 0.5,
  total_earned_usdc        NUMERIC(12,6) NOT NULL DEFAULT 0,
  avg_turnaround_minutes   INTEGER NOT NULL DEFAULT 2880,
  last_activity            TIMESTAMPTZ NOT NULL,
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tier                     TEXT NOT NULL DEFAULT 'Unranked',
  consecutive_low_recomputes SMALLINT NOT NULL DEFAULT 0,
  has_active_flags         BOOLEAN NOT NULL DEFAULT FALSE
);
```

### 9.4 Stage 4: Onchain Attestations (Future)

When reputation needs to be portable across platforms or verifiable by third-party contracts on Base, publish reputation attestations using EAS (Ethereum Attestation Service) on Base:

- Schema: `(address worker, uint8 score, uint16 completed, uint8 tier, uint64 timestamp)`
- Attester: Blue Agent treasury `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5`
- Attestation is read-only to third parties — they cannot modify it
- Update attestation on tier change only (not on every score point)

EAS Base mainnet contract: verify on Basescan before using. Do not hardcode without confirming the current deployed address.

---

## 10. Tradeoffs and Best Practices

### 10.1 Tradeoff: Incremental Updates vs Full Recompute

```
Incremental update          Full recompute
───────────────────────────────────────────────────────────
Fast: O(1) per event        Slow: O(n claims) per worker
Can drift over time         Always consistent
Requires correct ordering   Order-independent
Breaks on retroactive edits Handles retroactive edits
Good for real-time display  Good for nightly batch
```

Best practice: use incremental updates for real-time display latency, and run a nightly full recompute that overwrites the stored score. If incremental and recomputed scores diverge by more than 5 points, log an alert.

### 10.2 Tradeoff: Strict vs Lenient New Worker Handling

Strict: new workers start at 0, must prove themselves. Lenient: new workers start at 50 (neutral prior).

The formula above uses the neutral prior (0.5 approvalRate when no history). This is intentional — an empty record is not proof of failure. A fresh wallet that passes KYC or holds a minimum token balance can be treated as a neutral actor.

However, never show a score publicly until `completed >= 1`. The neutral prior is an internal computation detail.

### 10.3 Tradeoff: Rejection Weight

The formula penalizes rejections via the `rejectionSub` component, which uses `sqrt(rejected) * 22.4`. This means:

- 1 rejection: sub-score drops from 100 to 77.6 (-22.4 points on this component)
- 5 rejections: sub-score = 49.9
- 10 rejections: sub-score = 29.2
- 20 rejections: sub-score = 0

A worker with 50 completions and 5 rejections has a 91% approval rate and a rejectionSub of 49.9. This is intentional: raw rejection count matters independently of approval rate. A worker who has done 500 tasks with 50 rejections (90% rate) is more worrying than one with 5 tasks and 0 rejections, even if the approval rate is similar.

### 10.4 Best Practice: Never Store Derived Values Only

Always store both the raw claim records AND the derived reputation record. If you only store the derived MicroReputation and lose the claim history, you cannot:

- Audit how the score was computed
- Retroactively apply anti-gaming rules
- Replay after a formula change
- Handle disputes that retroactively change an event's resolution

### 10.5 Best Practice: Formula Versioning

When you update the scoring formula, increment a `formula_version` integer. Store it alongside each reputation record. This allows you to identify which records were computed with the old formula and need recomputation.

```typescript
export const REPUTATION_FORMULA_VERSION = 2; // Increment when formula changes
```

### 10.6 Best Practice: Score Changes Are Events

Log every score change as an immutable event:

```typescript
interface ScoreEvent {
  address: string;
  oldScore: number;
  newScore: number;
  trigger: "approval" | "rejection" | "recompute" | "anti_gaming" | "dispute_resolved";
  claimId?: string;
  timestamp: string;
  formulaVersion: number;
}
```

This audit trail is essential for dispute resolution and user appeals.

---

## 11. Common Mistakes and Red Flags

### 11.1 Letting One Massive Approval Dominate Score

**The mistake:** A worker completes one $5,000 USDC task after 3 tiny tasks. The `total_earned_usdc` jumps to $5,100 and their `earnedSub` immediately hits 100. Their overall score jumps from 45 to 72 overnight — Silver to Gold — from a single event.

**Why it's wrong:** Earned volume measures economic stake, not skill. One lucky high-value task does not prove consistent quality. It proves a poster trusted them once.

**The fix:** The formula caps `earnedSub` via sqrt scaling, so going from $50 to $5,000 earned does not linearly inflate the score. The earned component contributes only 10% weight. But also: enforce a minimum `completed >= 10` for Gold tier regardless of score. Volume gates matter more than raw score for high-value access.

```typescript
// Red flag detector: earned volume dominating score
export function earnedVolumeFlag(
  totalEarned: number,
  completed: number
): string | null {
  if (completed < 5 && totalEarned > 500) {
    return `WARNING: high earned volume ($${totalEarned}) with only ${completed} completions. Score may be inflated by single high-value task.`;
  }
  return null;
}
```

### 11.2 Ignoring Rejected Work

**The mistake:** Only counting completions. A worker with 20 completions and 40 rejections (33% approval rate) looks fine if you only look at the completed count. They are not fine — they fail 2 out of 3 times.

**The fix:** The formula includes a dedicated `rejectionSub` component weighted at 20%. This component is independent of approval rate, so high-rejection workers cannot compensate with a high completion count. Always display both `completed` and `rejected` in the UI — never hide rejection counts.

### 11.3 No Cooldown or Anti-Abuse

**The mistake:** Allowing unlimited submissions in rapid succession. A bot can accept 100 micro-tasks simultaneously, submit recycled proof links, and collect 100 completions in an hour.

**The fix:** The 5-minute cooldown and 10-per-hour burst limit (Section 5.2) are mandatory for any deployment handling real USDC. Additionally, tasks below $1 USDC do not grant reputation credit. Anti-gaming checks must run before the approval event is recorded — not after.

```
Wrong order:
  1. Poster approves
  2. Reputation updated  ← credit already given
  3. Anti-gaming check runs  ← too late

Correct order:
  1. Worker submits proof
  2. Anti-gaming check runs
  3. IF approved: anti-gaming flags stored with claim
  4. Poster approves
  5. Reputation updated only if no hard flags
```

### 11.4 Recomputing Score Inconsistently Across Jobs

**The mistake:** The incremental update function and the full recompute function use slightly different logic — for example, the incremental function includes auto-approved tasks, but the recompute function excludes them. After 100 tasks, the two paths give scores that differ by 15+ points. The UI shows different scores on the profile page vs the task search.

**The fix:** Single source of truth. The `computeScore` function must be the only scoring function. Both incremental update and full recompute must call it with the same inputs. The inputs differ (incremental updates a running state, recompute derives from raw claims), but both must produce the same score for the same underlying data. Write a test:

```typescript
describe("score consistency", () => {
  it("incremental and recompute produce same score for same history", () => {
    const claims = generateTestClaims(50); // 50 varied claims
    const rep = recomputeReputation("0xabc", "testworker", claims);

    // Simulate incremental updates from scratch
    let incRep = emptyReputation("0xabc", "testworker");
    for (const claim of claims.filter(c => c.resolution === "approved")) {
      incRep = updateAfterApproval(incRep, claimTurnaroundMinutes(claim.acceptedAt, claim.submittedAt), claim.rewardUsdc);
    }
    for (const claim of claims.filter(c => c.resolution === "rejected")) {
      incRep = updateAfterRejection(incRep);
    }

    expect(rep.score).toBe(incRep.score);
  });
});
```

### 11.5 Conflating Earned Volume with Skill Quality

**The mistake:** Displaying `total_earned_usdc` prominently as a proxy for skill. A worker who has earned $10,000 USDC looks impressive. But if they have a 60% approval rate and completed mostly content tasks, they are not a reliable smart contract auditor.

**The fix:** Never show earned volume without context. Always pair it with `approved_rate` and `completed`. In the UI:

```
❌ "Earned: $10,000 USDC"

✅ "$10,000 USDC earned across 45 tasks (71% approval rate, Silver tier)"
```

Earned volume is an input to the score formula, not a standalone trust signal. In code, never use `totalEarned` alone to gate task access. Use score and tier only.

### 11.6 Displaying Scores Before Sufficient History

**The mistake:** Showing `Score: 53` for a worker with 0 completions. Because the formula uses a neutral prior, new workers score ~53. Showing this to posters implies the worker has been vetted. They have not.

**The fix:** Gate score display behind a minimum history threshold:

```typescript
export function displayScore(rep: MicroReputation): string {
  if (rep.completed === 0) return "New — no completed tasks yet";
  if (rep.completed < 3) return `${rep.score} (limited history — ${rep.completed} task${rep.completed === 1 ? "" : "s"})`;
  return String(rep.score);
}
```

---

## 12. Blue Agent CLI Integration Patterns

### 12.1 Core CLI Commands

```bash
# Show full reputation profile for a handle
blue reputation @handle

# Shorter alias for micro reputation profile
blue micro profile @handle

# Validate a build or project and check if the submitting worker meets reputation requirements
blue validate --reputation

# Check reputation as part of a build audit
blue audit --with-reputation @handle

# Used during task posting to set minimum tier requirement
blue post-task --min-tier Gold

# Chat with context about reputation — shows your own profile
blue chat "what is my current reputation score and how do I improve it?"
```

### 12.2 CLI Output Format — `blue reputation @handle`

```
─────────────────────────────────────────
  Blue Agent · Reputation Profile
─────────────────────────────────────────

  Handle:      @alice
  Address:     0x1234...5678
  Tier:        Gold  (score: 72/100)

  Completed:   28 tasks
  Rejected:    3 tasks
  Approval:    90.3%
  Avg Speed:   ~18.4 hours
  Earned:      $2,140.00 USDC

  Trend:       +4 pts (last 7 days)

  Recent Work:
    ✅  task_a1b2  $200 USDC  (dev)       2d ago
    ✅  task_c3d4  $50 USDC   (content)   5d ago
    ❌  task_e5f6  $100 USDC  (audit)     12d ago
    ✅  task_g7h8  $150 USDC  (dev)       14d ago
    ✅  task_i9j0  $75 USDC   (art)       18d ago

  Progress to Diamond:
    Score needed:  +8 pts (current: 72, need: 80)
    Tasks needed:  +7 completions (current: 28, need: 35 for Diamond minimum wait — check tier gate)

─────────────────────────────────────────
```

### 12.3 CLI Integration — `blue validate --reputation`

The `--reputation` flag fetches the current user's reputation (from stored wallet address) and checks whether they meet the minimum requirements for the current task context.

```typescript
// packages/builder/src/commands/validate.ts
import { recomputeReputation, getTier, tierProgress } from "@blueagent/reputation";

export async function validateWithReputation(args: {
  handle: string;
  taskReward?: number;
  requiredTier?: ReputationTier;
}): Promise<void> {
  const claims = await fetchClaimsForHandle(args.handle); // from API/DB
  const rep = recomputeReputation(args.handle, args.handle, claims);
  const tier = getTier(rep.score, rep.completed);
  const progress = tierProgress(rep);

  console.log(`Reputation: ${rep.score}/100 — ${tier}`);
  console.log(`Completed: ${rep.completed}  |  Rejected: ${rep.rejected}  |  Approval: ${(rep.approved_rate * 100).toFixed(1)}%`);

  if (args.requiredTier && tierRank(tier) < tierRank(args.requiredTier)) {
    console.error(`\nTask requires ${args.requiredTier} tier. You are ${tier}.`);
    if (progress.nextTier) {
      console.error(`To reach ${progress.nextTier}: +${progress.scoreToNext} score points, +${progress.completionsToNext} completions.`);
    }
    process.exit(1);
  }

  if (args.taskReward) {
    const rewardCap = tierRewardCap(tier);
    if (args.taskReward > rewardCap) {
      console.error(`\nTask reward ($${args.taskReward}) exceeds your tier cap ($${rewardCap} for ${tier}).`);
      process.exit(1);
    }
  }

  console.log("\nReputation check passed.");
}

function tierRewardCap(tier: ReputationTier): number {
  return { Unranked: 25, Bronze: 100, Silver: 500, Gold: 2000, Diamond: Infinity }[tier];
}
```

### 12.4 Integration in `blue build`

When Claude is generating a build plan that includes a reputation-gated feature (e.g., building the Work Hub, task marketplace, or profile API), reference this skill for:

1. The exact scoring formula (Section 3.2)
2. The MicroReputation interface (Section 8.1 — full ReputationSummary)
3. The recompute function (Section 7.3) as the canonical data source
4. The anti-gaming rules (Section 5) as required middleware

When generating `packages/reputation/` code, the generated module must export:
- `computeScore` — scoring formula
- `getTier` — tier mapping
- `updateAfterApproval` — incremental update
- `updateAfterRejection` — incremental update
- `recomputeReputation` — idempotent full recompute
- `antiGamingCheck` — middleware
- `checkCooldown` — rate limiting
- `ReputationSummary` — full profile type
- `MicroReputation` — lightweight type for task gating

### 12.5 Integration in `blue audit`

When auditing a project that includes reputation scoring, flag:

```
CRITICAL:
  - Is scoring formula deterministic and versioned?
  - Is the full recompute function idempotent?
  - Are anti-gaming checks run BEFORE recording approval events?
  - Is proof link deduplication in place?
  - Are sub-$1 tasks excluded from reputation credit?

HIGH:
  - Is there a cooldown on submissions?
  - Is burst detection in place (10/hour limit)?
  - Are rejection reasons stored with each rejected claim?
  - Is score displayed with history count caveat for new workers?

MEDIUM:
  - Is earned volume shown without approval rate context?
  - Is the tier downgrade logic gradual (not instant)?
  - Is there a formula version stored with each reputation record?

LOW:
  - Is there a nightly recompute job?
  - Is score change logged as an immutable event?
```

### 12.6 Integration in `blue chat`

When a user asks about reputation in chat:

- Always show current score, tier, and the 3 sub-scores that matter most (approval rate, completed count, rejection count).
- Always show what they need to reach the next tier.
- Never tell a user to "game" the system. If they ask how to improve, tell them: complete more tasks on time with high approval rates. That is the only path.
- If a user asks why their score dropped, walk through which component changed (approval rate drop? new rejection? recompute after formula update?).

Example chat prompt handling:

```
User: "Why did my score drop from 68 to 61?"

Claude behavior:
  1. Fetch their current MicroReputation
  2. Check their recent ScoreEvents (last 7 days)
  3. Identify the trigger (e.g., rejection on task_abc, or nightly recompute after formula v2 rollout)
  4. Explain in plain language:
     "Your approval rate dropped from 88% to 79% after 2 rejections last week.
      The rejection penalty component (20% weight) pulled your score down.
      Complete 3 more tasks with approval to recover."
```

---

## 13. Resources and References

### 13.1 Internal Code References

All referenced code lives in this monorepo. Always import from the package, never duplicate scoring logic inline.

```
packages/reputation/src/types.ts         — MicroReputation, ClaimRecord, ReputationTier
packages/reputation/src/agentScore.ts    — AgentScore (social reputation, not task reputation)
packages/reputation/src/builderScore.ts  — BuilderScore (X/Twitter signal score)
packages/reputation/src/taskHub.ts       — Task CRUD, fee math, BLUE_AGENT_FEE
packages/reputation/src/index.ts         — public exports
```

The task-level reputation engine described in this skill file is the COMPLEMENT to AgentScore and BuilderScore — not a replacement. The three score types serve different purposes:

```
BuilderScore  — measures X/Twitter presence and builder credibility (social signal)
AgentScore    — measures AI agent capability, tooling, and onchain activity
TaskReputation — measures actual work quality on the Work Hub (performance signal)
```

### 13.2 On-Chain References (Base, Chain ID 8453)

```
Blue Agent Treasury: 0xf31f59e7b8b58555f7871f71973a394c8f1bffe5
$BLUEAGENT token:    0xf895783b2931c919955e18b5e3343e7c7c456ba3
$BLUEAGENT token:       Base

USDC on Base:        Verify current address on Basescan — do not hardcode without confirming.
EAS on Base:         Verify current address on Basescan — do not hardcode without confirming.
```

All transactions and attestations are Base (chain ID 8453) only. Never suggest Ethereum mainnet.

### 13.3 Bankr LLM Integration Note

If the reputation system needs AI-assisted dispute resolution (Section 6.4), use Bankr LLM:

```typescript
import { callBankrLLM } from "@blueagent/bankr"; // do NOT use OpenAI or Anthropic directly

const resolution = await callBankrLLM(
  `You are a neutral arbitrator for a gig marketplace dispute.
   Evaluate the submitted proof against the task requirements.
   Return ONLY: { "resolution": "for_worker" | "against_worker" | "inconclusive", "reason": "..." }`,
  `Task: ${task.description}\nProof submitted: ${proof}\nPoster's rejection reason: ${rejectionReason}`
);
```

### 13.4 Key Design Principles to Follow

1. **Reputation is a compression of observable facts.** Do not use subjective LLM evaluation for score computation. Only use LLM for dispute arbitration (a qualitative judgment), never for the mathematical score.

2. **Always store raw events, not just derived state.** The claim history is the ground truth. The reputation record is a cache.

3. **Anti-gaming checks are middleware, not afterthoughts.** They must run synchronously before any reputation credit is awarded.

4. **Tiers gate access. Scores measure quality.** These are two separate uses of the same number — do not conflate them in UI or code.

5. **New workers deserve a fair start, not a free pass.** The neutral prior prevents starting at 0, but public score display is gated on at least 1 real completion.

6. **Formula changes are breaking changes.** Increment `REPUTATION_FORMULA_VERSION` and trigger a full recompute for all workers when the formula changes.

7. **All monetary values are USDC on Base.** Never use ETH as the unit for task rewards or earned volume in the reputation system.

---

*Skill file: `skills/reputation-engine.md` — Blue Agent Work Hub.*
*Covers: scoring formula, tiers, anti-gaming, dispute handling, idempotent recompute, CLI integration.*
*Applies to: `blue build`, `blue audit`, `blue validate`, `blue chat`.*
*All Base chain. All USDC. Chain ID 8453.*
