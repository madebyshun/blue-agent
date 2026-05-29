#!/usr/bin/env bash
# Setup permanent Cloudflare Tunnel for BlueAgent x402 backend
# Run this ONCE after: cloudflared tunnel login

set -e

TUNNEL_NAME="blue-agent-x402"
LOCAL_PORT="3002"
HOSTNAME="x402.blueagent.dev"  # Change if you have a custom domain

echo "🔵 BlueAgent x402 — Permanent Tunnel Setup"
echo ""

# 1. Create tunnel
echo "1. Creating tunnel '$TUNNEL_NAME'..."
if cloudflared tunnel list 2>/dev/null | grep -q "$TUNNEL_NAME"; then
  echo "   ✓ Tunnel '$TUNNEL_NAME' already exists"
  TUNNEL_ID=$(cloudflared tunnel list 2>/dev/null | grep "$TUNNEL_NAME" | awk '{print $1}')
else
  TUNNEL_ID=$(cloudflared tunnel create "$TUNNEL_NAME" 2>/dev/null | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}')
  echo "   ✓ Created tunnel ID: $TUNNEL_ID"
fi

if [ -z "$TUNNEL_ID" ]; then
  echo "   ⚠ Could not determine tunnel ID. Run: cloudflared tunnel list"
  TUNNEL_ID="<your-tunnel-id>"
fi

# 2. Write config
CONFIG_DIR="$HOME/.cloudflared"
mkdir -p "$CONFIG_DIR"

cat > "$CONFIG_DIR/config.yml" << EOF
tunnel: $TUNNEL_NAME
credentials-file: $CONFIG_DIR/$TUNNEL_ID.json

ingress:
  - service: http://localhost:$LOCAL_PORT
EOF

echo "2. Config written to ~/.cloudflared/config.yml"
echo "   Forwarding all traffic → http://localhost:$LOCAL_PORT"

# 3. Show what the tunnel URL will be
echo ""
echo "3. Tunnel URL will be: https://$TUNNEL_NAME.cfargotunnel.com"
echo "   (This URL is stable — it won't change on restart)"
echo ""

# 4. Write launchd plist for auto-start
PLIST_PATH="$HOME/Library/LaunchAgents/com.cloudflare.tunnel.blue-agent.plist"
cat > "$PLIST_PATH" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cloudflare.tunnel.blue-agent</string>

  <key>ProgramArguments</key>
  <array>
    <string>/opt/homebrew/bin/cloudflared</string>
    <string>tunnel</string>
    <string>run</string>
    <string>$TUNNEL_NAME</string>
  </array>

  <key>RunAtLoad</key>
  <true/>

  <key>KeepAlive</key>
  <true/>

  <key>StandardOutPath</key>
  <string>/Users/shun/projects/blue-agent/services/x402-server/logs/tunnel-stdout.log</string>

  <key>StandardErrorPath</key>
  <string>/Users/shun/projects/blue-agent/services/x402-server/logs/tunnel-stderr.log</string>
</dict>
</plist>
EOF

echo "4. LaunchAgent written to $PLIST_PATH"

# 5. Load the service
mkdir -p /Users/shun/projects/blue-agent/services/x402-server/logs
launchctl unload "$PLIST_PATH" 2>/dev/null || true
launchctl load "$PLIST_PATH"
echo "5. Tunnel service started (auto-starts on login)"
echo ""

TUNNEL_URL="https://$TUNNEL_NAME.cfargotunnel.com"
echo "✅ Done! Your permanent tunnel URL is:"
echo "   $TUNNEL_URL"
echo ""
echo "🔑 Update TUNNEL_BASE_URL in Vercel:"
echo "   Go to: https://vercel.com/madebyshuns-projects/blueagent-web-new/settings/environment-variables"
echo "   Key:   TUNNEL_BASE_URL"
echo "   Value: $TUNNEL_URL"
echo ""
echo "   Or run this curl command:"
VERCEL_TOKEN=$(python3 -c "import json; d=json.load(open('/Users/shun/Library/Application Support/com.vercel.cli/auth.json')); print(d.get('token',''))" 2>/dev/null || echo "")
if [ -n "$VERCEL_TOKEN" ]; then
  echo "   curl -X DELETE 'https://api.vercel.com/v10/projects/prj_zHBghOI8Ym6D6RDPPWJRimbjtzUL/env/0Vx60P1sTSlcOOI2?teamId=team_IOe8DkqrIgqBK4V1QaQV0yGK' -H 'Authorization: Bearer $VERCEL_TOKEN'"
  echo "   curl -X POST 'https://api.vercel.com/v10/projects/prj_zHBghOI8Ym6D6RDPPWJRimbjtzUL/env?teamId=team_IOe8DkqrIgqBK4V1QaQV0yGK' -H 'Authorization: Bearer $VERCEL_TOKEN' -H 'Content-Type: application/json' -d '{\"key\":\"TUNNEL_BASE_URL\",\"value\":\"$TUNNEL_URL\",\"type\":\"plain\",\"target\":[\"production\",\"preview\"]}'"
fi
