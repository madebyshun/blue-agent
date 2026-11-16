# Blue Agent: Stocks Maxxing research and delivery

Research date: 2026-11-16. Network: Base mainnet (8453). Product recommendation, not an eligibility determination.

## Positioning

Enter **Agentic Stock Finance** with an agent that produces auditable stock-market observations: oracle/DEX gaps, coverage limits, corporate-action context and a fixed weekend record. Programmable Stock Markets is a possible infrastructure fit, but the agent workflow is the clearer primary story. These are our positioning judgments, not statements from the organizers.

The [official campaign](https://www.base.org/stocksmaxxing) runs November 5–December 5, advertises $100,000+ in rewards and includes agents that research, earn or trade around tokenized stocks. It does not require launching a token. The [rules](https://www.base.org/stocksmaxxing/rules) require a public X video demo tagging @buildonbase plus the submission form. They allow existing owned code when the new campaign-period work is identified. The campaign page separately describes conditions for existing token projects; check the project's original launch date and the current form before claiming eligibility. Do not assume the Blue Agent token automatically qualifies.

No submission or public post has been made by this implementation.

## Technical findings

- [Base's Stocks API documentation](https://docs.base.org/sdks/tokenized-stocks/overview) distinguishes supply, multipliers and reference values from live execution prices. Its list is paginated; omitted scalar fields and missing NAV data cannot be treated as usable prices. New coverage work should consume all pages and preserve unknown states.
- [Chainlink's Coinbase B20 documentation](https://docs.chain.link/data-feeds/tokenized-equity-feeds/coinbase) describes total-return prices, WAD-scaled multipliers, issuer-driven pauses and 24/5 session coverage. A callable feed can hold an earlier value outside supported sessions. Age alone does not identify a pause reason. Apply the multiplier once and retain both read times and price units.
- Live read of [Base's official catalog](https://www.base.org/api/stocks) returned 358 records during this investigation; the checked-in catalog has 338 verified entries dated November 11. The additional records have not been independently admitted or verified by this change.
- The production drift poller watches 12 explicit registry entries. This is not proof that all other stocks lack a feed, supply or liquidity. Admission needs a fresh per-token assessment.
- [MPRO Lab's own stock page](https://mprolab.io/stocks) already describes pool prices beside Chainlink. A basic gap table is not a strong differentiator by itself. Our proposed difference is the agent-readable, content-addressed evidence record and honest forward evaluation, not a claim of unique DEX data.

## Delivered in this change

1. Drift labels the curated watchlist, observed rows, checked catalog size/date and the fact that the remaining universe is unassessed. The API carries the same coverage and Base-specific poll timestamp.
2. Oracle references carry precise UTC timestamps and distinguish pre-weekend values from rounds updated since the weekend. Neither state claims the cause of a pause.
3. Draft readers attach source inputs and method metadata. Scheduled composition saves the exact text and evidence under a SHA-256 content id before delivery; storage/copy-check failures stop composition. The public evidence page and JSON endpoint are read-only.
4. Live board/weekend drafts reject missing, future-dated or older-than-15-minute stock snapshots. Historical fixed-call and graded drafts remain historical and explicitly labeled.
5. Copy scopes findings to tracked stocks, removes official-close and opening-auction implications, and no longer infers crypto causation. Weekend draft copy includes the observation time.
6. New crypto context uses completed hourly candles only and retains actual candle closing times and prices. Previously saved historical scorecards are not rewritten.

## Next delivery sequence

### Coverage inventory, before adding more graded stocks

Build a bounded scheduled job, not hundreds of RPC/DEX requests on page load. Join the official paginated catalog to on-chain identity by **Base + verified address**, then assess issuance, oracle identity/units, multiplier/pause state, anchored pool, depth, volume and candle activity. Retain assessment timestamps, source failures and reasons. Unknown is not failed. Cross-check addresses on Basescan and the official list before admission.

Publish counts for listed / issued / oracle-readable / pool-readable / observed / admitted-for-grading. Permit an observational row with warnings without adding it to the graded cohort. A new observation must not retroactively change the old cohort or denominator. First measure the actual universe; do not promise 358 actionable markets.

### A fair common-window benchmark

Archive stock pool prices at a fixed Friday instant and at the Sunday call, separately from last oracle references. Compare BTC/ETH over matching completed-candle timestamps and label rounding. Add an independently licensed cash-equity source only if claiming official close/open; otherwise retain the post-open oracle benchmark. Publish absolute errors versus the flat-reference baseline alongside direction and sample counts. Crypto attribution requires a separate method and observations, not a sentence inferred from simultaneous declines.

### Demo and campaign package

Demo: a stock gap → row timestamp and coverage → generated draft → permanent evidence page → fixed Sunday call → later oracle outcome. Include one resumed feed and one missing-data case. Show machine-readable usage through the existing free tools without adding another catalog id just for marketing. Record only features working at demo time, distinguish legacy work from campaign-period changes, and then prepare the video/X/form submission for the owner.

Suggested pitch: **Blue Agent researches tokenized stocks on Base and shows the evidence behind every market observation.** Do not market these pool spots as a production collateral oracle.

## Coverage inventory delivered

- Scheduled `/api/cron/stock-coverage` every ten minutes, at most 12 stocks per invocation, two concurrent assessments. A scan freezes its address universe, refreshes issuer references for each batch, saves progress after each pair, and refreshes a completed catalog after six hours. A full 358-stock pass requires about 30 invocations; it is deliberately not a page-load scan.
- Joins all paginated Coinbase records to the official Base list by address and symbol, then checks identity, supply, multiplier, transfer pause, explorer and anchored indexed pools on Base 8453. RPC chain id must be 8453. Incomplete pagination, mismatched catalogs and unreadable storage cannot silently reset prior progress.
- Public inventory: `/markets/drift/coverage` on the app host; machine-readable JSON: `/api/stocks/coverage`. Main Drift links the new inventory and its progress counters. Missing issuer NAV is explicitly distinct from an absent Chainlink feed. Existing feed mappings come only from verified address-book entries; no ticker-based feed resolution was added.
- Inventory comparisons use issuer NAV and DEX spot in **USD per token**. The multiplier is not divided out a second time. This differs from the legacy desk's share-price presentation and is labeled on the page.
- The fixed 12-stock grading cohort and all historical denominators remain unchanged. New observations are not grading admissions; 72-hour candle checks and independently reviewed price bands remain separate work.

## Validation and release status

- TypeScript and `npm run verify:build` passed. Next emitted SWC lockfile-patching and optional dependency warnings; they did not fail the build.
- All 163 hermetic suites passed; three network/runtime suites remain intentionally excluded by the existing runner. The initial 11 failures were repaired by removing retired-tool promises, correcting shipped metadata and retaining meaningful regression fixtures/sentinels rather than obsolete catalog-size floors. No payment or credit-metering behavior was changed.
- Coverage tests exercise complete pagination, duplicate/malformed pages, outage handling, Base address joins, unknown versus unissued states, USD-per-token arithmetic, cohort isolation, cursor validation, resumable progress, durable-write failure, wrong-chain RPC, budget limits and lock release.
- Read-only live probes at 2026-11-16 07:57 and 08:06 UTC: both official lists returned 358 records. Coinbase published positive supply for 72 and NAV for 12. The first selected 16-stock sample contained the 12 NAV stocks plus four zero-supply records; all passed token identity and Basescan checks. The second sample included two issued stocks without issuer NAV: AMD had a readable anchored pool, while APP had no Base pool indexed in that provider response. Both remained unpriced against a reference, with explicit reasons. RKT and FUN had zero onchain supply. This is not a completed onchain scan of all 358 stocks.
- Local HTTP and browser checks confirmed the inventory table and counts with the live probe report served through an isolated local KV mock: 358 listed, 16 assessed, 342 pending, 12 issued, four unissued and 12 comparable observations. No fixture data was written to production KV. Draft evidence tests also cover save/read, invalid and missing ids and simulated outages.
- Production status is reported in the delivery message. No campaign submission or X post is part of this delivery.
