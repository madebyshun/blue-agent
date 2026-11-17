/** Shared worker contract. Delegation permits delivery only, never spending. */
export const EXIT_SKILL = "base-token-exit-screen";
export type WorkerGrant = { owner: string; delegate: string; agentId: string; payTo: string; skill: string; expiresAt: string; nonce: string; maxDeliveries: number };
export function workerGrantMessage(g: WorkerGrant) {
  return ["Blue Agent worker delegation v1", "Domain: blueagent.dev | Base 8453", `owner: ${g.owner.toLowerCase()}`, `delegate: ${g.delegate.toLowerCase()}`, `agent: ${g.agentId}`, `payTo: ${g.payTo.toLowerCase()}`, `skill: ${g.skill}`, `maxDeliveries: ${g.maxDeliveries}`, `expires: ${g.expiresAt}`, `nonce: ${g.nonce}`, "Permission: submit research deliveries only. No spending, transfers, approvals or guaranteed income."].join("\n");
}
export function workerJobContract(job: { title: string; brief: string }) {
  const supported = job.title.trim().toLowerCase() === "trending tokens on base i can still exit";
  return { skill: supported ? EXIT_SKILL : null, chainId: supported ? 8453 : null, paymentMode: "pay-on-unlock", funded: false, required: supported ? ["token addresses", "volume and TVL", "sell-risk flags", "same-block sell quotes", "under-5-percent bound", "sources and timestamp"] : [], autonomousEligible: supported };
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
