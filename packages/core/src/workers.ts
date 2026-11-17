/** Shared worker contract. Delegation permits delivery only, never spending. */
export const EXIT_SKILL = "base-token-exit-screen";
export type WorkerGrant = { owner: string; delegate: string; agentId: string; payTo: string; skill: string; expiresAt: string; nonce: string; maxDeliveries: number };
export function workerGrantMessage(g: WorkerGrant) {
  return ["Blue Agent worker delegation v1", "Domain: blueagent.dev | Base 8453", `owner: ${g.owner.toLowerCase()}`, `delegate: ${g.delegate.toLowerCase()}`, `agent: ${g.agentId}`, `payTo: ${g.payTo.toLowerCase()}`, `skill: ${g.skill}`, `maxDeliveries: ${g.maxDeliveries}`, `expires: ${g.expiresAt}`, `nonce: ${g.nonce}`, "Permission: submit research deliveries only. No spending, transfers, approvals or guaranteed income."].join("\n");
}
/** Stock research skills (Base 8453 Coinbase B20 stocks). Not delegable yet: grantProblem accepts EXIT_SKILL only until ShunTr widens it. */
export const STOCK_SKILLS = {
  "stock-weekend-gap": ["ticker and token address (Base 8453)", "Friday close vs weekend pool price", "gap percent computed from both", "source: blueagent.dev weekend-scorecard", "sources and timestamp"],
  "stock-after-hours-volume": ["ticker and token address (Base 8453)", "pool volume by session (regular, after hours, weekend)", "share of volume outside market hours", "sources and timestamp"],
  "stock-nav-premium": ["ticker and token address (Base 8453)", "oracle (NAV) price and pool price at the same block", "premium or discount percent computed from both", "sources, block and timestamp"],
} as const;
/** Job templates for the "Stock research" category. Prefill only; the poster sets the stock and budget. */
export const STOCK_JOB_TEMPLATES: readonly { skill: StockSkill; title: string; brief: string; budget: string }[] = [
  { skill: "stock-weekend-gap", title: "Weekend gap for {TICKER} on Base", budget: "0.50", brief: "Base 8453 only, token {TOKEN}. Compare the Friday close with the weekend pool price and give the gap in percent, computed from both numbers. Free source: POST https://blueagent.dev/api/x402/weekend-scorecard {ticker}. Include sources and timestamp; say 'insufficient data' rather than estimate. Research only, no trade. Pay on unlock, not escrowed." },
  { skill: "stock-after-hours-volume", title: "After-hours volume for {TICKER} on Base", budget: "0.50", brief: "Base 8453 only, token {TOKEN}. Split pool volume by session (regular hours, after hours, weekend) and give the share traded outside market hours. Include pools, sources and timestamp; say 'insufficient data' rather than estimate. Research only, no trade. Pay on unlock, not escrowed." },
  { skill: "stock-nav-premium", title: "NAV premium for {TICKER} on Base", budget: "0.50", brief: "Base 8453 only, token {TOKEN}. Read the oracle (NAV) price and the pool price at the same block and give the premium or discount in percent, computed from both. Include sources, block and timestamp; say 'insufficient data' rather than estimate. Research only, no trade. Pay on unlock, not escrowed." },
];
export type StockSkill = keyof typeof STOCK_SKILLS;
export const isStockSkill = (s: unknown): s is StockSkill => typeof s === "string" && Object.prototype.hasOwnProperty.call(STOCK_SKILLS, s);
/** A stock is identified by chain + token address; the ticker is a label (no "c" suffix). */
export type StockInputs = { ticker: string; token: string; chainId: 8453 };
export function workerJobContract(job: { title: string; brief: string; skill?: string; inputs?: StockInputs }) {
  if (isStockSkill(job.skill) && job.inputs) {
    return { skill: job.skill, chainId: 8453, inputs: job.inputs, paymentMode: "pay-on-unlock", funded: false, required: [...STOCK_SKILLS[job.skill]], autonomousEligible: false };
  }
  const supported = job.title.trim().toLowerCase() === "trending tokens on base i can still exit";
  return { skill: supported ? EXIT_SKILL : null, chainId: supported ? 8453 : null, inputs: null, paymentMode: "pay-on-unlock", funded: false, required: supported ? ["token addresses", "volume and TVL", "sell-risk flags", "same-block sell quotes", "under-5-percent bound", "sources and timestamp"] : [], autonomousEligible: supported };
}
export function grantProblem(g: WorkerGrant, now = Date.now()) {
  if (![g.owner,g.delegate,g.payTo].every(x => /^0x[0-9a-f]{40}$/i.test(x || ""))) return "Invalid wallet";
  if (g.owner.toLowerCase() !== g.payTo.toLowerCase() || g.owner.toLowerCase() === g.delegate.toLowerCase()) return "Payee must be owner; delegate must be separate";
  if (!/^\d{1,12}$/.test(g.agentId) || !/^[0-9a-f]{32}$/.test(g.nonce)) return "Invalid identity or nonce";
  if (g.skill !== EXIT_SKILL || !Number.isInteger(g.maxDeliveries) || g.maxDeliveries < 1 || g.maxDeliveries > 10) return "Unsupported scope";
  const end=Date.parse(g.expiresAt); if (!Number.isFinite(end) || end <= now || end > now + 24*3600000) return "Delegation must expire within 24 hours";
  return null;
}
export const reservationMessage = (jobId: string, agentId: string, issuedAt: string) => `Blue Agent reserve job v1\nDomain: blueagent.dev | Base 8453\njob: ${jobId}\nagent: ${agentId}\nissued: ${issuedAt}`;
export const revokeMessage = (agentId: string, nonce: string, issuedAt: string) => `Blue Agent revoke worker v1\nDomain: blueagent.dev | Base 8453\nagent: ${agentId}\nnonce: ${nonce}\nissued: ${issuedAt}`;
