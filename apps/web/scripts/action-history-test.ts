/**
 * action-history-test — G3 (2026-09-30): the wallet's own actions, shown in
 * Wallet → Activity and on /app/usage.
 *
 *   §1  a row says what the record holds — never a symbol without its
 *       contract, every chain named with its id
 *   §2  the view is private: no read without a session for this wallet, and
 *       "could not read" is never drawn as "no actions" (source)
 */
import fs from "node:fs";
import path from "node:path";
import { actionSummary, tokenText } from "../src/lib/action-summary";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const AAPL_RH = "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9";
const BOB = "0xb0b0000000000000000000000000000000000002";

console.log("\n1. a row says what the record holds");
ok("native ETH is ETH, however it was spelled", tokenText("ETH", null) === "ETH" && tokenText("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", "WETH") === "ETH");
let t = tokenText(USDC, "USDC");
ok("a symbol always travels with its contract", t.startsWith("USDC (") && t.includes("0x8335") && t.includes("2913"), t);
t = tokenText(USDC, "");
ok("no symbol → the contract alone, never a guessed name", t === "0x8335…2913", t);

let s = actionSummary({ kind: "send", params: { token: USDC, symbol: "USDC", amount: "5", to: BOB } });
ok("send: amount, token with contract, recipient", s === "5 USDC (0x8335…2913) → 0xb0b0…0002", s);
s = actionSummary({ kind: "bridge", params: { fromChain: "base", toChain: "robinhood", token: "ETH", amount: "0.01", symbol: "ETH" } });
ok("bridge: both chains named with their ids", s === "0.01 ETH · Base 8453 → Robinhood 4663", s);
s = actionSummary({ kind: "swap", params: { tokenIn: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", tokenOut: USDC, amountIn: "0.1", symIn: "ETH", symOut: "USDC" } });
ok("Base swap (0x card): in → out", s === "0.1 ETH → USDC (0x8335…2913)", s);
s = actionSummary({ kind: "swap", params: { direction: "sell", token: AAPL_RH, amount: "2", symIn: "AAPL", symOut: "ETH" } });
ok("RH sell (direction + token): token → ETH", s === "2 AAPL (0xaF3D…93f9) → ETH", s);
s = actionSummary({ kind: "swap", params: { direction: "buy", token: AAPL_RH, amount: "0.01", symIn: "ETH", symOut: "AAPL" } });
ok("RH buy: ETH → token", s === "0.01 ETH → AAPL (0xaF3D…93f9)", s);
s = actionSummary({ kind: "swap", params: { tokenIn: USDC, tokenOut: "ETH", amountIn: "10" } });
ok("an agent's (MCP) swap has no symbols → contracts only", s === "10 0x8335…2913 → ETH", s);

console.log("\n2. the view is private, and failure is not emptiness (source)");
const web = path.resolve(__dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(web, p), "utf8");
const view = read("src/components/wallet/ActionHistory.tsx");
const hs = view.indexOf("await hasSession(address)");
const fe = view.search(/\b(?:fetch|sessionFetch)\(`\/api\/actions/); // sessionFetch since the mini-app header session
ok("no read of /api/actions before a session for THIS wallet is confirmed", hs > 0 && fe > hs);
ok("signed out → the one-signature offer, not an empty list", /s: "signed-out"/.test(view) && /Sign in to see them/.test(view));
ok("a failed read renders as an error with Retry, distinct from \"No actions yet\"",
  /load\.s === "error"/.test(view) && /Retry/.test(view) && /No actions yet/.test(view));
ok("a 401 mid-session falls back to signed-out", /r\.status === 401\) \{ setLoad\(\{ s: "signed-out" \}\)/.test(view));
ok("the tx link goes to the record's OWN chain's explorer", /WALLET_CHAINS\[r\.chain\]/.test(view) && /\$\{cfg\.explorer\}\/tx\/\$\{r\.tx_hash\}/.test(view));
ok("the summary comes from the shared pure helper", /from "@\/lib\/action-summary"/.test(view));
ok("Wallet → Activity mounts it", /<ActionHistory address=\{acct\}/.test(read("src/app/app/bank/BankClient.tsx")));
ok("/app/usage mounts it", /<ActionHistory address=\{address\}/.test(read("src/app/app/usage/page.tsx")));

console.log(failures === 0 ? "\naction-history-test: PASS" : `\naction-history-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
