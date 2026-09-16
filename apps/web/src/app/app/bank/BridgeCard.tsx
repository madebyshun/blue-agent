"use client";
// The wallet's Bridge panel: Base ↔ Robinhood Chain, via Relay Protocol.
//
// This is an EDITOR wrapped around the confirm-only card the chat already uses
// (RobinhoodBridgeCard). The split is deliberate and it is the #107 rule:
//
//   · Here, the user CHOOSES — direction, token, amount. Nothing is signable.
//   · There, the user CONFIRMS — a quote fetched for a frozen intent, with the
//     delivered token, the total cost, the floor and the balance gate all
//     rendered before the button.
//
// Chat gets its intent from the LLM; the wallet gets it from this form. Both
// then hand the SAME component the same shape, so the signing path, the
// fail-closed balance gate, the asset-changed banner and the cost line exist in
// exactly one place. A second signing surface is a second place for those to
// drift, and drift on a fund-touching path is how you ship a card that says
// "USDC on Robinhood" for a token that cannot exist there.
//
// The intent is FROZEN on review (`nonce`). Editing is reopened by an explicit
// "Change" — never by typing underneath a live quote. That also means the card
// can never be remounted mid-signature, which would orphan a broadcast tx hash.
//
// ─── Chat mounts this editor too (#256/#257, 2026-09-12) ─────────────────────
//
// `robinhood_bridge` used to render RobinhoodBridgeCard bare: a quote for
// whatever the LLM decided, with no way to change the chain, the token or the
// amount short of retyping the sentence and hoping for a different parse. The
// instruction is that chat gets the wallet's controls, so chat now mounts THIS,
// and the confirm card keeps its one job underneath.
//
// That inverts the #107 split for this one card, and the `initial*` props are
// what make the inversion safe rather than merely convenient:
//
//  · `initialToken` is an ADDRESS (or the word ETH/NATIVE), never a ticker —
//    the same contract `robinhood_bridge`'s schema already states. It is
//    matched against the bridgeable set Relay returned for that chain, and a
//    miss ARMS NOTHING: it raises a banner and leaves the picker on its own
//    default. Falling back to "the first bridgeable token" under a name the
//    user typed would move a different asset than the one they asked for.
//  · `initialSymbol` is display only. Two chains, two different tokens, one
//    ticker is the normal case here, so a symbol identifies nothing.
//  · `autoReview` skips this editor straight to the quote — but ONLY when the
//    seed actually matched, the amount is present and the pair is not refused.
//    It fires exactly once, so "← Change" opens the editor instead of bouncing
//    back to chat's guess.
//
// ─── The amount is a NUMBER by the time it is shown (2026-09-16) ─────────────
//
// This editor used to read no balance at all, and passed the amount through
// verbatim — words and all — on the reasoning that the confirm card resolves
// "max" against the real on-chain figure anyway, so the editor need not.
//
// That is true of the VALUE and false of the DISPLAY, and the display is what
// the user is looking at. Pressing Max wrote the literal string `max` into a
// field styled as a number (`inputMode="decimal"`, placeholder `0.0`, the
// largest type on the card) and the button underneath then read
//
//     Review · max ETH → Robinhood
//
// which is not a figure the user can check, agree with, or spot as wrong. On a
// card whose whole job is "assert the amount you are about to move", a quantity
// you cannot read is the one thing it must not show. Every sibling editor —
// WalletSendCard, SwapCard, RhSwapCard — already resolves the word for exactly
// this reason (#137/#138); the bridge was the last one that did not.
//
// So the balance IS read here now, through the same `useSpendableBalance` the
// confirm card uses, on the same holder/token/chain. wagmi keys those queries by
// their arguments, so the two surfaces share one cached read rather than making
// two. Max and a seeded word resolve in BASE UNITS (`raw * bps / 10000n`) —
// never floats — for the reason in `amount.ts`: the float path rounds UP, and
// a 100% that is a hair above the balance is a 100% the user can never spend.
//
// What did NOT move here is the GATE. The editor chooses; the confirm card
// decides, fail-closed, against its own read (`resolveSpend`). An unread balance
// therefore disables Max — we cannot compute a number we did not measure — but
// it does not block Review, because refusing to let the user continue is the
// confirm card's call to make, on its own evidence, with its own retry.

import { useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { formatUnits, parseUnits } from "viem";
import {
  RobinhoodBridgeCard, type RobinhoodBridgeResult,
} from "@/app/chat/components/RobinhoodBridgeCard";
// The SAME module the server validates with — not a client-side paraphrase of
// it. `bridge-pairs` is pure (zero imports, no env, no fetch), so the browser
// can run the real resolver on the real list and show the real sentence.
import {
  type ChainCurrencies, NATIVE_ADDRESS, bridgeableOf, isNativeAddress, resolveBridgePair,
} from "@/lib/wallet/bridge-pairs";
import { WALLET_CHAINS } from "@/lib/wallet/chains";
// The same read, the same rule and the same reserve the confirm card uses, so
// the figure this editor shows is the figure that card would have computed.
import { useSpendableBalance } from "@/lib/wallet/useSpendableBalance";
import { PLAIN_AMOUNT_RE, QUANTITY_WORD_RE, wordToBps } from "@/lib/wallet/amount";
import { NATIVE_GAS_RESERVE } from "@/app/chat/components/ConfirmCardParts";
import { Picker, PickerRow } from "@/components/wallet/Picker";
import {
  WalletCard, Field, NetworkPicker, ChainMark, ConfirmButton, CardNote,
} from "@/components/wallet/CardShell";

type ChainKey = "base" | "robinhood";

// The two ends Relay connects for this wallet. Written here, not taken from
// `WALLET_CHAIN_ORDER`: a bridge's endpoints are a fact about the route, and
// Base Sepolia is not one of them.
const BRIDGE_CHAINS: readonly ChainKey[] = ["base", "robinhood"];

const truncAddr = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

// The amount, shortened for the BUTTON only — `formatUnits` on an 18-decimal
// Max produces things like "0.052134819237421398", which is the right number
// and an unreadable label. Same rule and same 6 digits as the send card's
// button (`fmt`), so the two read alike. The input keeps the exact string and
// the exact string is what is frozen into the intent; this is a summary of it,
// never the source of it.
const fmtQty = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n.toLocaleString("en-US", { maximumFractionDigits: 6 }) : s;
};

/**
 * The route's GET hands back Relay's parsed `/chains` entry per chain, verbatim
 * — `null` when Relay does not list the chain at all, which is a different fact
 * from "listed but nothing is movable" and is rendered differently below.
 */
type ListResponse = {
  ok?: boolean;
  error?: { code: string; message: string };
  chains?: Record<string, ChainCurrencies | null>;
};

const LABEL: Record<ChainKey, string> = { base: "Base", robinhood: "Robinhood" };

/** The frozen intent handed to the confirm card. */
type Intent = {
  fromChain: ChainKey;
  token:     string;
  amount:    string;
  symbol:    string;
  nonce:     number;
};

export default function BridgeCard({
  account, initialFromChain, initialToken, initialSymbol, initialAmount, autoReview,
}: {
  account?: `0x${string}`;
  /** Origin chain — the side funds LEAVE from. The destination is derived. */
  initialFromChain?: ChainKey;
  /** A 0x address on `initialFromChain`, or the word ETH/NATIVE. NEVER a
   *  ticker: the same symbol names different tokens on the two chains, so a
   *  ticker cannot pick one. A value that isn't in Relay's bridgeable set for
   *  that chain arms nothing and raises the banner below. */
  initialToken?: string;
  /** Display hint only — used to name the token in the "couldn't arm" banner so
   *  the sentence says what the user said, not a truncated address. */
  initialSymbol?: string;
  /** Whole units ("25.5") or a quantity word ("max", "half", "50%"), verbatim.
   *  A word is resolved HERE against the live balance so the user sees a figure
   *  before they review — and falls back to being passed through as a word if
   *  that read fails, which is what this card used to do unconditionally. */
  initialAmount?: string | number;
  /** Skip straight to the quote. Honoured ONCE, and only when the token seed
   *  matched, an amount is present and the pair is not refused. */
  autoReview?: boolean;
}) {
  const { address: connected } = useAccount();
  const from = (account || connected || "") as `0x${string}` | "";

  const [fromChain, setFromChain] = useState<ChainKey>(
    initialFromChain === "robinhood" ? "robinhood" : "base");
  const toChain: ChainKey = fromChain === "base" ? "robinhood" : "base";

  // ── What can actually be bridged ─────────────────────────────────────────
  //
  // Fetched from the route that also VALIDATES the bridge, so the picker cannot
  // offer a token the server would then refuse. There is no local fallback
  // list: `null` data renders "couldn't load", never a guess. Relay's set is
  // small and surprising (Base DEGEN is listed by Relay and flagged
  // unbridgeable; Robinhood takes ETH and USDG and nothing else), so a
  // plausible-looking hardcoded list would be wrong in ways nobody would
  // notice until a user had already signed an approve.
  const [list, setList]   = useState<Record<string, ChainCurrencies | null> | null>(null);
  const [listErr, setListErr] = useState("");
  const [listLoading, setListLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true); setListErr("");
    fetch("/api/robinhood/router/bridge-prepare", { cache: "no-store" })
      .then((r) => r.json() as Promise<ListResponse>)
      .then((j) => {
        if (cancelled) return;
        if (j.ok && j.chains) setList(j.chains);
        else setListErr(j.error?.message || "Could not load the bridgeable token list.");
      })
      .catch((e) => { if (!cancelled) setListErr((e as Error).message || "Could not load the bridgeable token list."); })
      .finally(() => { if (!cancelled) setListLoading(false); });
    return () => { cancelled = true; };
  }, [reloadKey]);

  const originChain = list ? list[fromChain] ?? null : null;
  const destChain   = list ? list[toChain]   ?? null : null;
  // `bridgeableOf`, not `[native, ...erc20]`: Relay LISTS tokens it will not
  // move (Base DEGEN is flagged `supportsBridging: false` today), and the
  // picker must show the moved set, not the listed set. Same function the
  // server filters with.
  const originTokens = originChain ? bridgeableOf(originChain) : [];

  // Selected token, by ADDRESS. Kept as an address rather than an index or a
  // symbol because Relay's list can be reordered and symbols are not unique
  // across chains — the address is the only stable identity.
  const [tokenAddr, setTokenAddr] = useState<string>("");
  // What the caller asked for, held until Relay's list arrives to check it
  // against. A ref, not state: consuming it must not itself cause a render, and
  // it is read in exactly one place.
  const seedRef = useRef(String(initialToken ?? "").trim());
  // Set when the caller named a token we could NOT arm. Rendered as an amber
  // banner and, separately, used to hold `autoReview` back — advancing to a
  // quote for the picker's default under a name the user typed is how a card
  // moves an asset nobody asked for.
  const [assetHint, setAssetHint] = useState("");
  // Only an explicitly-seeded, matched token may auto-advance. Distinct from
  // "a token is selected", which is true of the picker's own default too.
  const [seedArmed, setSeedArmed] = useState(false);

  // Pick a sane default once the list lands, and re-pick when the direction
  // flips: a Base USDC selection is meaningless as a Robinhood origin.
  useEffect(() => {
    // The seed is consumed EXACTLY ONCE, on the first list that lands, whatever
    // that list turns out to contain. Leaving it armed would make a later
    // direction flip silently re-apply a token the user had moved off, and
    // would make "← Change" bounce back to chat's choice instead of opening the
    // editor it promises.
    const want = list ? seedRef.current : "";
    if (list) seedRef.current = "";

    if (!originTokens.length) { setTokenAddr(""); return; }

    if (want) {
      const addr = /^(eth|native)$/i.test(want) ? NATIVE_ADDRESS : want.toLowerCase();
      const hit = originTokens.find((t) => t.address.toLowerCase() === addr);
      if (hit) { setTokenAddr(hit.address); setSeedArmed(true); return; }
      // "Relay has never heard of this" and "Relay lists it and won't move it"
      // are different facts, and the second one is the surprising one — Base
      // DEGEN is listed today with `supportsBridging: false`. Saying the true
      // one costs a lookup in data already in hand.
      const listed = originChain
        ? [originChain.native, ...originChain.erc20].find((t) => t.address.toLowerCase() === addr)
        : undefined;
      const named = String(initialSymbol ?? "").trim() || truncAddr(want);
      setAssetHint(listed
        ? `Relay lists ${listed.symbol} on ${LABEL[fromChain]} but won't bridge it right now, so nothing is armed. Pick a token below.`
        : `${named} isn't in the set Relay bridges from ${LABEL[fromChain]}, so nothing is armed. Pick a token below.`);
    }

    setTokenAddr((cur) => (originTokens.some((t) => t.address === cur) ? cur : originTokens[0]!.address));
  }, [fromChain, list]); // eslint-disable-line react-hooks/exhaustive-deps

  const token = originTokens.find((t) => t.address === tokenAddr) ?? null;
  const isNative = !!token && isNativeAddress(token.address);

  // The amount, and — separately — a word waiting to BECOME one.
  //
  // They are two fields because a word cannot live in the number input: it is
  // typed `inputMode="decimal"`, `Number("max")` is NaN, and a NaN in the field
  // that gates the button is a button that never enables. So a seeded word is
  // parked in `pendingWord`, the input stays empty and honest, and the moment
  // the balance lands the word resolves INTO `amount` as a figure.
  //
  // Seeded in the initialiser rather than an effect so a parent re-render can
  // never re-arm the card with chat's original value under a user who has
  // already edited it.
  const [amount, setAmount] = useState(() => {
    const raw = initialAmount != null ? String(initialAmount).trim() : "";
    return QUANTITY_WORD_RE.test(raw) ? "" : raw;
  });
  const [pendingWord, setPendingWord] = useState(() => {
    const raw = initialAmount != null ? String(initialAmount).trim() : "";
    return QUANTITY_WORD_RE.test(raw) ? raw.toLowerCase() : "";
  });
  const [intent, setIntent] = useState<Intent | null>(null);

  // The balance behind Max and behind a seeded word. Same hook, same holder,
  // same token and same chainId the confirm card will use, so wagmi serves both
  // from one cached read — and so the figure shown here is the figure that card
  // would have computed, rather than a second opinion about the same wallet.
  //
  // Declared ABOVE the `if (intent)` early return: hook order is not checked by
  // `tsc` or by `next build`, so a hook that renders only while editing is a
  // crash that ships. Everything it reads is already resolved at this point.
  const bal = useSpendableBalance({
    holder: from,
    native: isNative,
    token:  isNative ? undefined : (token?.address ?? undefined),
    chainId: WALLET_CHAINS[fromChain].chainId,
  });

  // A percentage of the balance, computed in BASE UNITS. `raw * bps / 10000n`
  // truncates toward zero; the float path it replaced used `.toFixed`, which
  // rounds UP — and a Max that lands a hair above the balance is a Max the
  // spend gate refuses, which is the user unable to bridge everything they own.
  //
  // Native 100% keeps `NATIVE_GAS_RESERVE` back, the SAME constant the confirm
  // card's `resolveQuantity` applies, so pressing Max here and letting the card
  // resolve "max" itself produce the same number. A bridge that moves the last
  // wei of ETH leaves a wallet that cannot pay for the transaction moving it.
  function setPct(bps: number) {
    if (bal.raw == null || bal.decimals == null) return;
    let part = (bal.raw * BigInt(bps)) / 10000n;
    if (isNative && bps === 10000) {
      const reserve = parseUnits(String(NATIVE_GAS_RESERVE), bal.decimals);
      part = part > reserve ? part - reserve : 0n;
    }
    setAmount(formatUnits(part, bal.decimals));
  }

  // A parked word resolves the instant its balance lands — through `setPct`, so
  // a word and the Max button are one calculation and cannot disagree.
  //
  // The `failed` branch is the important one. A read that did not complete is
  // not a zero balance, so the word is NOT resolved to 0 and it is NOT dropped:
  // it goes back into `amount` as the word it always was, which restores this
  // card's previous behaviour exactly — the confirm card resolves it against
  // its own read, behind its own fail-closed gate and its own retry. `autoReview`
  // therefore still advances on a bad RPC, instead of stranding a chat user on
  // an editor whose amount box silently emptied itself.
  useEffect(() => {
    if (!pendingWord) return;
    if (bal.raw != null && bal.decimals != null) {
      const bps = wordToBps(pendingWord);
      if (bps != null) setPct(bps);
      setPendingWord("");
      return;
    }
    if (bal.failed) { setAmount(pendingWord); setPendingWord(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingWord, bal.raw, bal.decimals, bal.failed]);

  // ── What will this token turn into on the far side? ──────────────────────
  //
  // Answered BEFORE the quote, by the SERVER'S OWN RESOLVER — not by a
  // client-side paraphrase of it. `resolveBridgePair` is pure and exported, the
  // chain data is Relay's verbatim, and `preferredStable` is the identical
  // `WALLET_CHAINS[dest].stable` the POST passes. So this is not "a label that
  // mirrors the rules": it is the same function, on the same inputs, producing
  // the same verdict and the same sentence the POST would have returned.
  //
  // That matters because the rules are genuinely surprising — most of Relay's
  // Base list cannot cross at all, since filling it would mean SELLING the
  // asset, and the server refuses to auto-liquidate. A user should learn that
  // from the picker, not from a red error after pressing Review.
  //
  // It is still not a GATE. The server re-runs this on a payload it parses
  // itself, and its refusal is what actually protects the funds; a browser can
  // always post whatever it likes. What this removes is the possibility of the
  // two disagreeing.
  const pair = token && originChain && destChain
    ? resolveBridgePair(originChain, destChain, token.address, {
        preferredStable: WALLET_CHAINS[toChain].stable,
      })
    : null;
  const outlook: { kind: "same" | "dollar" | "refused"; text: string } | null = !pair ? null
    : !pair.ok
      ? { kind: "refused", text: pair.message }
    : pair.assetChanged
      // `pair.note` is the resolver's own sentence, already written for a user
      // to read. Rewriting it here would be a third copy of the same fact.
      ? { kind: "dollar", text: pair.note }
      : { kind: "same", text: `Arrives as ${pair.to.symbol} on ${LABEL[toChain]}.` };

  const amtN = Number(amount);
  const amountOk = PLAIN_AMOUNT_RE.test(amount.trim()) && Number.isFinite(amtN) && amtN > 0;
  // A word only survives to here when the balance read FAILED (see the effect
  // above) — the normal path resolves it to a figure. It still counts as a
  // valid amount, because the confirm card can resolve what this editor could
  // not, and refusing to continue is that card's decision to make on its own
  // evidence. The shared regex, never a local one: this card used to carry its
  // own `\d{1,3}%`, which rejected "12.5%" the confirm card accepts and
  // accepted "999%" it would have resolved to 9.99× the balance.
  const isWord = QUANTITY_WORD_RE.test(amount.trim());
  const canReview = !!from && !!token && (amountOk || isWord) && outlook?.kind !== "refused";

  function review() {
    if (!canReview || !token) return;
    setIntent({
      fromChain,
      // "ETH" is the route's word for the zero address — the one address that
      // means the same thing on both chains.
      token:  isNativeAddress(token.address) ? "ETH" : token.address,
      amount: amount.trim(),
      symbol: token.symbol,
      nonce:  Date.now(),
    });
  }

  // ── Auto-advance, for a caller that already has a complete intent ─────────
  //
  // Chat's user said the whole thing in prose; making them press Review is a
  // second confirmation of a sentence they already typed. So a COMPLETE and
  // CHECKED seed goes straight to the quote — which still signs nothing.
  //
  // Four conditions, and each one is load-bearing:
  //  · `seedArmed` — the token was named AND found in Relay's bridgeable set.
  //    Without this, an absent or unrecognised token would auto-quote the
  //    picker's default, and the user would be looking at a card for an asset
  //    they never mentioned.
  //  · `!assetHint` — the banner explaining what we couldn't arm must be read,
  //    not skipped past.
  //  · `canReview` — folds in the connected wallet, a present amount, and the
  //    refused-pair verdict.
  //  · the ref — ONCE. "← Change" must open the editor, and a Change button
  //    that bounces straight back to the quote is a trap on a fund card.
  const advanced = useRef(false);
  useEffect(() => {
    if (!autoReview || advanced.current) return;
    if (assetHint) { advanced.current = true; return; }
    if (!seedArmed || !canReview) return;
    advanced.current = true;
    review();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoReview, assetHint, seedArmed, canReview]);

  // ── Confirming ───────────────────────────────────────────────────────────
  if (intent) {
    const result: RobinhoodBridgeResult = {
      kind:        "robinhood_bridge",
      fromChain:   intent.fromChain,
      toChain:     intent.fromChain === "base" ? "robinhood" : "base",
      fromAddress: from || undefined,
      token:       intent.token,
      amount:      intent.amount,
      tokenSymbol: intent.symbol,
    };
    return (
      <div>
        <button onClick={() => setIntent(null)}
          className="font-mono text-[10px] text-slate-500 hover:text-slate-300 mb-2">
          ← Change
        </button>
        {/* Keyed on the frozen nonce: a NEW review remounts (fresh quote, fresh
            step machine), and nothing the user does while a tx is in flight can
            remount it, because the form is not reachable from here. */}
        <RobinhoodBridgeCard key={intent.nonce} result={result} />
      </div>
    );
  }

  // ── Editing ──────────────────────────────────────────────────────────────
  //
  // Same frame as SEND, from the same module — see components/wallet/CardShell.
  // These two panels are one click apart in the action row and both move the
  // user's funds off the chain they are looking at; drawn differently, they
  // read as two different products, and "which chain is this pointed at" is the
  // question a money card must answer before any other.
  const tokenUnavailable = !listLoading && (!!listErr || !originChain || !destChain || originTokens.length === 0);
  return (
    <WalletCard title="BRIDGE" chain={fromChain} note={`→ ${LABEL[toChain]}`}>
      {/* Direction. The origin gets the dropdown because it is the side that
          decides everything — whose funds move, whose gas is paid, which list
          of tokens is even offered. The destination is DERIVED from it (two
          chains, one complement), so it is shown as a read-only bar rather
          than a second control that could be set to contradict the first. */}
      <NetworkPicker label="FROM" chains={BRIDGE_CHAINS}
        value={fromChain} onChange={(c) => { setFromChain(c as ChainKey); setAssetHint(""); }} />

      <div className="text-[9px] text-slate-600 mb-1">TO</div>
      <div className="flex items-center gap-2 mb-3">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 rounded-lg border border-[#1A1A2E] bg-[#050508] px-2.5 py-2">
          <ChainMark chain={toChain} size={13} />
          <span className="text-[12px] text-white truncate flex-1">{WALLET_CHAINS[toChain].label}</span>
          <span className="text-[9px] text-slate-600 shrink-0">{WALLET_CHAINS[toChain].chainId}</span>
        </div>
        <button onClick={() => { setFromChain(toChain); setAssetHint(""); }} title="Swap direction"
          className="w-9 h-9 rounded-lg shrink-0 text-[13px]"
          style={{ background: "#4FC3F710", color: "#4FC3F7", border: "1px solid #4FC3F730" }}>
          ⇄
        </button>
      </div>

      {/* What the caller named and we refused to arm. Above the picker, because
          the picker is the answer to it. Amber, not red: nothing is wrong, the
          card simply declined to guess — and it has NOT silently substituted
          the default underneath, which is the failure this banner exists to
          make impossible to miss. */}
      {assetHint && (
        <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[9px] leading-relaxed text-amber-300">
          {assetHint}
        </div>
      )}

      {/* Token. A closed list, because for a bridge it genuinely is one: Relay
          moves a curated set and nothing else, so a paste-an-address field
          would only ever collect addresses the server rejects. (The SEND card
          is the opposite case — there the user's holdings are arbitrary, so
          its picker carries a paste field and this one must not.) */}
      {tokenUnavailable || listLoading ? (
        <>
          <div className="text-[9px] text-slate-600 mb-1">TOKEN</div>
          {listLoading ? (
            <div className="mb-3 rounded-lg border border-[#1A1A2E] bg-[#050508] px-2.5 py-2 text-[10px] text-slate-600">
              Loading what Relay will move…
            </div>
          ) : listErr ? (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-300">
              {listErr}
              <button onClick={() => setReloadKey((k) => k + 1)} className="ml-2 underline">Retry</button>
            </div>
          ) : !originChain || !destChain ? (
            // Relay does not list one of the two chains. Distinct from "listed,
            // but nothing movable" below — one is Relay not knowing the chain,
            // the other is Relay knowing it and moving nothing — and collapsing
            // them would report an outage as a fact about the bridge.
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-300">
              Relay isn&apos;t listing {LABEL[!originChain ? fromChain : toChain]} right now, so this
              direction can&apos;t be quoted.
              <button onClick={() => setReloadKey((k) => k + 1)} className="ml-2 underline">Retry</button>
            </div>
          ) : (
            <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-2 text-[10px] text-amber-300">
              Relay lists nothing bridgeable from {LABEL[fromChain]} right now.
            </div>
          )}
        </>
      ) : (
        <Picker label="TOKEN"
          summary={
            <span className="flex items-center gap-2 min-w-0">
              <span className="text-[12px] text-white truncate">{token?.symbol ?? "—"}</span>
              {token && isNativeAddress(token.address) && (
                <span className="text-[9px] text-slate-600 shrink-0">gas token</span>
              )}
            </span>
          }>
          {(close) => (
            <div className="max-h-56 overflow-y-auto">
              {originTokens.map((t) => (
                <PickerRow key={t.address} selected={t.address === tokenAddr}
                  onClick={() => { setTokenAddr(t.address); setAssetHint(""); close(); }}>
                  <span className="text-[12px] text-white flex-1 truncate">{t.symbol}</span>
                  <span className="text-[9px] text-slate-600 shrink-0">
                    {isNativeAddress(t.address) ? "gas token" : truncAddr(t.address)}
                  </span>
                </PickerRow>
              ))}
            </div>
          )}
        </Picker>
      )}

      {/* What lands. Amber when the asset changes, red-ish when the trip is
          refused — either way it is on screen BEFORE the amount is typed. */}
      {outlook && (
        <div className="mb-3 rounded-lg px-2.5 py-2 text-[9px] leading-relaxed"
          style={outlook.kind === "same"
            ? { border: "1px solid #1A1A2E", color: "#64748b" }
            : outlook.kind === "dollar"
              ? { border: "1px solid rgba(245,158,11,.3)", background: "rgba(245,158,11,.05)", color: "#fcd34d" }
              : { border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.05)", color: "#fca5a5" }}>
          {outlook.text}
        </div>
      )}

      {/* Amount. Boxed like SEND's, and for the same reason the figure is the
          biggest type on the card: it is the one number the user is asserting.
          So it must BE a figure — see the header. The balance row and the Max
          button below are both drawn from one read, and both disappear rather
          than guess when that read has not landed. */}
      <Field label="YOU BRIDGE"
        right={
          <span className="flex items-center gap-2">
            {/* The balance, or nothing. Never a dash standing in for a number
                and never `0` — an unread balance is not an empty wallet, and
                on a card that is about to move funds those two must never
                render the same. Five decimals for the gas token, where the
                interesting digits are small. */}
            {bal.balance != null && token && (
              <span className="font-mono text-[9px] text-slate-600">
                Bal {bal.balance.toFixed(isNative ? 5 : 2)} {token.symbol}
              </span>
            )}
            {/* Max is disabled until the balance is actually read, because the
                only honest Max is one computed from a measured number. The
                title says which of the two it is — still reading, or the read
                came back empty-handed. */}
            <button type="button" onClick={() => setPct(10000)}
              disabled={bal.raw == null || bal.decimals == null}
              title={
                bal.raw != null && bal.decimals != null
                  ? `Everything you hold${isNative ? `, less ${NATIVE_GAS_RESERVE} ETH kept back for gas` : ""}`
                  : bal.failed
                    ? "Your balance couldn't be read, so there is no figure to take all of."
                    : "Reading your balance…"
              }
              className="text-[9px] px-2 py-0.5 rounded-md text-[#4FC3F7] border border-[#4FC3F730] disabled:opacity-40 disabled:cursor-not-allowed">
              Max
            </button>
          </span>
        }>
        <div className="flex items-center gap-2">
          <input value={amount} onChange={(e) => { setAmount(e.target.value); setPendingWord(""); }}
            inputMode="decimal" placeholder="0.0"
            className="flex-1 w-0 bg-transparent text-[16px] text-white outline-none placeholder:text-slate-700" />
          {token && (
            <span className="text-[11px] text-slate-300 px-2 py-1.5 rounded-lg border border-[#1A1A2E] shrink-0">
              {token.symbol}
            </span>
          )}
        </div>
        {/* A word still waiting on the balance it refers to. Said out loud so an
            empty box reads as "being worked out" rather than as an instruction
            that got dropped somewhere between chat and here. */}
        {pendingWord && (
          <div className="font-mono text-[9px] text-slate-500 mt-1.5">
            “{pendingWord}” — resolving against your {token?.symbol ?? "token"} balance…
          </div>
        )}
        {/* The read failed and a word is what is left in the box. Not a gate —
            Review stays live and the confirm card resolves the word behind its
            own fail-closed balance check. This only explains why the figure the
            user expected to see isn't there, and offers the re-read. */}
        {!pendingWord && isWord && bal.failed && (
          <div className="flex items-center justify-between gap-2 mt-1.5">
            <span className="font-mono text-[9px] text-amber-400">
              Couldn&apos;t read your balance here — “{amount.trim()}” is resolved on the next screen.
            </span>
            <button type="button" onClick={() => { void bal.refetch(); }} disabled={bal.refetching}
              className="shrink-0 font-mono text-[9px] text-amber-400 underline disabled:opacity-50">
              {bal.refetching ? "reading…" : "Retry"}
            </button>
          </div>
        )}
      </Field>

      {!from && <p className="text-[10px] text-amber-400 mb-2">Connect your wallet to bridge.</p>}

      <ConfirmButton onClick={review} disabled={!canReview}>
        {!from ? "Connect your wallet"
          : !token ? "Pick a token"
          : outlook?.kind === "refused" ? `${token.symbol} can't cross to ${LABEL[toChain]}`
          // A word is still being turned into a figure. Its own branch, ahead of
          // "Enter an amount": the user DID enter one, and telling them they
          // didn't is the card losing track of an instruction it is holding.
          : pendingWord ? `Working out “${pendingWord}”…`
          : !(amountOk || isWord) ? "Enter an amount"
          : `Review · ${fmtQty(amount.trim())} ${token.symbol} → ${LABEL[toChain]}`}
      </ConfirmButton>

      <CardNote>
        Routed by Relay Protocol · you sign every transaction · non-custodial.
        The quote, the total cost and the guaranteed minimum are shown before you sign.
      </CardNote>
    </WalletCard>
  );
}
