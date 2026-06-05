#!/usr/bin/env bash
# register-erc8257.sh — Register Blue Hub tools on ERC-8257 ToolRegistry (Base mainnet)
#
# ToolRegistry: 0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1
#
# Usage:
#   PRIVATE_KEY=0x... bash scripts/register-erc8257.sh [tool-id]
#
# Examples:
#   PRIVATE_KEY=0x... bash scripts/register-erc8257.sh                    # registers all 64
#   PRIVATE_KEY=0x... bash scripts/register-erc8257.sh honeypot-check     # single tool
#   PRIVATE_KEY=0x... bash scripts/register-erc8257.sh --new-only         # skip 13 already registered
#
# Requires:
#   - @opensea/tool-sdk installed: npm i -g @opensea/tool-sdk
#   - PRIVATE_KEY with ETH on Base mainnet for gas (~0.000055 ETH for 51 new tools)
#   - Manifests live at https://blueagent.dev/.well-known/ai-tool/{tool}.json

set -e

BASE_URL="https://blueagent.dev"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"

# ── Already registered (13) ─────────────────────────────────────────────────
REGISTERED=(
  "token-pick-signal"
  "narrative-position"
  "ecosystem-digest"
  "contract-trust"
  "builder-deep-dd"
  "market-fit"
  "token-launch-readiness"
  "whale-copy-signal"
  "blue-idea"
  "blue-build"
  "blue-audit"
  "blue-ship"
  "blue-raise"
)

# ── All 64 tools ─────────────────────────────────────────────────────────────
ALL_TOOLS=(
  # Intelligence
  "token-pick-signal"
  "narrative-position"
  "ecosystem-digest"
  "market-fit"
  "token-launch-readiness"
  # Builder
  "blue-idea"
  "blue-build"
  "blue-audit"
  "blue-ship"
  "blue-raise"
  "roadmap-validator"
  "competitor-scan"
  "pitch-intelligence"
  "fundraise-timing"
  "gtm-brief"
  "stack-recommender"
  "investor-memo"
  "token-distribution-plan"
  "agent-performance"
  "agent-collab-match"
  "repo-health"
  "community-sentiment"
  "defi-opportunity"
  "builder-deep-dd"
  "launch-simulator"
  "launch-simulator-2"
  "launch-simulator-3"
  "launch-advisor"
  "grant-evaluator"
  "builder-score"
  "agent-score"
  # Trading & Alpha
  "whale-copy-signal"
  "token-momentum-scanner"
  "portfolio-rebalancer"
  # Content
  "thread-intelligence"
  "builder-brand-score"
  "community-growth-playbook"
  # Agent Economy
  "agent-revenue-optimizer"
  "agent-token-strategy"
  "multi-agent-workflow"
  # Base Ecosystem
  "base-grant-finder"
  "base-protocol-comparison"
  "base-builder-network-match"
  # On-chain
  "wallet-strategy-analyzer"
  "protocol-risk-monitor"
  "wallet-pnl"
  "aml-screen"
  "airdrop-check"
  "whale-tracker"
  "dex-flow"
  # Security
  "honeypot-check"
  "risk-gate"
  "deep-analysis"
  "contract-trust"
  "quantum-premium"
  "quantum-batch"
  "quantum-migrate"
  "quantum-timeline"
  "key-exposure"
  # Earn
  "yield-optimizer"
  "lp-analyzer"
  "tax-report"
  # Alerts
  "alert-subscribe"
  "alert-check"
)

# ── New tools only (51) — not yet registered ──────────────────────────────────
NEW_TOOLS=(
  "roadmap-validator"
  "competitor-scan"
  "pitch-intelligence"
  "fundraise-timing"
  "gtm-brief"
  "stack-recommender"
  "investor-memo"
  "token-distribution-plan"
  "agent-performance"
  "agent-collab-match"
  "repo-health"
  "community-sentiment"
  "defi-opportunity"
  "launch-simulator"
  "launch-simulator-2"
  "launch-simulator-3"
  "launch-advisor"
  "grant-evaluator"
  "builder-score"
  "agent-score"
  "token-momentum-scanner"
  "portfolio-rebalancer"
  "thread-intelligence"
  "builder-brand-score"
  "community-growth-playbook"
  "agent-revenue-optimizer"
  "agent-token-strategy"
  "multi-agent-workflow"
  "base-grant-finder"
  "base-protocol-comparison"
  "base-builder-network-match"
  "wallet-strategy-analyzer"
  "protocol-risk-monitor"
  "wallet-pnl"
  "aml-screen"
  "airdrop-check"
  "whale-tracker"
  "dex-flow"
  "honeypot-check"
  "risk-gate"
  "deep-analysis"
  "quantum-premium"
  "quantum-batch"
  "quantum-migrate"
  "quantum-timeline"
  "key-exposure"
  "yield-optimizer"
  "lp-analyzer"
  "tax-report"
  "alert-subscribe"
  "alert-check"
)

# ── Resolve target list ───────────────────────────────────────────────────────
if [ "$1" = "--new-only" ]; then
  TARGET=("${NEW_TOOLS[@]}")
  echo "Mode: new tools only (${#TARGET[@]} tools)"
elif [ -n "$1" ] && [ "$1" != "--all" ]; then
  TARGET=("$1")
  echo "Mode: single tool"
else
  TARGET=("${ALL_TOOLS[@]}")
  echo "Mode: all 64 tools"
fi

if [ -z "$PRIVATE_KEY" ]; then
  echo "❌ Missing PRIVATE_KEY env var"
  echo "   Usage: PRIVATE_KEY=0x... bash scripts/register-erc8257.sh [--new-only | tool-id]"
  exit 1
fi

echo "═══ ERC-8257 ToolRegistry Registration ══════════════════"
echo "Registry: 0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1"
echo "Network:  Base mainnet"
echo "Tools:    ${#TARGET[@]}"
echo "═══════════════════════════════════════════════════════════"

PASS=0
FAIL=0
SKIP=0

for TOOL in "${TARGET[@]}"; do
  MANIFEST_URL="${BASE_URL}/.well-known/ai-tool/${TOOL}.json"

  echo ""
  echo "▶ [${TOOL}]"

  # Verify manifest is reachable
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANIFEST_URL")
  if [ "$HTTP_STATUS" != "200" ]; then
    echo "  ⚠ Manifest not found (HTTP $HTTP_STATUS) — skipping"
    (( SKIP++ )) || true
    continue
  fi

  echo "  Manifest: ✓ ($MANIFEST_URL)"

  # Register onchain via @opensea/tool-sdk
  if PRIVATE_KEY="$PRIVATE_KEY" RPC_URL="$RPC_URL" \
      npx @opensea/tool-sdk register \
        --metadata "$MANIFEST_URL" \
        --network base \
        --yes \
        2>&1 | tail -5; then
    echo "  ✅ Registered: ${TOOL}"
    (( PASS++ )) || true
  else
    echo "  ❌ Failed: ${TOOL}"
    (( FAIL++ )) || true
  fi
done

echo ""
echo "═══ Done ═════════════════════════════════════════════════"
echo "✅ Registered: $PASS"
echo "❌ Failed:     $FAIL"
echo "⚠  Skipped:    $SKIP"
echo "Total:         ${#TARGET[@]}"
echo ""
echo "Verify any tool:"
echo "  npx @opensea/tool-sdk inspect --tool-id <id> --network base"
echo "  https://basescan.org/address/0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1"
echo "═══════════════════════════════════════════════════════════"
