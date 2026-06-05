#!/usr/bin/env bash
# deploy-staking.sh — Deploy BlueMarketStaking to Base mainnet
#
# Prerequisites:
#   curl -L https://foundry.paradigm.xyz | bash && foundryup
#
# Usage:
#   PRIVATE_KEY=0x... BASESCAN_API_KEY=... bash scripts/deploy-staking.sh
#   PRIVATE_KEY=0x... bash scripts/deploy-staking.sh --no-verify    # skip Basescan verify
#
# Addresses (Base mainnet):
#   BLUE: 0xf895783b2931c919955e18b5e3343e7c7c456ba3
#   USDC: 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913

set -e

BLUE="0xf895783b2931c919955e18b5e3343e7c7c456ba3"
USDC="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
RPC="${RPC_URL:-https://mainnet.base.org}"
NO_VERIFY="${1:-}"

if [ -z "$PRIVATE_KEY" ]; then
  echo "❌ Missing PRIVATE_KEY"
  echo "   Usage: PRIVATE_KEY=0x... bash scripts/deploy-staking.sh"
  exit 1
fi

echo "═══ Deploy BlueMarketStaking ════════════════════════════"
echo "Network:  Base mainnet"
echo "BLUE:     $BLUE"
echo "USDC:     $USDC"
echo "═════════════════════════════════════════════════════════"

# Compile
echo ""
echo "▶ Compiling..."
forge build --quiet

# Deploy
echo "▶ Deploying..."
if [ "$NO_VERIFY" = "--no-verify" ] || [ -z "$BASESCAN_API_KEY" ]; then
  DEPLOY_OUT=$(forge create contracts/BlueMarketStaking.sol:BlueMarketStaking \
    --rpc-url "$RPC" \
    --private-key "$PRIVATE_KEY" \
    --constructor-args "$BLUE" "$USDC" \
    --broadcast \
    2>&1)
else
  DEPLOY_OUT=$(forge create contracts/BlueMarketStaking.sol:BlueMarketStaking \
    --rpc-url "$RPC" \
    --private-key "$PRIVATE_KEY" \
    --constructor-args "$BLUE" "$USDC" \
    --broadcast \
    --verify \
    --etherscan-api-key "$BASESCAN_API_KEY" \
    2>&1)
fi

echo "$DEPLOY_OUT"

# Extract deployed address
CONTRACT=$(echo "$DEPLOY_OUT" | grep -oE "Deployed to: 0x[0-9a-fA-F]{40}" | awk '{print $3}')
TX=$(echo "$DEPLOY_OUT" | grep -oE "Transaction hash: 0x[0-9a-fA-F]{64}" | awk '{print $3}')

if [ -z "$CONTRACT" ]; then
  echo "❌ Could not extract contract address from output"
  exit 1
fi

echo ""
echo "═══ Deployed ════════════════════════════════════════════"
echo "Contract:  $CONTRACT"
echo "Tx:        $TX"
echo "Basescan:  https://basescan.org/address/$CONTRACT"
echo ""
echo "Next steps:"
echo "  1. Add to Vercel env: STAKING_CONTRACT=$CONTRACT"
echo "  2. Set yieldDistributor to backend wallet:"
echo "     cast send $CONTRACT 'setYieldDistributor(address)' <BACKEND_WALLET> --rpc-url $RPC --private-key \$PRIVATE_KEY"
echo "  3. Update apps/web/src/lib/staking.ts with contract address"
echo "═════════════════════════════════════════════════════════"
