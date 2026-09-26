/**
 * Guard: an EIP-7702 delegated EOA must never be reported as a contract.
 *
 * Run: `npx tsx scripts/eip7702-designator-test.ts` (from apps/web). Exit 0 = pass.
 * Hermetic — pure function, no RPC. The live read is proven separately; this
 * pins the decode, which is the part that can silently over- or under-match.
 *
 * WHY IT EXISTS
 * -------------
 * `eth_getCode` returns bytecode for a 7702 account, so the obvious
 * "code ⟹ contract" test classifies a MetaMask or Alchemy smart-account user
 * as a contract. MEASURED before the fix: risk-gate returned
 * `isContract: true, verified: false` for an EOA delegated to the MetaMask
 * delegator, i.e. it warned a user that their own wallet was an unverified
 * contract. Every consumer of `TokenIdentity.isContract` inherited that.
 *
 * 🔴 The failure that matters is the LENGTH check, not the prefix. A designator
 * is exactly 23 bytes; a real contract may legitimately begin with the same
 * bytes (`0xef` was reserved precisely so it could not, but nothing stops a
 * future format from sharing the prefix, and `startsWith` alone would also
 * match a 5KB contract whose first three bytes happen to collide). Dropping the
 * length check turns a contract into "an EOA" — the inverse bug, and the more
 * dangerous direction: a token would be waved through as a harmless wallet.
 * So the over-match cases below are the real content of this file.
 */
import { parseDelegationDesignator } from "../src/lib/onchain";

let pass = 0;
const failures: string[] = [];
function check(name: string, cond: boolean) {
  if (cond) pass++;
  else failures.push(name);
}

const DELEGATE = "0x77021100bd87b7008e5e1989d0eb38555d0d0000";
const designator = `0xef0100${DELEGATE.slice(2)}`;

// ── 1. the happy path ────────────────────────────────────────────────────────
check("1.1 a designator decodes to its delegate address",
      parseDelegationDesignator(designator) === DELEGATE);
check("1.2 …case-insensitively on the prefix, lowercased on the way out",
      parseDelegationDesignator(`0xEF0100${DELEGATE.slice(2).toUpperCase()}`) === DELEGATE);

// ── 2. must NOT match — the over-match direction ─────────────────────────────
// Each of these would be called an EOA if the length check were dropped.
check("2.1 a long contract sharing the 0xef0100 prefix is NOT a designator",
      parseDelegationDesignator(`0xef0100${"60".repeat(400)}`) === null);
check("2.2 a designator missing its last byte is NOT decoded",
      parseDelegationDesignator(designator.slice(0, -2)) === null);
check("2.3 a designator with an extra byte is NOT decoded",
      parseDelegationDesignator(`${designator}ff`) === null);

// ── 3. must NOT match — ordinary inputs ──────────────────────────────────────
check("3.1 an empty account (0x) is not a designator", parseDelegationDesignator("0x") === null);
check("3.2 undefined (failed RPC read) is not a designator", parseDelegationDesignator(undefined) === null);
check("3.3 real contract bytecode is not a designator",
      parseDelegationDesignator("0x608060405234801561001057600080fd5b50") === null);
// Right length, wrong prefix — the case a prefix-only OR a length-only check
// would each get wrong on its own, so it proves both halves are live.
check("3.4 23 bytes that are not a designator are rejected on the prefix",
      parseDelegationDesignator(`0xef0200${DELEGATE.slice(2)}`) === null);

console.log(`\neip-7702 designator guard: ${pass} passed, ${failures.length} failed`);
for (const f of failures) console.log(`  FAIL  ${f}`);
process.exit(failures.length === 0 ? 0 : 1);
