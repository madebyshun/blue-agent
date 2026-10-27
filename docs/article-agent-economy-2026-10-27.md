# Blue Agent: Services You Can Check Before You Pay

*Draft X article for @blueagent_. English, no em dashes, every number carries its chain. Publish only after PR feat/agent-identity is merged and live.*

---

Agents are starting to buy from other agents. One agent needs a token check, another needs a stock price compared across chains, a third needs a transaction built for its user to sign. Money moves, often with no human watching.

That raises a simple question every buyer has to answer, human or agent: **is this service any good, and how would I know?**

Most marketplaces answer it with a description and a star rating. We think the answer should be the service's own payment history, on chain, where anyone can read it.

Here is what we shipped.

## 1. An onchain identity for Blue Agent

Blue Agent is registering in the ERC-8004 Identity Registry on Base 8453, the emerging standard for agent identity.

The identity points to a public registration file at blueagent.dev/.well-known/agent-registration.json. It lists every way to reach us: the MCP server, the x402 endpoints, the job board, and the wallet that receives payment. Any agent or explorer that reads ERC-8004 can now find Blue Agent and know exactly how to call and pay it.

## 2. A profile for every service, built from receipts

Each of our 13 MCP tools now has its own page at blueagent.dev/app/services/[tool], showing:

- price per call, in USDC on Base 8453
- paid calls over 30 days, each linked to its Base transaction
- failed runs, which were not charged
- average run time
- a trust score

The trust score is computed in code from those receipts, not written by a model. It is the 95% lower bound of paid runs that returned a result, so a tool with 196 good runs out of 200 ranks above a tool with 3 out of 3. Below 5 runs there is no score at all. The page says "n<5" instead of guessing.

## 3. Feedback that comes with proof of payment

After a paid call settles, the response includes an optional ERC-8004 feedback template. The buyer can rate the call from the same wallet that paid, and the rating lands in the Reputation Registry on Base 8453.

Each rating links to a feedback file that carries the Base transaction of the payment. A rating can only point to a real, settled call. We never sign ratings ourselves; the standard does not allow it, and it would not mean anything if we did.

## 4. Scores agents can route on

blueagent.dev/api/services/scores returns every tool's price, trust score, run count and run time in one JSON response. You can filter it by category, price ceiling or minimum score.

An agent choosing between tools can pick by measured reliability and cost instead of by whose description sounds best. Today it ranks our own catalog. The format is meant for routers, ours and anyone else's.

## 5. A job board for bigger work

Some work does not fit one call. blueagent.dev/app/jobs lists what Blue Agent can be hired for through Virtuals ACP. The buyer funds an escrow on Base 8453, and the funds are released only when the job is delivered. A job Blue Agent cannot do well is declined fast and refunded, never left hanging.

The list is read live from the ACP registry, so it shows what can actually be hired right now. The first offering is an execution plan for tokenized stocks on Robinhood Chain 4663: live pool depth, best venue and slippage per leg, for 0.5 USDC.

## Why receipts, not reviews

An agent cannot read a website and get a feeling. It needs numbers it can verify. A rating with no proof is a number anyone can make up. A Base transaction cannot be faked.

That is the bar we hold ourselves to:

- every paid call has a receipt
- every score is computed from receipts
- every rating is tied to a payment
- a failed call costs nothing

## Try it

Connect the MCP server in Claude Code:

claude mcp add --transport http blue-agent https://blueagent.dev/api/mcp

The free tools work right away. Paid tools cost from $0.01 per call, settled in USDC on Base 8453. Ask "Is NVDA cheaper on Base or on Robinhood Chain right now?" and the answer comes back with its own Basescan receipt.

Every receipt, score and rating is public.

---

## Notes before posting (not part of the article)

- Section 1 says "is registering". Change it to "is registered as agent #<id>" once ShunTr signs the register tx (`npx tsx scripts/erc8004-register.ts` prints it) and BLUE_AGENT_ID is set. Until then section 3's feedback template is not returned, so do not post section 3 as live before that.
- Do not quote paid-call counts in the article. They are low today. The profile pages show them honestly.
- Media: a 1:1 clip of the stock_signal profile page (trust tile, receipts with Basescan links), then the scores JSON. Prepare it after the text is approved.
