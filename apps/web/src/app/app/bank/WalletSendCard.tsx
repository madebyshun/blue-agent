"use client";

// Unified Send — one non-custodial transfer card spanning TWO chains, with the
// network chosen INSIDE the card instead of by a wallet-wide switcher.
//
// Why this supersedes the old `network === "robinhood" ? <RhSendCard> :
// <SendCard>` split in BankClient: those were two cards behind a top switcher,
// and the switcher is going away (the wallet is moving to showing both chains at
// once). Send therefore has to carry its OWN chain, and it has to do so without
// the trap the split existed to avoid — the Base `SendCard` types its network as
// `YieldNetwork` (base | baseSepolia) and renders a Base Sepolia form when handed
// "robinhood", i.e. the wrong funds on the wrong chain. See the `can.send` note
// in lib/wallet/chains.ts.
//
// This card does not reinterpret either money path. It ports both VERBATIM from
// the two proven cards:
//   • Base       → user signs a plain ERC-20 `transfer` (cash) or a native send,
//                  exactly SendCard's path — including its EIP-5792 branch (see
//                  "Why chat mounts this card" below).
//   • Robinhood  → POST /api/robinhood/router/send-prepare (server builds
//                  calldata; user signs from their own wallet), exactly
//                  RhSendCard. No keys server-side, no funds touched.
//
// ─── Why chat mounts this card (#256/#257, 2026-09-12) ───────────────────────
//
// Chat had its OWN send card. Two cards meant two answers to the same question,
// and they had drifted into contradicting each other on the one field that
// decides whose money moves: chat defaulted `network` to Base SEPOLIA while this
// card defaulted to Base MAINNET. A user who typed "send 5 USDC to alice.base"
// got a testnet form; the same instruction typed into the wallet got a mainnet
// one. That is not a styling gap, it is two different chains under one verb.
//
// So chat now renders THIS file and its own card is going away. The rule is the
// one CardShell.tsx and `pinnedAssets` already enforce one layer down: writing
// the money path twice is how the copies drift.
//
// Being the only card means it has to carry everything the chat card carried,
// or deleting that card would silently remove a capability:
//   • EIP-5792 — routes 5792-capable wallets through `wallet_sendCalls` to
//     attach the ERC-8021 builder-code `dataSuffix` (attribution on base.dev)
//     and, when the wallet exposes a paymaster, sponsor the gas. `optional:true`
//     means a wallet that ignores it still sends. BASE ONLY, and gated on the
//     capability being present FOR THIS chainId — 4663 has no paymaster and its
//     sends are server-prepared calldata, so offering a batch there would be a
//     promise nothing fulfils.
//   • transferWithMemo — when the armed token IS the configured B20 settlement
//     token, a memo rides along on-chain (order id / payment ref). Keyed off the
//     ARMED ADDRESS, not off a ticker, so it can never attach to a look-alike.
//   • Quantity words — the LLM passes "all" / "max" / "half" / "50%" through
//     verbatim, so `initialAmount` accepts them and resolves against the live
//     balance in BASE UNITS (see `applyWord`). A card that only accepted digits
//     would land those as NaN and disable its own button.
//
// What it does NOT carry, deliberately: arming a token by TICKER. An LLM string
// like "cbBTC" is not an identity — `initialAsset` arms only an ADDRESS or a
// chain pin (native gas / that chain's cash), and anything else is surfaced as a
// note asking the user to pick it. Ticker-as-identity is exactly how an impostor
// gets in (#145, #280).
//
// Every spend goes through the SAME fail-closed gate as every other surface
// (useSpendableBalance + resolveSpend): a balance that is merely UNREAD refuses
// to sign, it does not read as zero. Decimals are read on-chain, never assumed —
// USDG is 6, native is 18, and a guessed exponent is the exact bug the shared
// hook was written to kill.
//
// Scope note, SUPERSEDED 2026-09-11: the Token selector used to offer exactly
// two options — the chain's cash and its native ETH — as a pair of segmented
// buttons. That shape was the seam this file's own note pointed at, and it is
// now open: the picker lists whatever the address actually HOLDS on the selected
// chain (same read as the portfolio table, see useSendableAssets.ts) and accepts
// a pasted contract address for anything the read missed. The fail-closed gate
// needed no change to cover them — decimals were always read on-chain, per
// token, which is exactly why arbitrary tokens were safe to admit.

import { useEffect, useState } from "react";
import {
  useAccount, useSwitchChain, useSendTransaction, useWaitForTransactionReceipt, useReadContract,
  useCapabilities, useSendCalls, useCallsStatus,
} from "wagmi";
import { isAddress, getAddress, parseUnits, formatUnits, namehash, encodeFunctionData } from "viem";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
import { ERC20_ABI } from "@/lib/yield-execution";
import { DATA_SUFFIX } from "@/constants/builderCode";
import { B20_ENABLED, B20_USDC } from "@/lib/orders";
import { encodeTransferWithMemo, isValidMemo, MEMO_MAX_CHARS } from "@/lib/b20/encode";
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { resolveSpend } from "@/lib/wallet/read-state";
// A chat marker passes the user's own word through verbatim ("send ALL my USDG"),
// because the model has no balance and any number it produced would be invented.
// Resolution happens HERE, against the balance this card already reads — and via
// the same basis-points path as the 25/50/Max buttons, so a word and a button
// that mean the same thing can never produce two different figures.
import { wordToBps } from "@/lib/wallet/amount";
import { UnverifiedBalance } from "@/components/wallet/UnverifiedBalance";
import { Picker, PickerRow } from "@/components/wallet/Picker";
import {
  WalletCard, Field, NetworkPicker, ConfirmButton, CardNote,
} from "@/components/wallet/CardShell";
import {
  pinnedAssets, useSendableAssets, type SendableAsset,
} from "@/lib/wallet/useSendableAssets";
import { classifyToken, TRUST_BADGE } from "@/lib/wallet/token-trust";

type SendNet = "base" | "robinhood";

// `symbol()` is OPTIONAL in ERC-20 and absent from this repo's shared
// `ERC20_ABI`, so a pasted token gets its own one-function ABI. A revert here is
// not an error state — it means the token has no symbol, and the card renders
// the address rather than inventing a ticker for it.
const SYMBOL_ABI = [
  { name: "symbol", type: "function", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const BASE = WALLET_CHAINS.base;
const RH = WALLET_CHAINS.robinhood;

// Forward Basename resolution, read straight off the verified Base L2 Resolver
// (OnchainKit's forward lookup returned "not found" for live names). Copied from
// the chat SendCard so this card holds no import into a 2,600-line chat file.
// Basenames are a BASE concept; they are only offered when network === "base".
const BASENAME_L2_RESOLVER = "0xC6d566A56A1aFf6508b41f6c90ff131615583BCD" as const;
const RESOLVER_ADDR_ABI = [
  { name: "addr", type: "function", stateMutability: "view",
    inputs: [{ name: "node", type: "bytes32" }], outputs: [{ type: "address" }] },
] as const;
const ZERO_ADDR = "0x0000000000000000000000000000000000000000";
function basenameToEns(input: string): string | null {
  const n = input.trim().toLowerCase();
  if (!n) return null;
  if (n.endsWith(".base")) return `${n}.eth`;
  if (n.endsWith(".base.eth") || n.endsWith(".eth")) return n;
  return null;
}
function safeNamehash(name: string | null): `0x${string}` | undefined {
  if (!name) return undefined;
  try { return namehash(name); } catch { return undefined; }
}

const truncAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 6 });

// Row balances, compacted the SAME way the portfolio table compacts them
// (TokenTable.fmtAmount) — a picker row and the table row it came from must not
// disagree about the number they are both showing. Unparseable input is returned
// untouched rather than coerced: a string this can't read is still what the
// holdings endpoint said, and "NaN" would be a figure the wallet invented.
function fmtAmt(s: string): string {
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return Math.round(n).toLocaleString("en-US");
  return s;
}

// The send-prepare shape (mirrors RhSendCard / the chat card's PrepareResponse).
type PrepareResponse = {
  ok?: boolean;
  error?: string;
  tx?: { to: `0x${string}`; data: `0x${string}`; value: string; chainId: number };
};

// The chains this card will sign on. Base + Robinhood only — Base Sepolia is
// deliberately absent from a real-money send card, which is why the list is
// written here rather than taken from `WALLET_CHAIN_ORDER`: what a card is
// willing to spend on is the card's own rule, not a display order.
const NETWORKS: readonly SendNet[] = ["base", "robinhood"];

// ── What a caller is allowed to pre-arm ──────────────────────────────────────
//
// `initialAsset` is a free string because two callers speak two vocabularies:
// the wallet's scan-to-pay prefill says "cash" / "native", and a chat marker says
// "USDC" / "ETH" / "B20" or a raw 0x address. Both are honoured, but only through
// things that are actually IDENTITIES:
//
//   • a 0x address                → that token, checksummed, classified on arrival
//   • "native" | "eth"            → the chain's gas token, which HAS no address
//   • "cash" | the chain's stable → that chain's configured stable, from config
//   • "b20"                       → the configured B20 settlement token (Base only)
//
// Any other ticker is NOT armed. It comes back as `unmatched` and the card says
// so out loud, because arming "cbBTC" by name means arming whichever address
// happens to wear that string — the impostor's whole method (#145, #280).
type SeededAsset = { asset: SendableAsset; unmatched?: string };

/** B20 is only real when it's switched on AND a verified address is configured;
 *  `B20_USDC` is the empty string until one is. */
const b20Configured = () => B20_ENABLED && isAddress(B20_USDC);

function b20Asset(): SendableAsset {
  const a = getAddress(B20_USDC) as `0x${string}`;
  return {
    address: a, symbol: "B20", name: "B20 settlement token", pinned: true,
    trust: classifyToken({ symbol: "B20", address: a }, "base"),
  };
}

function seedAsset(net: SendNet, want?: string): SeededAsset {
  const pins = pinnedAssets(net);            // [0] native gas, [1] chain cash
  const s = String(want ?? "cash").trim();
  if (!s) return { asset: pins[1] };
  if (isAddress(s)) {
    const addr = getAddress(s) as `0x${string}`;
    const hit = pins.find(p => p.address?.toLowerCase() === addr.toLowerCase());
    // Symbol left EMPTY on purpose when it isn't a pin — the card reads it
    // on-chain, exactly as it does for a pasted address, rather than trusting a
    // ticker that arrived beside the address.
    return { asset: hit ?? { address: addr, symbol: "", trust: classifyToken({ symbol: "", address: addr }, net) } };
  }
  const k = s.toLowerCase();
  if (k === "native" || k === "eth") return { asset: pins[0] };
  if (k === "cash" || k === WALLET_CHAINS[net].stableSymbol.toLowerCase()) return { asset: pins[1] };
  if (k === "b20") {
    return net === "base" && b20Configured() ? { asset: b20Asset() } : { asset: pins[1], unmatched: s };
  }
  return { asset: pins[1], unmatched: s };
}

// ── Quantity words ───────────────────────────────────────────────────────────
export default function WalletSendCard({
  account, initialNetwork = "base", initialTo, initialAmount, initialAsset = "cash",
}: {
  account?: `0x${string}`;
  initialNetwork?: SendNet;
  initialTo?: string;
  /** A number, or one of the quantity WORDS above — resolved once the balance lands. */
  initialAmount?: string | number;
  /** "cash" | "native" | "eth" | the chain's stable symbol | "b20" | a 0x address. */
  initialAsset?: string;
}) {
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { sendTransactionAsync } = useSendTransaction();

  const [network, setNetwork] = useState<SendNet>(initialNetwork);
  // The ARMED asset — one object, not a `"cash" | "native"` enum. The enum was
  // the token list: it could only ever name two things, so widening the picker
  // had to start by deleting it. Seeded from the same `pinnedAssets` the hook
  // uses, so the initial value and the list's first two rows are one definition.
  //
  // Seeded in `useState`'s initializer rather than a `useMemo`, so a parent
  // re-render mid-send can never re-arm the card under the user.
  const [seeded] = useState<SeededAsset>(() => seedAsset(initialNetwork, initialAsset));
  const [asset, setAsset] = useState<SendableAsset>(seeded.asset);
  /** A ticker the caller asked for that this card refused to resolve by name. */
  const [assetHint, setAssetHint] = useState<string>(seeded.unmatched ?? "");
  const [recipient, setRecipient] = useState<string>(initialTo ?? "");
  // A word can't live in the number input — `parseFloat("max")` is NaN, which
  // would disable the button forever. It waits in `pendingWord` until the
  // balance it refers to has actually been read.
  const [amount, setAmount] = useState<string>(() => {
    const raw = initialAmount != null ? String(initialAmount) : "";
    return wordToBps(raw) == null ? raw : "";
  });
  const [pendingWord, setPendingWord] = useState<string>(() => {
    const raw = initialAmount != null ? String(initialAmount).trim() : "";
    return wordToBps(raw) != null ? raw.toLowerCase() : "";
  });
  const [memo, setMemo] = useState("");
  const [step, setStep] = useState<
    "idle" | "preparing" | "switching" | "signing" | "broadcasting" | "done" | "error"
  >("idle");
  const [err, setErr] = useState("");
  const [txHash, setTxHash] = useState<`0x${string}` | "">("");

  const cfg = WALLET_CHAINS[network];
  const chainId = cfg.chainId;
  const isNative = asset.address === null;
  // What the card CALLS the armed asset. A pasted token whose `symbol()`
  // reverted keeps `symbol: ""`, and this falls through to its address —
  // never to a placeholder ticker, which on a send screen would be a label
  // claiming an identity nothing read.
  const symbol = asset.symbol || truncAddr(asset.address ?? "");

  // ── EIP-5792 ───────────────────────────────────────────────────────────────
  // Routes 5792-capable wallets through `wallet_sendCalls`, which is the only
  // transport that can carry the ERC-8021 builder-code suffix and a paymaster.
  // BASE ONLY: a Robinhood send is server-prepared calldata on a chain with no
  // paymaster, so a batch there would advertise something nothing serves.
  const { sendCallsAsync } = useSendCalls();
  const { data: walletCapabilities } = useCapabilities({ account, query: { enabled: !!account } });
  const [callsId, setCallsId] = useState<string>("");
  const sendCallsReady = network === "base" && !!walletCapabilities;
  // Gas can only be sponsored when the wallet says so FOR THIS chain. Anything
  // less specific would put a "⚡ gasless" badge on a send the user pays for.
  const gaslessSupported = sendCallsReady && Boolean(
    (walletCapabilities as Record<number, { paymasterService?: { supported?: boolean } }> | undefined)
      ?.[chainId]?.paymasterService?.supported,
  );

  // ── B20 memo ───────────────────────────────────────────────────────────────
  // A memo is a property of ONE token — the configured B20 settlement token,
  // which implements `transferWithMemo`. Keyed off the ARMED ADDRESS, never off
  // the symbol: a look-alike calling itself B20 has no such function, and
  // offering the field for it would build calldata that reverts.
  const b20Row = b20Configured() && network === "base" ? b20Asset() : null;
  const memoAsset = !!b20Row && asset.address != null
    && asset.address.toLowerCase() === B20_USDC.toLowerCase();
  const memoTooLong = memoAsset && memo.trim().length > MEMO_MAX_CHARS;

  // Everything the address holds on THIS chain, from the same endpoint the
  // portfolio table reads. Re-fetched on every chain change by the hook.
  const list = useSendableAssets(account, network);
  // …plus B20 when it's configured, so the token can be reached by picking it
  // and not only by a caller pre-arming it. Card-local rather than added to the
  // shared `pinnedAssets`: "this chain's cash" is a chain fact, "we accept memo
  // payments in this token" is a fact about this card, and the portfolio table
  // must not grow a row for a token the user may not hold.
  const rows = b20Row && !list.assets.some(a => a.address?.toLowerCase() === B20_USDC.toLowerCase())
    ? [...list.assets, b20Row]
    : list.assets;

  // Balance of the sending asset WITH its on-chain scale, through the one hook —
  // so "still reading" and "could not read" stay distinct and the gate fails
  // closed. Re-reads when the network or asset changes.
  //
  // NOTE the token argument: `asset.address`, the ARMED asset, not the chain's
  // cash. The gate below is only fail-closed if it is reading the token that is
  // about to move; pointing it at USDC while the user sends cbBTC would be a
  // gate that passes on the wrong balance.
  const bal = useSpendableBalance({
    holder: account, native: isNative, token: asset.address ?? undefined, chainId,
  });
  const balance = bal.balance;

  // A pasted token arrives as an address and nothing else. Its ticker is READ
  // here, on the chain the send will run on, and only then classified — so an
  // address wearing "USDC" at something other than Base USDC is labelled an
  // impostor by the same function the portfolio table uses (#145). Until the
  // read lands the card shows the address, which is the one thing it knows.
  const needsSymbol = asset.address !== null && asset.symbol === "";
  const { data: symbolRaw } = useReadContract({
    address: asset.address ?? undefined, abi: SYMBOL_ABI, functionName: "symbol",
    chainId, query: { enabled: needsSymbol },
  });
  useEffect(() => {
    if (typeof symbolRaw !== "string" || !symbolRaw) return;
    setAsset(a => {
      if (a.address === null || a.symbol !== "") return a;
      return { ...a, symbol: symbolRaw, trust: classifyToken({ symbol: symbolRaw, address: a.address }, network) };
    });
  }, [symbolRaw, network]);

  const badge = TRUST_BADGE[asset.trust];

  // ── The asset panel's one input ──────────────────────────────────────────────
  // It is both the filter and the paste field. Which one it is right now is
  // decided by `isAddress`, not by a mode the user has to pick: a 0x40-hex string
  // is never a symbol search, and a symbol search is never an address.
  const [query, setQuery] = useState("");
  const q = query.trim();
  // Checksummed the moment it parses. Every downstream comparison lowercases, so
  // this is for DISPLAY and for the value handed to the transfer — the one form
  // a user can check against an explorer character by character.
  const pastedAddr = isAddress(q) ? (getAddress(q) as `0x${string}`) : null;

  // Is this address already a row? Compared as an address, lowercased — never by
  // symbol. Prevents offering "Use 0x833…913" directly above the USDC row that
  // IS 0x833…913, two rows that would arm the same token while looking like a
  // choice between two things.
  const listed = (a: string) =>
    rows.some(x => x.address !== null && x.address.toLowerCase() === a.toLowerCase());

  // A pasted address, armed with only what is actually established about it: the
  // address. The symbol is left EMPTY for the on-chain read above to fill — not
  // guessed from the query string, and not defaulted to a ticker. `trust` is
  // classified by ADDRESS here (that alone can prove "verified" — it is the
  // identity); the symbol read re-classifies it, which is the only way a paste
  // can come back "impostor".
  const pasteAsset = (a: `0x${string}`): SendableAsset => ({
    address: a, symbol: "", trust: classifyToken({ symbol: "", address: a }, network),
  });

  // Filter on symbol AND name, because an impostor's tell is usually its name.
  // When the query IS an address the list is left whole — the paste row above it
  // is the answer, and silently emptying the list would read as "you don't hold
  // this" when nothing checked.
  const ql = q.toLowerCase();
  const shown = q && !pastedAddr
    ? rows.filter(a =>
        a.symbol.toLowerCase().includes(ql) || (a.name ?? "").toLowerCase().includes(ql))
    : rows;

  // Recipient. Base accepts a 0x address OR a Basename (name.base / name.eth);
  // Robinhood accepts a 0x address only (Basenames are a Base concept — resolving
  // one for a 4663 send would introduce a cross-chain dependency this card avoids).
  const recip = recipient.trim();
  const recipIsAddr = isAddress(recip);
  const namesAllowed = network === "base";
  const recipIsName = namesAllowed && /\.(base|eth)$/i.test(recip);
  const node = recipIsName ? safeNamehash(basenameToEns(recip)) : undefined;
  const { data: resolvedRaw, isLoading: resolving } = useReadContract({
    address: BASENAME_L2_RESOLVER, abi: RESOLVER_ADDR_ABI, functionName: "addr",
    args: node ? [node] : undefined, chainId: BASE.chainId,
    query: { enabled: !!node },
  });
  const resolvedAddr = resolvedRaw && resolvedRaw !== ZERO_ADDR ? (resolvedRaw as `0x${string}`) : undefined;
  const toAddress = (recipIsAddr ? recip : (recipIsName ? resolvedAddr : undefined)) as `0x${string}` | undefined;

  const amt = parseFloat(amount);

  // FAIL-CLOSED. `over` alone is false on an unread balance; resolveSpend supplies
  // the half that refuses to sign when the balance is merely unknown.
  const gate = resolveSpend({
    loading: bal.loading, received: bal.received, failed: bal.failed,
    over: balance != null && amt > balance,
  });
  const overBalance = gate === "insufficient";
  const valid = !!toAddress && amt > 0 && gate === "ok" && bal.decimals != null && !memoTooLong;
  const busy = step === "preparing" || step === "switching" || step === "signing" || step === "broadcasting";

  // 25 / 50 / 100% presets computed in BASE UNITS (raw * bps / 10000n) so the
  // string handed to parseUnits can never carry more decimals than the token has,
  // and "send 100%" can never round a hair over the real balance. Native leaves a
  // small gas reserve at 100% only.
  function setPct(bps: number) {
    if (bal.raw == null || bal.decimals == null) return;
    let part = (bal.raw * BigInt(bps)) / 10000n;
    if (isNative && bps === 10000) {
      const reserve = parseUnits("0.00005", bal.decimals);
      part = part > reserve ? part - reserve : 0n;
    }
    setAmount(formatUnits(part, bal.decimals));
  }

  // A pending quantity word resolves the MOMENT its balance lands — through
  // `setPct`, so "all" and the Max button are one calculation. Cleared whether
  // or not it produced a figure: a zero balance leaves an empty amount rather
  // than a word that retries forever.
  useEffect(() => {
    if (!pendingWord || bal.raw == null || bal.decimals == null) return;
    const bps = wordToBps(pendingWord);
    if (bps != null) setPct(bps);
    setPendingWord("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWord, bal.raw, bal.decimals]);

  // Watch the tx on the selected chain until it mines.
  const { isSuccess: mined, isError: minedErr } = useWaitForTransactionReceipt({
    hash: txHash || undefined, chainId, query: { enabled: !!txHash },
  });
  useEffect(() => {
    if (mined && step === "broadcasting") setStep("done");
    if (minedErr && step === "broadcasting") { setStep("error"); setErr("Transaction reverted on-chain."); }
  }, [mined, minedErr, step]);

  // An EIP-5792 batch returns an id, not a tx hash. Poll it until the bundle
  // lands, then surface the real on-chain hash so the success view links to the
  // same explorer page every other path does.
  const { data: callsStatus } = useCallsStatus({
    id: callsId,
    query: {
      enabled: !!callsId,
      refetchInterval: ({ state }) => (state.data?.status === "success" ? false : 1500),
    },
  });
  useEffect(() => {
    if (callsStatus?.status !== "success") return;
    const h = callsStatus.receipts?.[0]?.transactionHash;
    if (h) { setTxHash(h); setStep("done"); }
  }, [callsStatus]);

  // Changing chain RESETS the asset to that chain's cash. It must: the armed
  // asset is a contract address on the chain it came from, and Base USDC does
  // not exist on 4663. Carrying it across would point the balance read, the
  // decimals read and the transfer itself at an address with no code — the
  // cross-chain mistake this wallet's rules exist to prevent, from inside one
  // card.
  function pickNetwork(n: SendNet) {
    if (n === network) return;
    setNetwork(n); setAsset(pinnedAssets(n)[1]); setAmount(""); setErr(""); setTxHash(""); setCallsId("");
    // A pending word named a balance on the OLD chain, and the hint named a
    // ticker the caller wanted there. Neither survives the chain it referred to.
    setPendingWord(""); setAssetHint(""); setMemo("");
    if (step !== "idle") setStep("idle");
  }
  // The amount clears with the asset, always. 12 of a 6-decimal dollar and 12 of
  // an 8-decimal BTC are not the same instruction, and a figure left over from
  // the previous token reads as one the user chose for this one. The memo goes
  // with it — it is a B20 field, and the user has just armed something else.
  function pickAsset(a: SendableAsset) {
    setAsset(a); setAmount(""); setErr(""); setPendingWord(""); setAssetHint(""); setMemo("");
  }

  // The Base call, as { to, data?, value? }. ONE builder for both transports —
  // the 5792 batch and the legacy fallback below encode from this, so they can
  // never sign different transactions (a memo applied in one and not the other
  // is exactly the drift this file exists to stop). The scale is passed IN,
  // read off the token, so the quantity signed and the balance it was gated
  // against are always at the same exponent.
  function buildBaseCall(to: `0x${string}`, dec: number): { to: `0x${string}`; data?: `0x${string}`; value?: bigint } {
    if (isNative) return { to, value: parseUnits(amount, dec) };
    // Non-null by `isNative` — the nullable spelling is what makes that provable.
    const token = asset.address as `0x${string}`;
    const data = memoAsset && isValidMemo(memo)
      ? encodeTransferWithMemo({ to, amount, decimals: dec, memo: memo.trim() })
      : encodeFunctionData({ abi: ERC20_ABI, functionName: "transfer", args: [to, parseUnits(amount, dec)] });
    return { to: token, data };
  }

  async function send() {
    if (!account) { setErr("Connect your wallet"); setStep("error"); return; }
    if (!toAddress) {
      setErr(recipIsName ? "Couldn't resolve that name" : "Enter a valid 0x address"); setStep("error"); return;
    }
    if (!(amt > 0)) { setErr("Enter an amount"); setStep("error"); return; }
    // `valid` guards the CLICK; this guards the SIGNATURE. Same gate on purpose —
    // a stale render or keyboard submit must not reach a wallet prompt on an
    // unread or insufficient balance.
    if (gate !== "ok" || bal.decimals == null) {
      setErr(gate === "insufficient" ? `Amount exceeds your ${symbol} balance`
        : gate === "reading" ? "Still reading your balance — one moment"
        : "Couldn't read your balance — refusing to sign a transfer that may not settle");
      setStep("error"); return;
    }
    const dec = bal.decimals;
    setErr(""); setTxHash(""); setCallsId("");
    try {
      if (network === "robinhood") {
        // Server builds the calldata; the user signs. Identical to RhSendCard.
        setStep("preparing");
        const r = await fetch("/api/robinhood/router/send-prepare", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromAddress: account, toAddress, token: isNative ? "ETH" : asset.address, amount: String(amount),
          }),
        });
        const j = (await r.json()) as PrepareResponse;
        if (!r.ok || !j.ok || !j.tx) throw new Error(j.error || `Prepare failed (${r.status})`);
        setStep("switching");
        try { await switchChainAsync({ chainId }); }
        catch { throw new Error("Switch to Robinhood Chain (4663) and try again"); }
        setStep("signing");
        const hash = await sendTransactionAsync({
          to: j.tx.to, data: j.tx.data, value: BigInt(j.tx.value), chainId,
        });
        setTxHash(hash); setStep("broadcasting");
      } else {
        // Base — the user signs a transfer (cash), a native send, or a
        // transferWithMemo when the armed token is the B20 settlement token.
        setStep("switching");
        try { await switchChainAsync({ chainId }); }
        catch { throw new Error("Switch to Base and try again"); }
        setStep("signing");
        // `dec` is `bal.decimals`, read ON-CHAIN from this token. Never
        // `asset.decimals`, which came from a holdings payload.
        const call = buildBaseCall(toAddress, dec);

        // EIP-5792 first, when the wallet does it. `wallet_sendCalls` is the
        // only transport that can carry the ERC-8021 builder-code suffix, and
        // the paymaster when one is exposed. `optional: true` on the suffix
        // means a wallet that ignores the capability still sends — attribution
        // is never allowed to become a reason a transfer fails.
        if (sendCallsReady) {
          const origin = typeof window !== "undefined" ? window.location.origin : "";
          const dataSuffix = { value: DATA_SUFFIX, optional: true };
          const capabilities = gaslessSupported
            ? { paymasterService: { url: `${origin}/api/paymaster?network=base` }, dataSuffix }
            : { dataSuffix };
          const res = await sendCallsAsync({ calls: [call], chainId, capabilities });
          // An id, not a tx hash — `callsStatus` above resolves the real one.
          setCallsId(typeof res === "string" ? res : res.id);
          setStep("broadcasting");
          return;
        }

        // Everything else: one plain transaction, same calldata.
        const hash = call.data
          ? await sendTransactionAsync({ to: call.to, data: call.data, chainId })
          : await sendTransactionAsync({ to: call.to, value: call.value, chainId });
        setTxHash(hash); setStep("broadcasting");
      }
    } catch (e) {
      const m = (e as Error).message || String(e);
      const cancelled = /user rejected|denied|cancell?ed/i.test(m);
      setErr(cancelled ? "Send cancelled." : m.slice(0, 200));
      setStep("error");
    }
  }

  if (step === "done") {
    return (
      <div className="mt-2 rounded-xl border p-3.5" style={{ borderColor: "#22C55E40", background: "#22C55E08" }}>
        <div className="font-mono text-[11px] font-bold mb-1" style={{ color: "#22C55E" }}>
          ✓ Sent {fmt(amt)} {symbol} · {cfg.short}
        </div>
        <div className="font-mono text-[10px] text-slate-400 mb-2 break-all">
          to {recipIsName ? recip : truncAddr(toAddress ?? "")}
        </div>
        {txHash && (
          <a href={`${cfg.explorer}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"
             className="font-mono text-[10px] px-2.5 py-1 rounded-lg border border-[#4FC3F730] text-[#4FC3F7] inline-block mt-1">View tx ↗</a>
        )}
        <button onClick={() => { setStep("idle"); setAmount(""); setRecipient(""); setTxHash(""); setCallsId(""); setMemo(""); }}
          className="font-mono text-[10px] text-slate-500 hover:text-slate-300 ml-3">Send again</button>
      </div>
    );
  }

  // The gasless qualifier rides in the card's own `note` slot rather than a
  // free-floating badge, so it can only ever appear BESIDE the chain it applies
  // to — sponsorship is a per-chain capability, and a badge that outlived its
  // chain would be a promise about the wrong network.
  return (
    <WalletCard title="SEND" chain={network} note={gaslessSupported ? "⚡ gas sponsored" : undefined}>
      {/* Network — chosen in-card. Base + Robinhood only; no Base Sepolia.
          A dropdown rather than one button per chain: the segmented row encoded
          "there are exactly two chains", and this wallet is built to grow past
          that. Adding a third chain is a WALLET_CHAINS entry, not a layout.

          `pickNetwork` is narrowed back to `SendNet` on the way in. The shared
          picker speaks the full `WalletChain` union because Deposit lists a
          testnet; this card does not, and the cast is where that stays true. */}
      <NetworkPicker label="NETWORK" disabled={busy} chains={NETWORKS}
        value={network} onChange={c => pickNetwork(c as SendNet)} />

      {/* Asset — everything the address HOLDS on this chain, plus a paste field
          for whatever the holdings read did not see. See useSendableAssets.ts:
          this list is the same read the portfolio table renders, so Send can
          reach every row the wallet shows and cannot offer one it doesn't. */}
      <Picker label="ASSET" disabled={busy} onClose={() => setQuery("")}
        summary={
          <span className="flex items-center gap-2 min-w-0">
            <span className="font-mono text-[12px] text-white truncate">{symbol}</span>
            {badge && (
              <span className="font-mono text-[8px] px-1 py-0.5 rounded shrink-0"
                style={{ color: badge.color, border: `1px solid ${badge.color}40` }}>{badge.label}</span>
            )}
            {asset.pinned && asset.address !== null && (
              <span className="font-mono text-[9px] text-slate-600 shrink-0">{cfg.short} cash</span>
            )}
            {isNative && <span className="font-mono text-[9px] text-slate-600 shrink-0">gas token</span>}
          </span>
        }>
        {close => (
          <div>
            {/* Filter AND paste, in one field. Two controls would have made
                "send a token not in the list" an advanced mode; it is the
                ordinary case on a chain whose indexer is one Blockscout. */}
            <div className="p-2 border-b border-[#13131f]">
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search symbol, or paste a token address"
                spellCheck={false} autoCapitalize="none" autoCorrect="off"
                className="w-full bg-[#050508] border border-[#1A1A2E] rounded-md px-2 py-1.5 font-mono text-[11px] text-white outline-none placeholder:text-slate-700 focus:border-[#4FC3F740]" />
            </div>

            <div className="max-h-56 overflow-y-auto">
              {/* A pasted address is offered as a row, never armed on keystroke.
                  Its ticker is unknown until the chain answers, so the row shows
                  the address — the only thing established at this point.

                  No `setQuery("")` in the click handlers below: the Picker's
                  `onClose` owns that reset for every dismissal path, and a
                  second copy is how the two drift. */}
              {pastedAddr && !listed(pastedAddr) && (
                <PickerRow onClick={() => { pickAsset(pasteAsset(pastedAddr)); close(); }}>
                  <span className="font-mono text-[11px] text-[#4FC3F7] flex-1 truncate">
                    Use {truncAddr(pastedAddr)}
                  </span>
                  <span className="font-mono text-[9px] text-slate-600">on {cfg.short}</span>
                </PickerRow>
              )}

              {shown.map(a => {
                const b = TRUST_BADGE[a.trust];
                const key = a.address ?? "native";
                const sel = (asset.address ?? "native") === key;
                return (
                  <PickerRow key={key} selected={sel} onClick={() => { pickAsset(a); close(); }}>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className="font-mono text-[12px] text-white truncate">
                          {a.symbol || truncAddr(a.address ?? "")}
                        </span>
                        {b && (
                          <span className="font-mono text-[8px] px-1 py-0.5 rounded shrink-0"
                            style={{ color: b.color, border: `1px solid ${b.color}40` }}>{b.label}</span>
                        )}
                      </span>
                      {a.name && <span className="block font-mono text-[9px] text-slate-600 truncate">{a.name}</span>}
                    </span>
                    <span className="text-right shrink-0">
                      {/* What the HOLDINGS read saw. Display only — the figure
                          the send is gated on is re-read on-chain below. A row
                          with no balance shows nothing, never a zero. */}
                      {a.amount != null && (
                        <span className="block font-mono text-[10px] text-slate-300">{fmtAmt(a.amount)}</span>
                      )}
                      {a.usdValue != null && (
                        <span className="block font-mono text-[9px] text-slate-600">${a.usdValue.toFixed(2)}</span>
                      )}
                    </span>
                  </PickerRow>
                );
              })}

              {shown.length === 0 && !pastedAddr && (
                <div className="px-2.5 py-3 font-mono text-[10px] text-slate-500">
                  Nothing matches “{query.trim()}”. Paste the token&apos;s address to send it anyway.
                </div>
              )}
            </div>

            {/* How complete is this list? Never silent — an incomplete list that
                looks complete is what sends a user looking for a token they
                hold and concluding the wallet lost it.

                `!account` is checked FIRST and is not one of the hook's three
                read states, because it is not a read at all. With no address
                there is nothing to query, so the hook reports loading:false,
                failed:false, partial:false — every flag reads "fine", and the
                default branch would print "Your Base tokens" over two pins that
                are just this file's defaults. That is a completeness claim about
                a wallet nobody looked at. */}
            <div className="px-2.5 py-1.5 border-t border-[#13131f] font-mono text-[9px] leading-relaxed">
              {!account ? (
                  <span className="text-slate-600">
                    Not connected — showing {cfg.stableSymbol} and ETH only, not your holdings.
                  </span>
                )
                : list.loading ? <span className="text-slate-500">reading your {cfg.short} tokens…</span>
                : list.failed ? (
                  <span className="text-amber-400">
                    Couldn&apos;t read your {cfg.short} tokens — showing {cfg.stableSymbol} and ETH only.
                    Paste an address to send anything else.{" "}
                    <button type="button" onClick={() => list.refetch()} className="underline">Retry</button>
                  </span>
                ) : list.partial ? (
                  <span className="text-amber-400">
                    This list is incomplete — paste an address if yours isn&apos;t here.
                  </span>
                ) : (
                  <span className="text-slate-600">Your {cfg.short} tokens · paste an address for anything else.</span>
                )}
            </div>
          </div>
        )}
      </Picker>

      {/* The one refusal this card makes about IDENTITY rather than balance.
          Not a block: the token is the user's and refusing to move it would
          strand it. But an impostor's entire purpose is to be mistaken for the
          asset it names, and this card's confirm button says "Send 5 USDC" — so
          the warning has to be louder than the button. Same verdict, same
          function, as the portfolio table's badge (#145). */}
      {asset.trust === "impostor" && (
        <div className="mb-3 rounded-lg border border-red-500/30 bg-red-500/5 px-2.5 py-2 font-mono text-[9px] text-red-400 leading-relaxed">
          ⚠ This token calls itself <strong>{asset.symbol}</strong> but its address is not the real{" "}
          {asset.symbol} on {cfg.short}. Sending it sends the impostor, not the asset it names.
        </div>
      )}
      {needsSymbol && (
        <div className="mb-3 font-mono text-[9px] text-slate-500">
          Reading {truncAddr(asset.address ?? "")} on {cfg.short}…
        </div>
      )}

      {/* A caller named a token this card would not resolve by ticker. Said out
          loud rather than swallowed: the alternative is arming the chain's cash
          under a name the user did not say, which is a send card quietly
          choosing a different token than the one that was asked for. */}
      {assetHint && (
        <div className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-2.5 py-2 font-mono text-[9px] text-amber-400 leading-relaxed">
          Asked for <strong>{assetHint}</strong> — a ticker alone doesn&apos;t identify a token, so it wasn&apos;t armed.
          {" "}{symbol} is selected; pick <strong>{assetHint}</strong> in ASSET (or paste its address) to send that instead.
        </div>
      )}

      {/* Amount + balance-aware presets */}
      <Field label="YOU SEND"
        right={balance != null && (
          <span className="font-mono text-[9px] text-slate-600">Bal {balance.toFixed(isNative ? 5 : 2)} {symbol}</span>
        )}>
        <div className="flex items-center gap-2">
          <input type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.0"
            className="flex-1 bg-transparent font-mono text-[16px] text-white outline-none placeholder:text-slate-700 w-0" />
          <span className="font-mono text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E]">{symbol}</span>
        </div>
        {/* 25 / 50 / 100% — shown only once a balance is actually established, so a
            preset can never be computed off an unread balance. */}
        {balance != null && (
          <div className="flex gap-1.5 mt-2">
            {([["25%", 2500], ["50%", 5000], ["Max", 10000]] as const).map(([lbl, bps]) => (
              <button key={lbl} type="button" onClick={() => setPct(bps)}
                className="flex-1 font-mono text-[9px] py-1 rounded-md border border-[#1A1A2E] text-slate-400 hover:text-[#4FC3F7] hover:border-[#4FC3F730] transition-colors">
                {lbl}
              </button>
            ))}
          </div>
        )}
        {/* A word the caller passed through, still waiting on the balance it
            refers to. Shown rather than left blank, so an empty amount box
            reads as "being worked out" and not as "your instruction was lost". */}
        {pendingWord && (
          <div className="font-mono text-[9px] text-slate-500 mt-1.5">
            “{pendingWord}” — resolving against your {symbol} balance…
          </div>
        )}
        {overBalance && <div className="font-mono text-[9px] text-red-500 mt-1.5">Exceeds your {symbol} balance</div>}
      </Field>

      {/* Recipient */}
      <Field label="RECIPIENT">
        <input value={recipient} onChange={e => setRecipient(e.target.value)}
          placeholder={namesAllowed ? "0x…, name.base or name.eth" : "0x… address"}
          spellCheck={false} autoCapitalize="none" autoCorrect="off"
          className="w-full bg-transparent font-mono text-[12px] text-white outline-none placeholder:text-slate-700" />
        {/* Resolution status — honest about what actually resolves on this chain. */}
        <div className="font-mono text-[9px] mt-1 h-3">
          {recipIsName && resolving ? <span className="text-slate-500">resolving {recip}…</span>
            : recipIsName && toAddress ? <span className="text-[#22C55E]">→ {truncAddr(toAddress)}</span>
            : recipIsName && recip.length > 3 ? <span className="text-red-500">name not found on Base</span>
            : recipIsAddr ? <span className="text-[#22C55E]">✓ valid address</span>
            : recip.length > 0 ? (
                <span className="text-amber-400">
                  {namesAllowed ? "Enter a 0x address or a name.base / name.eth" : "Enter a valid 0x address on Robinhood Chain"}
                </span>
              )
            : <span className="text-slate-600">{namesAllowed ? "Address or Basename (name.base / name.eth)" : "Address only — Basenames are a Base concept"}</span>}
        </div>
      </Field>

      {/* Memo — B20 only. The field appears for exactly one armed ADDRESS, the
          configured settlement token, because `transferWithMemo` is a function
          that token has and USDC/ETH do not. Offering it anywhere else would
          collect a reference the transfer then silently drops. */}
      {memoAsset && (
        <Field label="MEMO (OPTIONAL)"
          right={
            <span className={`font-mono text-[9px] ${memoTooLong ? "text-red-500" : "text-slate-600"}`}>
              {memo.trim().length}/{MEMO_MAX_CHARS}
            </span>
          }>
          <input value={memo} onChange={e => setMemo(e.target.value)} placeholder="INV-2026-001"
            spellCheck={false} autoCapitalize="none" autoCorrect="off"
            className="w-full bg-transparent font-mono text-[12px] text-white outline-none placeholder:text-slate-700" />
          <div className="font-mono text-[9px] mt-1 h-3">
            {memoTooLong
              ? <span className="text-red-500">Max {MEMO_MAX_CHARS} characters — a memo is one bytes32.</span>
              : <span className="text-slate-600">Attached on-chain — order id / payment reference.</span>}
          </div>
        </Field>
      )}

      {gate === "unverified" && (
        <UnverifiedBalance symbol={symbol} onRetry={() => { void bal.refetch(); }} busy={bal.refetching} />
      )}
      {step === "broadcasting" && <p className="font-mono text-[10px] text-slate-400 mb-2">Broadcasting… waiting for the block.</p>}
      {step === "error" && <p className="font-mono text-[10px] text-amber-400 mb-2">{err}</p>}

      <ConfirmButton onClick={send} disabled={!valid || busy || !isConnected}>
        {!isConnected ? "Connect your wallet"
          : busy
            ? (step === "preparing" ? "Preparing…"
              : step === "switching" ? "Switch network…"
              : step === "signing" ? "Confirm in wallet…"
              : "Broadcasting…")
            : gate === "unverified" ? "Balance unread — held"
            : overBalance ? "Insufficient balance"
            : `Send ${amt > 0 ? fmt(amt) : ""} ${symbol}${toAddress ? ` → ${recipIsName ? recip : truncAddr(toAddress)}` : ""}`}
      </ConfirmButton>
      <CardNote>
        {cfg.short} · you sign every transaction · non-custodial · sends are final.
        {gaslessSupported && <span className="text-[#A78BFA]"> Gas is sponsored — no ETH needed.</span>}
      </CardNote>
    </WalletCard>
  );
}
