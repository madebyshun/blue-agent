#!/bin/bash
# Register all 40 Blue Hub tools on ERC-8257 ToolRegistry (Base Mainnet)
# Usage: PRIVATE_KEY=0x... bash scripts/register-all-tools.sh
#
# Wallet: 0x62b45ff0ff8620d36a48dd981614fd27fa52a8a2
# Contract: 0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1 (Base)
# Already registered: #43-55 (13 tools from previous session)

set -e

if [ -z "$PRIVATE_KEY" ]; then
  echo "❌  Set PRIVATE_KEY env var first:"
  echo "    export PRIVATE_KEY=0x<your-key>"
  exit 1
fi

BASE_URL="https://blueagent.dev/.well-known/ai-tool"
NETWORK="base"

# All 40 tool IDs
TOOLS=(
  token-pick-signal
  narrative-position
  ecosystem-digest
  market-fit
  token-launch-readiness
  roadmap-validator
  competitor-scan
  pitch-intelligence
  fundraise-timing
  gtm-brief
  stack-recommender
  investor-memo
  token-distribution-plan
  agent-performance
  agent-collab-match
  repo-health
  community-sentiment
  defi-opportunity
  builder-deep-dd
  launch-simulator
  whale-copy-signal
  token-momentum-scanner
  portfolio-rebalancer
  thread-intelligence
  builder-brand-score
  community-growth-playbook
  agent-revenue-optimizer
  agent-token-strategy
  multi-agent-workflow
  base-grant-finder
  base-protocol-comparison
  base-builder-network-match
  wallet-strategy-analyzer
  protocol-risk-monitor
  contract-trust
  blue-idea
  blue-build
  blue-audit
  blue-ship
  blue-raise
)

SUCCESS=0
FAIL=0
SKIP=0

for TOOL in "${TOOLS[@]}"; do
  METADATA_URL="$BASE_URL/$TOOL.json"
  echo ""
  echo "━━━ $TOOL"
  
  # Verify manifest first
  VERIFY=$(npx @opensea/tool-sdk verify "$METADATA_URL" 2>&1)
  if echo "$VERIFY" | grep -q "FAIL\|Error\|error"; then
    echo "  ⚠️  Manifest verify failed — skipping"
    ((FAIL++))
    continue
  fi
  
  echo "  ✓ Manifest verified"
  
  # Register onchain
  RESULT=$(PRIVATE_KEY="$PRIVATE_KEY" npx @opensea/tool-sdk register \
    --metadata "$METADATA_URL" \
    --network "$NETWORK" \
    --wallet-provider private-key \
    --yes \
    2>&1)
  
  if echo "$RESULT" | grep -q "already registered\|AlreadyRegistered"; then
    echo "  ✓ Already registered — skip"
    ((SKIP++))
  elif echo "$RESULT" | grep -q "Transaction\|txHash\|registered\|success"; then
    echo "  ✅ Registered!"
    echo "$RESULT" | grep -E "txHash|tokenId|Tool ID" || true
    ((SUCCESS++))
  else
    echo "  ❌ Failed:"
    echo "$RESULT" | tail -5
    ((FAIL++))
  fi
  
  # Rate limit: wait 3s between txs
  sleep 3
done

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  ✅ Registered : $SUCCESS"
echo "  ✓  Skipped    : $SKIP (already registered)"
echo "  ❌ Failed      : $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
