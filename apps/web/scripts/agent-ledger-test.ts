// Agent record (BaseCity plan item 3): self-paid excluded, USDC verified from
// the receipt, Blocky badge only on tokenURI + card agreement.
import { encodeAbiParameters, pad } from "viem";
import { isBlockyCard, receiptPays, agentRecord, type LedgerEntry } from "../src/lib/agent-ledger";

let passed = 0, failed = 0;
const check = (name: string, ok: boolean) => { if (ok) passed++; else failed++; console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}`); };

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const T = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const A = (n: string) => `0x${n.repeat(40)}`;
const log = (token: string, from: string, to: string, v: bigint) => ({ address: token, topics: [T, pad(from as `0x${string}`), pad(to as `0x${string}`)], data: encodeAbiParameters([{ type: "uint256" }], [v]) });

(async () => {
  check("USDC payer → payTo ≥ price verifies", receiptPays([log(USDC, A("1"), A("2"), 500_000n)], A("1"), A("2"), 500_000));
  check("short amount does not verify", !receiptPays([log(USDC, A("1"), A("2"), 499_999n)], A("1"), A("2"), 500_000));
  check("wrong recipient does not verify", !receiptPays([log(USDC, A("1"), A("3"), 500_000n)], A("1"), A("2"), 500_000));
  check("other token does not verify", !receiptPays([log(A("9"), A("1"), A("2"), 500_000n)], A("1"), A("2"), 500_000));

  const card = { registrations: [{ agentId: 1205445 }] };
  const uri = "https://www.basecity.space/api/agent-card?blocky=718&agent=1205445";
  check("Blocky: BaseCity tokenURI + matching id", isBlockyCard(uri, card, "1205445"));
  check("not Blocky: id mismatch", !isBlockyCard(uri, card, "7"));
  check("not Blocky: other host serving the same card", !isBlockyCard("https://evil.example/api/agent-card?blocky=718", card, "1205445"));
  check("not Blocky: lookalike host", !isBlockyCard("https://basecity.space.evil.io/api/agent-card?x=1", card, "1205445"));

  const owner = A("a"), payTo = A("b");
  const e = (did: string, payer: string | null, tx: string | null = null): LedgerEntry => ({ jobId: "j" + did, did, title: "t", skill: "stock-nav-premium", ticker: "NVDA", at: `2026-11-1${did}T00:00:00Z`, priceUnits: 1_000_000, payTo, ...(payer ? { unlock: { tx, payer, at: "" } } : {}) });
  const r = await agentRecord([e("1", null), e("2", owner), e("3", payTo), e("4", A("c")), e("5", A("c")), e("6", A("d"))], [owner, payTo]);
  check("delivered counts every entry", r.delivered === 6);
  check("self-paid (owner or payTo) excluded from purchases", r.purchased === 3 && r.selfPaid === 2);
  check("unique payers counts other wallets once", r.uniquePayers === 2);
  check("no tx ⇒ not verified, no USDC claimed", r.verifiedUsd === 0 && r.unverified === 3);
  console.log(`\n${failed ? `${failed} of ${passed + failed} CHECK(S) FAILED` : `all ${passed} checks passed`}`);
  process.exit(failed ? 1 : 0);
})();
