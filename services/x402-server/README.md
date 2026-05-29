# x402-server

Blue Agent x402 backend — chạy trên Mac Mini, expose qua Cloudflare Tunnel.

## Kiến trúc

```
x402.bankr.bot  →  Bankr verifies payment  →  Cloudflare Tunnel  →  localhost:3002
```

## Cây file

```
services/x402-server/
├── src/
│   ├── index.ts                  # entry point, Express app
│   ├── routes/
│   │   ├── healthz.ts            # GET /healthz
│   │   └── ecosystem-digest.ts   # GET|POST /ecosystem-digest
│   └── lib/
│       └── llm.ts                # Bankr LLM client + Aeon helpers
├── .env.example
├── com.blueagent.x402server.plist  # launchd (auto-start khi login)
├── package.json
└── tsconfig.json
```

## Setup

```bash
cd services/x402-server
npm install

# Tạo .env từ example
cp .env.example .env
# Điền BANKR_API_KEY vào .env
```

## Chạy local (dev)

```bash
npm run dev
```

Server khởi động ở `http://localhost:3002`.

## Build & start production

```bash
npm run build
npm start
```

## Test endpoints

```bash
# Health check
curl http://localhost:3002/healthz

# Ecosystem digest (không LLM)
curl http://localhost:3002/ecosystem-digest

# Ecosystem digest với focus
curl -X POST http://localhost:3002/ecosystem-digest \
  -H "Content-Type: application/json" \
  -d '{"focus":"AI agents on Base"}'
```

## Mở public tunnel với Cloudflare

### Cài cloudflared

```bash
brew install cloudflare/cloudflare/cloudflared
```

### Chạy tunnel tạm thời (test nhanh)

```bash
cloudflared tunnel --url http://localhost:3002
```

Cloudflare sẽ in ra URL dạng: `https://random-name.trycloudflare.com`

### Tunnel cố định (production)

```bash
# 1. Login
cloudflared tunnel login

# 2. Tạo tunnel
cloudflared tunnel create blue-agent-x402

# 3. Tạo config
mkdir -p ~/.cloudflared
cat > ~/.cloudflared/config.yml << 'EOF'
tunnel: blue-agent-x402
credentials-file: /Users/shun/.cloudflared/<TUNNEL_ID>.json

ingress:
  - hostname: x402.blueagent.dev
    service: http://localhost:3002
  - service: http_status:404
EOF

# 4. Tạo DNS CNAME
cloudflared tunnel route dns blue-agent-x402 x402.blueagent.dev

# 5. Chạy tunnel
cloudflared tunnel run blue-agent-x402
```

### Đăng ký URL với Bankr

Sau khi có public URL, update trong Bankr dashboard hoặc re-deploy handler với URL mới.

## Auto-start với launchd (macOS)

```bash
# 1. Build trước
npm run build

# 2. Tạo thư mục logs
mkdir -p logs

# 3. Đặt plist vào LaunchAgents
cp com.blueagent.x402server.plist ~/Library/LaunchAgents/

# 4. Load service
launchctl load ~/Library/LaunchAgents/com.blueagent.x402server.plist

# Kiểm tra
launchctl list | grep x402server

# Xem logs
tail -f logs/stdout.log
```

### Unload service

```bash
launchctl unload ~/Library/LaunchAgents/com.blueagent.x402server.plist
```

## Thêm route mới

1. Tạo file `src/routes/<tool-name>.ts` theo pattern của `ecosystem-digest.ts`
2. Import và mount vào `src/index.ts`
3. Re-deploy handler trên Bankr trỏ đến URL tunnel mới
