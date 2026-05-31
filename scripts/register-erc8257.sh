#!/usr/bin/env bash
# register-erc8257.sh — Register Blue Hub tools on ERC-8257 ToolRegistry (Base mainnet)
#
# ToolRegistry: 0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1
#
# Usage:
#   PRIVATE_KEY=0x... bash scripts/register-erc8257.sh [tool-id]
#
# Examples:
#   PRIVATE_KEY=0x... bash scripts/register-erc8257.sh token-pick-signal
#   PRIVATE_KEY=0x... bash scripts/register-erc8257.sh  # registers all tools
#
# Requires:
#   - @opensea/tool-sdk installed: npm i -g @opensea/tool-sdk
#   - PRIVATE_KEY with ETH on Base mainnet for gas
#   - Manifests live at https://blueagent.dev/.well-known/ai-tool/{tool}.json

set -e

BASE_URL="https://blueagent.dev"
RPC_URL="${RPC_URL:-https://mainnet.base.org}"

# Tools to register (start with key ones — can register all later)
KEY_TOOLS=(
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

# If tool-id passed as arg, only register that one
if [ -n "$1" ]; then
  KEY_TOOLS=("$1")
fi

if [ -z "$PRIVATE_KEY" ]; then
  echo "❌ Missing PRIVATE_KEY env var"
  echo "   Usage: PRIVATE_KEY=0x... bash scripts/register-erc8257.sh [tool-id]"
  exit 1
fi

echo "═══ ERC-8257 ToolRegistry Registration ══════════════════"
echo "Registry: 0x265BB2DBFC0A8165C9A1941Eb1372F349baD2cf1"
echo "Network:  Base mainnet"
echo "Tools:    ${#KEY_TOOLS[@]}"
echo "═══════════════════════════════════════════════════════════"

for TOOL in "${KEY_TOOLS[@]}"; do
  MANIFEST_URL="${BASE_URL}/.well-known/ai-tool/${TOOL}.json"

  echo ""
  echo "▶ Registering: ${TOOL}"
  echo "  Manifest: ${MANIFEST_URL}"

  # Step 1: Verify manifest is live and valid
  echo "  [1/3] Verifying manifest..."
  npx @opensea/tool-sdk verify "$MANIFEST_URL" 2>&1 | tail -3

  # Step 2: Register onchain
  echo "  [2/3] Registering onchain..."
  PRIVATE_KEY="$PRIVATE_KEY" RPC_URL="$RPC_URL" \
    npx @opensea/tool-sdk register \
      --metadata "$MANIFEST_URL" \
      --network base \
      --yes \
      2>&1 | tail -5

  echo "  ✓ Done: ${TOOL}"
done

echo ""
echo "═══ Registration Complete ════════════════════════════════"
echo "Inspect any tool:"
echo "  npx @opensea/tool-sdk inspect --tool-id <id> --network base"
echo "═══════════════════════════════════════════════════════════"
