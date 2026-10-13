# Building AI finance that shows its work: the five layers of Blue Agent

An AI that touches money has to answer five questions before a single dollar moves.

What is true right now? Is this trade safe? Who is allowed to do it? How does it actually happen? And afterwards, what happened?

Most "AI trading" products answer the first one with a language model and skip the other four. We spent the last month rebuilding Blue Agent around all five. Not by adding features. Mostly by cutting them.

Here is what each layer does, what we built, and what we removed to get there.

---

## 1. Perceive: read, don't remember

A model's memory of a market is wrong by definition. Prices move, pools drain, tokens launch every few seconds. So Blue Agent does not answer market questions from what the model knows. It answers from what it just read.

Ask "what's trending on Base?" and the answer comes from GeckoTerminal, with a tax check run against each token's contract. Ask "what launched in the last hour on Robinhood Chain?" and the counts come from the launchpads' own on-chain events: Pons, Virtuals, Doppler and others. A token launched through Bankr is labelled from chain state, from the integrator field on its Doppler launch, not from anyone's API. Stock token prices come from Chainlink feeds read on-chain.

The lesson that shaped this layer: **prompts do not prevent hallucination. Data sources do.** A tool with no real source will invent an answer no matter how carefully the prompt is written. So every tool either has a source or does not ship.

The harder half is saying nothing when the source is silent. Our tax check can only decode certain token contracts. For the rest, the answer is "tax unverified", not "clean". Missing data is reported as missing. It is never turned into a score.

## 2. Judge: decided in code, never by the model

Before any swap, send or bridge, one pre-trade check returns one of three answers:

- **PASS**: nothing measured against the trade.
- **WARN**: a measured risk or an unmeasured gap. You see the reason and confirm before signing.
- **BLOCK**: measured evidence. The sign button stays locked.

The verdict word is chosen by code from measured signals. The model can explain a verdict. It cannot pick one. We learned this the hard way: some of our earlier safety tools let a model choose between SAFE and CAUTION, and the same token could flip between runs. A verdict that changes when you ask twice is not a verdict.

BLOCK is reserved for evidence:

- a contract wearing the symbol of a verified token at a different address;
- a sell tax of 50% or more, read from the contract;
- a bridge whose measured cost is too large a share of the amount.

A real example: bridging 0.00003 ETH from Base to Robinhood Chain quoted a cost of 31.7% of the amount. The check refused it and told the user why: send more, or not at all.

There is no "this token feels risky". If we cannot measure it, it is a WARN with the gap named, not a BLOCK.

## 3. Authorize: the server holds no key that can move your money

This is the layer we cut the most from.

The rule is simple. Only the user's signature moves the user's funds. Blue Agent builds the transaction. Your wallet signs it.

Holding that line meant removing things that worked. We had a DCA feature where a keeper on our server executed recurring buys using keys we derived and held. It was convenient. It was also a server-held key with permission to spend user funds. We retired it, and kept only the paths that let users cancel and revoke what they had granted.

The same rule applies to credits. Any request that spends a wallet's credits has to prove which wallet sent it, with a Sign-In with Ethereum session. For people who log in with email, that proof happens silently with their embedded wallet. External wallets sign once.

Non-custodial is not a feature we add. It is a list of things we refuse to build.

## 4. Execute: say it, then sign it

Execution is deliberately small: buy, sell, send and bridge, on Base and Robinhood Chain, for crypto and stock tokens.

Stock tokens get extra care, because the same ticker exists on both chains as different contracts. Blue Agent never resolves a stock token by its name. On Base, a Coinbase B20 tokenized stock has to match its registry address and its on-chain checks. On Robinhood Chain, stock tokens are matched against the issuer's registry. A ticker string alone identifies nothing.

Automations follow the same rule as everything else. You can say "alert me if ETH on Base drops 5% in 24h, then buy $25". Blue Agent checks every 5 minutes. When the condition is met, it prepares the trade card with a live quote and the pre-trade check, and waits. It never trades on its own.

## 5. Record: account for the money, not the predictions

Every action lands on one private timeline per wallet: alerts that fired, trades prepared and signed, automation checks, and trades the check refused, with the reason it gave. Only that wallet can read it.

This layer changed the most in our thinking. For months, our accountability story was a public track record of market signals: each one published before the outcome, graded after, hits and misses. The signals graded well. Nobody traded on them.

So we froze them. The data is still recorded, but we stopped publishing new signals. Accountability moved to the place where money actually moves: what you asked for, what the check said, what you signed. Our public meter counts only what the server itself measured.

---

## The same loop, for agents

People are not the only users. Agents call Blue Agent over MCP.

An agent asking `blue_swap_tx` for a trade gets back an unsigned transaction, the approval it needs, the quote, and the same pre-trade verdict a person would see. A WARN arrives with an instruction attached: show the reasons to the user and get an explicit yes before they sign. The agent signs from its own wallet. Blue Agent holds no keys on that path either.

## What AI finance actually means

Building this changed our answer to "what makes an AI agent good with money?"

It is not how smart the model is. It is what the model is not allowed to do:

- It does not make up numbers. Every number has a source, or the answer says "unknown".
- It does not pick verdicts. Code does, from measurements.
- It does not hold your keys or sign for you.
- It does not act on its own. Automations prepare; you approve.
- It does not lose track. Every action leaves a record you can read.

Five layers, one loop: Perceive, Judge, Authorize, Execute, Record. On Base and Robinhood Chain.

Try it at app.blueagent.dev. 500 free credits a day for any connected wallet.
