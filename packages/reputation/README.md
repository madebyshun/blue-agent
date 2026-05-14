# @blueagent/reputation

Blue Agent Reputation System — Builder Score, Agent Score, and Work Hub.

Built by [Blocky Studio](https://blocky.studio).

## Install

```bash
npm install @blueagent/reputation
```

Requires `BANKR_API_KEY` in your environment. All scoring calls go through Bankr LLM.

---

## Three systems

### 1. Builder Score

Score any X/Twitter handle on 5 dimensions (total 100 pts). Returns a tier, dimension breakdown, and summary.

**Dimensions:**
| Dimension  | Max | What it measures |
|---|---|---|
| activity   | 25  | Posting frequency, streak, consistency |
| social     | 25  | Followers, engagement rate, mentions |
| uniqueness | 20  | Niche clarity, differentiation in bio/content |
| thesis     | 20  | Vision clarity, pinned content, project description |
| community  | 10  | Replies, retweets, builder interactions |

**Tiers:**
| Score  | Tier     |
|---|---|
| 0–40   | Explorer |
| 41–60  | Builder  |
| 61–75  | Maker    |
| 76–90  | Legend   |
| 91–100 | Founder  |

```typescript
import { scoreBuilder } from "@blueagent/reputation";

const result = await scoreBuilder("madebyshun");
console.log(result.score);       // 72
console.log(result.tier);        // "Maker"
console.log(result.dimensions);  // { activity: 18, social: 20, ... }
console.log(result.summary);     // "Sharp builder focused on Base..."
console.log(result.badge);       // "https://blueagent.dev/badge/builder/madebyshun"
```

---

### 2. Agent Score

Score any AI agent by X handle, npm package, GitHub repo, or x402 endpoint. Returns a tier, dimension breakdown, strengths, and gaps.

**Dimensions:**
| Dimension        | Max | What it measures |
|---|---|---|
| skillDepth       | 25  | SKILL.md/CLAUDE.md, grounded knowledge, tool count |
| onchainActivity  | 25  | Wallet txs, x402 revenue, Base deployments |
| reliability      | 20  | Uptime, response rate, error rate |
| interoperability | 20  | MCP server, npm package, API endpoints, AgentKit compat |
| reputation       | 10  | npm downloads, GitHub stars, community mentions |

**Tiers:**
| Score  | Tier        |
|---|---|
| 0–40   | Bot         |
| 41–60  | Agent       |
| 61–75  | Pro Agent   |
| 76–90  | Elite Agent |
| 91–100 | Sovereign   |

**Input formats:**
- `@handle` or `handle` — X/Twitter handle
- `npm:@scope/package` — npm package name
- `github.com/user/repo` — GitHub repository
- `https://...` — x402 endpoint URL (pinged for liveness)

```typescript
import { scoreAgent } from "@blueagent/reputation";

// By X handle
const r1 = await scoreAgent("@blocky_agent");

// By npm package
const r2 = await scoreAgent("npm:@blueagent/skill");

// By GitHub repo
const r3 = await scoreAgent("github.com/coinbase/agentkit");

// By endpoint
const r4 = await scoreAgent("https://api.blueagent.dev/v1/analyze");

console.log(r2.score);       // 68
console.log(r2.tier);        // "Pro Agent"
console.log(r2.strengths);   // ["Strong MCP integration", "Published npm package"]
console.log(r2.gaps);        // ["No onchain wallet activity detected"]
console.log(r2.badge);       // "https://blueagent.dev/badge/agent/@blueagent%2Fskill"
```

---

### 3. Task Hub

Post, accept, and complete work tasks with USDC rewards on Base. 5% fee goes to the Blue Agent treasury on task completion.

**Task flow:**
1. Poster calls `createTask()` — task goes to `open`
2. Doer calls `acceptTask()` — task moves to `in_progress`
3. Doer calls `submitTask()` with proof — task moves to `completed`

**Fee:** 5% of reward to treasury (`0xf31f59e7b8b58555f7871f71973a394c8f1bffe5`) on Base. Doer receives 95%.

**Proof types:** `tx_hash` | `github_link` | `npm_link` | `url`

**Categories:** `audit` | `content` | `art` | `data` | `dev`

```typescript
import {
  createTask, acceptTask, submitTask, listTasks,
  getFeeAmount, getDoerAmount, TREASURY
} from "@blueagent/reputation";

// Post a task
const task = createTask({
  title: "Audit ERC-20 token contract",
  description: "Review for reentrancy, overflow, and access control issues",
  category: "audit",
  reward: 50,        // 50 USDC
  poster: "0xYourAddress",
  deadline: "2026-06-01T00:00:00Z",
  proof_required: "github_link",
});

console.log(task.id);      // "task_a1b2c3d4"
console.log(task.status);  // "open"

// Accept the task
const accepted = acceptTask(task.id, "0xDoerAddress");

// Submit with proof
const completed = submitTask(task.id, "0xDoerAddress", "https://github.com/...");

// Fee breakdown
console.log(getFeeAmount(50));  // 2.5 USDC → treasury
console.log(getDoerAmount(50)); // 47.5 USDC → doer
console.log(TREASURY);          // "0xf31f59e7b8b58555f7871f71973a394c8f1bffe5"

// List open tasks in "dev" category
const devTasks = listTasks({ category: "dev", status: "open" });
```

---

## Score reward system

Every task completion awards reputation points:
- **Poster**: +2 Reputation
- **Doer**: +5 Skill Depth

---

## Notes

- Scoring uses Bankr LLM (`https://llm.bankr.bot/v1/messages`). Set `BANKR_API_KEY` in your environment.
- Task Hub is in-memory by default. Replace with a DB or onchain store for production.
- All USDC rewards are on Base (chain ID 8453).
- Treasury address is verified on Basescan: `0xf31f59e7b8b58555f7871f71973a394c8f1bffe5`
