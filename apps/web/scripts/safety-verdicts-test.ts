/**
 * safety-verdicts-test — the four safety tools decide their verdict in CODE,
 * from what was measured (W0-19, 2026-09-30).
 *
 * Until then: honeypot-check ORed a model's `is_honeypot` into HONEYPOT;
 * risk-gate mapped a model-invented `risk_score` (50 — CAUTION — when there was
 * none); contract-trust let a third model call pick SAFE/CAUTION/RED_FLAG;
 * quick-safety took the model's verdict word, and even its tax numbers. A
 * verdict a model picks flips between runs on the same input, and a model
 * saying "honeypot" about a token nobody measured is a negative inferred from
 * absent data — both forbidden by CLAUDE.md.
 *
 * The verdict functions are pure, so they are tested directly, both ways:
 * every decisive measured fact changes the answer, and absence of data yields
 * UNKNOWN, never a negative. §5 then checks each handler takes its `verdict`
 * from its function and not from a model field.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { measuredHoneypotVerdict } from "../src/app/api/x402/_handlers/honeypot-check";
import { measuredRiskVerdict, decodeApproval, type RiskFacts } from "../src/app/api/x402/_handlers/risk-gate";
import { measuredTrustVerdict } from "../src/app/api/x402/_handlers/contract-trust";
import { quickVerdict } from "../src/app/api/x402/_handlers/quick-safety";

let failures = 0;
let passes = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (cond) passes++; else failures++;
}

const READ = (sell: number, blacklist: boolean | null = false) => ({ tax_read: "template" as const, sell_tax: sell, has_blacklist: blacklist });
const UNREAD = { tax_read: "failed" as const, sell_tax: null, has_blacklist: null };

console.log("\n1. honeypot — measuredHoneypotVerdict");
ok("measured 50% sell tax → HONEYPOT", measuredHoneypotVerdict(READ(5_000)).verdict === "HONEYPOT");
ok("unread tax → UNKNOWN, never SUSPICIOUS", measuredHoneypotVerdict(UNREAD).verdict === "UNKNOWN");
ok("read, blacklist lever → SUSPICIOUS", measuredHoneypotVerdict(READ(0, true)).verdict === "SUSPICIOUS");
ok("read, 12% sell tax → SUSPICIOUS", measuredHoneypotVerdict(READ(1_200)).verdict === "SUSPICIOUS");
ok("read, 1% and no lever → SAFE", measuredHoneypotVerdict(READ(100)).verdict === "SAFE");
ok("confidence is code's: 95 / 85 / 70 / 50",
  [READ(5_000), READ(100), READ(0, true), UNREAD].map((t) => measuredHoneypotVerdict(t).confidence).join() === "95,85,70,50");

console.log("\n2. risk-gate — decodeApproval + measuredRiskVerdict");
const MAX = "f".repeat(64);
const SPENDER = "000000000000000000000000" + "1".repeat(40);
ok("approve(spender, max) → unlimited", decodeApproval(`0x095ea7b3${SPENDER}${MAX}`) === "unlimited");
ok("approve(spender, 100) → not an unlimited grant", decodeApproval(`0x095ea7b3${SPENDER}${"0".repeat(62)}64`) === null);
ok("setApprovalForAll(op, true) → operator", decodeApproval(`0xa22cb465${SPENDER}${"0".repeat(63)}1`) === "operator");
ok("setApprovalForAll(op, false) → nothing granted", decodeApproval(`0xa22cb465${SPENDER}${"0".repeat(64)}`) === null);
ok("garbage calldata → null", decodeApproval("0xzz") === null && decodeApproval("") === null);
const base: RiskFacts = { movesValue: true, hasCalldata: false, isContract: false, isToken: false, verified: false, isDelegatedEoa: false, approval: null, honeypot: null };
ok("plain value send to a wallet → PROCEED", measuredRiskVerdict(base).verdict === "PROCEED");
ok("nothing moves, nothing executes → PROCEED", measuredRiskVerdict({ ...base, movesValue: false }).verdict === "PROCEED");
ok("into a measured honeypot → ABORT", measuredRiskVerdict({ ...base, isToken: true, isContract: true, honeypot: "HONEYPOT" }).verdict === "ABORT");
ok("an unlimited approval → CAUTION", measuredRiskVerdict({ ...base, hasCalldata: true, approval: "unlimited" }).verdict === "CAUTION");
ok("token with unread tax → UNKNOWN, not CAUTION", measuredRiskVerdict({ ...base, isToken: true, isContract: true, honeypot: "UNKNOWN" }).verdict === "UNKNOWN");
ok("calldata into an unverified non-token contract → UNKNOWN",
  measuredRiskVerdict({ ...base, isContract: true, hasCalldata: true }).verdict === "UNKNOWN");
ok("a 7702 wallet is not treated as an unverified contract",
  measuredRiskVerdict({ ...base, isContract: true, hasCalldata: true, isDelegatedEoa: true }).verdict === "PROCEED");
ok("every verdict carries its measured reason", measuredRiskVerdict({ ...base, approval: "operator", hasCalldata: true }).reasons.length > 0);

console.log("\n3. contract-trust — measuredTrustVerdict");
ok("measured honeypot → RED_FLAG", measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: "HONEYPOT" }).verdict === "RED_FLAG");
ok("Basescan silent → UNKNOWN, not 'unverified'", measuredTrustVerdict({ basescanAvailable: false, verified: false, isProxy: false, honeypot: null }).verdict === "UNKNOWN");
ok("unverified source, nothing measured wrong → UNKNOWN", measuredTrustVerdict({ basescanAvailable: true, verified: false, isProxy: false, honeypot: null }).verdict === "UNKNOWN");
ok("unverified upgradeable proxy → CAUTION", measuredTrustVerdict({ basescanAvailable: true, verified: false, isProxy: true, honeypot: null }).verdict === "CAUTION");
ok("verified, no lever → SAFE", measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: "SAFE" }).verdict === "SAFE");
ok("verified token with a blacklist lever → CAUTION", measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: "SUSPICIOUS" }).verdict === "CAUTION");

console.log("\n4. quick-safety — quickVerdict");
ok("measured honeypot → DANGER", quickVerdict({ liquidityUsd: 1e6, basePairs: 3, verified: true, honeypot: "HONEYPOT" }).verdict === "DANGER");
ok("no Base pair → CAUTION", quickVerdict({ liquidityUsd: 0, basePairs: 0, verified: true, honeypot: "UNKNOWN" }).verdict === "CAUTION");
ok("thin liquidity → CAUTION", quickVerdict({ liquidityUsd: 2_000, basePairs: 1, verified: true, honeypot: "SAFE" }).verdict === "CAUTION");
ok("verified + real liquidity → SAFE", quickVerdict({ liquidityUsd: 500_000, basePairs: 4, verified: true, honeypot: "SAFE" }).verdict === "SAFE");
ok("DexScreener + Basescan silent → UNKNOWN (absence is not risk)",
  quickVerdict({ liquidityUsd: null, basePairs: null, verified: null, honeypot: "UNKNOWN" }).verdict === "UNKNOWN");
const silent = quickVerdict({ liquidityUsd: null, basePairs: null, verified: null, honeypot: "UNKNOWN" });
ok("…and no flag claims thin liquidity or no market from a null", !silent.flags.some((f) => /liquidity|no Base DEX/.test(f)), silent.flags.join(" | "));

console.log("\n5. each handler's verdict comes from its measured function");
const H = (f: string) => readFileSync(join(process.cwd(), "src/app/api/x402/_handlers", f), "utf8");
ok("honeypot-check: verdict = measured.verdict, no model boolean in it",
  /const verdict = measured\.verdict;/.test(H("honeypot-check.ts")) && !/Boolean\(blue\.is_honeypot\) \|\|/.test(H("honeypot-check.ts")));
ok("risk-gate: verdict = measured.verdict, no model risk_score in it",
  /const verdict = measured\.verdict;/.test(H("risk-gate.ts")) && !/riskScore > 70/.test(H("risk-gate.ts")));
ok("contract-trust: no 'final arbiter' model call left",
  !/final arbiter/i.test(H("contract-trust.ts").replace(/\/\/.*$/gm, "")) && /verdict: measured\.verdict/.test(H("contract-trust.ts")));
ok("quick-safety: no model call at all", !/callLLM/.test(H("quick-safety.ts").replace(/\/\/.*$/gm, "")));

console.log(`\nsafety-verdicts-test: ${passes}/${passes + failures} passed`);
if (failures > 0) process.exit(1);
