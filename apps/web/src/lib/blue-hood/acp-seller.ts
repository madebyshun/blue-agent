/**
 * Blue Hood — ACP v2 SELLER adapter (task 2.3, Offering #1: execution-plan).
 *
 * This is the ARCHITECTURE-DEPENDENT half of the paid offering — the piece that
 * actually talks to Virtuals ACP. It drives the maintained event SDK
 * (`@virtuals-protocol/acp-node-v2`) from a Vercel CRON POLL rather than a
 * persistent listener (the host decision for v1: no always-on infra). Each poll:
 *
 *   create adapter → agent.start() (hydrates every active job) → act on our
 *   provider jobs by status → agent.stop().
 *
 * `AcpAgent.start()` awaits `getActiveJobs()` hydration, so `agent.sessions` is a
 * complete snapshot the moment it resolves — the SDK explicitly documents this
 * as the startup-reconcile pattern. A job funded during the ~2-min gap between
 * ticks is simply picked up on the next tick's hydration (the accepted
 * higher-latency trade-off of cron-poll vs. a live socket).
 *
 * ── Non-custodial / settlement boundary ──────────────────────────────────────
 * The seller only ever calls three JobSession actions:
 *   • setBudget — propose our fixed price on a new job,
 *   • submit    — deliver the execution plan,
 *   • reject    — decline a bad/unfulfillable job (refunds the buyer's escrow).
 * It NEVER calls complete() or fund(). Escrow release / the 80-20 split is done
 * by the ACP contract (attributed via `builderCode`), NOT here. None of these
 * actions move the agent's own funds or a user's funds — they are the seller-side
 * protocol calls that fulfil a paid job. Gas is sponsored by the smart-account.
 *
 * ── Anti-ungraduation (the existential rule) ─────────────────────────────────
 * 10 consecutive expirations auto-ungraduate the agent, so a HUNG job is the
 * worst outcome and a FAST reject is safe. Every branch here either acts or
 * rejects — never leaves a funded job hanging:
 *   • bad/unknown requirement  → reject immediately (reject-incomplete),
 *   • engine blind / slow      → reject "temporarily unavailable" (no charge),
 *   • internal deadline < SLA  → withDeadline() forces a decision,
 *   • exactly-once submit      → acquireSubmitLock so a retrying tick never
 *                                double-delivers against the same escrow,
 *   • every job logged         → the KV ledger tracks the expire streak so we
 *                                see danger long before ACP's hard limit.
 *
 * ── Inert until configured ───────────────────────────────────────────────────
 * The heavy SDK (socket.io-client, @privy-io/node, @account-kit/infra,
 * @solana/kit) is loaded via a RUNTIME dynamic import reached ONLY after the env
 * gate passes. With no `ACP_WALLET_ADDRESS` / `ACP_WALLET_ID` /
 * `ACP_SIGNER_PRIVATE_KEY`, `runAcpPollCycle()` returns `{ configured:false }`
 * without ever importing the SDK — so shipping this is a no-op until the operator
 * registers the agent + sets env. The signer key is SECRET (operator holds it);
 * it is read from env and passed straight to the adapter — never logged.
 */
import {
  recordJobSeen,
  updateJobStatus,
  recordJobError,
  acquireSubmitLock,
  listUnsettledJobIds,
  type AcpSubjectChain,
  type AcpSubjectSide,
} from "@/lib/blue-hood/acp-jobs";
import { readJobOnChain } from "@/lib/blue-hood/acp-chain";
// Shared with the free `/api/acp/execution-plan` URL so the paid path and the
// path buyers self-test against cannot disagree about what `chain`/`side` mean.
import { readRequirement } from "@/lib/blue-hood/acp-requirement";
import { computeExecutionPlan, type ExecPlan } from "@/lib/blue-hood/execution-plan";
import { findByTicker } from "@/lib/robinhood/rwa-registry";
// Type-only import — fully erased at compile time, so it never pulls the heavy
// SDK into the webpack bundle. Runtime values come from the dynamic import below.
import type { JobSession } from "@virtuals-protocol/acp-node-v2";

/** The module type, for fully-typed access to the dynamically-imported SDK. */
type AcpModule = typeof import("@virtuals-protocol/acp-node-v2");

/** Operator-provisioned config. All from env; the signer key is SECRET. */
interface AcpSellerConfig {
  walletAddress: `0x${string}`;
  walletId: string;
  signerPrivateKey: string;
  chainId: number;
  price: number;
  offeringName: string;
  builderCode?: string;
}

/** Per-tick outcome tally — what the cron reports (never contains secrets). */
export interface AcpPollTally {
  provider_sessions: number;
  budget_proposed: number;
  delivered: number; // deliverable submitted
  rejected_input: number; // bad shape / unknown ticker
  declined: number; // engine blind or deadline — no charge
  lock_skipped: number; // another tick owns the submit
  completed: number; // terminal completions reconciled
  expired: number; // terminal expirations reconciled
  noop: number; // awaiting counterparty (budget_set / submitted) or other terminal
  errors: number; // per-session crashes (kept — never aborts the batch)
  reconciled: number; // terminal states learned from the chain, not the active set
}

export interface AcpPollResult extends Partial<AcpPollTally> {
  ok: boolean;
  configured: boolean;
  skipped?: string;
  error?: string;
  duration_ms: number;
}

/** Compute must return well within the ACP SLA — force a decision by here. */
const INTERNAL_DEADLINE_MS = 12_000;
/** Bound the connect+hydrate so a slow stream can't eat the whole cron budget. */
const START_DEADLINE_MS = 30_000;
/**
 * Bound each on-chain write. The route's maxDuration is 60s and START_DEADLINE_MS
 * can already claim 30 of it, so this has to fit in what's left with room to
 * persist the failure afterwards — a diagnosis written after the kill is no
 * diagnosis at all.
 */
const WRITE_DEADLINE_MS = 15_000;
/**
 * How far into the cycle a write may still be outstanding. The route's
 * maxDuration is 60s; the 10s left over is for persisting the failure and
 * stopping the agent, because a diagnosis written after the kill is no
 * diagnosis at all.
 */
const CYCLE_WRITE_BUDGET_MS = 50_000;

/**
 * Read config from env. Returns null (→ inert) unless ALL THREE required secrets
 * are present. Cheap + SDK-free, so the route can gate on it without loading the
 * heavy package.
 */
function readConfig(): AcpSellerConfig | null {
  const walletAddress = process.env.ACP_WALLET_ADDRESS?.trim();
  const walletId = process.env.ACP_WALLET_ID?.trim();
  const signerPrivateKey = process.env.ACP_SIGNER_PRIVATE_KEY?.trim();
  if (!walletAddress || !walletId || !signerPrivateKey) return null;

  const chainId = Number(process.env.ACP_CHAIN_ID ?? "8453") || 8453; // Base default
  const priceRaw = Number(process.env.ACP_OFFERING_PRICE_USDC ?? "0.5");
  const price = Number.isFinite(priceRaw) && priceRaw > 0 ? priceRaw : 0.5;
  const offeringName = process.env.ACP_OFFERING_NAME?.trim() || "execution-plan";
  const builderCode = process.env.ACP_BUILDER_CODE?.trim() || undefined;

  return {
    walletAddress: walletAddress as `0x${string}`,
    walletId,
    signerPrivateKey,
    chainId,
    price,
    offeringName,
    builderCode,
  };
}

/** True when the operator has wired the three required secrets. SDK-free. */
export function isAcpSellerConfigured(): boolean {
  return readConfig() !== null;
}

/** Race a promise against a timeout; resolves null on timeout (never rejects). */
function withDeadline<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

const WRITE_TIMED_OUT = Symbol("write_timed_out");

/**
 * Bound an on-chain write and turn a hang into a throw.
 *
 * Every write here goes through the wallet provider, which can park instead of
 * failing — the SDK's approval gate waits 300s on a promise that no caller can
 * shorten. The cron's 60s budget expires first, so the function is killed while
 * the promise is still pending: nothing throws, no catch runs, no tx is sent,
 * and the job stays `seen` forever while the next tick repeats it. A silent
 * retry loop is indistinguishable from an idle seller on the public read.
 * Throwing lets the per-session backstop record a reason.
 *
 * A rejection still propagates unchanged — "it threw" and "it never returned"
 * are different diagnoses and must not collapse into one.
 *
 * `deadlineAt` is the cycle's own wall clock, not a fixed budget: connect can
 * already have eaten most of the 60s, and a 15s timer that fires after the
 * platform kill records nothing at all.
 */
async function boundedWrite<T>(label: string, p: Promise<T>, deadlineAt: number): Promise<T> {
  const ms = Math.max(1_000, Math.min(WRITE_DEADLINE_MS, deadlineAt - Date.now()));
  const raced = await Promise.race([
    p,
    new Promise<typeof WRITE_TIMED_OUT>((resolve) => setTimeout(() => resolve(WRITE_TIMED_OUT), ms)),
  ]);
  if (raced === WRITE_TIMED_OUT) {
    throw new Error(`${label} still pending after ${ms}ms — write never returned`);
  }
  return raced;
}

/** Lenient JSON parse — buyers may fence or wrap the requirement payload. */
function lenientJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const i = s.indexOf("{");
  const j = s.lastIndexOf("}");
  if (i >= 0 && j > i) s = s.slice(i, j + 1);
  try {
    const v = JSON.parse(s);
    return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/**
 * Pull the `{ ticker, size_usd, chain?, side? }` requirement from a session. Tries the
 * job description first (populated by hydration), then the latest
 * requirement-shaped message entry. Returns null when the payload is missing or
 * malformed → the caller reject-incompletes.
 *
 * ⚠️ `chain` is PARSED, not assumed. A ticker string does not identify a token:
 * NVDA, META, GOOGL and TSLA exist as tradeable tokens on BOTH Robinhood Chain
 * (4663) and Base (8453), and the two chains share no state. This offering can
 * only answer for RH — every datum in `computeExecutionPlan` comes from the RH
 * registry and RH pools — so a bare ticker here would silently sell a Robinhood
 * plan to a buyer who meant the Base B20. That is the #161/#206/#219 bug family
 * (four sites so far), and it is worse here than anywhere it has appeared
 * before, because here the buyer PAYS for the wrong-chain answer and the escrow
 * releases on delivery.
 *
 * Absent `chain` defaults to `"robinhood"` — the only desk this offering serves
 * — but it is written onto the object so the value is explicit at every use
 * site and can be gated on, rather than being an unstated assumption that reads
 * as correct until a Base buyer arrives.
 */
function extractRequirement(
  session: JobSession,
): {
  ticker: string;
  size_usd: number;
  chain: AcpSubjectChain;
  side: AcpSubjectSide;
} | null {
  const sources: string[] = [];
  const desc = session.job?.description;
  if (desc) sources.push(desc);
  for (let k = session.entries.length - 1; k >= 0; k--) {
    const e = session.entries[k];
    if (
      e.kind === "message" &&
      (e.contentType === "requirement" || e.contentType === "structured" || e.contentType === "text")
    ) {
      sources.push(e.content);
      break;
    }
  }
  for (const raw of sources) {
    const obj = lenientJson(raw);
    if (!obj) continue;
    // One alias table, shared with the free URL (REQUIREMENT_KEYS). Spelling the
    // aliases out here again is what let the two surfaces drift on WHICH KEY
    // carries `chain` long after they agreed on what its values mean.
    const { ticker, size_usd: size, chain, side } = readRequirement((k) => obj[k]);
    if (ticker && Number.isFinite(size) && size > 0) {
      return { ticker, size_usd: size, chain, side };
    }
  }
  return null;
}

/** Gross escrow value that settled for a completed job (a real on-chain fact). */
function grossUsdcFromJob(session: JobSession): number | undefined {
  const amt = session.job?.budget?.amount;
  return typeof amt === "number" && Number.isFinite(amt) ? amt : undefined;
}

/**
 * The paid deliverable: the execution plan wrapped with light provenance.
 *
 * `chain` is part of that provenance and is not decorative — the buyer is
 * paying for pool depth, slippage and a route, and every one of those numbers
 * is meaningless without the chain it was measured on. A receipt that names the
 * ticker but not the desk is the same claim the OG "VERIFIED" pill used to make
 * before it was made to name the chain.
 */
function buildDeliverable(cfg: AcpSellerConfig, plan: ExecPlan): string {
  return JSON.stringify({
    offering: cfg.offeringName,
    // 1.1 → 1.2: `plan.side` could only ever be "buy"; it can now be "sell".
    // The shape is unchanged, but the version field exists so a buyer can pin
    // what it will receive, and a value domain that widens is exactly that.
    version: "1.2",
    chain: "robinhood",
    chain_id: 4663,
    generated_at: new Date().toISOString(),
    plan,
  });
}

/**
 * Handle ONE provider session by its current status. Isolated per-session try/
 * catch at the call site guarantees a single bad job never aborts the batch.
 */
async function handleSession(
  session: JobSession,
  cfg: AcpSellerConfig,
  AssetToken: AcpModule["AssetToken"],
  tally: AcpPollTally,
  deadlineAt: number,
): Promise<void> {
  const write = <T>(label: string, p: Promise<T>) => boundedWrite(label, p, deadlineAt);
  const jobId = session.jobId;
  const chainId = session.chainId;
  const buyer = session.job?.clientAddress;
  const req = extractRequirement(session);

  // Guarantee a ledger record exists BEFORE any transition (idempotent upsert;
  // created_at is stamped once, status is preserved for existing records). This
  // makes terminal reconciliation below always land on a real record.
  await recordJobSeen({
    job_id: jobId,
    chain_id: chainId,
    offering: cfg.offeringName,
    buyer: buyer ?? undefined,
    ticker: req?.ticker,
    // Recorded on FIRST SIGHT, before any gate runs — so a rejected wrong-chain
    // job still leaves behind what desk was asked for. If we only stamped it on
    // the accept path, the ledger could show a rejection with no way to tell
    // whether the buyer meant Base or sent junk.
    subject_chain: req?.chain,
    side: req?.side,
    size_usd: req?.size_usd,
    price_usdc: cfg.price,
  });

  switch (session.status) {
    case "open": {
      // Reject-incomplete: never set a budget for a job we can't fulfil.
      if (!req) {
        await write("reject", session.reject("invalid requirement: expected JSON { ticker, size_usd }"));
        await updateJobStatus(jobId, "rejected", { error: "bad_requirement" });
        tally.rejected_input++;
        return;
      }
      // SUBJECT chain, which is not the settlement chain. `chainId` above is
      // where the USDC escrow lives (ACP runs on Base); `req.chain` is which
      // desk the ticker trades on. They are legitimately different values and
      // conflating them is how a Base job gets a Robinhood answer.
      if (req.chain !== "robinhood") {
        await write(
          "reject",
          session.reject(
            `unsupported chain "${req.chain}" — Offering #1 covers Robinhood Chain (4663) only; ` +
              `"${req.ticker}" may also exist on Base (8453), and this desk cannot price that token`,
          ),
        );
        await updateJobStatus(jobId, "rejected", {
          error: "unsupported_chain",
          subject_chain: req.chain,
        });
        tally.rejected_input++;
        return;
      }
      if (req.side === "unknown") {
        await write(
          "reject",
          session.reject(`unsupported side — send "buy" or "sell" (omit the field for "buy")`),
        );
        await updateJobStatus(jobId, "rejected", { error: "unsupported_side", side: req.side });
        tally.rejected_input++;
        return;
      }
      if (!findByTicker(req.ticker)) {
        await write(
          "reject",
          session.reject(`unknown ticker "${req.ticker}" — not a Robinhood-Chain RWA token`),
        );
        await updateJobStatus(jobId, "rejected", { error: "unknown_ticker" });
        tally.rejected_input++;
        return;
      }
      // Valid → propose our fixed price (USDC on the job's own chain).
      await write("setBudget", session.setBudget(AssetToken.usdc(cfg.price, chainId)));
      await updateJobStatus(jobId, "budget_set", {
        ticker: req.ticker,
        size_usd: req.size_usd,
        subject_chain: req.chain,
        side: req.side,
      });
      tally.budget_proposed++;
      return;
    }

    case "funded": {
      if (!req) {
        await write(
          "reject",
          session.reject("invalid requirement at funding: expected JSON { ticker, size_usd }"),
        );
        await updateJobStatus(jobId, "rejected", { error: "bad_requirement" });
        tally.rejected_input++;
        return;
      }
      // The chain gate is REPEATED here, not inherited from "open". A job
      // created and funded inside one 2-min gap is first seen at `funded`, so a
      // gate that only ran on the `open` branch would not run at all for
      // exactly the jobs that reach delivery fastest. A gate on one path is not
      // a gate (#215/#216).
      if (req.chain !== "robinhood") {
        await write(
          "reject",
          session.reject(
            `unsupported chain "${req.chain}" at funding — Offering #1 covers Robinhood Chain (4663) only`,
          ),
        );
        await updateJobStatus(jobId, "rejected", {
          error: "unsupported_chain",
          subject_chain: req.chain,
        });
        tally.rejected_input++;
        return;
      }
      // Repeated here for the same reason as the chain gate above: a job first
      // seen at `funded` never ran the `open` branch at all.
      if (req.side === "unknown") {
        await write("reject", session.reject(`unsupported side at funding — send "buy" or "sell"`));
        await updateJobStatus(jobId, "rejected", { error: "unsupported_side", side: req.side });
        tally.rejected_input++;
        return;
      }
      // Exactly-once: only one tick may ever submit this job.
      const won = await acquireSubmitLock(jobId);
      if (!won) {
        tally.lock_skipped++;
        return;
      }
      await updateJobStatus(jobId, "funded");

      const plan = await withDeadline(
        computeExecutionPlan({ ticker: req.ticker, size_usd: req.size_usd, side: req.side }),
        INTERNAL_DEADLINE_MS,
      );
      if (!plan) {
        // Timed out — decline (refund), never hang past the SLA.
        await write(
          "reject",
          session.reject("temporarily unavailable — plan timed out, job declined (no charge)"),
        );
        await updateJobStatus(jobId, "rejected", { error: "deadline" });
        tally.declined++;
        return;
      }
      if (plan.ok) {
        await write("submit", session.submit(buildDeliverable(cfg, plan)));
        await updateJobStatus(jobId, "submitted", {
          ticker: plan.ticker,
          size_usd: plan.size_usd,
          side: plan.side, // from the PLAN, not the request — what we actually priced
        });
        tally.delivered++;
        return;
      }
      if (plan.kind === "decline") {
        // Engine blind (no readable market) — decline, no charge.
        await write(
          "reject",
          session.reject(`temporarily unavailable — ${plan.reason} (declined, no charge)`),
        );
        await updateJobStatus(jobId, "rejected", { error: plan.error });
        tally.declined++;
        return;
      }
      // Late-caught bad input (e.g. unknown ticker that slipped past "open").
      await write("reject", session.reject(`${plan.reason} ${plan.hint ?? ""}`.trim()));
      await updateJobStatus(jobId, "rejected", { error: plan.error });
      tally.rejected_input++;
      return;
    }

    case "completed": {
      const usdc = grossUsdcFromJob(session);
      await updateJobStatus(jobId, "completed", usdc != null ? { usdc_gross: usdc } : {});
      tally.completed++;
      return;
    }

    case "expired": {
      await updateJobStatus(jobId, "expired");
      tally.expired++;
      return;
    }

    case "rejected": {
      await updateJobStatus(jobId, "rejected");
      tally.noop++;
      return;
    }

    default: {
      // budget_set (awaiting buyer funding) or submitted (awaiting evaluator) —
      // nothing for the seller to do this tick.
      tally.noop++;
      return;
    }
  }
}

/**
 * Run one ACP poll cycle. Total + safe: returns a result on every path, never
 * throws. Inert (`configured:false`) until the operator wires the env secrets.
 */
/**
 * How many stale ledger jobs may be chain-read per tick. Each is one RPC call,
 * and the cron has a 60s ceiling it shares with real work, so this is a budget,
 * not a limit we expect to hit.
 */
const RECONCILE_MAX_PER_TICK = 10;

/**
 * Close the books on jobs the active set can no longer tell us about.
 *
 * `agent.sessions` comes from `getActiveJobs()`, so a job that settles drops out
 * of it at once while this cron only looks every 2 minutes. The tick that would
 * have recorded the outcome therefore usually never sees the job — MEASURED
 * 2026-09-25: 81125's rejection and 81132's completion were both missed, and
 * `/api/acp/revenue` kept reporting zero earnings after 0.45 USDC had arrived.
 * Anything the ledger still calls in-flight but the SDK no longer lists is
 * exactly the set worth asking the chain about.
 *
 * ⚠ A job the ACP SERVER considers expired stays `OPEN` on chain — nothing
 * on-chain moves a job to EXPIRED, and 81119 has sat past its deadline for
 * hours still reading `OPEN`. So the `expired` branch below is correctness, not
 * a path that fires: server-side expiry lands on no public field and this
 * reconcile genuinely cannot see it. Such jobs stay in-flight in the ledger,
 * which is the honest answer rather than a guessed one. Newest-first ordering
 * keeps them from ever crowding a live job out of the per-tick budget.
 */
async function reconcileSettledJobs(
  activeIds: ReadonlySet<string>,
  cfg: AcpSellerConfig,
  acp: AcpModule,
  tally: AcpPollTally,
): Promise<void> {
  const contract = acp.ACP_CONTRACT_ADDRESSES[cfg.chainId];
  if (!contract) return;

  let unsettled: string[];
  try {
    unsettled = await listUnsettledJobIds();
  } catch {
    return; // ledger unreadable this tick — next one re-reconciles
  }

  const stale = unsettled
    .filter((id) => !activeIds.has(id))
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, RECONCILE_MAX_PER_TICK);

  for (const jobId of stale) {
    const chainJob = await readJobOnChain({
      jobId,
      chainId: cfg.chainId,
      contract,
      abi: acp.ACP_ABI,
    });
    if (!chainJob) continue; // unknown state — write nothing

    switch (chainJob.status) {
      case "completed":
        await updateJobStatus(jobId, "completed", { usdc_gross: chainJob.budget_usdc });
        tally.completed++;
        tally.reconciled++;
        break;
      case "rejected":
        await updateJobStatus(jobId, "rejected");
        tally.reconciled++;
        break;
      case "expired":
        await updateJobStatus(jobId, "expired");
        tally.expired++;
        tally.reconciled++;
        break;
      default:
        break; // still live on chain — the active set just hadn't hydrated it
    }
  }
}

export async function runAcpPollCycle(): Promise<AcpPollResult> {
  const started = Date.now();
  const cfg = readConfig();
  if (!cfg) {
    return { ok: true, configured: false, skipped: "acp_not_configured", duration_ms: 0 };
  }

  const tally: AcpPollTally = {
    provider_sessions: 0,
    budget_proposed: 0,
    delivered: 0,
    rejected_input: 0,
    declined: 0,
    lock_skipped: 0,
    completed: 0,
    expired: 0,
    noop: 0,
    errors: 0,
    reconciled: 0,
  };

  let acp: AcpModule;
  try {
    // Reached ONLY when configured — an unconfigured deploy never loads the SDK.
    acp = await import("@virtuals-protocol/acp-node-v2");
  } catch (e) {
    console.warn(`[acp-poll] SDK import failed: ${(e as Error).message}`);
    return { ok: false, configured: true, error: "sdk_import_failed", duration_ms: Date.now() - started };
  }

  const { AcpAgent, PrivyAlchemyEvmProviderAdapter, AssetToken, getEvmChainByChainId } = acp;

  let agent: InstanceType<AcpModule["AcpAgent"]> | null = null;
  try {
    const chain = getEvmChainByChainId(cfg.chainId);
    const evmProvider = await PrivyAlchemyEvmProviderAdapter.create({
      walletAddress: cfg.walletAddress,
      walletId: cfg.walletId,
      signerPrivateKey: cfg.signerPrivateKey,
      chains: chain ? [chain] : undefined,
      builderCode: cfg.builderCode,
    });
    agent = await AcpAgent.create({ evmProvider });

    // Connect + hydrate active jobs, bounded so a slow stream can't wedge us.
    const connected = await withDeadline(agent.start().then(() => true), START_DEADLINE_MS);
    if (!connected) {
      console.warn("[acp-poll] start() timed out — leaving jobs for next tick");
      return { ok: false, configured: true, error: "start_timeout", duration_ms: Date.now() - started };
    }

    const providerSessions = agent.sessions.filter((s) => s.roles.includes("provider"));
    tally.provider_sessions = providerSessions.length;

    for (const session of providerSessions) {
      try {
        await handleSession(session, cfg, AssetToken, tally, started + CYCLE_WRITE_BUDGET_MS);
      } catch (e) {
        // Per-session backstop — a single job's failure must not stop the batch.
        const message = (e as Error).message;
        console.warn(`[acp-poll] session ${session.jobId} failed: ${message}`);
        // Also persist it: a console.warn is only readable in the Vercel
        // dashboard, which makes a permanently-stuck seller indistinguishable
        // from an idle one on the public read.
        await recordJobError(String(session.jobId), message).catch(() => {});
        tally.errors++;
      }
    }

    await reconcileSettledJobs(
      new Set(providerSessions.map((s) => String(s.jobId))),
      cfg,
      acp,
      tally,
    );
  } catch (e) {
    // Init/connect failure → offering is "temporarily unavailable" this tick;
    // jobs remain for the next one. Never throws out of the cron.
    console.warn(`[acp-poll] cycle init failed: ${(e as Error).message}`);
    return { ok: false, configured: true, error: "init_failed", ...tally, duration_ms: Date.now() - started };
  } finally {
    if (agent) await agent.stop().catch(() => {});
  }

  return { ok: true, configured: true, ...tally, duration_ms: Date.now() - started };
}
