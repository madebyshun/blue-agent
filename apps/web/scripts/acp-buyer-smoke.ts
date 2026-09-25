/**
 * ACP buyer smoke — the buyer half the repo has never had.
 *
 * `src/lib/blue-hood/acp-seller.ts` is the only ACP code here, and it only ever
 * plays PROVIDER. So the paid path has never been walked end to end: as of
 * 2026-09-25 the live seller reports `total_jobs: 0`, meaning
 * `funded → submit → complete` has not executed once in production. This script
 * is the other side of that handshake, so the first buyer to arrive is not also
 * the first test.
 *
 * ── Why the preflight is the important half ──────────────────────────────────
 *
 * PREFLIGHT reads the registered offering from `api.acp.virtuals.io` and
 * compares it against what the seller code actually does. It needs no
 * credentials, no wallet and no USDC, and it runs in about a second — so the
 * cheap phase is the one that can fail, and it caught a real blocker the day it
 * was written (`requiredFunds: true`, see GATE 4).
 *
 * Note the host: `api.acp.virtuals.io` is the SDK's own server and is NOT the
 * `acpx.virtuals.io` Strapi registry. The Strapi one stopped indexing new
 * agents after 2026-09-07 and returns 0 hits for this listing; this one returns
 * it correctly. Do not conclude anything about the listing from the Strapi API.
 *
 * ── Why a plain EOA cannot buy ───────────────────────────────────────────────
 *
 * `ViemProviderAdapter` in the SDK is an abstract stub — every method throws
 * "not implemented. Override in subclass." The only working EVM adapter is
 * `PrivyAlchemyEvmProviderAdapter`, which needs a Privy `walletId` alongside
 * the address and signer key. A buyer therefore has to be its own registered
 * Virtuals agent with a Privy wallet holding USDC on Base 8453. That is the
 * real cost of the live phases below, and it is why they are opt-in flags
 * rather than the default.
 *
 * ── Money ────────────────────────────────────────────────────────────────────
 *
 * `--fund` moves real USDC on Base 8453 into ACP escrow. It is deliberately a
 * separate invocation behind an explicit env acknowledgement so it can never
 * ride along with a run someone started to "just look". Nothing else in this
 * file transfers value.
 *
 * Usage:
 *   npx tsx scripts/acp-buyer-smoke.ts                  # preflight only (default)
 *   npx tsx scripts/acp-buyer-smoke.ts --create         # open a job, watch to budget_set
 *   npx tsx scripts/acp-buyer-smoke.ts --watch <jobId>  # follow transitions, print deliverable
 *   ACP_ACK_FUND=yes ... --fund <jobId>                 # MOVES REAL USDC
 *   npx tsx scripts/acp-buyer-smoke.ts --complete <jobId>   # release escrow to seller
 *   npx tsx scripts/acp-buyer-smoke.ts --reject <jobId>     # refund, terminal "rejected"
 *
 * ⚠️ If you abandon a test job, `--reject` it. 10 consecutive expiries
 * auto-ungraduate the agent, and the seller's streak is currently a clean 0.
 * A rejection is free; walking away is not.
 *
 * Do NOT expect to see that expiry happen. MEASURED 2026-09-25 against the Base
 * contract: job 81119 passed its deadline and stayed `status 0 = OPEN`, because
 * nothing on chain transitions a job to EXPIRED — `expiredAt` is a deadline, not
 * a timer that fires. The server keeps its own expiry bookkeeping (it dropped
 * that job from `getActiveJobs()` shortly after the deadline) and that counter
 * appears on NO public field of the agent record. So the cost of walking away is
 * real and simultaneously invisible, which is the worst combination and the
 * whole reason this warning is here.
 *
 * ── The Privy approval gate ──────────────────────────────────────────────────
 *
 * A Virtuals wallet policy can answer any signing request with
 * `403 APPROVAL_REQUIRED` and a one-off approval URL. The SDK then blocks on
 * `awaitApproval()`, which is hardcoded to `DEFAULT_APPROVAL_TIMEOUT_MS`
 * (5 minutes) with no caller override, and which resolves ONLY over the
 * `/wallets/stream` SSE that `agent.start()` opens. So the window is real and
 * unextendable, and missing it means re-running rather than resuming — a fresh
 * approval id is minted each attempt. Nothing is signed or sent when it times
 * out, so a missed approval costs nothing but the attempt. `armApprovalOpener`
 * below opens the URL the moment it appears so the window is winnable.
 */
export {};

// Load .env.local the same hand-rolled way `blue-hood-smoke.ts` does — tsx does
// not auto-load it, Next does. This exists so the buyer's signer key can live in
// a gitignored file instead of being `export`ed into shell history, which is
// where a key pasted at a prompt actually ends up.
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
(function loadEnvLocal() {
  try {
    const p = path.resolve(__dirname, "../.env.local");
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const s = line.trim();
      if (!s || s.startsWith("#")) continue;
      const eq = s.indexOf("=");
      if (eq < 0) continue;
      const key = s.slice(0, eq).trim();
      let value = s.slice(eq + 1).trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch { /* preflight still runs without it */ }
})();

const SELLER_WALLET = "0x884fbdd5cf193e7f87cba76419e526d8f4df7a9b";
const OFFERING_NAME = "executionplan";
const SETTLE_CHAIN_ID = 8453; // Base — where USDC escrow settles.
const BASE_RPC_URL = process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
const SUBJECT_CHAIN = "robinhood"; // RH 4663 — where the priced stock lives.
const ACP_SERVER = "https://api.acp.virtuals.io";

/** The requirement the smoke job asks for. `size_usd` is a STRING: the
 *  registered schema types it that way, and the SDK validates with ajv before
 *  it will create the job. The seller coerces with `Number()`, so both agree. */
const REQUIREMENT = {
  ticker: "NVDA",
  size_usd: "25000",
  chain: SUBJECT_CHAIN,
  side: "buy",
} as const;

const TERMINAL = new Set(["completed", "rejected", "expired"]);

type Offering = {
  name: string;
  priceValue: number;
  slaMinutes: number;
  requiredFunds: boolean;
  isHidden: boolean;
  requirements?: { required?: string[]; properties?: Record<string, { type?: string }> };
};

let failures = 0;
function gate(ok: boolean, label: string, detail: string): void {
  if (!ok) failures++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}\n        ${detail}`);
}

async function fetchOffering(): Promise<Offering> {
  const res = await fetch(`${ACP_SERVER}/agents/wallet/${SELLER_WALLET}`);
  if (!res.ok) throw new Error(`agent lookup failed: ${res.status} ${res.statusText}`);
  const agent = (await res.json()).data;
  if (!agent) throw new Error(`no ACP agent registered at ${SELLER_WALLET}`);

  console.log(`Agent: ${agent.name}  (created ${String(agent.createdAt).slice(0, 10)})`);
  const base = (agent.chains ?? []).find((c: { chainId: number }) => c.chainId === SETTLE_CHAIN_ID);
  gate(
    Boolean(base?.active),
    "settle chain active",
    `chain ${SETTLE_CHAIN_ID} active=${base?.active ?? "absent"} — escrow cannot settle otherwise`,
  );

  const offering = (agent.offerings ?? []).find((o: Offering) => o.name === OFFERING_NAME);
  if (!offering) {
    const names = (agent.offerings ?? []).map((o: Offering) => o.name);
    throw new Error(`offering "${OFFERING_NAME}" absent; registered: ${JSON.stringify(names)}`);
  }
  return offering;
}

function preflight(offering: Offering): void {
  // GATE 4 is the one that has actually fired. `requiredFunds: true` makes the
  // buyer SDK call createFundTransferJob, which attaches the FundTransferHook
  // (Base 8453: 0x0EaD…A86B). The seller then calls plain `session.setBudget()`,
  // and jobSession throws "setBudget cannot be called directly when
  // FundTransferHook is configured". The per-session catch swallows it, the job
  // sits at `open` through every 2-minute tick, and at the SLA it EXPIRES.
  // Every buyer hits this, and ten of them ungraduate the agent.
  gate(
    offering.requiredFunds === false,
    "requiredFunds OFF",
    offering.requiredFunds
      ? "requiredFunds=true → buyer gets a FundTransferHook job; seller calls setBudget() and throws; job expires at SLA. Turn Require Funds OFF on this offering in the ACP dashboard."
      : "requiredFunds=false → plain createJob; seller's setBudget() path is correct",
  );

  gate(
    offering.isHidden === false,
    "offering visible",
    `isHidden=${offering.isHidden} — a hidden offering is unbuyable`,
  );

  gate(
    offering.priceValue === 0.5,
    "price matches code default",
    `registry ${offering.priceValue} USDC vs ACP_OFFERING_PRICE_USDC default 0.5`,
  );

  gate(
    offering.slaMinutes === 30,
    "SLA matches runbook",
    `registry ${offering.slaMinutes}m vs documented 30m`,
  );

  // The SDK compiles `offering.requirements` with ajv and refuses to create the
  // job if the payload fails. Checking it here turns a mid-flight throw into a
  // preflight line.
  const req = offering.requirements;
  const required = req?.required ?? [];
  const missing = required.filter((k) => !(k in REQUIREMENT));
  gate(
    missing.length === 0,
    "requirement payload satisfies schema",
    missing.length ? `missing required key(s): ${missing.join(", ")}` : `required=[${required.join(", ")}] all present`,
  );

  const sizeType = req?.properties?.size_usd?.type;
  gate(
    typeof REQUIREMENT.size_usd === sizeType,
    "size_usd type matches schema",
    `schema says ${sizeType}, payload sends ${typeof REQUIREMENT.size_usd}`,
  );

  // Not a gate — `side` is absent from the schema but ajv allows extra keys
  // (no additionalProperties:false), so sending it is safe. It is still a
  // documentation drift: the offering DESCRIPTION advertises side, the
  // REQUIREMENTS schema does not declare it, so no buyer can discover it.
  const declaresSide = Boolean(req?.properties && "side" in req.properties);
  console.log(
    `  ${declaresSide ? "PASS" : "WARN"}  side declared in schema\n        ${
      declaresSide
        ? "buyers can discover the sell-side option"
        : "description advertises `side`, schema omits it — accepted at runtime, undiscoverable to buyers. Add as String, not required."
    }`,
  );
}

/**
 * Surface the SDK's approval URL loudly and open it, because the 5-minute
 * `awaitApproval` clock starts the instant that line is printed and the SDK
 * only writes it to stderr in the middle of unrelated output.
 */
function armApprovalOpener(): void {
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const url = args
      .map((a) => String(a))
      .join(" ")
      .match(/https:\/\/app\.virtuals\.io\/wallet\/approve-transaction\?id=[\w-]+/)?.[0];
    if (!url) return;
    original(`\n>>> APPROVE NOW — the window is 5 minutes and cannot be extended:\n>>> ${url}\n`);
    if (process.platform === "darwin") {
      spawn("open", [url], { stdio: "ignore", detached: true }).unref();
    }
  };
}

/** Build a buyer agent. Separate credentials from the seller's on purpose. */
async function buyer() {
  const walletAddress = process.env.ACP_BUYER_WALLET_ADDRESS?.trim();
  const walletId = process.env.ACP_BUYER_WALLET_ID?.trim();
  const signerPrivateKey = process.env.ACP_BUYER_SIGNER_PRIVATE_KEY?.trim();
  if (!walletAddress || !walletId || !signerPrivateKey) {
    throw new Error(
      "buyer credentials missing. Need ACP_BUYER_WALLET_ADDRESS, ACP_BUYER_WALLET_ID, " +
        "ACP_BUYER_SIGNER_PRIVATE_KEY. The buyer must be its own registered Virtuals agent " +
        "with a Privy wallet funded with USDC on Base 8453 — a plain EOA cannot buy, because " +
        "the SDK's ViemProviderAdapter is an unimplemented stub.",
    );
  }

  const acp = await import("@virtuals-protocol/acp-node-v2");
  const chain = acp.getEvmChainByChainId(SETTLE_CHAIN_ID);
  const evmProvider = await acp.PrivyAlchemyEvmProviderAdapter.create({
    walletAddress: walletAddress as `0x${string}`,
    walletId,
    signerPrivateKey,
    chains: chain ? [chain] : undefined,
  });
  const agent = await acp.AcpAgent.create({ evmProvider });
  await agent.start();
  return { acp, agent, walletAddress };
}

/**
 * Read a job straight off Base, bypassing the session surface entirely.
 *
 * `agent.sessions` is hydrated from `getActiveJobs()`, so a job the server has
 * stopped calling active is simply absent — indistinguishable, from the outside,
 * from one that never existed. MEASURED 2026-09-25: job 81119 dropped out of the
 * active set while still `OPEN` on chain, and the script reported it as "already
 * terminal", which was wrong in exactly the case where the truth matters most.
 *
 * Needs no credentials: `getJob` is a view call, so this works when the buyer
 * keys are absent and when the job is far too old to be hydrated.
 */
async function readOnChain(jobId: string) {
  const [{ createPublicClient, http }, acp] = await Promise.all([
    import("viem"),
    import("@virtuals-protocol/acp-node-v2"),
  ]);
  const address = acp.ACP_CONTRACT_ADDRESSES[SETTLE_CHAIN_ID];
  if (!address) return null;
  const client = createPublicClient({ transport: http(BASE_RPC_URL) });
  // No cast: viem reads `expiredAt` off the ABI as `uint48` and types it
  // `number`, not `bigint`. Asserting a shape here would have quietly hidden
  // that, and the unit is seconds either way.
  const job = await client.readContract({
    address: address as `0x${string}`,
    abi: acp.ACP_ABI,
    functionName: "getJob",
    args: [BigInt(jobId)],
  });
  return { ...job, statusName: acp.JobStatus[job.status] ?? `unknown(${job.status})` };
}

/** Poll a session, printing every status change until terminal or timeout. */
async function watch(agent: Awaited<ReturnType<typeof buyer>>["agent"], jobId: string, minutes: number) {
  const deadline = Date.now() + minutes * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const s = agent.getSession(SETTLE_CHAIN_ID, jobId);
    const status = s?.status ?? "(no session)";
    if (status !== last) {
      console.log(`  ${new Date().toISOString()}  ${last || "—"} → ${status}`);
      last = status;
      if (status === "submitted" || status === "completed") {
        const deliverable = s?.entries.filter((e) => e.kind === "message").at(-1)?.content;
        if (deliverable) console.log(`\n  deliverable:\n${deliverable}\n`);
      }
      if (TERMINAL.has(status)) return status;
    }
    await new Promise((r) => setTimeout(r, 10_000));
  }
  console.log(`  watch window (${minutes}m) elapsed at status "${last}"`);
  return last;
}

async function main() {
  const argv = process.argv.slice(2);
  const flag = (name: string) => argv.indexOf(`--${name}`);
  const arg = (name: string) => {
    const i = flag(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  console.log(`\nACP buyer smoke — seller ${SELLER_WALLET}, offering "${OFFERING_NAME}"\n`);
  console.log("PREFLIGHT (no credentials, no writes, no money)");
  const offering = await fetchOffering();
  preflight(offering);

  if (failures > 0) {
    console.log(`\n${failures} preflight gate(s) FAILED — not creating a job.`);
    console.log("A job created against a broken offering does not fail fast: it sits open");
    console.log("until the SLA and terminates as `expired`, which is the outcome that");
    console.log("counts toward ungraduation. Fix the offering first.\n");
    process.exit(1);
  }
  console.log("\nPreflight clean.\n");

  armApprovalOpener();

  if (flag("create") >= 0) {
    const { agent, walletAddress } = await buyer();
    console.log(`Buyer ${walletAddress} opening job for ${JSON.stringify(REQUIREMENT)}`);
    console.log("If a Privy approval URL appears, it opens automatically — approve within 5 minutes.");
    // Self-evaluation: the buyer is its own evaluator, so escrow only releases
    // when the buyer calls --complete. Skip-evaluation would auto-release on the
    // seller's submit, which is the wrong default for a first live test.
    const jobId = await agent.createJobByOfferingName(
      SETTLE_CHAIN_ID,
      OFFERING_NAME,
      SELLER_WALLET,
      REQUIREMENT,
      { evaluatorAddress: walletAddress },
    );
    console.log(`  job ${jobId} created. Seller polls every 2 minutes.\n`);
    const status = await watch(agent, jobId.toString(), 8);
    console.log(
      status === "budget_set"
        ? `\nSeller set the budget. Next: ACP_ACK_FUND=yes npx tsx scripts/acp-buyer-smoke.ts --fund ${jobId}`
        : `\nStopped at "${status}". If you are abandoning this job, run --reject ${jobId} so it does not expire.`,
    );
    await agent.stop();
    return;
  }

  const jobId = arg("watch") ?? arg("fund") ?? arg("complete") ?? arg("reject");
  if (!jobId) return;

  const { acp, agent } = await buyer();
  const session = agent.getSession(SETTLE_CHAIN_ID, jobId);
  if (!session) {
    const job = await readOnChain(jobId);
    await agent.stop();
    if (!job) throw new Error(`job ${jobId} does not exist on Base ${SETTLE_CHAIN_ID}`);
    const deadline = new Date(Number(job.expiredAt) * 1000);
    const overdue = (Date.now() - deadline.getTime()) / 60_000;
    console.log(
      `Job ${jobId} has left the active set, but on Base ${SETTLE_CHAIN_ID} it reads ` +
        `"${job.statusName}" (deadline ${deadline.toISOString()}, ${overdue.toFixed(1)}m ago).`,
    );
    if (job.statusName === "OPEN") {
      console.log(
        `\nStill OPEN past its deadline — no transaction was ever sent for it. The chain does\n` +
          `not expire jobs on its own, so this one stays OPEN indefinitely. The server has its\n` +
          `own expiry bookkeeping (it dropped this job from the active set) and that counter is\n` +
          `NOT on the public agent record, so reject abandoned jobs rather than assuming a job\n` +
          `stuck here is harmless.`,
      );
    }
    return;
  }
  console.log(`Job ${jobId} status: ${session.status}`);
  // `expiredAt` is a deadline, NOT a timer that fires. MEASURED 2026-09-25 by
  // reading the Base contract directly: job 81119 sat 33 minutes past its
  // deadline and was still `status 0 = OPEN` on chain. Nothing moves a job to
  // EXPIRED on its own. The neighbours prove the field does record real outcomes
  // once someone writes one — 81118 = 4 REJECTED, 81116/81117 = 3 COMPLETED — so
  // a job still OPEN past its deadline means no transaction was ever sent, not
  // that the deadline slipped. Print it so "we missed the window" is a number on
  // screen rather than an inference.
  const expiredAt = session.job?.expiredAt;
  if (expiredAt) {
    // Epoch SECONDS: the ABI types it `uint48`, and the events-API path builds it
    // with `BigInt(new Date(...).getTime() / 1000)` (acpJob.js:72), so both
    // sources agree on the unit.
    const ms = Number(expiredAt) * 1000;
    const mins = (ms - Date.now()) / 60000;
    console.log(
      `  deadline: ${new Date(ms).toISOString()} ` +
        `(${mins >= 0 ? `${mins.toFixed(1)}m left` : `${(-mins).toFixed(1)}m ago — does NOT auto-expire`})`,
    );
  }

  if (flag("watch") >= 0) {
    await watch(agent, jobId, 40);
  } else if (flag("fund") >= 0) {
    if (process.env.ACP_ACK_FUND !== "yes") {
      throw new Error(
        `--fund transfers ${offering.priceValue} real USDC on Base ${SETTLE_CHAIN_ID} into ACP escrow. ` +
          "Re-run with ACP_ACK_FUND=yes to acknowledge.",
      );
    }
    await session.fund(acp.AssetToken.usdc(offering.priceValue, SETTLE_CHAIN_ID));
    console.log(`  funded ${offering.priceValue} USDC. Watching for the seller's submit…`);
    await watch(agent, jobId, 40);
  } else if (flag("complete") >= 0) {
    await session.complete("deliverable accepted (buyer smoke)");
    console.log("  completed — escrow released to the seller.");
  } else if (flag("reject") >= 0) {
    await session.reject("buyer smoke: cancelling test job");
    console.log("  rejected — refunded, and the terminal outcome is `rejected`, not `expired`.");
  }

  await agent.stop();
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`\nacp-buyer-smoke: ${message}`);
  if (/timed out after/.test(message) && /Approval/.test(message)) {
    console.error(
      "\nThat is the Privy approval window, not a failure of the job. Nothing was\n" +
        "signed or sent, so no job exists and the seller's expire_streak is untouched.\n" +
        "Re-run the same command and approve in the browser tab that opens.\n",
    );
  }
  process.exit(1);
});
