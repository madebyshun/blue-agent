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
import { measuredRiskVerdict, decodeApproval, isKnownTokenCall, isBoundedApproval, type RiskFacts } from "../src/app/api/x402/_handlers/risk-gate";
import { measuredTrustVerdict } from "../src/app/api/x402/_handlers/contract-trust";
import { quickVerdict } from "../src/app/api/x402/_handlers/quick-safety";
import { parseEtherscanSource } from "../src/lib/moralis";
import { contractAnswered } from "../src/lib/onchain";
import { createPublicClient, custom, encodeFunctionResult, parseAbi } from "viem";
import { base as baseChain } from "viem/chains";

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
const base: RiskFacts = { movesValue: true, hasCalldata: false, isContract: false, isToken: false, verified: false, isDelegatedEoa: false, approval: null, boundedApproval: false, knownTokenCall: false, honeypot: null };
ok("plain value send to a wallet → PROCEED", measuredRiskVerdict(base).verdict === "PROCEED");
ok("nothing moves, nothing executes → PROCEED", measuredRiskVerdict({ ...base, movesValue: false }).verdict === "PROCEED");
ok("into a measured honeypot → ABORT", measuredRiskVerdict({ ...base, isToken: true, isContract: true, honeypot: "HONEYPOT" }).verdict === "ABORT");
ok("an unlimited approval → CAUTION", measuredRiskVerdict({ ...base, hasCalldata: true, approval: "unlimited" }).verdict === "CAUTION");
ok("token with unread tax → UNKNOWN, not CAUTION", measuredRiskVerdict({ ...base, isToken: true, isContract: true, honeypot: "UNKNOWN" }).verdict === "UNKNOWN");
ok("calldata into an unverified non-token contract → UNKNOWN",
  measuredRiskVerdict({ ...base, isContract: true, hasCalldata: true }).verdict === "UNKNOWN");
const eoa7702 = measuredRiskVerdict({ ...base, isContract: false, hasCalldata: true, isDelegatedEoa: true });
ok("a 7702 wallet is not called an unverified contract — but its undecoded calldata is UNKNOWN, not PROCEED",
  eoa7702.verdict === "UNKNOWN" && !/UNVERIFIED contract/.test(eoa7702.reasons.join(" ")), eoa7702.reasons.join(" | "));

// 2026-10-01 — PROCEED is earned, not defaulted (risk-gate header).
const ADDR = (h: string) => "0".repeat(24) + h.repeat(40);
const U160_MAX = "0".repeat(24) + "f".repeat(40);
const permit2Approve = `0x87517c45${ADDR("a")}${ADDR("d")}${U160_MAX}${"0".repeat(52)}ffffffffffff`;
ok("Permit2 approve(token, spender, max-uint160, far expiry) → unlimited", decodeApproval(permit2Approve) === "unlimited");
ok("Permit2 approve of a small amount → not an unlimited grant",
  decodeApproval(`0x87517c45${ADDR("a")}${ADDR("d")}${"0".repeat(62)}64${"0".repeat(64)}`) === null);
ok("ERC-2612 permit(owner, spender, max, …) → unlimited",
  decodeApproval(`0xd505accf${ADDR("a")}${ADDR("d")}${MAX}${"f".repeat(64)}${"0".repeat(62)}1b${"1".repeat(128)}`) === "unlimited");
ok("Permit2 permit(owner, {token, max-uint160, …}, sig) → unlimited",
  decodeApproval(`0x2b67b570${ADDR("a")}${ADDR("b")}${U160_MAX}${"f".repeat(64)}${"0".repeat(64)}${ADDR("d")}${"f".repeat(64)}${"0".repeat(61)}100`) === "unlimited");
ok("the Permit2 drain the review described → CAUTION, not SAFE_TO_EXECUTE",
  measuredRiskVerdict({ ...base, movesValue: false, hasCalldata: true, isContract: true, verified: true, approval: decodeApproval(permit2Approve) }).verdict === "CAUTION");
ok("calldata the gate did not decode, into a VERIFIED non-token contract → UNKNOWN, not PROCEED",
  measuredRiskVerdict({ ...base, movesValue: false, hasCalldata: true, isContract: true, verified: true }).verdict === "UNKNOWN");
const unread = measuredRiskVerdict({ ...base, isContract: null, hasCalldata: true });
ok("eth_getCode failed (isContract null) → UNKNOWN, never PROCEED", unread.verdict === "UNKNOWN" && /could not be read/.test(unread.reasons[0]), unread.reasons.join(" | "));
ok("…even for a plain value send", measuredRiskVerdict({ ...base, isContract: null }).verdict === "UNKNOWN");
ok("…but a no-op still moves nothing → PROCEED", measuredRiskVerdict({ ...base, isContract: null, movesValue: false }).verdict === "PROCEED");
const transfer = `0xa9059cbb${ADDR("d")}${"0".repeat(62)}64`;
const approveOf = (amtHex: string) => `0x095ea7b3${SPENDER}${amtHex.padStart(64, "0")}`;
const approve100 = approveOf("64");
const approveZero = approveOf("0");
const approve2e254 = approveOf((2n ** 254n).toString(16));
ok("isKnownTokenCall: ERC-20 transfer and a zero-amount approve (revoke) are read; a non-zero approve, an unlimited one and garbage are not",
  isKnownTokenCall(transfer) && isKnownTokenCall(approveZero) && !isKnownTokenCall(approve100) &&
  !isKnownTokenCall(`0x095ea7b3${SPENDER}${MAX}`) && !isKnownTokenCall(permit2Approve) && !isKnownTokenCall("0x"));
// Review r2 #2 — "bounded" used to mean < 2^255, and a bounded approve was a PROCEED shape.
ok("approve(drainer, 2^254) → unlimited (the line is 2^128 now, not 2^255)", decodeApproval(approve2e254) === "unlimited" && !isBoundedApproval(approve2e254));
ok("approve(spender, 2^127) → bounded, not unlimited",
  decodeApproval(approveOf((2n ** 127n).toString(16))) === null && isBoundedApproval(approveOf((2n ** 127n).toString(16))));
ok("isBoundedApproval: approve(100) yes; approve(0), a transfer, setApprovalForAll no",
  isBoundedApproval(approve100) && !isBoundedApproval(approveZero) && !isBoundedApproval(transfer) && !isBoundedApproval(`0xa22cb465${SPENDER}${"0".repeat(63)}1`));
const tokenSafe = { ...base, movesValue: false, hasCalldata: true, isContract: true, isToken: true, verified: true, honeypot: "SAFE" as const };
const factsFor = (d: string): RiskFacts => ({ ...tokenSafe, approval: decodeApproval(d), boundedApproval: isBoundedApproval(d), knownTokenCall: isKnownTokenCall(d) });
ok("approve(drainer, 2^254) on a token whose tax read SAFE → CAUTION, not PROCEED", measuredRiskVerdict(factsFor(approve2e254)).verdict === "CAUTION");
const bounded = measuredRiskVerdict(factsFor(approve100));
ok("approve(unassessed spender, 100) on that SAFE token → UNKNOWN, not PROCEED, and says why",
  bounded.verdict === "UNKNOWN" && /allowance/.test(bounded.reasons[0]), bounded.reasons.join(" | "));
ok("approve(spender, 0) — a revoke — on that SAFE token → PROCEED", measuredRiskVerdict(factsFor(approveZero)).verdict === "PROCEED");
ok("a bounded Permit2 approve into the verified Permit2 contract → UNKNOWN",
  measuredRiskVerdict({ ...base, movesValue: false, hasCalldata: true, isContract: true, verified: true,
    boundedApproval: isBoundedApproval(`0x87517c45${ADDR("a")}${ADDR("d")}${"0".repeat(62)}64${"0".repeat(64)}`) }).verdict === "UNKNOWN");
ok("a decoded transfer on a token whose tax measured SAFE → PROCEED",
  measuredRiskVerdict({ ...base, movesValue: false, hasCalldata: true, isContract: true, isToken: true, verified: true, knownTokenCall: true, honeypot: "SAFE" }).verdict === "PROCEED");
ok("an undecoded call on that same SAFE token → UNKNOWN",
  measuredRiskVerdict({ ...base, movesValue: false, hasCalldata: true, isContract: true, isToken: true, verified: true, knownTokenCall: false, honeypot: "SAFE" }).verdict === "UNKNOWN");
ok("calldata to an address with NO code executes nothing → PROCEED",
  measuredRiskVerdict({ ...base, hasCalldata: true }).verdict === "PROCEED");
ok("every verdict carries its measured reason", measuredRiskVerdict({ ...base, approval: "operator", hasCalldata: true }).reasons.length > 0);

console.log("\n3. contract-trust — measuredTrustVerdict");
ok("measured honeypot → RED_FLAG", measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: "HONEYPOT" }).verdict === "RED_FLAG");
ok("Basescan silent → UNKNOWN, not 'unverified'", measuredTrustVerdict({ basescanAvailable: false, verified: false, isProxy: false, honeypot: null }).verdict === "UNKNOWN");
ok("unverified source, nothing measured wrong → UNKNOWN", measuredTrustVerdict({ basescanAvailable: true, verified: false, isProxy: false, honeypot: null }).verdict === "UNKNOWN");
ok("unverified upgradeable proxy → CAUTION", measuredTrustVerdict({ basescanAvailable: true, verified: false, isProxy: true, honeypot: null }).verdict === "CAUTION");
ok("verified, no lever → SAFE", measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: "SAFE" }).verdict === "SAFE");
ok("verified token with a blacklist lever → CAUTION", measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: "SUSPICIOUS" }).verdict === "CAUTION");
// 2026-10-01 — verified source is not a read sell side.
const taxUnread = measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: "UNKNOWN" });
ok("verified token whose tax was NOT read → UNKNOWN, not SAFE", taxUnread.verdict === "UNKNOWN", taxUnread.reasons.join(" | "));
ok("verified NON-token contract (no tax to read) → SAFE", measuredTrustVerdict({ basescanAvailable: true, verified: true, isProxy: false, honeypot: null }).verdict === "SAFE");

console.log("\n4. quick-safety — quickVerdict");
ok("measured honeypot → DANGER", quickVerdict({ liquidityUsd: 1e6, basePairs: 3, verified: true, honeypot: "HONEYPOT" }).verdict === "DANGER");
ok("no Base pair → CAUTION", quickVerdict({ liquidityUsd: 0, basePairs: 0, verified: true, honeypot: "UNKNOWN" }).verdict === "CAUTION");
ok("thin liquidity → CAUTION", quickVerdict({ liquidityUsd: 2_000, basePairs: 1, verified: true, honeypot: "SAFE" }).verdict === "CAUTION");
ok("verified + real liquidity → SAFE", quickVerdict({ liquidityUsd: 500_000, basePairs: 4, verified: true, honeypot: "SAFE" }).verdict === "SAFE");
const qUnread = quickVerdict({ liquidityUsd: 500_000, basePairs: 4, verified: true, honeypot: "UNKNOWN" });
ok("verified + real liquidity but tax NOT read → UNKNOWN, not SAFE (2026-10-01)", qUnread.verdict === "UNKNOWN", qUnread.flags.join(" | "));
ok("DexScreener + Basescan silent → UNKNOWN (absence is not risk)",
  quickVerdict({ liquidityUsd: null, basePairs: null, verified: null, honeypot: "UNKNOWN" }).verdict === "UNKNOWN");
const silent = quickVerdict({ liquidityUsd: null, basePairs: null, verified: null, honeypot: "UNKNOWN" });
ok("…and no flag claims thin liquidity or no market from a null", !silent.flags.some((f) => /liquidity|no Base DEX/.test(f)), silent.flags.join(" | "));

const H = (f: string) => readFileSync(join(process.cwd(), "src/app/api/x402/_handlers", f), "utf8");
const H0 = H;

console.log("\n4b. Basescan source read — an Etherscan error is not an answer");
ok("rate-limit (HTTP 200, status 0, result is a STRING) → null, not its first character",
  parseEtherscanSource({ status: "0", message: "NOTOK", result: "Max calls per sec rate limit reached (5/sec)" }) === null);
ok("missing/invalid key → null", parseEtherscanSource({ status: "0", message: "NOTOK", result: "Missing/Invalid API Key" }) === null);
ok("garbage bodies → null", parseEtherscanSource(null) === null && parseEtherscanSource({ status: "1", result: ["x"] }) === null && parseEtherscanSource({ status: "1", result: [] }) === null);
const unv = parseEtherscanSource({ status: "1", message: "OK", result: [{ SourceCode: "", ABI: "Contract source code not verified", ContractName: "" }] });
ok("an UNVERIFIED contract is still an answer (row with empty SourceCode)", unv != null && unv.SourceCode === "");
const ver = parseEtherscanSource({ status: "1", message: "OK", result: [{ SourceCode: "contract FiatTokenProxy {}", ContractName: "FiatTokenProxy" }] });
ok("a verified contract → its row", ver != null && ver.ContractName === "FiatTokenProxy");

console.log("\n4c. getTokenIdentity — a failed code read is null, not an EOA");
const ONCHAIN = readFileSync(join(process.cwd(), "src/lib/onchain.ts"), "utf8").replace(/\/\/.*$/gm, "");
const idFn = ONCHAIN.slice(ONCHAIN.indexOf("export async function getTokenIdentity"), ONCHAIN.indexOf("export function scanSourceSignals"));
ok("getCode's failure is a null sentinel that returns null (viem maps an EOA's \"0x\" to undefined too)",
  idFn.length > 0 && /getCode\(\{ address \}\)\.catch\(\(\) => null\)/.test(idFn) && /if \(code === null\) return null;/.test(idFn) && !/getCode\([^)]*\)\.catch\(\(\) => undefined\)/.test(idFn));
ok("risk-gate does not fall back to Basescan for the target type",
  /const isContract: boolean \| null = identity \? identity\.isContract : null;/.test(H0("risk-gate.ts")));
// Review r2 #1 — the multicall is the second way a failed read became a negative.
ok("getTokenIdentity: a metadata multicall the contract did not ANSWER is a null identity, not isToken:false",
  /if \(!contractAnswered\(res\[1\], "symbol"\) \|\| !contractAnswered\(res\[2\], "decimals"\)\) return null;/.test(idFn) &&
  /\} catch \{ return null; \}/.test(idFn) && !/leave metadata null/.test(idFn));
ok("contract-trust reads the tax for a null identity (unread is not 'not a token')",
  /identity == null \|\| identity\.isToken \? measuredHoneypotVerdict/.test(H("contract-trust.ts")));

// contractAnswered against REAL viem multicall results, over a custom transport
// that plays the RPC — no network. The three shapes a getTokenIdentity read can
// come back in: the contract answered (data, revert, or empty return) or the
// transport failed, which with allowFailure:true is ALSO status "failure".
const ERC20 = parseAbi(["function symbol() view returns (string)", "function decimals() view returns (uint8)"]);
const AGG3 = parseAbi(["function aggregate3((address target, bool allowFailure, bytes callData)[] calls) payable returns ((bool success, bytes returnData)[] returnData)"]);
const TOKEN = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
const rpc = (onCall: () => unknown) => createPublicClient({
  chain: baseChain,
  transport: custom({ async request({ method }) { if (method === "eth_call") return onCall(); throw new Error(`unexpected ${method}`); } }, { retryCount: 0 }),
});
const agg3 = (entries: { success: boolean; returnData: `0x${string}` }[]) =>
  encodeFunctionResult({ abi: AGG3, functionName: "aggregate3", result: entries });
const readMeta = (c: ReturnType<typeof rpc>) => c.multicall({
  allowFailure: true,
  contracts: [
    { address: TOKEN, abi: ERC20, functionName: "symbol" },
    { address: TOKEN, abi: ERC20, functionName: "decimals" },
  ],
});
async function multicallCases() {
  const answered = await readMeta(rpc(() => agg3([
    { success: true, returnData: encodeFunctionResult({ abi: ERC20, functionName: "symbol", result: "USDC" }) },
    { success: true, returnData: encodeFunctionResult({ abi: ERC20, functionName: "decimals", result: 6 }) },
  ])));
  ok("a token that answered → both entries answered", contractAnswered(answered[0], "symbol") && contractAnswered(answered[1], "decimals"));
  const reverted = await readMeta(rpc(() => agg3([{ success: false, returnData: "0x" }, { success: false, returnData: "0x" }])));
  ok("a contract that REVERTED symbol()/decimals() → answered (a measured non-token)",
    reverted[0].status === "failure" && contractAnswered(reverted[0], "symbol") && contractAnswered(reverted[1], "decimals"));
  const empty = await readMeta(rpc(() => agg3([{ success: true, returnData: "0x" }, { success: true, returnData: "0x" }])));
  ok("a contract whose fallback returned NOTHING → answered (a measured non-token)",
    empty[0].status === "failure" && contractAnswered(empty[0], "symbol") && contractAnswered(empty[1], "decimals"));
  const down = await readMeta(rpc(() => { throw new Error("429 Too Many Requests"); }));
  ok("the RPC rate-limited the multicall → status failure on every entry, but NOT answered",
    down.every((e) => e.status === "failure") && !contractAnswered(down[0], "symbol") && !contractAnswered(down[1], "decimals"));
  ok("a missing entry is not an answer", !contractAnswered(undefined, "symbol"));
}

console.log("\n5. each handler's verdict comes from its measured function");

ok("honeypot-check: verdict = measured.verdict, no model boolean in it",
  /const verdict = measured\.verdict;/.test(H("honeypot-check.ts")) && !/Boolean\(blue\.is_honeypot\) \|\|/.test(H("honeypot-check.ts")));
ok("risk-gate: verdict = measured.verdict, no model risk_score in it",
  /const verdict = measured\.verdict;/.test(H("risk-gate.ts")) && !/riskScore > 70/.test(H("risk-gate.ts")));
ok("contract-trust: no 'final arbiter' model call left",
  !/final arbiter/i.test(H("contract-trust.ts").replace(/\/\/.*$/gm, "")) && /verdict: measured\.verdict/.test(H("contract-trust.ts")));
ok("quick-safety: no model call at all", !/callLLM/.test(H("quick-safety.ts").replace(/\/\/.*$/gm, "")));

console.log("\n6. contractAnswered — real viem multicall results, no network");
multicallCases().catch((e) => { ok("multicall cases ran", false, String(e)); }).finally(() => {
  console.log(`\nsafety-verdicts-test: ${passes}/${passes + failures} passed`);
  if (failures > 0) process.exit(1);
});
