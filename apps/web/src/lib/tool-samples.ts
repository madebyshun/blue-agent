/**
 * tool-samples.ts — a copyable request and the response it buys, per tool.
 *
 * WHY THIS EXISTS. MEASURED 2026-11-13: every one of the 62 payment-gated tools
 * in the catalog warned `no_sample_query` on the directory's own listing check.
 * The 402 body carried a JSON Schema — field names and types — and nothing
 * else: no example value, no example output. An agent deciding whether to spend
 * money had to guess both the value format and the payoff, and guessing is
 * exactly where a caller bounces. This is the cheapest gate to clear: two extra
 * keys in a body we already emit, no new endpoint, no new upstream call.
 *
 * WHAT IS HONEST ABOUT EACH HALF.
 *
 * `provenance: "measured"` — both halves are a RESPONSE-SHAPED TRIM of a real
 * 200 from production, re-read on 2026-11-13. Keys and units are exact; the
 * values are from that one read and will drift. These are the seven $0.00
 * tools, which need no payment to call.
 *
 * `provenance: "shape"` — the KEYS the handler returns, taken from its own
 * `Response.json({...})` with the value types inferred from the source
 * expression, and placeholders where a value cannot be known without paying.
 * Reading a paid tool's real output would mean buying it, so nothing here is
 * a measurement: a caller can size the answer from it, not quote it. Every
 * number, placeholder string and empty array in a "shape" sample says so.
 *
 * WHAT THIS IS NOT.
 *   - Not a second schema. `input` on the 402 body is still the contract; this
 *     is one example that satisfies it.
 *   - Not a promise about a specific call. Values move; keys rarely do.
 *   - Not generated at request time. It is a constant, so it cannot fail, cost
 *     anything, or disagree between two reads of the same 402.
 *
 * The sample inputs use $VIRTUAL on Base and a well-known public wallet —
 * deliberately never the treasury or the owner's own wallet, because these
 * strings are published.
 */

export type SampleProvenance = "measured" | "shape";

export interface ToolSample {
  /** Whether the values below were read from production, or are placeholders. */
  provenance: SampleProvenance;
  /** A body that satisfies the tool's schema. POST it as JSON. */
  input: Record<string, unknown>;
  /** The keys the handler returns, with typed placeholders. */
  output: Record<string, unknown>;
}

export const TOOL_SAMPLES: Record<string, ToolSample> = {

  // ── approval-audit ($0.00)
  "approval-audit": {
    provenance: "measured",
    input: {"wallet": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"},
    output: {
      "tool": "approval-audit",
      "wallet": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
      "chain": "base",
      "chain_id": 8453,
      "grants": [
        {
          "type": "erc20",
          "asset": "0xe2f7b7355a3b0616f237891ff5d34880bc683539",
          "symbol": "CPEPE",
          "spender": "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
          "allowance": "UNLIMITED",
          "unlimited": true
        }
      ],
      "counts": {"live": 32, "block": 0, "warn": 32, "info": 0, "closed_since": 4},
      "unread": [],
      "note": null,
      "checked_at": "2026-11-13T10:22:12.252Z",
      "how_to_use": "Each grant carries an unsigned `revoke` tx {chain_id, to, data, value}; the wallet owner signs it. BLOCK = rev…",
      "data_sources": ["Blockscout getLogs (Approval, ApprovalForAll, Permit2)"]
    },
  },

  // ── base-stock-movers ($0.03)
  "base-stock-movers": {
    provenance: "shape",
    input: {"limit": 5, "min_liquidity_usd": 100000},
    output: {
      "chain": "base",
      "chain_id": 8453,
      "gainers": [
        {
          "ticker": "AAPL",
          "symbol": "AAPLc",
          "name": "Apple Inc.",
          "token": "<0x… the tokenized-stock contract on Base>",
          "change_24h_pct": 0.0,
          "price_usd": 0.0,
          "liquidity_usd": 0.0,
          "volume_24h_usd": 0.0
        }
      ],
      "losers": [
        {
          "ticker": "MSFT",
          "symbol": "MSFTc",
          "name": "Microsoft Corp.",
          "token": "<0x… the tokenized-stock contract on Base>",
          "change_24h_pct": 0.0,
          "price_usd": 0.0,
          "liquidity_usd": 0.0,
          "volume_24h_usd": 0.0
        }
      ],
      "universe": {"listed": 0, "ranked": 0, "below_liquidity_floor": 0, "unread": 0},
      "min_liquidity_usd": 0.0,
      "source": "<upstream name>",
      "note": "<human-readable note>"
    },
  },

  // ── stock-screen ($0.02)
  "stock-screen": {
    provenance: "shape",
    input: {"max_abs_drift_pct": 0.5, "min_liquidity_usd": 10000, "limit": 5},
    output: {
      "tool": "stock-screen",
      "chain": "base",
      "chain_id": 8453,
      "filters": {
        "max_abs_drift_pct": 0.5,
        "min_liquidity_usd": 10000,
        "max_oracle_age_seconds": null,
        "require_can_fire": false
      },
      "universe": {"listed": 9, "read": 9, "passed": 0, "failed_read": []},
      "rows": [
        {
          "ticker": "AAPL",
          "token": "<0x… the tokenized-stock contract on Base>",
          "share_price_usd": 0.0,
          "dex_price_usd": 0.0,
          "drift_pct": 0.0,
          "abs_drift_pct": 0.0,
          "liquidity_usd": 0.0,
          "volume_24h_usd": 0.0,
          "oracle_age_seconds": 0,
          "oracle_is_stale": false,
          "price_in_band": true,
          "can_fire": true,
          "suppressed_reason": null,
          "pool": "https://…"
        }
      ],
      "rejected": [{"ticker": "MSFT", "failed_on": ["drift_over_max"], "drift_pct": 0.0}],
      "ranked_by": "abs_drift_pct, widest first — a ranking, not a recommendation",
      "note": "Facts about nine tokenized stocks, filtered by your own thresholds. A wide drift is as often a broken oracle read as a mispriced pool; read can_fire and suppressed_reason before acting. Not financial advice."
    },
  },

  // ── base-stock-quote ($0.02)
  "base-stock-quote": {
    provenance: "shape",
    input: {"ticker": "AAPL"},
    output: {
      "ticker": "AAPL",
      "symbol": "AAPL",
      "name": "Apple Inc.",
      "token": "<0x… the tokenized-stock contract on Base>",
      "logo": "https://…",
      "chain": "base",
      "chain_id": 8453,
      "explorer": "https://basescan.org",
      "token_url": "https://basescan.org/token/<0x…>",
      "issuance": {
        "minted": true,
        "supply": 0.0,
        "multiplier": 1.0,
        "multiplier_change_pct": 0.0,
        "prospectus": "https://…",
        "source": "totalSupply() and multiplier() on Base 8453; prospectus as base.org links it"
      },
      "corporate_actions": {
        "status": "<one of: the actions Coinbase records for this token, or 'could not be read right now'>",
        "source": "announcement events on the token (Base 8453) + Coinbase's record for each action"
      },
      "dex": {
        "price_usd": 0.0,
        "change_24h_pct": 0.0,
        "liquidity_usd": 0.0,
        "volume_24h_usd": 0.0,
        "pool": "<0x…>",
        "pool_name": "<dex> AAPL/USDC",
        "dex": "<dex name>",
        "source": "GeckoTerminal, deepest pool by liquidity"
      },
      "oracle": {
        "share_price_usd": 0.0,
        "feed_age_seconds": 0,
        "feed_is_stale": false,
        "multiplier": 1.0,
        "drift_pct": 0.0,
        "source": "Chainlink on Base, divided by the token's multiplier()"
      },
      "buy_impact": {
        "status": "<a quoted size, or 'unknown' with a reason>",
        "source": "Aerodrome Quoter on Base, best single USDC pool per size, the deepest pool among them; a router splitting across pools may do better"
      },
      "note": "A stock token tracks a share; it is not the share. Not financial advice.",
      "timestamp": "2026-11-13T10:20:00.000Z"
    },
  },

  // ── blue-doctor ($0.00)
  "blue-doctor": {
    provenance: "measured",
    input: {},
    output: {
      "tool": "blue-doctor",
      "checked_at": "2026-11-13T10:21:48.637Z",
      "summary": "ok",
      "verdict": "Every upstream this check can reach is answering normally. A failure you are seeing is more likely your inputs…",
      "counts": {"probed": 6, "ok": 6, "degraded": 0, "down": 0, "not_probed": 5},
      "upstreams": [
        {
          "name": "base_rpc",
          "powers": "every Base 8453 read: token scans, gas, balances, contract calls",
          "status": "ok",
          "latency_ms": 41,
          "error": null
        }
      ],
      "known_issues": [
        {
          "upstream": "moralis",
          "measured_on": "2026-09-26",
          "detail": "Every endpoint returned HTTP 401 with a paused-plan message. Billing, not an outage, and not a code fault. bas…"
        }
      ],
      "note": "`down` means a request was sent and it failed. `unknown` means no request was sent, and the reason is on the e…"
    },
  },

  // ── blue-registry ($0.05)
  "blue-registry": {
    provenance: "shape",
    input: {"query": "stock quote", "category": "on-chain"},
    output: {
      "tool": "blue-registry",
      "timestamp": "2026-11-13T10:20:00.000Z",
      "data_source": "<upstream name>",
      "totals": {"all": 0, "first_party": 0, "matched": 0},
      "tools": [
        {
          "id": "token-price",
          "name": "Token Price",
          "description": "<what it does, and when to use it>",
          "category": "on-chain",
          "price": "$0.01",
          "source": "first-party",
          "endpoint": "https://blueagent.dev/api/x402/token-price"
        }
      ],
      "tools_truncated": 0,
      "how_to_call": {
        "x402": "GET /api/x402/{id} for payment requirements, sign EIP-3009 USDC on Base (chain 8453), POST with X-Payment header."
      },
      "other_sellers": "<documented value — see description>",
      "open_jobs": [],
      "how_to_deliver": "<human-readable note>"
    },
  },

  // ── contract-trust ($0.15)
  "contract-trust": {
    provenance: "shape",
    input: {"address": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"},
    output: {
      "tool": "contract-trust",
      "timestamp": "2026-11-13T10:20:00.000Z",
      "chain": "base",
      "chainId": 8453,
      "basescan": {
        "verified": false,
        "contractName": null,
        "isProxy": false,
        "url": "https://basescan.org/address/<0x…>"
      },
      "security": {
        "score": null,
        "verified": false,
        "proxy_risk": "<n/a | low | …>",
        "red_flags": [],
        "green_flags": [],
        "attack_vectors": [],
        "known_pattern": "<contract pattern, e.g. EOA>",
        "assessment": "<a sentence>"
      },
      "community": {
        "trust": "<n/a | …>",
        "recognition": "<wallet | …>",
        "degen_flags": [],
        "verdict": "<value>"
      },
      "summary": "<documented value — see description>",
      "summary_model_generated": false,
      "checklist": []
    },
  },

  // ── gas-tracker ($0.01)
  "gas-tracker": {
    provenance: "shape",
    input: {},
    output: {
      "tool": "gas-tracker",
      "chain": "base",
      "chainId": 8453,
      "base_fee_gwei": 0.0,
      "priority_fee_gwei": 0.0,
      "estimated_cost": {
        "simple_transfer_usd": 0.0,
        "erc20_transfer_usd": 0.0,
        "swap_usd": 0.0,
        "contract_deploy_usd": 0.0
      },
      "congestion": "<low | medium | high | unknown>",
      "timestamp": "2026-11-13T10:20:00.000Z"
    },
  },

  // ── honeypot-check ($0.10)
  "honeypot-check": {
    provenance: "shape",
    input: {"token": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"},
    output: {
      "tool": "honeypot-check",
      "timestamp": "2026-11-13T10:20:00.000Z",
      "chain": "base",
      "chainId": 8453,
      "token": {
        "name": "<token name>",
        "symbol": "<TICKER>",
        "decimals": 18,
        "verified": true,
        "liquidityUsd": 0.0,
        "url": "https://basescan.org/address/<0x…>"
      },
      "verdict": "<documented value — see description>",
      "action": "<documented value — see description>",
      "confidence": 0.0,
      "confidence_capped": false,
      "is_honeypot": false,
      "tax_read": "<documented value — see description>",
      "tax_units": "<documented value — see description>",
      "buy_tax": null,
      "sell_tax": null,
      "tax_source": "<where the tax was read, or null>",
      "token_template": null,
      "has_blacklist": null,
      "sell_tax_estimate": "<documented value — see description>",
      "buy_tax_estimate": "<documented value — see description>",
      "red_flags": [],
      "green_flags": [],
      "honeypot_patterns": [],
      "community": {
        "trust": "<n/a | …>",
        "recognition": "<value>",
        "degen_flags": [],
        "verdict": "<value>"
      },
      "assessment": []
    },
  },

  // ── hood-live ($0.00)
  "hood-live": {
    provenance: "measured",
    input: {"chain": "base"},
    output: {
      "tool": "hood-live",
      "as_of": "2026-11-13T10:19:37.844Z",
      "data_age_seconds": 136,
      "is_stale": false,
      "stale_after_seconds": 900,
      "poll_cadence_seconds": 300,
      "chain_filter": "base",
      "market": {"is_open": false, "session": "premarket"},
      "robinhood_coverage": {
        "registry_total": 203,
        "feed_eligible": 35,
        "watched": 24,
        "not_enabled": 11,
        "no_chainlink_feed": 168,
        "errored": 0
      },
      "base_desk": {"status": "live", "count": 9, "unattributed": 0},
      "counts": {
        "returned": 9,
        "returned_robinhood": 0,
        "returned_base": 9,
        "available_robinhood": 24,
        "available_base": 9
      },
      "rows": [
        {
          "ticker": "NVDA",
          "chain": "base",
          "chain_id": 8453,
          "chain_label": "Base",
          "name": "NVIDIA Corporation",
          "contract": "0xb20000000000000000000078ee7ce2fE4908108C"
        }
      ],
      "data_sources": [
        "Blue Hood poll snapshot (Vercel KV) — Chainlink AggregatorV3 oracle + GeckoTerminal/DexScreener pool spot, sto…"
      ],
      "note": "Prices are from the last completed poll cycle, not a fresh quote. Read `data_age_seconds` and `is_stale` befor…",
      "timestamp": "2026-11-13T10:21:53.749Z"
    },
  },

  // ── liquidity-depth ($0.03)
  "liquidity-depth": {
    provenance: "shape",
    input: {"token": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"},
    output: {
      "tool": "liquidity-depth",
      "chain": "base",
      "chainId": 8453,
      "depth": {"impact_1pct_usd": null, "impact_2pct_usd": null, "impact_5pct_usd": null},
      "slippage_estimate": {"size_1k": null, "size_10k": null, "size_100k": null},
      "note": [],
      "dataSource": "<documented value — see description>",
      "timestamp": "2026-11-13T10:20:00.000Z"
    },
  },

  // ── pool-scan ($0.02)
  "pool-scan": {
    provenance: "shape",
    input: {"limit": 5},
    output: {
      "tool": "pool-scan",
      "chain": "base",
      "chain_id": 8453,
      "dedupe": {
        "rule": "one row per subject token, keeping the deepest-liquidity pool; see pool_count",
        "pools_in": 0,
        "rows_out": 0,
        "collapsed_count": 0
      },
      "new_pools_filter": {"min_liquidity_usd": 0, "pools_in": 0, "rows_out": 0},
      "data_source": "<upstream name>",
      "timestamp": "2026-11-13T10:20:00.000Z"
    },
  },

  // ── pre-trade-check ($0.00)
  "pre-trade-check": {
    provenance: "measured",
    input: {
      "token": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b",
      "chain": "base",
      "kind": "swap",
      "sender": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "recipient": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    },
    output: {
      "tool": "pre-trade-check",
      "chain": "base",
      "chain_id": 8453,
      "kind": "swap",
      "token": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b",
      "verdict": "PASS",
      "asset_type": "crypto",
      "label": "VIRTUAL",
      "reasons": [
        {
          "level": "INFO",
          "code": "TAX_CLEAN",
          "text": "Buy/sell tax measured by GoPlus: 0% / 0%, not a honeypot."
        }
      ],
      "checked_at": "2026-11-13T10:22:17.786Z",
      "how_to_use": "BLOCK: do not sign. WARN: sign only after showing the reasons to the user. PASS: no evidence of harm was found…",
      "data_sources": ["Base / Robinhood Chain RPC (eth_getCode, eth_call)"]
    },
  },

  // ── rh-rwa-verify ($0.00)
  "rh-rwa-verify": {
    provenance: "measured",
    input: {"contract": "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", "expected_ticker": "AAPL"},
    output: {
      "tool": "rh-rwa-verify",
      "verdict": "CANONICAL",
      "canonical": true,
      "contract": "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
      "registry": {
        "ticker": "AAPL",
        "name": "Apple Inc.",
        "issuer": "RHJ",
        "kind": "stock",
        "decimals": 18
      },
      "onchain": {
        "name": "Apple • Robinhood Token",
        "symbol": "AAPL",
        "decimals": 18,
        "total_supply": "10039315312410000000000"
      },
      "provenance": {
        "creator": "0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046",
        "expected_deployer": "0x4783C67b63dE2B358Ac5951a7D41F47A38F3C046",
        "deployed_by_rhj": true,
        "checked": true
      },
      "metadata_match": true,
      "warnings": [],
      "network": {
        "chainId": 4663,
        "name": "Robinhood Chain",
        "rpc": "https://rpc.mainnet.chain.robinhood.com",
        "explorer": "https://robinhoodchain.blockscout.com"
      },
      "explorer_url": "https://robinhoodchain.blockscout.com/address/0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9",
      "data_sources": ["on-chain ERC-20 metadata"],
      "timestamp": "2026-11-13T10:26:42.211Z"
    },
  },

  // ── rh-stock-agent-brief ($0.20)
  "rh-stock-agent-brief": {
    provenance: "shape",
    input: {"ticker": "AAPL"},
    output: {
      "tool": "rh-stock-agent-brief",
      "verdict_note": "<documented value — see description>",
      "web_sources": [],
      "risk_flags": [],
      "warnings": [],
      "llm": {
        "provider": "<llm provider>",
        "web_search_used": false,
        "duration_ms": 0,
        "attempts": 0
      },
      "note": "<human-readable note>",
      "data_sources": []
    },
  },

  // ── rh-stock-arb ($0.05)
  "rh-stock-arb": {
    provenance: "shape",
    input: {"ticker": "AAPL"},
    output: {
      "tool": "rh-stock-arb",
      "verdict": "<documented value — see description>",
      "note": "<human-readable note>",
      "data_sources": []
    },
  },

  // ── rh-stock-holders ($0.05)
  "rh-stock-holders": {
    provenance: "shape",
    input: {"ticker": "AAPL", "contract": "0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9", "limit": 5},
    output: {
      "tool": "rh-stock-holders",
      "returned_count": 0,
      "concentration": {
        "top1_pct": 0.0,
        "top10_pct": 0.0,
        "hhi": 0.0,
        "hhi_note": "Herfindahl-Hirschman index over returned holders. 0 = perfectly distributed; 10000 = single holder."
      },
      "note": "<human-readable note>",
      "data_sources": []
    },
  },

  // ── rh-stock-liquidity ($0.05)
  "rh-stock-liquidity": {
    provenance: "shape",
    input: {"ticker": "AAPL"},
    output: {
      "tool": "rh-stock-liquidity",
      "pools": [],
      "data_sources": [],
      "explorer_url": "https://…"
    },
  },

  // ── rh-stock-movers ($0.05)
  "rh-stock-movers": {
    provenance: "shape",
    input: {"limit": 5, "min_tvl_usd": 100000, "min_volume_24h_usd": 50000},
    output: {
      "tool": "rh-stock-movers",
      "gainers": [],
      "losers": [],
      "note": "<human-readable note>",
      "universe": {},
      "anchor_filter": {},
      "data_sources": []
    },
  },

  // ── rh-stock-ohlc ($0.05)
  "rh-stock-ohlc": {
    provenance: "shape",
    input: {"ticker": "AAPL"},
    output: {
      "tool": "rh-stock-ohlc",
      "is_v4_pool_id": 0,
      "pool_url": "https://…",
      "candles_returned": 0,
      "candle_field_meta": {},
      "pool_selection": "<documented value — see description>",
      "price_derivation": "<documented value — see description>",
      "data_sources": []
    },
  },

  // ── rh-stock-quote ($0.03)
  "rh-stock-quote": {
    provenance: "shape",
    input: {"ticker": "AAPL"},
    output: {
      "tool": "rh-stock-quote",
      "source": "<upstream name>",
      "note": "<human-readable note>",
      "data_sources": []
    },
  },

  // ── rh-stock-swap-prepare ($0.05)
  "rh-stock-swap-prepare": {
    provenance: "shape",
    input: {
      "ticker": "AAPL",
      "side": "buy",
      "amount": "1",
      "recipient": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"
    },
    output: {
      "tool": "rh-stock-swap-prepare",
      "denom_in": "<documented value — see description>",
      "quote": {},
      "route": {},
      "calls": [],
      "deadline_unix": 1763000000,
      "notes": []
    },
  },

  // ── rh-stock-swap-quote ($0.05)
  "rh-stock-swap-quote": {
    provenance: "shape",
    input: {"ticker": "AAPL", "side": "buy", "amount": "1"},
    output: {
      "tool": "rh-stock-swap-quote",
      "denom_in": "<documented value — see description>",
      "amount_in": 0,
      "amount_in_base_units": 0,
      "expected_out_base_units": 0,
      "slippage_bps": 0,
      "one_side_usd_used": 0,
      "route": {},
      "execution": {},
      "data_sources": []
    },
  },

  // ── risk-gate ($0.20)
  "risk-gate": {
    provenance: "shape",
    input: {"to": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045"},
    output: {
      "tool": "risk-gate",
      "timestamp": "2026-11-13T10:20:00.000Z",
      "transaction": {},
      "chain": "base",
      "chainId": 8453,
      "target": {},
      "action": "<documented value — see description>",
      "risk_score": 0.0,
      "risk_level": "<documented value — see description>",
      "red_flags": [],
      "attack_vectors": [],
      "aml_signals": [],
      "community": {},
      "model_opinion": {},
      "assessment": "<documented value — see description>"
    },
  },

  // ── safe-trending ($0.15)
  "safe-trending": {
    provenance: "shape",
    input: {"min_liquidity_usd": 100000, "limit": 5},
    output: {
      "tool": "safe-trending",
      "chain": "base",
      "chain_id": 8453,
      "filter": {},
      "counts": {},
      "ranking": "<documented value — see description>",
      "disclaimer": "<human-readable note>",
      "data_source": "<upstream name>",
      "timestamp": "2026-11-13T10:20:00.000Z"
    },
  },

  // ── sign-check ($0.00)
  "sign-check": {
    provenance: "measured",
    input: {
      "chain": "base",
      "from": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      "tx": {"to": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", "value": "1000000"}
    },
    output: {
      "tool": "sign-check",
      "chain": "base",
      "chain_id": 8453,
      "verdict": "PASS",
      "kind": "transaction",
      "summary": ["Sends 0.000000 ETH to 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045."],
      "effects": [
        {
          "direction": "out",
          "asset": "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
          "symbol": "ETH",
          "amount": "0.000000",
          "counterparty": "0xd8da6bf26964af9d7eed9e03e53415d37aa96045"
        }
      ],
      "simulated": true,
      "reasons": [],
      "checked_at": "2026-11-13T10:26:26.375Z",
      "how_to_use": "BLOCK: do not sign. WARN: show the summary and reasons to the user and sign only on an explicit yes. PASS: eve…",
      "data_sources": ["eth_simulateV1 (traceTransfers) on the chain RPC"]
    },
  },

  // ── token-price ($0.01)
  "token-price": {
    provenance: "shape",
    input: {"token": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"},
    output: {
      "tool": "token-price",
      "price_usd": 0.0,
      "change": {},
      "pair": "<documented value — see description>",
      "data_source": "<upstream name>"
    },
  },

  // ── wallet-holdings ($0.02)
  "wallet-holdings": {
    provenance: "shape",
    input: {"address": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"},
    output: {
      "tool": "wallet-holdings",
      "chain": "base",
      "status": "<documented value — see description>",
      "error": {},
      "note": "<human-readable note>",
      "timestamp": "2026-11-13T10:20:00.000Z"
    },
  },

  // ── wallet-risk ($0.05)
  "wallet-risk": {
    provenance: "shape",
    input: {"address": "0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b"},
    output: {
      "tool": "wallet-risk",
      "verdict": "<documented value — see description>",
      "status": "<documented value — see description>",
      "chain_facts": {},
      "error": {},
      "note": "<human-readable note>",
      "timestamp": "2026-11-13T10:20:00.000Z"
    },
  },

  // ── weekend-scorecard ($0.00)
  "weekend-scorecard": {
    provenance: "measured",
    input: {"ticker": "AAPL", "weekends": 4},
    output: {
      "chain": "base",
      "chain_id": 8453,
      "ticker": "AAPL",
      "method": {
        "chain": "base",
        "chain_id": 8453,
        "call_at": "Sunday 22:00 UTC, before the 24/5 Chainlink feed reopens",
        "weekend_move": "Base DEX price ÷ frozen Chainlink price (Friday's last round) − 1",
        "call_threshold_abs_pct": 0.5,
        "call_threshold_why": "the Chainlink B20 feed's own 0.5% deviation step; smaller moves are FLAT and not graded",
        "open": "Chainlink price at the first hourly reading of the next regular session whose round is dated after 09:30 ET, a…",
        "sources": ["Base desk hourly archive (bh:base:series:day:*)"],
        "gate": "hit rate is published only from 30 graded calls; below that: calls, hits and needed"
      },
      "summary": {
        "weekends": 11,
        "rows_graded": 11,
        "calls": 1,
        "hits": 1,
        "ready": false,
        "needed": 30,
        "hit_rate": null,
        "ci95": null,
        "p_value_two_sided": null,
        "dex_nearer": 3,
        "flat_nearer": 8,
        "mean_dex_error_pct": 0.9609,
        "mean_flat_error_pct": 0.7984,
        "by_size": [{"bucket": "0.5–1%", "calls": 1, "hits": 1}]
      },
      "live": null,
      "pending": null,
      "weekends": [
        {
          "friday": "2026-11-06",
          "call_at": "2026-11-08T22:00:46.458Z",
          "source": "archive",
          "rows": [
            {
              "ticker": "AAPL",
              "token": "0xb200000000000000000000C2e324d24d7eEcd1fb",
              "close_usd": 343.05875,
              "close_round_at": 1793995119,
              "dex_usd": 342.52,
              "weekend_move_pct": -0.157
            }
          ],
          "excluded": [],
          "crypto": {
            "btc_pct": -1.7804,
            "eth_pct": -4.8663,
            "from": "2026-11-06T23:00:55.000Z",
            "to": "2026-11-08T22:00:46.458Z"
          }
        }
      ],
      "weekends_total": 11,
      "page": "https://blueagent.dev/markets/weekend"
    },
  },
};

/** The sample for a tool, or undefined when the tool is not in the catalog. */
export function sampleFor(id: string): ToolSample | undefined {
  return TOOL_SAMPLES[id];
}
