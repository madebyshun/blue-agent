// Builder Score
export type BuilderTier = "Explorer" | "Builder" | "Maker" | "Legend" | "Founder";

export interface BuilderScoreDimensions {
  activity: number;    // 0-25
  social: number;      // 0-25
  uniqueness: number;  // 0-20
  thesis: number;      // 0-20
  community: number;   // 0-10
}

export interface BuilderScoreResult {
  handle: string;
  score: number;
  tier: BuilderTier;
  dimensions: BuilderScoreDimensions;
  summary: string;
  badge: string;
}

// Agent Score
export type AgentTier = "Bot" | "Agent" | "Pro Agent" | "Elite Agent" | "Sovereign";

export interface AgentScoreDimensions {
  skillDepth: number;         // 0-25
  onchainActivity: number;    // 0-15
  reliability: number;        // 0-20
  interoperability: number;   // 0-20
  reputation: number;         // 0-20
}

export interface AgentScoreResult {
  handle: string;
  score: number;
  tier: AgentTier;
  dimensions: AgentScoreDimensions;
  strengths: string[];
  gaps: string[];
  badge: string;
}

// Task Hub
export type TaskCategory = "audit" | "content" | "art" | "data" | "dev";
export type TaskStatus = "open" | "in_progress" | "completed" | "disputed";
export type ProofType = "tx_hash" | "github_link" | "npm_link" | "url";

export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  reward: number;            // USDC, required — no default
  currency: "USDC";
  poster: string;
  deadline: string;
  status: TaskStatus;
  proof_required: ProofType;
  max_slots: number;         // how many doers can accept (default 1)
  slots_taken: number;       // how many have accepted so far
  proof?: string;
  doer?: string;             // last accepted doer (or only doer when max_slots=1)
  doers?: string[];          // all accepted doers when max_slots > 1
  created_at: string;
  updated_at: string;
}

export interface TaskCreateInput {
  title: string;
  description: string;
  category: TaskCategory;
  reward: number;            // required — caller must specify
  poster: string;
  deadline: string;
  proof_required: ProofType;
  max_slots?: number;        // optional, defaults to 1
}
