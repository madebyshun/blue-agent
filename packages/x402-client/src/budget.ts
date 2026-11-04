/**
 * Agent budget for x402 spending: limits the CLIENT enforces before it signs.
 *
 * Nothing here holds or moves money. Each check runs between reading a 402 and
 * signing the EIP-3009 authorization, so a refused call is never paid:
 *   • a total budget for the client (every agent sharing this key),
 *   • a budget per agent (CallOptions.agent), which the agent cannot raise:
 *     budgets are fixed when the client is built,
 *   • a loop guard: the same agent calling the same endpoint with the same body
 *     more than `maxRepeats` times inside `windowSeconds` is stopped, so an
 *     agent stuck retrying cannot drain the wallet one cent at a time.
 *
 * Spend is RESERVED before signing and only kept if the seller answers 2xx, so
 * concurrent calls cannot overshoot a budget, and a failed call gives its
 * reservation back.
 */

export interface AgentBudgetConfig {
  /** USDC atomic units (6 decimals) this client may spend in total. Unset = no total cap. */
  totalAtomic?: bigint;
  /** Per-agent caps, USDC atomic units, keyed by CallOptions.agent. */
  perAgentAtomic?: Record<string, bigint>;
  /** Cap for any agent not named in perAgentAtomic. Unset = only the total applies. */
  defaultAgentAtomic?: bigint;
  /** Loop guard. Default { maxRepeats: 5, windowSeconds: 60 }; `false` turns it off. */
  loop?: { maxRepeats: number; windowSeconds: number } | false;
}

export type BudgetErrorCode = "BUDGET_EXCEEDED" | "AGENT_BUDGET_EXCEEDED" | "LOOP_DETECTED";

export class BudgetError extends Error {
  readonly code: BudgetErrorCode;
  constructor(code: BudgetErrorCode, message: string) {
    super(message);
    this.name = "BudgetError";
    this.code = code;
  }
}

export interface AgentSpend { agent: string; spentAtomic: bigint; calls: number; capAtomic: bigint | null }

const fmt = (a: bigint) => {
  const v = Number(a) / 1e6;
  return `$${v > 0 && v < 0.01 ? v.toFixed(4) : v.toFixed(2)}`;
};

export const DEFAULT_AGENT = "default";

export class AgentBudget {
  private readonly total?: bigint;
  private readonly perAgent: Record<string, bigint>;
  private readonly defaultAgent?: bigint;
  private readonly loop: { maxRepeats: number; windowMs: number } | null;
  private spentTotal = 0n;
  private reservedTotal = 0n;
  private readonly spentBy = new Map<string, { spent: bigint; reserved: bigint; calls: number }>();
  private readonly seen = new Map<string, number[]>();

  constructor(cfg: AgentBudgetConfig = {}, private readonly now: () => number = Date.now) {
    this.total = cfg.totalAtomic;
    this.perAgent = { ...(cfg.perAgentAtomic ?? {}) };
    this.defaultAgent = cfg.defaultAgentAtomic;
    const l = cfg.loop === undefined ? { maxRepeats: 5, windowSeconds: 60 } : cfg.loop;
    if (l && (!Number.isInteger(l.maxRepeats) || l.maxRepeats < 1 || !(l.windowSeconds > 0))) {
      throw new Error("loop guard needs a whole maxRepeats ≥ 1 and windowSeconds > 0");
    }
    this.loop = l ? { maxRepeats: l.maxRepeats, windowMs: l.windowSeconds * 1000 } : null;
    for (const [k, v] of [["total", this.total], ["default", this.defaultAgent], ...Object.entries(this.perAgent)] as const) {
      if (v !== undefined && v < 0n) throw new Error(`budget ${k} must not be negative`);
    }
  }

  private capFor(agent: string): bigint | undefined {
    return this.perAgent[agent] ?? this.defaultAgent;
  }

  private row(agent: string) {
    let r = this.spentBy.get(agent);
    if (!r) { r = { spent: 0n, reserved: 0n, calls: 0 }; this.spentBy.set(agent, r); }
    return r;
  }

  /**
   * Record an attempt and refuse a loop. Called for EVERY call, paid or free,
   * before anything is signed: a loop on a free endpoint is still a loop.
   */
  checkLoop(agent: string, key: string): void {
    if (!this.loop) return;
    const k = `${agent}\u0000${key}`;
    const t = this.now();
    const hits = (this.seen.get(k) ?? []).filter((x) => t - x < this.loop!.windowMs);
    if (hits.length >= this.loop.maxRepeats) {
      this.seen.set(k, hits);
      throw new BudgetError("LOOP_DETECTED",
        `Agent "${agent}" made the same call ${hits.length + 1} times in ${this.loop.windowMs / 1000}s; stopped as a loop. Nothing was paid.`);
    }
    hits.push(t);
    this.seen.set(k, hits);
  }

  /** Reserve `amount` for `agent` or throw. Returns a release/commit handle. */
  reserve(agent: string, amount: bigint, what: string): { commit: () => void; release: () => void } {
    const r = this.row(agent);
    if (this.total !== undefined && this.spentTotal + this.reservedTotal + amount > this.total) {
      const left = this.total - this.spentTotal - this.reservedTotal;
      throw new BudgetError("BUDGET_EXCEEDED",
        `${what} costs ${fmt(amount)}; ${fmt(left < 0n ? 0n : left)} of the ${fmt(this.total)} total budget is left. Nothing was paid.`);
    }
    const cap = this.capFor(agent);
    if (cap !== undefined && r.spent + r.reserved + amount > cap) {
      const left = cap - r.spent - r.reserved;
      throw new BudgetError("AGENT_BUDGET_EXCEEDED",
        `${what} costs ${fmt(amount)}; agent "${agent}" has ${fmt(left < 0n ? 0n : left)} of its ${fmt(cap)} budget left. Nothing was paid.`);
    }
    r.reserved += amount;
    this.reservedTotal += amount;
    let done = false;
    return {
      commit: () => {
        if (done) return; done = true;
        r.reserved -= amount; this.reservedTotal -= amount;
        r.spent += amount; this.spentTotal += amount; r.calls++;
      },
      release: () => {
        if (done) return; done = true;
        r.reserved -= amount; this.reservedTotal -= amount;
      },
    };
  }

  get spentAtomic(): bigint { return this.spentTotal; }

  remainingAtomic(agent?: string): bigint | null {
    const totalLeft = this.total === undefined ? null : this.total - this.spentTotal - this.reservedTotal;
    if (agent === undefined) return totalLeft;
    const cap = this.capFor(agent);
    const r = this.spentBy.get(agent);
    const agentLeft = cap === undefined ? null : cap - (r?.spent ?? 0n) - (r?.reserved ?? 0n);
    if (totalLeft === null) return agentLeft;
    if (agentLeft === null) return totalLeft;
    return agentLeft < totalLeft ? agentLeft : totalLeft;
  }

  /** Spend per agent, highest first: what each agent cost. */
  report(): AgentSpend[] {
    return [...this.spentBy.entries()]
      .map(([agent, r]) => ({ agent, spentAtomic: r.spent, calls: r.calls, capAtomic: this.capFor(agent) ?? null }))
      .sort((a, b) => (b.spentAtomic > a.spentAtomic ? 1 : b.spentAtomic < a.spentAtomic ? -1 : 0));
  }
}
