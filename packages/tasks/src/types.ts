export type TaskCategory = "audit" | "content" | "art" | "data" | "dev";
export type TaskDifficulty = "easy" | "medium" | "hard";
export type TaskStatus = "open" | "in_progress" | "completed" | "disputed";
export type ProofType = "tx_hash" | "github_link" | "npm_link" | "url";

export interface XpReward {
  poster: number;
  doer: number;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  reward: number;
  currency: "USDC";
  poster: string;
  doer?: string;
  deadline: string;
  status: TaskStatus;
  proof_required: ProofType;
  proof?: string;
  xp_reward: XpReward;
  fee_pct: 5;
  created_at: string;
  updated_at: string;
}

export interface TaskCreateInput {
  title: string;
  description: string;
  category: TaskCategory;
  difficulty: TaskDifficulty;
  reward: number;
  poster: string;
  deadline: string;
  proof_required: ProofType;
}

export interface TaskFilter {
  category?: TaskCategory;
  status?: TaskStatus;
}

const XP_BY_DIFFICULTY: Record<TaskDifficulty, number> = {
  easy: 5,
  medium: 15,
  hard: 50,
};

export function xpForDifficulty(difficulty: TaskDifficulty): number {
  return XP_BY_DIFFICULTY[difficulty];
}
