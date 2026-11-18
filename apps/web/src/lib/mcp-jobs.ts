/**
 * MCP `jobs_post` (ShunTr approved 2026-11-18, after BaseCity's review): the
 * door for a person asking Claude to hire an agent. Claude Desktop and
 * claude.ai cannot call HTTP, so without this tool they cannot post.
 *
 * Two calls, no custody:
 *   1. Without a signature: validate, resolve the invite, and return a
 *      preview plus the exact jobPostMessage() (v2, readable title and
 *      budget) for the poster's OWN wallet to sign — e.g. through a wallet
 *      MCP that asks the user to approve each signature — and the web link
 *      as the no-wallet alternative.
 *   2. With signer + signature + issuedAt: post through POST /api/jobs, the
 *      same route, limits and checks as every other signed post.
 *
 * Only jobs_post exists: workers (BaseCity's Blocky worker included) deliver
 * over HTTP, and posters unlock on the web (BaseCity agreed, 2026-11-18).
 */
import { POST as postJob } from "@/app/api/jobs/route";
import { LIMITS, clean, inviteSpec, jobPostMessage, jobProblem, stockJobSpec, INVITE_MS } from "@/lib/jobs";
import { readAgentCard } from "@/lib/agent-ledger";
import { parseBudget } from "../../../../packages/core/src/workers";

const CARD = (n: string) => `https://www.basecity.space/api/agent-card?blocky=${n}`;

/**
 * A Blocky tokenId → its ERC-8004 agent id, trusted only when the agent's
 * on-chain tokenURI is BaseCity's card for THIS Blocky and that card names the
 * agent (same rule as the /agents badge). Otherwise a refusal naming the fix.
 */
export async function resolveBlocky(raw: unknown): Promise<{ agentId: string; card: string } | string> {
  const n = String(raw ?? "").trim().replace(/^#/, "");
  if (!/^\d{1,6}$/.test(n)) return "blocky: a Blocky token id (digits).";
  let agentId: string | null = null;
  try {
    const r = await fetch(CARD(n), { signal: AbortSignal.timeout(5000) });
    const j = (await r.json()) as { registrations?: { agentId?: unknown }[] };
    const id = j.registrations?.[0]?.agentId;
    agentId = id != null && /^\d{1,12}$/.test(String(id)) ? String(id) : null;
  } catch { /* falls through */ }
  if (!agentId) return `Could not read Blocky #${n}'s agent card; pass invitedAgentId instead.`;
  const a = await readAgentCard(agentId);
  if (!a?.blocky || !new RegExp(`[?&]blocky=${n}(&|$)`).test(a.uri)) {
    return `Blocky #${n}'s card names agent #${agentId}, but that agent's on-chain tokenURI does not point at the card, so the link is not verified. Pass invitedAgentId: "${agentId}" if you trust it, or ask its owner to set the tokenURI to ${CARD(n)}&agent=${agentId}.`;
  }
  return { agentId, card: `${CARD(n)}&agent=${agentId}` };
}

const out = (o: unknown) => JSON.stringify(o, null, 2);

export async function mcpJobsPost(args: Record<string, unknown>): Promise<{ text: string; isError?: boolean }> {
  const title = clean(args.title, LIMITS.title);
  const brief = clean(args.brief, LIMITS.brief);
  const budgetUsd = typeof args.budgetUsd === "string" ? parseBudget(args.budgetUsd) : Number(args.budgetUsd);
  const why = jobProblem(title, brief, budgetUsd);
  if (why) return { text: why, isError: true };
  const spec = stockJobSpec(args.skill, args.token, args.ticker);
  if (typeof spec === "string") return { text: spec, isError: true };

  let invite: string | null = null;
  let card: string | null = null;
  if (args.blocky != null && args.blocky !== "") {
    const b = await resolveBlocky(args.blocky);
    if (typeof b === "string") return { text: b, isError: true };
    invite = b.agentId; card = b.card;
  } else {
    const i = inviteSpec(args.invitedAgentId);
    if (i && typeof i === "object") return { text: i.refusal, isError: true };
    invite = i;
  }

  const budgetUnits = Math.round(budgetUsd * 1e6);
  const web = `https://app.blueagent.dev/jobs${invite ? `?agent=${invite}${spec ? `&skill=${spec.skill}` : ""}` : ""}`;
  const signed = typeof args.signature === "string" && typeof args.signer === "string" && typeof args.issuedAt === "string";

  if (!signed) {
    const issuedAt = new Date().toISOString();
    return {
      text: out({
        status: "needs_signature",
        preview: { title, brief, budget_usd: budgetUnits / 1e6, chain: "base", skill: spec?.skill ?? null, stock: spec?.inputs ?? null, invited_agent_id: invite, invite_hours: invite ? INVITE_MS / 3600_000 : null, agent_card: card },
        read_back: "Show the user this preview and get a yes before asking their wallet to sign. Nothing is paid now: the budget is paid only when they unlock a delivery.",
        sign: { message: await jobPostMessage({ title, brief, budgetUnits, skill: spec?.skill ?? null, token: spec?.inputs.token ?? null, invitedAgentId: invite, issuedAt }), issuedAt, by: "the poster's own wallet (EIP-191, or ERC-1271/6492 for a smart account), within 10 minutes" },
        next: "Call jobs_post again with the same fields plus signer, signature and issuedAt (exactly as above).",
        no_wallet: `Post it on the web instead: ${web}`,
        paid_alternative: "Or POST https://blueagent.dev/api/jobs with X-PAYMENT for a $0.02 USDC fee instead of a signature (see https://blueagent.dev/api/jobs/openapi.json).",
      }),
    };
  }

  const res = await postJob(new Request("https://blueagent.dev/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title, brief, budgetUsd, skill: spec?.skill, inputs: spec ? { token: spec.inputs.token } : undefined, invitedAgentId: invite ?? undefined, signer: args.signer, signature: args.signature, issuedAt: args.issuedAt }),
  }) as never);
  const j = (await res.json().catch(() => ({}))) as { job?: { id: string; invitedAgentId?: string; inviteUntil?: string }; error?: string; message?: string };
  if (!res.ok || !j.job) return { text: out({ status: "refused", http: res.status, error: j.error ?? "Could not post the job.", ...(j.message ? { expected_message: j.message } : {}) }), isError: true };
  return {
    text: out({
      status: "posted",
      job_id: j.job.id,
      url: `https://app.blueagent.dev/jobs/${j.job.id}`,
      invited_agent_id: j.job.invitedAgentId ?? null,
      invite_until: j.job.inviteUntil ?? null,
      agent_card: card,
      next: "Agents deliver a preview and a price; open the URL to read previews and unlock the one you want (USDC on Base, paid straight to that agent).",
    }),
  };
}
