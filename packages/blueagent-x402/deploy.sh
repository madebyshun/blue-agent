#!/bin/bash
set -e

echo "🔵 BlueAgent x402 — Deploying 15 handlers to Bankr x402 Cloud"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

check_env() {
  if [ -z "$BANKR_LLM_KEY" ]; then
    echo "❌ Missing BANKR_LLM_KEY — run: bankr login"
    exit 1
  fi
  echo "✅ Bankr credentials OK"
}

deploy_handler() {
  local name=$1
  local price=$2
  local file="handlers/${name}.ts"

  echo ""
  echo "  Deploying: ${name} (\$${price} USDC)..."
  bankr x402 deploy "$file" \
    --name "blueagent-${name}" \
    --price "$price" \
    --price-currency USDC
  echo "  ✅ ${name} live"
}

check_env

# ── DATA ──────────────────────────────────────────────────────────────
echo ""
echo "📊 DATA"
deploy_handler "whale-tracker"   "0.10"
deploy_handler "dex-flow"        "0.15"
deploy_handler "unlock-alert"    "0.20"

# ── SECURITY ──────────────────────────────────────────────────────────
echo ""
echo "🛡️  SECURITY"
deploy_handler "honeypot-check"  "0.05"
deploy_handler "aml-screen"      "0.25"
deploy_handler "mev-shield"      "0.30"
deploy_handler "phishing-scan"   "0.10"

# ── RESEARCH ──────────────────────────────────────────────────────────
echo ""
echo "🔍 RESEARCH"
deploy_handler "tokenomics-score" "0.50"
deploy_handler "narrative-pulse"  "0.40"
deploy_handler "vc-tracker"       "1.00"
deploy_handler "whitepaper-tldr"  "0.20"

# ── EARN ──────────────────────────────────────────────────────────────
echo ""
echo "💰 EARN"
deploy_handler "yield-optimizer"  "0.15"
deploy_handler "airdrop-check"    "0.10"
deploy_handler "lp-analyzer"      "0.30"
deploy_handler "tax-report"       "2.00"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 All 15 handlers deployed!"
echo ""
echo "Test with:"
echo "  bankr x402 call \"https://x402.bankr.bot/\$TREASURY/honeypot-check\" \\"
echo "    -X POST -d '{\"token\":\"0xf895783b2931c919955e18b5e3343e7c7c456ba3\",\"chain\":\"base\"}' \\"
echo "    -y --max-payment 1 --raw"
