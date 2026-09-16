/**
 * CI guard on the cross-chain Activity timeline — `app/app/bank/TransactionHistory.tsx`.
 *
 * Run: `npx tsx scripts/timeline-chain-scope-test.ts` from `apps/web/`.
 * Hermetic: pure functions only. No env, no network, no React render.
 *
 * WHAT THIS PROTECTS, in one line: no fact from one chain may ever be rendered
 * under another chain's identity.
 *
 * The timeline used to read exactly one chain. It took `explorer`,
 * `explorerName` and `chainShort` as props and stamped every row with them, so
 * "which chain is this?" had a single answer for the whole card and could not be
 * wrong. Merging /api/wallet/rh-transactions into it removed that guarantee:
 * the card now holds Base rows and Robinhood 4663 rows side by side, and FOUR
 * separate labelling paths in `classify` name a counterparty from twenty bytes
 * with no chain attached —
 *
 *   1. `KNOWN[counterparty]`   — Aave / Morpho / 0x, all Base deployments
 *   2. `isBlueTreasury(...)`   — our payee address, on Base
 *   3. the x402 receipt join    — matched BY HASH, and a hash carries no chain
 *   4. `wantsBasename`          — a basename is a record on Base
 *
 * Each one, applied to a 4663 row, produces the #219/#230 defect: a fact from
 * one chain rendered under another's identity. Not one of them fails loudly —
 * they all produce a confident, plausible, wrong label on a screen about money.
 * That is why this is a test and not a comment.
 *
 * The invariant is stated over INPUTS, not over the current implementation, so
 * it survives a rewrite of `classify`: for any row whose `chain` is not Base
 * mainnet, no Base-derived name may appear anywhere in its output.
 */

import {
  classify, headingFor, matches,
  type WalletTx, type Receipt, type Filter,
} from "../src/app/app/bank/TransactionHistory";
import { TOPUP_TREASURY } from "../src/lib/payments";

let failed = 0;
function ok(what: string, cond: boolean, detail = "") {
  if (cond) { console.log(`  ✓ ${what}`); return; }
  failed++;
  console.log(`  ✗ ${what}${detail ? `\n      ${detail}` : ""}`);
}

const AAVE = "0xa238dd80c259a72e81d7e4664a9801593f98d1c5";
const STRANGER = "0x1111111111111111111111111111111111111111";

const row = (over: Partial<WalletTx>): WalletTx => ({
  chain: "base", hash: "0xdead", ts: 1_756_000_000_000, category: "",
  kind: "sent", dir: "out", counterparty: STRANGER, amount: 1, asset: "USDC",
  status: "complete", ...over,
});

const receipt: Receipt = {
  ts: 1_756_000_000_000, tool: "token-price", name: "Token Price",
  units: 1, usd: 0.01, tx: "0xdead",
};

// ── 1. The treasury proof is Base-only ───────────────────────────────────────
console.log("\nagent spend — `isBlueTreasury` is a claim about BASE");
{
  const onBase = classify(row({ chain: "base", counterparty: TOPUP_TREASURY }), null);
  ok("a USDC send to the treasury ON BASE is agent spending", onBase.group === "agent");
  ok("…and is headed 'Paid Blue Agent'",
    headingFor(row({ chain: "base", counterparty: TOPUP_TREASURY }), onBase, "Blue Agent") === "Paid Blue Agent");

  // x402 settles USDC on Base 8453 through the CDP facilitator. The identical
  // hex on 4663 is an account we have never controlled, so a transfer to it is
  // a transfer to a stranger — and "Paid Blue Agent" would be a fabricated
  // payee on a row about the user's own money.
  const onRh = classify(row({ chain: "robinhood", counterparty: TOPUP_TREASURY }), null);
  ok("the SAME hex on Robinhood 4663 is NOT agent spending",
    onRh.group !== "agent", `got group=${onRh.group}`);
  ok("…and never names Blue Agent", onRh.payee === null, `got payee=${onRh.payee}`);
  ok("…and the Agent filter does not sweep it up", !matches(onRh, "Agent" as Filter));

  // Base Sepolia too: x402 has never run there either.
  ok("Base Sepolia is not agent spending either",
    classify(row({ chain: "baseSepolia", counterparty: TOPUP_TREASURY }), null).group !== "agent");
}

// ── 2. The receipt join is Base-only ─────────────────────────────────────────
console.log("\nreceipts — a hash carries no chain, so the CHAIN must gate the join");
{
  const onBase = classify(row({ chain: "base" }), receipt);
  ok("a receipt explains a Base row", onBase.receipt?.tool === "token-price");
  ok("…and names the tool in the heading",
    headingFor(row({ chain: "base" }), onBase, "x") === "Blue Hub · Token Price");

  const onRh = classify(row({ chain: "robinhood" }), receipt);
  ok("the same receipt is DROPPED on a 4663 row",
    onRh.receipt === null, `got receipt=${JSON.stringify(onRh.receipt)}`);
  ok("…so the row is never captioned 'Blue Hub · …'",
    !headingFor(row({ chain: "robinhood" }), onRh, "0x1111…1111").startsWith("Blue Hub"));
}

// ── 3. The KNOWN map is Base-family ──────────────────────────────────────────
console.log("\ncounterparty names — `KNOWN` holds Base deployments");
{
  ok("Aave is named on Base", classify(row({ chain: "base", counterparty: AAVE }), null).payee === "Aave v3");
  ok("Aave is named on Base Sepolia (the map holds both deployments)",
    classify(row({ chain: "baseSepolia", counterparty: AAVE }), null).payee === "Aave v3");
  const rh = classify(row({ chain: "robinhood", counterparty: AAVE }), null);
  ok("the same hex on 4663 is NOT named 'Aave v3'", rh.payee === null, `got payee=${rh.payee}`);
  ok("…and does not group as Earn", rh.group !== "earn", `got group=${rh.group}`);
}

// ── 4. Basenames are Base records ────────────────────────────────────────────
console.log("\nbasenames — a name service on Base may not label a 4663 account");
{
  ok("an unknown Base counterparty asks for a basename",
    classify(row({ chain: "base", kind: "received", dir: "in" }), null).wantsBasename === true);
  ok("an unknown 4663 counterparty does NOT",
    classify(row({ chain: "robinhood", kind: "received", dir: "in" }), null).wantsBasename === false);
  ok("a NAMED Base counterparty does not ask either (nothing to resolve)",
    classify(row({ chain: "base", kind: "received", dir: "in", counterparty: AAVE }), null).wantsBasename === false);
}

// ── 5. The invariant, stated over inputs ─────────────────────────────────────
//
// Restated as a property so it holds however `classify` is rewritten: sweep
// every chain × every Base-derived counterparty × receipt-or-not, and assert
// that nothing Base-derived leaks onto a non-Base-mainnet row.
console.log("\ninvariant — no Base-derived label on a non-Base row, over the full cross product");
{
  const chains = ["base", "baseSepolia", "robinhood"] as const;
  const parties = [TOPUP_TREASURY, AAVE, STRANGER];
  const kinds = ["received", "sent", "swap", "contract"] as const;
  let checked = 0, leaks = 0;
  for (const chain of chains)
    for (const counterparty of parties)
      for (const kind of kinds)
        for (const r of [null, receipt]) {
          const tx = row({ chain, counterparty, kind, dir: kind === "received" ? "in" : "out" });
          const c = classify(tx, r);
          checked++;
          if (chain === "base") continue;
          const leaked =
            (chain !== "baseSepolia" && c.payee !== null) ||  // KNOWN is Base-family
            c.receipt !== null ||                              // receipts are Base mainnet
            c.group === "agent" ||                             // so is the treasury proof
            (chain === "robinhood" && c.wantsBasename);        // basenames are Base records
          if (leaked) {
            leaks++;
            console.log(`      LEAK ${chain}/${kind}/${counterparty.slice(0, 10)}/${r ? "receipt" : "none"} → ${JSON.stringify(c)}`);
          }
        }
  ok(`${checked} combinations swept, 0 leaks`, leaks === 0, `${leaks} leaked`);
}

// ── 6. A row's own chain decides its explorer ────────────────────────────────
//
// Source-text assertion, because the href is built inside a React render. The
// point is narrow and worth pinning: the card must NOT accept an `explorer`
// prop again. Taking one is what let a single Basescan URL be stamped on every
// row in a two-chain list, where it is right for one chain and dead for the
// other.
console.log("\nexplorer href — derived per row, never a card-level prop");
{
  const src = require("node:fs").readFileSync(
    require("node:path").join(__dirname, "../src/app/app/bank/TransactionHistory.tsx"), "utf8") as string;
  ok("no `explorer` / `explorerName` / `chainShort` prop survives",
    !/\bexplorerName\s*[:,]/.test(src) && !/\bchainShort\s*[:,]/.test(src));
  ok("the row href reads WALLET_CHAINS[tx.chain]",
    /WALLET_CHAINS\[tx\.chain\]/.test(src));
  ok("`WalletTx.chain` is required, not optional",
    /chain:\s*WalletChain;/.test(src) && !/chain\?:\s*WalletChain/.test(src));
}

console.log(failed === 0 ? "\nPASS — the timeline cannot mislabel a chain\n" : `\nFAIL — ${failed} check(s)\n`);
process.exit(failed === 0 ? 0 : 1);
