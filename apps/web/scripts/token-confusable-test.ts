/**
 * token-confusable-test — normalizeSymbol folds look-alike letters, so the
 * live fake-USDC tokens seen on Base (2026-10-13) classify as impostors.
 */
import { classifyToken, normalizeSymbol } from "../src/lib/wallet/token-trust";

let failures = 0;
function ok(label: string, cond: boolean) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; }
const FAKE = "0xeb37c874ff1fbbe442f017e91db2136c13c643d4";
for (const s of ["ÚSDС", "U឵S឵Dꓚ", "ꓴ឵ՏᎠ឵Ꮳ", "ＵＳＤＣ", "USDC"]) {
  ok(`"${s}" at another address is an impostor of USDC`, normalizeSymbol(s) === "USDC" && classifyToken({ symbol: s, address: FAKE }, "base") === "impostor");
}
ok("the real USDC stays verified", classifyToken({ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }, "base") === "verified");
ok("ETH2 stays its own symbol", normalizeSymbol("ETH2") === "ETH2");
ok("an unrelated long-tail symbol stays unverified", classifyToken({ symbol: "DEGEN", address: FAKE }, "base") === "unverified");
console.log(failures === 0 ? "\ntoken-confusable-test: PASS" : `\ntoken-confusable-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
