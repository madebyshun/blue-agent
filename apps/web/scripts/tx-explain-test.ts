/**
 * tx-explain-test — lib/tx-explain.ts log decoding (readLogs,
 * foreignZeroTransfers, feeEth) and lib/telegram/check.ts parsing. Pure.
 */
import { feeEth, foreignZeroTransfers, readLogs, T_TRANSFER, T_WETH_DEPOSIT, type RawLog } from "../src/lib/tx-explain";
import { T_APPROVAL, T_APPROVAL_ALL, T_P2_APPROVAL, PERMIT2 } from "../src/lib/approval-audit";
import { chainWord, findAddress, findHash } from "../src/lib/telegram/check";

let failures = 0;
function ok(label: string, cond: boolean) { console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}`); if (!cond) failures++; }

const pad = (a: string) => "0x" + a.slice(2).toLowerCase().padStart(64, "0");
const num = (n: bigint) => "0x" + n.toString(16).padStart(64, "0");
const ME = "0x1111111111111111111111111111111111111111";
const YOU = "0x2222222222222222222222222222222222222222";
const SENDER = "0x3333333333333333333333333333333333333333";
const TOKEN = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const NFT = "0x4444444444444444444444444444444444444444";
const MAX = 2n ** 256n - 1n;

const logs: RawLog[] = [
  { address: TOKEN, topics: [T_TRANSFER, pad(ME), pad(YOU), null], data: num(5_000_000n) },                 // out 5 USDC
  { address: TOKEN, topics: [T_TRANSFER, pad(YOU), pad(ME)], data: num(1n) },                               // in
  { address: NFT, topics: [T_TRANSFER, pad(ME), pad(YOU), num(42n)], data: "0x" },                          // nft out
  { address: TOKEN, topics: [T_TRANSFER, pad(YOU), pad(SENDER)], data: num(7n) },                           // not mine
  { address: TOKEN, topics: [T_APPROVAL, pad(ME), pad(YOU)], data: num(MAX) },                              // unlimited grant
  { address: NFT, topics: [T_APPROVAL_ALL, pad(ME), pad(YOU)], data: num(1n) },                             // operator on
  { address: PERMIT2, topics: [T_P2_APPROVAL, pad(ME), pad(TOKEN), pad(YOU)], data: num(100n) + num(1_800_000_000n).slice(2) },
  { address: "0x4200000000000000000000000000000000000006", topics: [T_WETH_DEPOSIT, pad(ME)], data: num(10n ** 15n) },
];
const r = readLogs(logs, ME);
ok("ERC-20 out, ERC-20 in, NFT out and a WETH deposit are the viewer's moves", r.moves.length === 4);
ok("the NFT keeps its token id", r.moves.some((m) => m.kind === "nft" && m.tokenId === 42n));
ok("a padded null topic does not turn ERC-20 into NFT", r.moves.find((m) => m.raw === 5_000_000n)?.kind === "erc20");
ok("a WETH deposit is an incoming WETH movement", r.moves.some((m) => m.dir === "in" && m.raw === 10n ** 15n));
ok("a transfer between others is counted, not listed", r.others === 1);
ok("three grants: erc20, operator, permit2", r.grants.map((g) => g.kind).join(",") === "erc20,operator,permit2");
ok("Permit2 amount and expiration decoded", r.grants[2].raw === 100n && r.grants[2].expiration === 1_800_000_000n);
ok("another owner's grant is not the viewer's", readLogs(logs, YOU).grants.length === 0);

const poison: RawLog[] = [
  { address: TOKEN, topics: [T_TRANSFER, pad(ME), pad(YOU)], data: "0x" },
  { address: TOKEN, topics: [T_TRANSFER, pad(YOU), pad(ME)], data: num(0n) },
  { address: TOKEN, topics: [T_TRANSFER, pad(SENDER), pad(YOU)], data: num(0n) },   // the sender's own: not foreign
  { address: TOKEN, topics: [T_TRANSFER, pad(ME), pad(YOU)], data: num(3n) },        // non-zero: not poisoning
];
const z = foreignZeroTransfers(poison, SENDER);
ok("zero-value transfers out of wallets the sender is not: 2 victims", z.victims === 2 && z.tokens.length === 1);

ok("fee 2.79e-7 is written out", feeEth("0.000000279") === "0.000000279");
ok("fee 0.0123456 keeps three significant digits", feeEth("0.0123456") === "0.0123");

ok("findAddress reads the command first", findAddress("0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9 rh") === "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9");
ok("findAddress falls back to the replied message", findAddress("", "look 0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b!") === "0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b");
ok("a tx hash is not an address", findAddress("0x79b250fc255ad86563229104a124f30fbfe35a0199a82352e0711c0b6ecb14fa") === null);
ok("findHash finds a hash", findHash("tx 0x79b250fc255ad86563229104a124f30fbfe35a0199a82352e0711c0b6ecb14fa") !== null);
ok("chain words", chainWord("0x… rh") === "robinhood" && chainWord("on base") === "base" && chainWord("0x…") === null);

console.log(failures === 0 ? "\ntx-explain-test: PASS" : `\ntx-explain-test: FAIL — ${failures}`);
process.exit(failures === 0 ? 0 : 1);
