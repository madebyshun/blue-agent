/**
 * scripts/frozen-transfers-test.ts — `npm run test:frozen`
 *
 * `frozen-transfers.json` is the committed, deadline-final pledge ledger the
 * /pledge page serves (see `frozen.ts`). It decides which transfers every
 * holder can see and, once the ratio is announced, what each is owed. It is a
 * static file, so a bad edit is the expected failure mode — and by the time a
 * wrong ledger is public the damage (a holder told their pledge is gone) is
 * done. So the loader's rejections are asserted here rather than trusted.
 *
 * What this checks:
 *   1. VALIDATION — every rejection path in `loadFrozen`, with a real bad
 *      fixture. A validator whose branches never run is decoration.
 *   2. SELF-CHECK — the per-chain counts/totals in `_meta` must match the
 *      transfer rows; a file edited to change the numbers must fail to load.
 *   3. DEADLINE — a row at or past the pledge deadline is refused.
 *   4. THE COMMITTED FILE — the real file loads and matches the known
 *      reconstruction (Base 19 tx / 16 wallets, RH 18 tx / 16 wallets, 0 late).
 *
 * Pure and offline — no RPC, no keys, no network. Exits non-zero on failure.
 */
import { loadFrozen } from "../src/lib/pledge/frozen";
import { CHAINS, RECEIVING_WALLET, PLEDGE_DEADLINE_ISO } from "../src/lib/pledge/config";
import committed from "../src/lib/pledge/frozen-transfers.json";

let failures = 0;
const ok = (m: string) => console.log(`  ✓ ${m}`);
const bad = (m: string) => {
  failures++;
  console.log(`  ✗ ${m}`);
};
const info = (m: string) => console.log(`    ${m}`);

function header(title: string) {
  console.log(`\n─── ${title} ${"─".repeat(Math.max(0, 60 - title.length))}`);
}

const eq = (label: string, actual: unknown, expected: unknown) => {
  if (actual === expected) ok(`${label} = ${String(actual)}`);
  else bad(`${label}: expected ${String(expected)}, got ${String(actual)}`);
};

if (!PLEDGE_DEADLINE_ISO) throw new Error("test: PLEDGE_DEADLINE_ISO is null");
const DEADLINE_ISO: string = PLEDGE_DEADLINE_ISO;
const DEADLINE_UNIX = Math.floor(Date.parse(DEADLINE_ISO) / 1000);
const BASE_TOKEN = CHAINS.base.token.address;
const RH_TOKEN = CHAINS.rh.token.address;

/** A valid single-transfer document, deep-cloned so overrides don't leak. */
function doc(over: {
  transfer?: Record<string, unknown>;
  meta?: Record<string, unknown>;
} = {}) {
  const transfer = {
    chain: "base",
    wallet: `0x${"1".repeat(40)}`,
    amount: "1000000000000000000",
    txHash: `0x${"a".repeat(64)}`,
    blockNumber: 49_500_000,
    timestamp: DEADLINE_UNIX - 1000,
    ...over.transfer,
  };
  const total = /^\d+$/.test(String(transfer.amount)) ? BigInt(transfer.amount as string) : 0n;
  return {
    _meta: {
      receivingWallet: RECEIVING_WALLET,
      deadlineIso: PLEDGE_DEADLINE_ISO,
      base: {
        token: BASE_TOKEN,
        chainId: CHAINS.base.chainId,
        transfers: transfer.chain === "base" ? 1 : 0,
        wallets: transfer.chain === "base" ? 1 : 0,
        totalRawUnits: transfer.chain === "base" ? total.toString() : "0",
        totalTokens: "",
      },
      rh: {
        token: RH_TOKEN,
        chainId: CHAINS.rh.chainId,
        transfers: transfer.chain === "rh" ? 1 : 0,
        wallets: transfer.chain === "rh" ? 1 : 0,
        totalRawUnits: transfer.chain === "rh" ? total.toString() : "0",
        totalTokens: "",
      },
      ...over.meta,
    },
    transfers: [transfer],
  };
}

/** Rejection = `loadFrozen` throws. Silence (an accepted bad file) is failure. */
function rejects(label: string, input: unknown) {
  try {
    loadFrozen(input);
    bad(`${label} — ACCEPTED, should have been rejected`);
  } catch (e) {
    ok(`${label} — rejected: ${(e as Error).message.slice(0, 74)}`);
  }
}

// ─── 1. Validation ───────────────────────────────────────────────────────────

function checkValidation() {
  header("1. Validation — every rejection path, with a real bad fixture");

  try {
    const l = loadFrozen(doc());
    eq("well-formed single transfer loads", l.transfers.length, 1);
  } catch (e) {
    bad(`well-formed doc threw: ${(e as Error).message}`);
  }

  rejects("missing _meta", { transfers: [] });
  rejects("receivingWallet is wrong", doc({ meta: { receivingWallet: `0x${"9".repeat(40)}` } }));
  rejects("deadlineIso disagrees with config", doc({ meta: { deadlineIso: "2020-01-01T00:00:00Z" } }));
  rejects("transfers is not an array", { _meta: doc()._meta, transfers: "nope" });
  rejects("chain is neither rh nor base", doc({ transfer: { chain: "solana" } }));
  rejects("wallet is not an address", doc({ transfer: { wallet: "0xdead" } }));
  rejects("amount is zero", doc({ transfer: { amount: "0" } }));
  rejects("amount has a decimal point", doc({ transfer: { amount: "1.5" } }));
  rejects("amount is a number, not a string", doc({ transfer: { amount: 100 } }));
  rejects("txHash is not 32 bytes", doc({ transfer: { txHash: "0xbeef" } }));
  rejects("blockNumber is zero", doc({ transfer: { blockNumber: 0 } }));
  rejects("timestamp is missing/zero", doc({ transfer: { timestamp: 0 } }));
}

// ─── 2. Self-check (meta vs rows) ────────────────────────────────────────────

function checkSelfCheck() {
  header("2. Self-check — _meta must match the transfer rows");

  rejects("token mismatch in _meta", doc({ meta: { base: { token: `0x${"5".repeat(40)}`, chainId: CHAINS.base.chainId, transfers: 1, wallets: 1, totalRawUnits: "1000000000000000000", totalTokens: "" } } }));
  rejects("chainId mismatch in _meta", doc({ meta: { base: { token: BASE_TOKEN, chainId: 1, transfers: 1, wallets: 1, totalRawUnits: "1000000000000000000", totalTokens: "" } } }));
  rejects("transfer count mismatch", doc({ meta: { base: { token: BASE_TOKEN, chainId: CHAINS.base.chainId, transfers: 99, wallets: 1, totalRawUnits: "1000000000000000000", totalTokens: "" } } }));
  rejects("wallet count mismatch", doc({ meta: { base: { token: BASE_TOKEN, chainId: CHAINS.base.chainId, transfers: 1, wallets: 99, totalRawUnits: "1000000000000000000", totalTokens: "" } } }));
  rejects("raw-unit total mismatch", doc({ meta: { base: { token: BASE_TOKEN, chainId: CHAINS.base.chainId, transfers: 1, wallets: 1, totalRawUnits: "999", totalTokens: "" } } }));
}

// ─── 3. Deadline ─────────────────────────────────────────────────────────────

function checkDeadline() {
  header("3. Deadline — a row at or past the deadline is refused");
  rejects("transfer AT the deadline", doc({ transfer: { timestamp: DEADLINE_UNIX } }));
  rejects("transfer PAST the deadline", doc({ transfer: { timestamp: DEADLINE_UNIX + 1 } }));
  const l = loadFrozen(doc({ transfer: { timestamp: DEADLINE_UNIX - 1 } }));
  eq("transfer one second before the deadline is eligible", l.transfers.length, 1);
}

// ─── 4. The committed file ───────────────────────────────────────────────────

function checkCommittedFile() {
  header("4. The committed frozen-transfers.json");

  let l: ReturnType<typeof loadFrozen>;
  try {
    l = loadFrozen(); // defaults to the real committed file
    ok(`loads — ${l.transfers.length} transfer(s)`);
  } catch (e) {
    bad(`the committed file does not load: ${(e as Error).message}`);
    return;
  }

  const base = l.transfers.filter((t) => t.chain === "base");
  const rh = l.transfers.filter((t) => t.chain === "rh");
  const baseWallets = new Set(base.map((t) => t.wallet.toLowerCase())).size;
  const rhWallets = new Set(rh.map((t) => t.wallet.toLowerCase())).size;

  eq("Base transfers", base.length, 19);
  eq("Base wallets", baseWallets, 16);
  eq("RH transfers", rh.length, 18);
  eq("RH wallets", rhWallets, 16);

  // No row may sit at or past the deadline — the loader would have thrown, but
  // assert it here too so the number the page shows is provably pre-deadline.
  const late = l.transfers.filter((t) => t.timestamp !== null && t.timestamp >= DEADLINE_UNIX);
  eq("post-deadline rows", late.length, 0);

  // Every transfer individually addressable — a 32-byte hash, unique.
  const hashes = new Set<string>();
  let dupes = 0;
  for (const t of l.transfers) {
    if (!/^0x[0-9a-fA-F]{64}$/.test(t.txHash)) bad(`bad hash: ${t.txHash}`);
    const key = `${t.txHash.toLowerCase()}:${t.chain}`;
    if (hashes.has(key)) dupes++;
    hashes.add(key);
  }
  eq("duplicate (hash,chain) rows", dupes, 0);

  const meta = (committed as unknown as { _meta: Record<string, { totalTokens: string }> })._meta;
  info(`Base total ${meta.base.totalTokens} old-$BLUEAGENT`);
  info(`RH   total ${meta.rh.totalTokens} old-$BLUEAGENT`);
}

// ─── run ─────────────────────────────────────────────────────────────────────

checkValidation();
checkSelfCheck();
checkDeadline();
checkCommittedFile();

console.log(
  failures === 0
    ? "\n✓ frozen transfers — all checks passed\n"
    : `\n✗ frozen transfers — ${failures} check(s) failed\n`,
);
process.exit(failures === 0 ? 0 : 1);
