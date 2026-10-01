/**
 * pinned-symbols-test — a bare symbol resolves only to an address this app
 * already pins on that chain (lib/wallet/pinned-symbols.ts), never by search.
 */
import { pinnedTokenFor } from "../src/lib/wallet/pinned-symbols";
import { BASE_MAJORS } from "../src/lib/wallet/token-trust";
import { findByTicker } from "../src/lib/robinhood/rwa-registry";

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failures++;
}
const baseUsdc = BASE_MAJORS.find((t) => t.sym === "USDC")!.addr;
ok("USDC on Base → the pinned Base USDC", pinnedTokenFor("base", "usdc") === baseUsdc);
ok("$WETH on Base → the Base predeploy", pinnedTokenFor("base", "$WETH") === BASE_MAJORS.find((t) => t.sym === "WETH")!.addr);
ok("USDG on Robinhood → the registry's stable row", pinnedTokenFor("robinhood", "USDG") === findByTicker("USDG")!.contract);
ok("USDC on Robinhood does not resolve (not pinned there)", pinnedTokenFor("robinhood", "USDC") === null);
ok("a stock ticker never resolves by name (AAPL on RH)", pinnedTokenFor("robinhood", "AAPL") === null);
ok("an arbitrary symbol on Base never resolves", pinnedTokenFor("base", "DEGEN") === null);
ok("ETH is left to its own native spelling", pinnedTokenFor("base", "ETH") === null);
console.log(failures === 0 ? "\npinned-symbols-test: PASS" : `\npinned-symbols-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
