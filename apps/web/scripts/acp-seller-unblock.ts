/**
 * ACP seller unblock — do the seller's first write somewhere it can finish.
 *
 * MEASURED 2026-09-25, jobs 81118 and 81119: the seller cron sees the job,
 * records it, calls `setBudget` — and the call never returns. No tx is
 * broadcast, nothing throws, the job sits at "open" until it expires, and the
 * next tick repeats it. The bounded write in `acp-seller.ts` now names it:
 *
 *   setBudget still pending after 15000ms — write never returned
 *
 * That is not a slow write, it is a parked one. A Virtuals wallet policy can
 * answer a signing request with `403 APPROVAL_REQUIRED`, and the SDK then waits
 * on `awaitApproval()` — hardcoded to 5 minutes, no caller override, resolved
 * ONLY over the `/wallets/stream` SSE that `agent.start()` opens. The cron's
 * maxDuration is 60s. A 300s wait inside a 60s function cannot resolve, so the
 * function is killed mid-promise every single time: the seller can never make
 * its first write from the cron, no matter how many times it retries.
 *
 * This script is the same write with no ceiling over it. Approve in the browser
 * and the promise resolves here instead of dying. The buyer wallet needed this
 * exactly once — its first `createJob` demanded approval, and every write after
 * that went through unattended — so the expectation is that one approval here
 * unblocks the cron permanently. If a later cron tick still reports the same
 * pending error, that expectation was wrong and the policy is per-transaction,
 * which is a dashboard fix, not a code one.
 *
 * Needs the SELLER secrets, which live in Vercel and are NOT in `.env.local` by
 * default. Add them locally to run this. It moves no money: `setBudget` only
 * proposes a price, and the seller never funds or completes anything.
 *
 * Usage:
 *   npx tsx scripts/acp-seller-unblock.ts            # report open jobs, write nothing
 *   npx tsx scripts/acp-seller-unblock.ts <jobId>    # setBudget on that job
 */
import fs from "fs";
import path from "path";
import { spawn } from "child_process";

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
  } catch { /* fall through to the missing-credentials message */ }
})();

const SETTLE_CHAIN_ID = Number(process.env.ACP_CHAIN_ID ?? "8453") || 8453;
const PRICE_USDC = (() => {
  const n = Number(process.env.ACP_OFFERING_PRICE_USDC ?? "0.5");
  return Number.isFinite(n) && n > 0 ? n : 0.5;
})();

/**
 * The approval URL is logged by the provider adapter and nothing else surfaces
 * it. Opening it the moment it appears is the difference between a 5-minute
 * window and a 5-minute window someone noticed 6 minutes late.
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

async function main() {
  const walletAddress = process.env.ACP_WALLET_ADDRESS?.trim();
  const walletId = process.env.ACP_WALLET_ID?.trim();
  const signerPrivateKey = process.env.ACP_SIGNER_PRIVATE_KEY?.trim();
  if (!walletAddress || !walletId || !signerPrivateKey) {
    throw new Error(
      "seller credentials missing. Need ACP_WALLET_ADDRESS, ACP_WALLET_ID and " +
        "ACP_SIGNER_PRIVATE_KEY in apps/web/.env.local. They are set in Vercel, not here — " +
        "copy them from the project's environment variables.",
    );
  }

  const jobId = process.argv[2]?.trim();
  armApprovalOpener();

  const acp = await import("@virtuals-protocol/acp-node-v2");
  const chain = acp.getEvmChainByChainId(SETTLE_CHAIN_ID);
  const evmProvider = await acp.PrivyAlchemyEvmProviderAdapter.create({
    walletAddress: walletAddress as `0x${string}`,
    walletId,
    signerPrivateKey,
    chains: chain ? [chain] : undefined,
    builderCode: process.env.ACP_BUILDER_CODE?.trim() || undefined,
  });
  const agent = await acp.AcpAgent.create({ evmProvider });
  await agent.start();

  try {
    const provider = agent.sessions.filter((s) => s.roles.includes("provider"));
    console.log(`\nSeller ${walletAddress} — ${provider.length} provider session(s)`);
    for (const s of provider) console.log(`  job ${s.jobId}  ${s.status}`);

    if (!jobId) {
      console.log("\nRead-only. Pass a job id to set its budget.");
      return;
    }

    const session = provider.find((s) => String(s.jobId) === jobId);
    if (!session) throw new Error(`job ${jobId} is not an open provider session for this seller`);
    if (session.status !== "open") {
      console.log(`\njob ${jobId} is "${session.status}", not "open" — setBudget would be wrong here.`);
      return;
    }

    console.log(
      `\nSetting budget ${PRICE_USDC} USDC on Base ${SETTLE_CHAIN_ID} for job ${jobId}.` +
        `\nIf an approval URL appears it opens automatically — approve within 5 minutes.`,
    );
    const t0 = Date.now();
    await session.setBudget(acp.AssetToken.usdc(PRICE_USDC, SETTLE_CHAIN_ID));
    console.log(`\n  budget set in ${((Date.now() - t0) / 1000).toFixed(1)}s — job ${jobId} is now awaiting buyer funding.`);
    console.log(`  Buyer funds with: ACP_ACK_FUND=yes npx tsx scripts/acp-buyer-smoke.ts --fund ${jobId}`);
  } finally {
    await agent.stop().catch(() => {});
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nacp-seller-unblock: ${message}`);
    if (/timed out after/.test(message) && /Approval/.test(message)) {
      console.error(
        "\nThat is the Privy approval window, not a failure of the write. Nothing was\n" +
          "signed or sent. Re-run and approve in the browser tab that opens.\n",
      );
    }
    process.exit(1);
  });
