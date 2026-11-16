# Markets showcase visual upgrade

Base mainnet (8453), 2026-11-16.

## References reviewed

- [Base Markets](https://www.base.org/markets/stocks): prominent summary figures, an expansive primary chart, restrained axes, compact range controls and a useful asset table. The Blue Agent implementation keeps its dark identity and uses these hierarchy principles rather than copying Base's site.
- [Inkling 2 Small on OpenRouter](https://openrouter.ai/thinkingmachines/inkling-2-small:free): model information reviewed as requested. The page describes text/image input and tool calling. No provider integration or inference call was added; product AI calls continue through Virtuals.

## Delivered

- Shared visual language: Blue Agent typography (JetBrains Mono for headings, chrome, charts and numbers; Inter for running prose), electric blue accents, quieter grid lines, rounded chart surfaces, deliberate spacing, contextual KPI labels and navigation across Overview / Oracle drift / Weekend lab / Coverage.
- Markets overview: selectable stock spotlight with hourly, four-hour and daily pool-candle views, date/value tooltips, and a depth ranking of six readable stock pools. The initial four-hour view shows the existing source's available history. Snapshot prices and 24h changes remain separately labeled.
- Drift: diverging premium/discount bars centered on the oracle reference, with signed hover values, tracked-sample counts and poll timestamp.
- Weekend: stacked right/wrong/flat counts for each archived weekend. It publishes counts rather than a percentage for each small weekly cohort. Existing confidence and sample-size gates remain intact. Replay paths break across missing hours.
- Coverage: one issuance-status cell per catalog address, with distinct issued, unissued and unknown/pending states and accessible token labels. The underlying assessment table and source distinctions remain visible.
- Token detail: consistent surfaces, spacing and typography; its header explicitly identifies Robinhood Chain 4663 when viewing that venue.

## Data and verification

All visualizations use existing market snapshots, GeckoTerminal pool candles, the recorded weekend scorecard or the coverage inventory. No illustrative price series, estimated gaps or new collateral/return claims were introduced. Missing history produces an explicit unavailable state. Time gaps in the price/replay series are not connected.

Desktop previews were inspected with actual public snapshots, including 11 recorded weekends, 12 drift rows and the completed 358-address inventory. Local KV fixtures were reconstructed only from those public records for rendering checks; nothing was written to production KV. Hourly/four-hour controls were exercised, and the coverage layout was inspected at 390px width before resetting the viewport. Sources and timestamps remain attached to charts.

Release validation: `npx tsc --noEmit`, all 163 hermetic suites and `npm run verify:build`. Network-only suites remain opt-out under the repository's existing runner. Release status is reported in the delivery message.
