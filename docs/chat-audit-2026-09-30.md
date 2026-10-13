# Audit Blue Chat — 2026-09-30

- **Phạm vi:** Blue Chat tại `app.blueagent.dev/chat` (route `/app/chat`), backend `apps/web/src/app/api/chat`.
- **Code đã deploy = tree đã commit, HEAD `5bd8c50f`.** Deployment Production `6715135117` báo `success` lúc 2026-09-28T16:30:40Z (`gh api repos/:owner/:repo/deployments?environment=Production`). Trang `app.blueagent.dev/chat` trả `age: 128371`, khớp với lần deploy đó.
- **Phương pháp:** chỉ đọc. Không gọi `/api/chat` trên prod (vì nó chạy LLM và trừ credit), không chạy tool nào dùng LLM, không ký, không broadcast, không commit. Probe live gồm: 4 MCP builder (chỉ trả calldata chưa ký), vài GET trên prod, và `eth_call` vào `mainnet.base.org`.
- **Viết tắt dùng trong bài:**
  - `route.ts` = `apps/web/src/app/api/chat/route.ts` @HEAD
  - `sp` = `apps/web/src/app/api/chat/system-prompt.ts` @HEAD
  - `tc` = `apps/web/src/app/chat/components/ToolCards.tsx` @HEAD
  - `x402` = `apps/web/src/app/api/x402/[tool]/route.ts`
  - `plan` = `docs/plan-2026-09-29.md`
  - `inv` = `docs/inventory-2026-09-29.md`

  Số dòng luôn là số dòng ở HEAD, đọc bằng `git show HEAD:<path>`.
- **Bankr** chỉ xuất hiện ở đây với tư cách đối thủ. Bankr đã bị gỡ khỏi repo (hoàn tất 2026-09-25, tài khoản bị 403-banned), và tài liệu này không đề xuất đưa lại bất kỳ phần nào.
- **Phần local chưa deploy:** `api/flash/`, `lib/flash/`, `FlashTradeCard.tsx` và các sửa chưa commit trong `route.ts`, `sp`, `tc` là việc của người khác. Tất cả được ghi riêng ở mục 6, và audit không sửa file nào trong số đó.
- **Ghi chú chi tiết** (trong scratchpad, sẽ mất khi phiên kết thúc): `inventory.md`, `inventory-verify.md`, `parity.md`, `live-probes.md`, `market.md` trong `/private/tmp/claude-501/-Users-shun-projects-blue-agent/37967086-59ea-407f-b691-1ebb499c9370/scratchpad/chat/`.

---

## 1. Tóm tắt (8 dòng)

1. Chat đã deploy đăng ký **55 tool** (`route.ts:378-1104`) và gửi nguyên schema cho model ở mọi request có tool (`route.ts:2119`). Chia ra: 11 tool local (8 thẻ để user ký + 3 tool đọc phía server), 3 tool free-direct, và 41 tool Hub x402 chỉ đọc, giá 10–2.000 credit mỗi lần gọi. Không tool nào ký phía server.
2. Những việc làm được: swap trên Base (qua 0x), swap trên RH (qua `RobinhoodSwapRouter`), send trên Base/RH, bridge Base↔RH (qua Relay), gửi USDC vào Aave/Morpho (thẻ này "chưa public" nhưng model vẫn gọi được), quản lý B20, đọc Hood arrow. Ngoài ra còn 41 tool đọc và connector MCP.
3. So với 7 tính năng trong tweet của Bankr: **0 CÓ, 3 MỘT PHẦN** (swap cross-chain, vault Morpho, học thành skill), **4 KHÔNG** (long đòn bẩy, LP giữ range, deploy contract trong chat, token omnichain).
4. Lỗi nặng nhất: trường `address` trong body **không được xác thực** (`route.ts:2864, 2888`). Ai cũng có thể tiêu credit của ví người khác, hoặc tạo ví mới để lấy 500 cr/ngày mỗi ví. Có hai cửa: `/api/chat` và `/api/cron/run`.
5. Lý do plan loại "Chat làm sản phẩm" **vẫn đúng trên prod**: có thẻ swap stock token RH, và nút [Review & Sign] của Hood arrow, dù được mô tả là "placeholder", thực ra mở panel trade thật. Code không có geo gate nào. Quy tắc "không tư vấn" chỉ nằm trong prompt, trong khi `hub_token_pick` trả BUY + entry/sizing.
6. Thẻ yield gắn sao cho Morpho với **5,86%**, nhưng con số đó là của vault SIRLOINUSDC. Tiền user ký nạp lại vào vault **gtUSDCp, khoảng 4,43%** (đo 2026-09-30 04:56 UTC).
7. Prompt hứa quá sự thật ở 18 chỗ, ví dụ `/help` gợi ý deploy B20, hay "You can chain tools" trong khi mỗi lượt chỉ có một vòng gọi tool. Scheduled run **đánh rơi thẻ ký**, nên vai "composer" hiện chưa giao được hành động nào.
8. Phần flash-trade local (chưa deploy) thêm lệnh điều kiện trên stock token, cũng không có geo gate. Việc Chat, Scheduled và Flash đi tiếp thế nào là **quyết định của ShunTr**: plan hiện đang đóng băng Chat (`plan:189`, `:602`, `:641`).

---

## 2. Mọi tính năng chat đang deploy

### 2.0 Đường ống request (cái gì chặn cái gì)

- **Rate limit:** 30 tin/phút/IP (`chat: { limit: 30, windowSeconds: 60 }`, `lib/rate-limit.ts:34`). Khi KV lỗi, limiter rơi về bộ đếm in-memory riêng từng instance (`rate-limit.ts:73, 77`).
- **Trừ credit cho tin nhắn:** chỉ khi `if (address && INTERNAL_KEY && /^0x[a-fA-F0-9]{40}$/.test(address))` (`route.ts:2888`). `address` lấy thẳng từ body (`route.ts:2864`), và `route.ts` không có siwe/session/signature nào.
  - Khách (không gửi address) không bị trừ ở server. Quota 100 cr/ngày của khách chỉ nằm trong localStorage (`credits.ts:49`).
- **Khi nào gắn tool:** `hasHubTools = !knowledgeOnly && !freeNoTools && !isE2EEModel` (`route.ts:2982`). Nhưng `isE2EEModel` chỉ xét provider Venice (`route.ts:2962`), nên preset `private` chạy Virtuals vẫn mang tool.
- **Hai pha, và chỉ một vòng tool:**
  - Pha 1 không stream, phát hiện tool, bị cap 1.024 token (`route.ts:2124`).
  - Các tool chạy song song (`route.ts:2242-2250`).
  - Pha 2 **không mang `tools`** (`model: modelId, messages: phase2Msgs, stream: true`, `route.ts:2333`).
  - Hệ quả: không có chuỗi phụ thuộc kiểu "honeypot xong rồi mới swap".
- **Gọi tool Hub:** POST `${BASE_URL}/api/x402/<id>` kèm `X-Blue-Internal` + `X-Blue-User: <address>` (`route.ts:1986-1995`).
  - Tiền tool trừ **trước** khi handler chạy (`x402:315` so với `:360`) và không bao giờ hoàn.
  - Nếu `spend` lỗi không phải do thiếu credit, route "degrade to free bypass" (`x402:334`).
- **Giá:** 1 credit = $0,0005 (`/api/chat/models` → `pricing_basis.credit_usd 0.0005`, probe 04:56:27Z). Credit của tool = giá USD × 2.000.

### 2.1 Preset model (nguồn server: `apps/web/src/app/api/_lib/llm.ts` `VIRTUALS_PRESETS`)

| id | provider | model | credit/tin | tool | web search | bằng chứng | kiểm tra live |
|---|---|---|---|---|---|---|---|
| fast | Virtuals | deepseek-v4-flash | 10 | có | không | llm.ts:438 | `/api/chat/presets` 200 (04:56:25Z) |
| free | Venice | qwen3-5-9b | 0 | KHÔNG (ghim ở server, `route.ts:2916-2921`) | không | llm.ts:448 | có trong presets, `noTools` |
| balanced | Virtuals | claude-sonnet-5 | 50 | có | không | llm.ts:449 | có |
| deep | Virtuals | claude-opus-4-8 | 200 | có | không | llm.ts:450 | có |
| private | Virtuals | e2ee-deepseek-v4-flash | 30 | **CÓ** (`route.ts:2962` chỉ xét Venice) | không | llm.ts:451 | có |
| flash ("Instant") | Virtuals | gemini-2.5-flash | 10 | có | không | llm.ts:459 | có |
| grok | Virtuals | grok-4-20 | 60 | có | **KHÔNG** | llm.ts:460 | có |
| search | Venice | grok-4-3 | 60 | có | **CÓ**, preset duy nhất (`route.ts:2950-2951`) | llm.ts:467 | có, `webSearch` |

Prod đang phục vụ 2 preset Venice. Điều này mâu thuẫn với dòng "Virtuals, and only Virtuals" trong CLAUDE.md, nhưng khớp với memory `project_venice-still-live.md` và comment trong `docs-truth-check.ts`.

### 2.2 Mười một tool local (không đi qua x402, 0 credit tool)

| Tool | Làm gì | Chain | Đọc/Ghi | Ai ký | Credit | Guard | Bằng chứng | Kiểm tra live |
|---|---|---|---|---|---|---|---|---|
| `prepare_yield` | MoveToYieldCard: supply/withdraw USDC vào Aave v3 Pool `0xA238Dd80C259a72e81d7e4664a9801593F98d1c5` hoặc Morpho vault `0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61`; APY lấy từ DefiLlama | Base 8453 + Base Sepolia (mặc định là testnet) | Ghi (thẻ) | User | 0 | Chỉ USDC, 2 venue hardcode. Dispatcher ghi "it is not public yet" (`tc:2573-2575`) nhưng tool vẫn gọi được | `route.ts:380, 1377-1386`; `yield-execution.ts:9, 145` | `/api/yield/rates` + DefiLlama + `eth_call` (04:56Z): **APY hiển thị lấy từ vault khác với vault nhận tiền** (mục 7) |
| `prepare_send` | WalletSendCard: chuyển ERC-20/native, phân giải Basename | Base 8453 / RH 4663, chỉ mainnet (`route.ts:1397`) | Ghi (thẻ) | User. Base có thể gasless qua paymaster (`WalletSendCard.tsx:569`) | 0 | Badge token-trust; kiểm tra số dư on-chain, fail-closed; không sàng lọc người nhận | `route.ts:393, 1387-1403` | Trên Base, calldata được encode ở client (`WalletSendCard.tsx:507`), **không** dùng chung backend với `blue_send_tx`. Chưa probe đường của chat |
| `prepare_swap` | ConvertPanel → BankSwapCard (0x) hoặc BankRhSwapCard | Base 8453 (chuyển được sang RH) | Ghi (thẻ) | User (approve + swap) | 0 | 4 token lớn được curate (`route.ts:1325-1330`), nhưng card nhận mọi địa chỉ 0x (`SwapCard.tsx:107-111`); không gửi slippage nên dùng mặc định của 0x (`swap/quote/route.ts:48`); không kiểm tra honeypot | `route.ts:1074, 1404-1429` | `GET /api/swap/quote` 200 (04:57:16Z): `zeroExFee` 0,15%, `integratorFee null`, route "LunarBase". Phí này **không hiển thị** cho user |
| `robinhood_swap` | ETH↔token (BankRhSwapCard) hoặc token↔token (RobinhoodSwapCard) qua `RobinhoodSwapRouter` `0x3bb0e9E3dB75faDC5f1f8b7D7B9D761Ef15cd23D` | RH 4663 | Ghi (thẻ) | User | 0 | Sàn `amountOutMinimum` 3% (`RhSwapCard.tsx:94`), token↔token 50 bps. Ticker → địa chỉ lấy **pool đầu tiên có tên chứa chuỗi** (`route.ts:1711`). Không honeypot, không geo gate. Stock token giao dịch được | `route.ts:965, 1658-1789` | Không probe. Code-read: chat gửi `amountOutMinimum` (`RobinhoodSwapCard.tsx:299`), đường MCP thì không |
| `robinhood_send` | WalletSendCard trên RH | RH 4663 | Ghi (thẻ) | User | 0 | Regex kiểm tra to/token/amount (`route.ts:1804-1816`) | `route.ts:980, 1790-1830` | Không probe |
| `robinhood_bridge` | BankBridgeCard / RobinhoodBridgeCard qua Relay (`bridge-prepare`) | Base ↔ RH | Ghi (thẻ) | User (approve + deposit ở chain nguồn) | 0 | Relay chịu slippage 2% ở chain đích, có hiện `minimumAmount` (`bridge-prepare/route.ts:176-177`); cảnh báo HIGH_COST khi phí >5% | `route.ts:995, 1831-1868` | `blue_bridge_tx` (cùng backend) 04:55:05Z: ok, USDC → **USDG**, chi phí 6,11%, `HIGH_COST`. `GET bridge-prepare` 200 |
| `hub_b20_manage` | B20ManageCard → mint/burn/pause/policy/role/cap/metadata | Base mainnet / Sepolia | Ghi (thẻ) | User | 0 | Chỉ hiện những hành động mà role on-chain của ví cho phép | `route.ts:1024, 1869-1879`; `tc:1562` | Không probe |
| `hub_hood_arrow` | Đọc arrow Blue Hood từ KV + HoodArrowCard. Nút [Review & Sign] mở **ReviewSignPanel trade stock thật** | Arrow thuộc desk Base hoặc RH; trade **luôn là RH 4663** (`ReviewSignPanel.tsx:44`) | Đọc + Ghi (thẻ) | User | 0 | Slippage 100 bps (`ReviewSignPanel.tsx:164`); nút chỉ xét `arrow.status === "open"` (`HoodArrowCard.tsx:229, 255`), không xét chain | `route.ts:932, 1466-1657`; `HoodArrowCard.tsx:23, 252-260` | Không probe |
| `check_memo` | Tra event Memo của B20 trong một tx | Base / Base Sepolia | Đọc | — | 0 | Không dùng LLM | `route.ts:1037, 1880-1901` | Không probe |
| `check_authorization` | `PolicyRegistry.isAuthorized` | Base / Base Sepolia | Đọc | — | 0 | Không dùng LLM | `route.ts:1049, 1902-1924` | Không probe |
| `check_wallet` | Thẻ holdings | Base + RH (Blockscout, `route.ts:1947-1950`) | Đọc | — | 0 | Bị ép gọi bằng regex khi đã nối ví (`route.ts:2428-2438, 3070-3078`). Moralis đang 401 (`holdings.ts:16`), nên kết quả luôn `partial` | `route.ts:1063, 1925-1979` | Không probe |

Gửi B20 kèm memo không có tool riêng. Nó nằm trong WalletSendCard, chỉ khi token là `B20_USDC` và `NEXT_PUBLIC_B20_ENABLED === "true"` (`lib/orders.ts:26`); giá trị cờ này trên prod chưa rõ. Encoder dùng chung với `b20_encode_payment`. Probe 04:55:31Z trên NVDAc `0xb20000000000000000000078ee7ce2fE4908108C` trả calldata `transferWithMemo` đúng dạng, decimals 8 đọc từ chain.

### 2.3 Ba tool free-direct (0 credit tool; khách cũng gọi được; route không auth, không rate limit)

| Tool | Làm gì | Chain | Đọc/Ghi | Nguồn | Bằng chứng | Kiểm tra live |
|---|---|---|---|---|---|---|
| `hub_token_price` | Giá USD live | base/eth/arb/op/polygon/bsc | Đọc | CoinGecko qua `/api/token-price`, **không phải** handler `token-price` (DexScreener) trong catalog | `route.ts:815, 2000-2012` | Không probe |
| `hub_crypto_rpc` | JSON-RPC thô | Danh mục của Venice (có base, robinhood, eth, testnet) | Đọc theo mô tả, nhưng **không có allowlist method**: `eth_sendRawTransaction` vẫn đi qua | Venice Crypto RPC | `route.ts:847`; `crypto-rpc/route.ts:154, 182` | Không probe |
| `hub_builder_score` | Điểm builder theo X handle | — | Đọc | GitHub + onchain + **LLM** (`builder-score.ts:117`) | `route.ts:569` | Không probe (có LLM). Id không có trong `AGENT_TOOLS`/`HANDLERS` |

### 2.4 Bốn mươi mốt tool Hub x402

Các tool trong nhóm này có chung những đặc điểm sau:
- Chỉ đọc, không ai ký.
- Credit = giá × 2.000, trừ trước khi handler chạy, không hoàn.
- Khách gọi thì nhận `WALLET_REQUIRED` (`x402:339-350`).
- Khai báo tool: `route.ts` (`TOOL_ENDPOINT` ở `:1115-1176`). Giá lấy từ `agent-tools.ts`.

Về kiểm tra live: **không tool nào được gọi**. Hoặc tool đó dùng LLM, hoặc gọi sẽ tốn credit. `hub_risk_gate` và `hub_honeypot` bị bỏ qua đúng vì lý do này: `callLLM` nằm ở `risk-gate.ts:6` và `honeypot-check.ts:29`.

| Tool chat | Catalog id | Credit | Nguồn | Chain | LLM |
|---|---|---|---|---|---|
| hub_token_pick | token-pick-signal | 400 | GeckoTerminal trending/new, chấm điểm bằng code | Base | có |
| hub_narrative | narrative-position | 300 | GeckoTerminal | Base | có |
| hub_narrative_pulse | narrative-pulse | 200 | GeckoTerminal | Base | có |
| hub_whale_signal | whale-copy-signal | 500 | Moralis (đang 401) | Base | có |
| hub_deep_analysis | deep-analysis | 1000 | Etherscan v2 + identity | Base | có |
| hub_honeypot | honeypot-check | 200 | Etherscan v2 + đọc token-tax | Base | có |
| hub_risk_gate | risk-gate | 400 | Etherscan v2 + 2 lượt LLM (phần "AML" là LLM) | Base | có |
| hub_contract_trust | contract-trust | 300 | identity + source Basescan | Base | có |
| hub_key_exposure | key-exposure | 1000 | nonce trên Base RPC + Etherscan | Base | có |
| hub_market_fit | market-fit | 500 | DefiLlama + GeckoTerminal | Base | có |
| hub_competitor_scan | competitor-scan | 400 | DefiLlama | Base | có |
| hub_investor_memo | investor-memo | 700 | Aeon KV (đã hết hạn) | — | có |
| hub_fundraise_timing | fundraise-timing | 400 | Aeon KV | — | có |
| hub_base_grant | base-grant-finder | 400 | danh sách grant được curate | Base | có |
| hub_repo_health | repo-health | 400 | GitHub API | — | có |
| hub_ecosystem | ecosystem-digest | 400 | DefiLlama + GeckoTerminal | Base | có |
| hub_agent_score | agent-score | 700 | GitHub + snapshot onchain | Base | có |
| hub_aml | aml-screen | 500 | Moralis + RPC + Etherscan, "not a sanctions-list check" | Base | có |
| hub_whale_tracker | whale-tracker | 200 | Moralis | Base | có |
| hub_dex_flow | dex-flow | 300 | DexScreener | Base | có (temp 0) |
| hub_builder_dd | builder-deep-dd | 700 | GitHub + Aeon KV | — | có |
| hub_token_momentum | token-momentum-scanner | 400 | GeckoTerminal | Base | có |
| hub_airdrop | airdrop-check | 200 | Moralis + onchain | Base | có |
| blue_monitor | blue-monitor | 400 | DexScreener + Basescan | Base | có |
| blue_registry | blue-registry | 100 | AGENT_TOOLS + KV | — | không |
| blue_research | blue-research | 2000 | DexScreener (tùy chọn) | Base | có |
| blue_compose | blue-compose | 200 | AGENT_TOOLS (chỉ lên kế hoạch) | — | có |
| blue_deploy | blue-deploy | 200 | chỉ LLM (script deploy) | Base | có |
| blue_analytics | blue-analytics | 500 | DexScreener | Base | có |
| blue_simulate | blue-simulate | 300 | chỉ LLM (mô hình kịch bản) | — | có |
| blue_stream | blue-stream | 100 | GeckoTerminal + DefiLlama, có lọc scam | Base hoặc RH | không |
| hub_b20_inspect | b20-inspect | 10 | multicall trên Base RPC | Base | không |
| hub_b20_analyze | b20-analyze | 100 | trạng thái activation on-chain | Base | có |
| hub_defi_opportunity | defi-opportunity | 500 | DefiLlama | Base | có |
| hub_protocol_risk | protocol-risk-monitor | 700 | DefiLlama | Base | có |
| hub_protocol_compare | base-protocol-comparison | 500 | DefiLlama | Base | có |
| hub_token_readiness | token-launch-readiness | 600 | DefiLlama + GT + DexScreener | Base | có |
| hub_gtm | gtm-brief | 500 | Aeon KV (advisory) | — | có |
| hub_stack | stack-recommender | 400 | Aeon KV (advisory) | — | có |
| hub_pitch_intel | pitch-intelligence | 600 | Aeon KV (advisory) | — | có |
| hub_multi_agent | multi-agent-workflow | 500 | Aeon KV (advisory) | — | có |

Công thức audit mà prompt gợi ý (`sp:114`) gồm risk_gate + honeypot + contract_trust + key_exposure, tổng **1.900 cr**. Con số này vượt 500 cr của bucket miễn phí mỗi ngày.

### 2.5 Connector MCP (`mcp__<id>__<tool>`)

- User tự gắn MCP server ở phía client. Server của ta fetch URL do user đưa, kèm header do user đưa (`route.ts:1240-1305`; `mcp-client.ts:179-190`). Tính năng này chỉ có trên những đường có tool (`route.ts:2963`).
- **Preset gắn được:** Blue Hub (`/api/mcp`), Base Docs, DeepWiki, Context7, Hugging Face (không cần auth), GitHub (bearer PAT), và URL tùy chọn.
  - Notion, Linear, Sentry và Stripe **chưa gắn được**: `auth: "oauth"`, "not attachable yet (OAuth flow TBD)" (`connectors.ts:44, 144-177`).
- **Blue Hub:** 18 tool chạy trên `internalX402Headers()` (`mcp/route.ts:222`), 0 credit. `blue_call` cố ý không dùng bypass, nên từ chat chỉ chạy được các id $0.00 (`mcp/route.ts:394-438`).
  - Calldata của `blue_swap_tx`/`blue_send_tx`/`blue_bridge_tx` trả về dạng text, không có thẻ ký (`tc:2656` default → null).
  - `/api/mcp` vốn miễn phí cho mọi người, nên đây không phải lỗ rò riêng của chat.
- **Danh sách tool của connector do client khai** (`route.ts:1253-1285`). Lúc chat, server không gọi `mcpListTools`.
- Output của connector được đóng khung là "untrusted third-party DATA" (`route.ts:3006`).

### 2.6 Tính năng không phải tool

| Tính năng | Làm gì | Bằng chứng | Ghi chú |
|---|---|---|---|
| File đính kèm | text nhúng thẳng; ảnh/PDF gửi dạng `image_url` | `route.ts:2679-2738` | — |
| Memory | 3 chunk Q/A gần nhất lấy từ localStorage | `ChatContext.tsx:619-629, 919-927` | Client gửi lên. Route embedding đã retire |
| `memoryContext` / `pageContext` | Nối vào system prompt | `route.ts:3009-3014` | Client gửi lên |
| `/credits`, `/help` | Chỉ trả kiến thức, không gắn tool | `route.ts:2440-2474` | Có hứa quá sự thật (mục 3) |
| `/skill install owner/repo` | Tải `SKILL.md` từ GitHub, tối đa 6.000 ký tự × 50 skill, nối vào prompt dưới tiêu đề "Installed Skills" | `integrations.ts:175, 232-236, 271`; `route.ts:3003` | **Không** được đóng khung là untrusted, server không giới hạn độ dài |
| Artifact | Code fenced dài hơn 20 dòng thành thẻ. HTML chạy trong iframe `sandbox="allow-scripts allow-popups"`. Solidity có nút "Open in Remix" | `ArtifactCard.tsx:8-10, 110, 124` | Đây là đường "deploy" duy nhất liên quan tới chat: chuyển sang Remix, user tự deploy |
| Share | Link chia sẻ cuộc chat, hết hạn sau 30 ngày | `api/chat/share`; `inv:214` | — |
| Scheduled | Tác vụ nền, ví lấy từ session SIWE; daily/weekly; tối đa 10 tác vụ/ví; prompt ≤2.000 ký tự | `api/chat/schedule/route.ts:1-20`; `scheduled-tasks.ts:70-72, 142`; cron `user-tasks` mỗi 5 phút | Model **không có tool để tạo schedule**. Run đi qua `/api/cron/run` → `/api/chat`, tính tiền cho chủ ví. **Thẻ ký bị bỏ** (mục 7) |
| SOUL.md | Chèn lên đầu mọi prompt | `route.ts:2994` | — |
| Hoàn credit khi lượt trống | Hoàn tiền tin nhắn nếu lượt không trả gì | `route.ts:152-196` | Chỉ áp dụng cho tiền tin nhắn, không cho tiền tool |

---

## 3. Chỗ prompt hứa quá sự thật, và tính năng ẩn

### 3.1 Hứa quá sự thật

| # | Prompt / mô tả nói | Code thật | Bằng chứng |
|---|---|---|---|
| 1 | `/help` gợi ý `"deploy a B20 stablecoin called vUSD"` | Không có tool deploy nào; chính prompt lại nói "YOU CANNOT DEPLOY, LAUNCH OR CREATE A TOKEN" | `route.ts:2465` so với `sp:243` |
| 2 | "Hub tools stay pay-per-call in USDC" | Trong chat, tiền tool trừ vào **credit** qua `X-Blue-User` | `sp:141`; `route.ts:2454`, `1988-1989`; `x402:303-316` |
| 3 | Muốn web search thì "switch to … the Grok or V4 Flash presets" | Cả hai là preset Virtuals, không có search; chỉ preset `search` có | `sp:112`; `llm.ts:438, 460, 467` |
| 4 | Nhắc tới tool `web_search` (chỉ ở nhánh `hasWebSearch`) | Không có schema nào tên đó. Nếu model gọi thì nhận `[Unknown tool: web_search]`. Nhánh còn lại nói đúng là "There is no web_search tool" | `sp:102, 110-111` so với `sp:103`; `route.ts:1982, 2950-2951` |
| 5 | "You can chain tools" | Mỗi lượt chỉ một vòng tool; pha 2 không mang `tools` | `sp:111, 113`; `route.ts:2124, 2333` |
| 6 | `check_wallet` "lists EVERY token … via Moralis" | Moralis 401 từ 2026-09-12; đường dự phòng luôn `partial` | `sp:99`; `holdings.ts:16` |
| 7 | SOUL: "Never give investment advice or price predictions" | `hub_token_pick` kích hoạt bằng "what should I buy", trả "entry point, sizing, and kill criterion" và verdict BUY/WATCH/SKIP. `hub_narrative` trả FRONT-RUN/RIDE/FADE. `hub_whale_signal` nói "worth copying". Skill mặc định in BUY/WATCH/AVOID và INVEST/WATCH/PASS. Không có gate nào trong code | `soul.ts:102`; `route.ts:408, 416, 437`; `token-pick-signal.ts:292`; `integrations.ts:105, 120` |
| 8 | SOUL: "Verified addresses only, from skills/base-addresses.md" | File đó không được nạp vào prompt, và không tool chat nào đọc nó | `soul.ts:90` |
| 9 | Skill mặc định: "114 pay-per-use x402 tools" (`TOOL_COUNT`) | Chat chỉ với tới 41 id x402 + 3 id free-direct | `integrations.ts:39` |
| 10 | `hub_key_exposure`: "backdoor, private key, and ownership risk" | Thực tế là kiểm tra lộ public key dựa trên nonce | `integrations.ts:89`; `route.ts:498` |
| 11 | `hub_aml` là "AML compliance screening"; `hub_risk_gate` có "AML" | Handler tự nói "not a regulatory compliance product and not a sanctions-list check"; phần AML của risk_gate chỉ là một lượt LLM | `route.ts:466, 764`; `aml-screen.ts:123`; `risk-gate.ts:111-118` |
| 12 | `hub_whale_signal` "(Basescan, live)" | Handler đọc Moralis, mà Moralis đang tạm dừng | `route.ts:437`; `whale-copy-signal.ts:2-3` |
| 13 | Rule 6b: "the Virtuals-native launch flow is coming soon" | Không có code nào đứng sau lời hứa này | `sp:291` |
| 14 | Khối B20 nói "live on Base mainnet", rồi ngay sau lại nói "Mainnet is delayed" | Tự mâu thuẫn | `sp:221` so với `sp:262` |
| 15 | "There is no simulate tool on any request" | Có tool tên `blue_simulate` đã đăng ký (mô hình kịch bản, không mô phỏng tx), nên câu tuyệt đối này sai | `sp:237`; `route.ts:916` |
| 16 | `/credits` nói khách có 100/ngày | Server không thực thi; khách không bao giờ bị trừ | `route.ts:2447, 2888` |
| 17 | Khối skill được nối vào **cả khi request không có tool** | Prompt của preset free/E2EE, hoặc prompt dựng lại khi pha 1 lỗi, vẫn nhắc tên `hub_*` qua skill mặc định. Đây chính là dạng lỗi #204/#205 mà `sp:1-50` được viết ra để ngăn | `route.ts:3003` (không có gate) |
| 18 | Hood arrow: nút [Review & Sign] là "placeholder … landing in T-E" | Nút mở panel trade stock RH thật (xem 3.2) | `route.ts:933`; `sp:300`; `HoodArrowCard.tsx:8-11` so với `:23, 252-260` |

### 3.2 Tính năng ẩn (chạy thật nhưng không được mô tả, hoặc được mô tả khác đi)

1. **21 tool không có trong bảng điều phối của prompt:** prepare_yield, hub_defi_opportunity, hub_protocol_risk, hub_protocol_compare, hub_token_readiness, hub_gtm, hub_stack, hub_pitch_intel, hub_multi_agent, hub_agent_score, hub_aml, hub_whale_tracker, hub_airdrop, blue_monitor, blue_registry, blue_research, blue_compose, blue_deploy, blue_analytics, blue_simulate, check_memo. Thêm 4 tool chỉ xuất hiện trong skill mặc định phía client.
   - Hiệu chỉnh: model **vẫn thấy** cả 55 tool qua function schema (`route.ts:2119`), và 8 trong số 21 tool này hiện dạng chip ở tab Tools (`hub-skills.ts`).
   - Lỗi thật nằm ở chỗ rule 11 viết "Only these tools exist. If a capability is not in the list above, you do not have it" (`sp:119`), mâu thuẫn với schema.
2. **`prepare_yield` là thẻ ghi đang sống,** dù dispatcher ghi "not public yet" (`tc:2573-2575`).
3. **Nút [Review & Sign] của `hub_hood_arrow` mở ReviewSignPanel trade RH thật.** Nút chỉ kiểm tra status, không kiểm tra `arrow.chain` (`HoodArrowCard.tsx:229, 255`). Vì vậy một arrow của desk Base cũng sẽ mở một lệnh trade RH theo ticker (đọc code, chưa chạy thử).
4. **`hub_crypto_rpc` nhận mọi method,** kể cả `eth_sendRawTransaction` (`crypto-rpc/route.ts:154, 182`). Prompt chỉ liệt kê các method đọc.
5. **`check_wallet` đọc cả RH** (`route.ts:1947-1950`), trong khi prompt nói chỉ Base.
6. **Send gasless trên Base qua `/api/paymaster`** (`WalletSendCard.tsx:569`), và giao dịch được gắn thêm suffix builder-code ERC-8021 (`WalletSendCard.tsx:562-568`).
7. **Connector Blue Hub cho 18 tool MCP miễn credit** (`mcp/route.ts:222`), trong đó có các builder calldata swap/send/bridge.
8. **Nhánh marker `blue_dca` vẫn còn** (`route.ts:1430-1460`), và DcaCard vẫn được mount (`tc:2568`), dù schema đã rút ngày 2026-09-06 (`route.ts:1086-1105`).
   - Kết quả tool được lưu cùng tin nhắn (`types.ts:15, 47`) và được render lại từ lịch sử (`ChatMessages.tsx:660`). Nếu lịch sử còn giữ kết quả `blue_dca` cũ, thẻ đó sẽ hiện lại dạng sống: POST `/api/dca/create` (`DcaCard.tsx:133`) và approve cho keeper (`DcaCard.tsx:186`).
   - Mức độ: PLAUSIBLE. Chưa kiểm tra lịch sử nào còn lưu kết quả `blue_dca`.
9. **Ký phía server vẫn chạm được từ bề mặt chat.** Khóa keeper DCA = `HMAC-SHA256(KEEPER_MASTER_KEY, purpose:userAddress)` (`lib/dca/keeper.ts:4-5, 31-54`), và `execution.ts` ký `transferFrom`/`approve`/swap/`transfer` bằng khóa này (`:274-279, 304-309, 317, 361-366`). Ngoài ra có ví nạp gas `GAS_TOP_UP_PRIVATE_KEY` (`gas-topup.ts:47, 76-80`).
   - Câu "không tool nào ký phía server" chỉ đúng cho 55 tool, không đúng cho cả bề mặt chat.
10. **`blue_deploy` sinh script deploy và lệnh verify** (`route.ts:906-908`), trong khi prompt cấm xuất Foundry/`forge create` cho yêu cầu deploy token (`sp:243`).
11. **`/skill install` nạp văn bản bên thứ ba vào system prompt như chỉ dẫn** (`route.ts:3003`).
12. **Code chết:**
    - `isInternalCaller` được tính (`route.ts:2875`) nhưng không bao giờ được truyền đi (`route.ts:2248`).
    - `BankClient.tsx:918` gọi `/api/chat`, nhưng `/app/bank` đã bị 301 về `/chat` (`middleware.ts:132, 300`).

---

## 4. So với 7 tính năng trong tweet của Bankr

Kết quả: **0 CÓ / 3 MỘT PHẦN / 4 KHÔNG**.

Cột "Bankr" ghi theo docs của chính Bankr (docs.bankr.bot, đọc ngày 2026-09-30), không phải theo tweet. Bankr chỉ dùng làm đối chiếu và không được đưa lại vào repo.

| # | Tính năng (tweet) | Bankr (theo docs) | Blue Chat (đã deploy) | Bằng chứng phía Blue | Việc cần làm để ngang bằng | Rủi ro custody / pháp lý | Plan: làm sâu hay làm loãng |
|---|---|---|---|---|---|---|---|
| 1 | Swap cross-chain | ĐÃ XÁC MINH: "Cross-Chain Swap, EVM + Solana", định tuyến qua 0x và Relay | **MỘT PHẦN.** Bridge Base↔RH (Relay) và swap trên từng chain là hai thẻ ký riêng; không có swap X ở chain A ra Y ở chain B trong một bước; chỉ có 2 chain | `route.ts:995-1008` (schema không có trường `toToken`); backend đã nhận `toToken` (`bridge-prepare/route.ts:298, 474`); `bridge-pairs.ts:32-36` cố ý chặn đổi tài sản ngầm | Mở `toToken` trong schema chat (giữ nguyên phần công bố `assetChanged`); mở rộng danh sách chain `SUPPORTED` | Vẫn non-custodial (user ký deposit Relay). Nhưng nếu tài sản đích là stock token RH thì lại đúng lý do loại của plan, vì không có geo gate | **Làm loãng.** Đây là tool thực thi mới trên bề mặt đang đóng băng (`plan:189, 602`) |
| 2 | Long có đòn bẩy | ĐÃ XÁC MINH: Hyperliquid và Avantis (tới 75x trên Base, có perp cổ phiếu) | **KHÔNG.** Flash local cũng không phải đòn bẩy, chỉ là lệnh spot có điều kiện | `git grep perp\|leverage\|margin` trên code chat chỉ ra một comment về token budget (`ChatInput.tsx:135`); `lib/flash/client.ts:37`; `api/flash/quote/route.ts:86-87` | Venue perps trên Base, tài sản thế chấp, calldata mở/đóng vị thế, hiển thị giá thanh lý, cảnh báo | Rủi ro pháp lý cao nhất trong 7 mục: phái sinh cho người dùng lẻ, perp cổ phiếu là security-based swap. Tự động giảm đòn bẩy cần keeper, tức là có quyền đứng trên vị thế | **Làm loãng và xung đột** với `plan:185` (không execute/không custody) và `plan:193` |
| 3 | Gửi vào vault Morpho "an toàn nhất" | KHÔNG phải tính năng riêng. Làm qua lệnh gọi "Arbitrary contracts"; docs không định nghĩa "safest" | **MỘT PHẦN, kèm lỗi đang sống.** Chỉ có một vault Morpho hardcode; "an toàn nhất" không được tính; APY hiển thị là của vault khác | `route.ts:380-381`; `tc:1212-1215, 1665, 1745`; `yield-execution.ts:145`; `yield/rates/route.ts:66`; đo 04:56Z: hiển thị SIRLOINUSDC 5,86% (2,75 là reward), còn vault on-chain có `symbol()` = `gtUSDCp`, DefiLlama cho khoảng 4,43% | Lấy dữ liệu vault Morpho (curator, exposure, LLTV, thanh khoản); xếp hạng rủi ro **bằng code**; lấy APY theo địa chỉ vault; dùng lại đường ERC-4626 sẵn có | Non-custodial, không cần keeper. Chữ "an toàn nhất" là một lời khuyên, nên chỉ trình bày dữ kiện và thứ hạng tính bằng code (`soul.ts:102`). USDC lending không dính vấn đề stock token | **Trung tính.** Hợp quy tắc nhất trong 7 mục, nhưng không phải Basis. Lỗi APY cần sửa bất kể có làm tính năng này hay không |
| 4 | LP Uniswap và giữ trong range | CHƯA XÁC MINH: không có dòng LP nào trong bảng tính năng | **KHÔNG.** Không có tool LP trong chat; `lp-analyzer` của catalog chỉ đọc và chưa nối vào chat | `route.ts` (0 lần nhắc `lp-analyzer`); `agent-tools.ts:1345`; V4 PositionManager chỉ dùng khi seed thanh khoản B20HUB (`b20hub/docs/page.tsx:128`) | (a) Calldata mở/đóng/collect cho v3/v4. (b) "Giữ range" cần keeper. (c) Biến thể chỉ báo: schedule kiểm tra "ra khỏi range" rồi báo, user tự ký rebalance | (b) cần custody hoặc quyền operator, và vi phạm `plan:185`. (c) thì non-custodial | (a) và (b) làm loãng. **(c) làm sâu Scheduled**: nó cần nhịp dưới 1 ngày và bộ đánh giá điều kiện, cùng engine mà Basis D28 cần. Scheduler hiện chỉ có daily/weekly (`scheduled-tasks.ts:142`) |
| 5 | Deploy contract | ĐÃ XÁC MINH: "Deploy Contract, EVM", có công tắc tắt | **KHÔNG trong chat, và đó là chủ ý.** Ngoài chat thì có: `/app/b20`, `/app/b20hub/launch` | `sp:243`; `sp:271-287` (tool launch cũ bỏ qua gate activation nên đã bị gỡ); `blue_deploy` chỉ trả text (`route.ts:906`); `B20Client.tsx:933`; artifact "Open in Remix" | Thẻ deploy do user ký, có gate activation, có pipeline compile/verify | Nhà máy token cho người dùng lẻ dễ thu hút scam và rủi ro chứng khoán | **Làm loãng.** Code hiện tại đã chọn "chat không deploy". Riêng dòng `/help` (`route.ts:2465`) cần sửa dù quyết định thế nào |
| 6 | Token omnichain | CHƯA XÁC MINH: 0 kết quả cho "layerzero"/"omnichain" trong khoảng 790 KB docs | **KHÔNG** | `git grep layerzero\|OFT\|ccip\|xERC20\|superchainERC20` chỉ ra CCIP-read cho Basename (`lib/b20/check-authorization.ts:9`, không liên quan) | LayerZero OFT, CCIP CCT hoặc SuperchainERC20, deploy peer và config admin ở từng chain. Chưa rõ B20 (token precompile) có bọc được không, và LZ/CCIP có hỗ trợ RH 4663 không | Ai giữ khóa admin của OFT thì người đó gánh rủi ro custody | **Làm loãng.** Không liên quan tới Basis hay Scheduled |
| 7 | Biến thứ đã học thành skill | XÁC MINH MỘT PHẦN: "Ask Bankr … lets the agent write it" (agent tự viết skill); cài từ GitHub; tối đa 50 skill và 20 MCP server | **MỘT PHẦN.** Có `/skill install` từ GitHub, memory 3 chunk, `blue_compose` lập kế hoạch dạng text. Không có "lưu thành skill" và không có đường nào từ chat tạo schedule | `route.ts:2380, 3003`; `integrations.ts:232-236, 271`; `ChatContext.tsx:619-629`; `route.ts:901`; `plan:61` | Lưu chuỗi tool (id + mẫu tham số) ở server theo ví SIWE. Dạng an toàn nhất: lưu thành **schedule chỉ đọc/báo** | Skill tự viết sẽ mở đường tự đầu độc prompt, vì khối skill không được đóng khung untrusted (`route.ts:3003` so với `:3006`). Replay bước ký tự động sẽ thành custody | **Làm sâu Scheduled, và đây chính là "composer"**, với điều kiện chỉ tạo tác vụ đọc/báo |

---

## 5. Những thứ Blue Chat có mà tweet của Bankr không nói tới

- **User tự ký từng giao dịch trong ví của mình.** Bankr thì dùng ví Privy, khóa không export được, và server của họ ký (docs `faq/wallets.md`). Với từng hành động, mô hình của Blue chặt hơn. Nhưng chính vì thế nó chưa diễn tả được hành động chạy lúc user vắng mặt.
- **Tool an toàn theo yêu cầu:**
  - Các tool: `hub_honeypot` (`route.ts:456`), `hub_risk_gate` (`:465`), `hub_contract_trust` (`:485`), `hub_key_exposure` (`:497`), `hub_aml` (`:763`), `blue_monitor` (`:886`).
  - Hạn chế thứ nhất: chúng **không** tự động chặn trước thẻ swap, vì mỗi lượt chỉ có một vòng tool.
  - Hạn chế thứ hai: `aml-screen` phụ thuộc Moralis, mà Moralis đang 401.
- **Chống giả mạo token:**
  - `lib/wallet/token-trust.ts` đánh dấu các dòng USDC/ETH giả.
  - Schema send/swap từ chối ticker trần (`route.ts:393-405, 1074-1076`).
  - `bridge-pairs` từ chối đổi tài sản ngầm và cảnh báo khi phí trên 5%. Probe đã thấy cảnh báo HIGH_COST 6,11% chạy đúng.
- **Swap trên RH có sàn `amountOutMinimum`.** Chat gửi sàn này (`RobinhoodSwapCard.tsx:299`); đường MCP thì không.
- **Tín hiệu thị trường Blue Hood (`hub_hood_arrow`):** chạy trên cả hai desk, có chain/status/tuổi của arrow, và cấm lấy arrow của chain này thay cho chain kia.
- **Công cụ B20:**
  - `hub_b20_inspect`: multicall, không dùng LLM, 10 cr.
  - `hub_b20_manage`: thẻ ký, lọc theo role on-chain.
  - `check_memo`, `check_authorization`: không dùng LLM.
- **Dữ liệu DeFi lấy từ DefiLlama:** `blue_stream` feed Base/RH (không LLM), `hub_defi_opportunity` / `hub_protocol_risk` / `hub_protocol_compare`.
- **Scheduled phía server:** ký bằng SIWE, có trần 10 tác vụ/ví, bỏ qua lượt bị lỡ, tự dừng khi hết credit.
- **Connector MCP:** được đóng khung là dữ liệu untrusted.
- **Tool tư vấn cho builder:** market_fit, competitor_scan, gtm, stack, pitch_intel…, có nhãn "model-generated".
- **Hoàn credit tin nhắn khi lượt trả về trống.**

### 5.1 Ngược lại: Bankr có (theo docs) mà Blue Chat chưa có

- **Geo gate cho tokenized stock, thực thi bằng code, trên đúng hai venue mà Blue phục vụ (RH stock và B20 trên Base).** Docs của Bankr ghi "not available in the US, UK, sanctioned countries", định vị theo kết nối, hiệu lực 30 ngày, và không đạt thì `/wallet/swap` trả 403. Blue: 0 kết quả khi grep ở HEAD, và 0 trong phần flash local.
- **Lớp policy phía server:** trần $500/24h, $500/tx, allowlist, trần price impact 15%, công tắc pause. Blue không có lớp nào tương đương cho hành động chạy lúc user vắng mặt.
- **Lệnh lặp lại tạo từ chat:** "Agent Command" chạy tối thiểu mỗi 10 phút, tối đa 1.000 lệnh. Blue đã rút DCA (`route.ts:1086`), và Scheduled chỉ có daily/weekly.

---

## 6. Phần flash-trade local, chưa deploy (chỉ mô tả)

**Trạng thái**
- Chưa commit, chưa deploy. Theo `git status`, `api/flash/`, `lib/flash/` và `FlashTradeCard.tsx` là file untracked, còn `route.ts`, `system-prompt.ts` và `ToolCards.tsx` có sửa chưa commit.
- Ba route `/api/flash/*` trả 404 trên prod (`inv:147`).
- Đây là việc của người khác; audit này chỉ đọc.

**Các file**
- `apps/web/src/lib/flash/client.ts`: 144 dòng.
- `apps/web/src/app/api/flash/quote/route.ts`: 101 dòng.
- `apps/web/src/app/api/flash/order/route.ts`: 73 dòng.
- `apps/web/src/app/api/flash/cancel/route.ts`: 28 dòng.
- `apps/web/src/app/chat/components/FlashTradeCard.tsx`: 340 dòng.
- Sửa thêm: +64 dòng trong `route.ts` (tool mới `flash_trade`), 1 rule mới "6g" trong `system-prompt.ts`, +2 dòng trong `ToolCards.tsx`.

**Nó làm gì**
- Thêm chat tool `flash_trade`, được mô tả là "NON-CUSTODIAL advanced order card via Definitive Flash".
- Đặt được lệnh market, limit, stop-loss, take-profit, DCA, TWAP và bracket (`lib/flash/client.ts:37`) trên ticker **tokenized stock**, trên Base hoặc Robinhood Chain.
- Route quote đổi ticker (NVDA/META/GOOGL/AAPL) ra contract theo từng chain, và đối ứng với USDC trên Base hoặc USDG trên RH (`api/flash/quote/route.ts:17-20, 65-82`).
- Lệnh chỉ chạy trong cùng một chain (`contraChain = targetChain`, `:86-87`), nên không cross-chain và không có đòn bẩy.

**Ai ký, ai thực thi, phí**
- User ký typed data EIP-712 `orderTypedData` (`FlashTradeCard.tsx:26, 203`).
- Definitive Flash thực thi và theo dõi lệnh trên hạ tầng của họ (`lib/flash/client.ts:10-13`).
- Server gọi API Flash bằng `FLASH_API_KEY` (`client.ts:85-96`).
- Phí là "promotional 10bps flat". Theo `client.ts`, Flash không có sandbox: "test on prod with small notional".

**Quan hệ với plan:** `plan:602` xếp Chat vào "GIỮ-ĐÓNG BĂNG … không thêm tool", và `plan:641` ghi Flash là "KHÔNG LẬP KẾ HOẠCH … nếu nó merge, xung đột với việc đóng băng chat". Các điểm quan sát được khi đọc code nằm ở mục 7.5.

---

## 7. Lỗi và rủi ro, theo mức độ

Ký hiệu: [ĐO] = đã đo live; [CODE] = đọc code ở HEAD; [PLAUSIBLE] = đường đi có thật nhưng chưa chứng minh chạy được tới cùng.

### 7.1 Cao

1. **`address` không xác thực → tiêu credit của người khác, hoặc cày credit bằng ví mới.** [CODE]
   - `/api/chat` lấy `address` từ body (`route.ts:2864`), trừ tiền theo nó (`:2888`), và truyền nó vào `X-Blue-User` khi gọi tool trả phí (`:1988-1989`).
   - Ledger cấp bucket hằng ngày "to ANY wallet" (`credit-ledger.ts:36`).
   - Cửa thứ hai là `/api/cron/run`: "This route is reachable by anyone" (`cron/run/route.ts:19`), và nó chuyển tiếp mọi `address` đúng định dạng (`:139-147`).
   - Chính `/api/chat/schedule` đã giải thích vì sao schedule phải bị khóa theo SIWE (`schedule/route.ts:8-19`), nhưng hai cửa trên thì không.
   - Plan cũng đã ghi nhận (`plan:420`). Chưa thử end-to-end trên prod.
2. **Đường ghi cho stock token bán lẻ vẫn sống, không có geo gate.** [CODE]
   - `robinhood_swap` cho giao dịch stock token RH.
   - Nút [Review & Sign] của `hub_hood_arrow` mở panel trade thật, dù mô tả gọi nó là placeholder.
   - Grep `x-vercel-ip-country|jurisdiction|geoblock` trên `apps/web/src` @HEAD: không trúng dòng code nào.
   - "Không tư vấn" chỉ nằm trong prompt (`soul.ts:102`), trong khi `hub_token_pick` trả BUY + entry/sizing (`route.ts:408`; `token-pick-signal.ts:292`), và `/pick` trong Scheduled cũng yêu cầu "entry, sizing and kill-criterion" (`cron/run/route.ts:39`).
   - Đây đúng là lý do loại ở `plan:233-234`, và nó vẫn đang ở trên prod.
3. **Ticker RH được đổi thành địa chỉ bằng cách lấy pool đầu tiên có tên chứa chuỗi đó.** [CODE]
   - `if (!poolName.includes(wanted)) continue;` (`route.ts:1711`).
   - Kết quả còn được gắn nhãn bằng chính ticker user gõ (`symbol: wanted`, `:1719`).
   - Điều này vi phạm hard rule #2 ("never resolve a stock token by ticker string"). Cộng với sàn slippage 3% và việc không có kiểm tra honeypot, user có thể mua nhầm token mạo danh.
4. **Thẻ yield hiển thị APY của một vault Morpho khác với vault nhận tiền.** [ĐO 2026-09-30 04:56 UTC]
   - Nguyên nhân: APY được tra theo `llamaProject`, không theo địa chỉ vault (`tc:1745`).
   - Thẻ gắn sao "best rate" 5,86% (SIRLOINUSDC, trong đó 2,75 là reward), trong khi deposit đi vào `0xeE8F4eC5672F09119b96Ab6fB59C27E1b7e44b61`: `symbol()` = gtUSDCp, khoảng $416M, khoảng 4,43%.
   - Tác hại được giảm bớt vì venue mặc định là Aave và mạng mặc định là Sepolia. Nhưng tool vẫn gọi được, dù code ghi "not public yet".
5. **Keeper DCA ký phía server vẫn có thể chạm tới.** [PLAUSIBLE]
   - Executor xác thực bằng `req.headers.has("x-vercel-cron")` hoặc bearer (`cron/dca-executor/route.ts:33-37`). Executor không có trong `vercel.json`, và chưa rõ Vercel có bỏ header `x-vercel-cron` do client gửi vào hay không.
   - `/api/dca/create` không có session, nhận mọi `userAddress`, mọi `buyToken`, và slippage tới 1.000 bps (`dca/create/route.ts:45, 96, 106`).
   - DcaCard có thể hiện lại từ lịch sử chat (3.2 mục 8).
   - Hậu quả nếu chạy được: tiêu allowance còn tồn của người khác vào một token tùy ý với slippage 10%. Tiền vẫn quay về ví user, nên đây là phá giá trị chứ không phải trộm. Cùng mẫu xác thực bằng header này có ở `cron/b20hub-distribute/route.ts:65`.

### 7.2 Trung bình

6. **Giá tính theo `tier`, còn model lấy theo lựa chọn của client.** [CODE]
   - Nhánh Venice nhận `provider/modelId` từ client cho mọi tier không miễn phí (`route.ts:2918-2919`).
   - Nhánh Virtuals: các tier cũ `deepseek`/`venice-deepseek`/`venice-mistral` có giá 10 cr (`credit-pricing.ts:63, 67, 74`), nhưng model rơi về mặc định `anthropic-claude-sonnet-5` (`route.ts:50, 3149`). Tức là dùng Sonnet 5 kèm đủ tool với giá 10 cr thay vì 50.
7. **Khách không bị tính tiền ở server,** với mọi preset kể cả `deep` (Opus). Chỉ có trần 30 tin/phút/IP, và trần này thành per-instance khi KV lỗi (`route.ts:2888`; `rate-limit.ts:73, 77`). [CODE]
8. **Tiền tool trừ trước handler và không hoàn.** Nếu trừ tiền lỗi thì tool chạy miễn phí (`x402:312-316, 333-336, 352-369`). Tiền hoàn trong chat chỉ áp cho tin nhắn. [CODE]
9. **Mỗi lượt chỉ một vòng tool,** nên kiểm tra an toàn không bao giờ chặn được thẻ swap, trong khi prompt nói "You can chain tools" (`route.ts:2333`; `sp:111, 113`). [CODE]
10. **Scheduled run bỏ mất thẻ ký.** `collectRun` chỉ giữ `delta.text` (`cron/run/route.ts:78, 110`), nên một schedule "swap" chỉ để lại câu "Your convert card is above" mà không có thẻ nào. Đây là trở ngại trực tiếp cho vai composer. [CODE]
11. **Guard SSRF của connector yếu.** [CODE, kiểm bằng node]
    - Điều kiện `host === "::1"` không bao giờ khớp, vì `URL.hostname` trả `"[::1]"`.
    - `[::ffff:7f00:1]` lọt qua.
    - `fetch` đi theo redirect.
    - Khách cũng dùng được.
    - Danh sách tool của connector do client khai (`mcp-client.ts:40-58`; `route.ts:1253-1285`).
12. **Skill từ GitHub được nạp vào system prompt như chỉ dẫn,** không đóng khung untrusted, server không giới hạn độ dài: đường prompt-injection (`route.ts:3003` so với `:3006`). [CODE]
13. **Nút trade của Hood arrow không kiểm tra `arrow.chain`,** nên arrow Base mở trade RH theo ticker (`HoodArrowCard.tsx:229, 255`; `ReviewSignPanel.tsx:44, 273`). Chưa rõ hôm nay có arrow Base nào đang `open` không. [CODE]
14. **Preset `private` (E2EE) vẫn mang tool,** nên tham số tool đi qua server của ta (`route.ts:2962`). [CODE]
15. **`hub_crypto_rpc` không auth, không allowlist method.** Nó thành relay broadcast tx đã ký sẵn, dùng key Venice của ta (`crypto-rpc/route.ts:154, 182`). [CODE]
16. **Phí 0,15% của 0x (`zeroExFee`) và nguồn route không hiển thị** trong SwapCard, cũng như trong meta của `blue_swap_tx`. [ĐO 04:57:16Z]

### 7.3 Thấp

17. `/api/paymaster` là proxy CDP mở: không auth, không rate limit, không kiểm tra sender. Giới hạn duy nhất là allowlist trên CDP portal, chưa rõ nội dung (`paymaster/route.ts:10-12`). [CODE]
18. `/api/swap/quote` và `/api/builder-score` không có auth hay rate limit. Người ngoài có thể tiêu quota `ZEROX_API_KEY`, và tiêu LLM miễn phí qua builder-score. [CODE]
19. Các lời hứa quá ở mục 3.1 (18 chỗ). Sửa copy là việc rẻ, nhất là `/help` "deploy a B20" (`route.ts:2465`) và "Grok or V4 Flash" (`sp:112`).
20. MCP (không phải chat): `blue_send_tx` không cảnh báo khi người gửi và người nhận trùng nhau [ĐO 04:55:23Z]; `b20_encode_payment` không assert `isB20` (`mcp/route.ts:331-387`) [CODE].
21. Code chết: `isInternalCaller` (`route.ts:2875`); `BankClient.tsx:918`. [CODE]
22. CLAUDE.md ghi "Virtuals, and only Virtuals", nhưng prod phục vụ 2 preset Venice [ĐO `/api/chat/presets`]. Tài liệu lệch, code thì đúng.

### 7.4 Ngoài phạm vi chat (ShunTr quyết)

23. **Vẫn còn một storefront mang tên BlueAgent đang nhận thanh toán, dù Bankr đã bị gỡ.** [ĐO 2026-09-30, GET không trả tiền]
    - Listing `BankrBot/skills/blueagent` trỏ tới `https://x402.bankr.bot/0xf31f59e7b8b58555f7871f71973a394c8f1bffe5/`. 30/31 id vẫn trả 402, với `payTo` `0x8AEE621035D93Deb3C0C1177fac252dC2dd501a0`. Đây **không** phải ví của BlueAgent; commit `c7432b3a` gọi nó là ví của Bankr.
    - Một số id đã 404 trên blueagent.dev (ví dụ `quantum-premium`, `mev-shield`).
    - Người trả tiền nhận lại gì thì chưa rõ. Theo luật retire ("A payment path must never outlive the product it sells"), đây là một storefront chưa được retire.
    - Tài khoản đó đã bị cấm, nên ai có quyền gỡ listing cũng chưa rõ. **Không trả tiền để thử.**

### 7.5 Phần local chưa deploy (quan sát khi đọc code, không phải review)

24. Route quote nhận **mọi địa chỉ 0x `contract` truyền vào mà không kiểm tra**, dù comment nói "Prefer an explicit verified contract" (`api/flash/quote/route.ts:68-70`).
25. `/api/flash/*` không có auth, không rate limit, nhưng tiêu `FLASH_API_KEY` của server (grep `rateLimit|session|siwe`: 0 kết quả).
26. Không truyền `maxSlippage` (`quote/route.ts:84-95`). Không có geo gate và không có disclaimer (0 kết quả grep).
27. Rule 6g mới ("DCA into AAPL") đứng ngay dưới rule 6f "There is no DCA tool", và mâu thuẫn với câu đã commit "There is NO DCA / recurring-buy capability" (`sp:241`). Nó còn dùng lại số rule "6g" vốn đã retire (`sp:270-287`).
28. `approveTx` có trong kiểu dữ liệu nhưng không được gửi đi đâu; `FlashTradeCard.tsx:58` là chỗ duy nhất nó xuất hiện. Nếu Flash cần approve trước khi khớp lệnh, lệnh có thể được nhận rồi thất bại. Chưa xác minh.

---

## 8. Gợi ý (ShunTr quyết, không phải kết luận)

**Có một điều phải quyết trước tiên.**
- Plan đang đóng băng Chat: "không thêm chat tool" (`plan:189`) và "GIỮ-ĐÓNG BĂNG … không thêm tool" (`plan:602`).
- Nhưng ý định mới là giữ và phát triển cả Chat lẫn Scheduled, với Chat làm "composer" tạo schedule (`plan:61`).
- Mọi gợi ý bên dưới giả định ShunTr gỡ, hoặc định nghĩa lại, lệnh đóng băng này.

### 8.1 Điều kiện tiên quyết (trước khi bán thêm bất cứ thứ gì bằng credit)

- **Ràng `address` vào session SIWE** trên `/api/chat` và `/api/cron/run`, giống cách `/api/chat/schedule` đang làm.
  - Lý do: ledger hiện lấy key theo một địa chỉ không xác thực, và composer tạo ra những lệnh chi tiêu thường trực. `plan:420` đã cấm bán Basis bằng credit cũng vì lý do này.
- **Chặn các đường ghi stock token** (thẻ `robinhood_swap` cho stock, nút trade của Hood arrow) bằng geo gate trong code, hoặc tắt chúng.
  - Lý do: đây là lý do plan loại Chat (`plan:233-234`), và nó vẫn đang sống.

### 8.2 Hợp với vai "composer tạo schedule" và với Basis

| Tính năng | Vì sao hợp |
|---|---|
| **Tool "lưu thành schedule" từ chat** (parity mục 7) | Đây đúng là composer (`plan:61`). Nên chỉ tạo tác vụ đọc/báo, không bao giờ replay bước ký. Nó dùng lại `/api/chat/schedule` sẵn có (SIWE, trần 10 tác vụ) |
| **Nhịp dưới 1 ngày + bộ đánh giá điều kiện + webhook** trong Scheduled | Basis cần đúng thứ này ("theo dõi NVDAc mỗi 5 phút; khi basis vượt p95 … gọi webhook", `plan:61`, D28). Cùng engine đó cũng phục vụ cảnh báo "LP ra khỏi range" (parity mục 4c). Scheduler hiện chỉ có daily/weekly (`scheduled-tasks.ts:142`) |
| **Cho scheduled run trả về output có cấu trúc** thay vì chỉ `delta.text` | Hiện run đánh rơi mọi thẻ (`cron/run/route.ts:78, 110`). Với Basis, output nên là dữ kiện + cảnh báo, không phải thẻ ký gửi người dùng lẻ |
| **Dữ kiện vault Morpho, chỉ dữ kiện, xếp hạng bằng code** (parity mục 3) | Non-custodial, không keeper, không dính stock token, nên hợp quy tắc nhất trong 7 mục. Nhưng nó không phải Basis, nên xếp sau. Lỗi lấy APY theo project cần sửa bất kể có làm hay không |
| **Sửa copy và tính trung thực của prompt** (mục 3.1) | Rẻ, và giảm các câu trả lời bịa. Composer chỉ đáng tin khi prompt mô tả đúng những gì code làm được |
| **Gate an toàn bằng code trước thẻ swap** (ví dụ chạy honeypot phía server trước khi trả marker) | Biến lợi thế "tool an toàn" (mục 5) thành một gate thật, thay vì phụ thuộc vào việc model có gọi hay không. Việc này cần gỡ giới hạn một vòng tool hoặc làm hẳn ở phía server |

### 8.3 Nên tránh

| Tính năng | Vì sao tránh |
|---|---|
| Long có đòn bẩy / perps | Phái sinh cho người dùng lẻ, perp cổ phiếu là security-based swap; tự giảm đòn bẩy cần keeper. Xung đột với `plan:185, 193` |
| Tự rebalance LP (keeper) | Cần custody hoặc quyền operator; lặp lại đúng thất bại của `blue_dca` (`route.ts:1086-1105`) |
| Deploy contract trong chat | Code đã chọn không làm (`sp:243`), và đường launch cũ bị gỡ vì bỏ qua gate activation. Deploy vẫn có sẵn ngoài chat (`/app/b20`) |
| Token omnichain | Không liên quan Basis/Scheduled; ai giữ khóa admin người đó gánh rủi ro; chưa rõ RH 4663 có được hỗ trợ không |
| Swap cross-chain **vào stock token** | Mở rộng đúng phần bị loại khi chưa có geo gate |
| `flash_trade` trên stock token như bản local hiện tại | Không có geo gate, route quote nhận contract chưa kiểm tra, mâu thuẫn prompt về DCA, và `plan:641` đã ghi là xung đột với lệnh đóng băng. Nếu muốn đi tiếp, cần quyết định riêng của ShunTr, cộng geo gate và auth trước |
| Mọi hành động chạy lúc user vắng mặt | Cần một lớp policy (trần, allowlist, pause) mà Blue chưa có. Nếu Blue giữ quyền ký thì đó là custody (`plan:185`) |

---

## 9. Không xác định được, và lý do

| Điều chưa biết | Lý do |
|---|---|
| Hành vi live của từng tool chat | Theo quy tắc audit: không gọi `/api/chat` prod, không gọi tool có LLM |
| Lỗ `address` có khai thác được end-to-end trên prod không | Chỉ đọc code; thử thì phải tiêu credit của ví khác |
| Vercel có bỏ header `x-vercel-cron` do client gửi không; `KEEPER_MASTER_KEY`/`GAS_TOP_UP_PRIVATE_KEY` có được set không; có allowance keeper nào còn tồn không | Không đọc env/secret; không gọi executor |
| Lịch sử chat nào còn lưu kết quả `blue_dca` | Không đọc KV của user |
| Venice/Virtuals xử lý thế nào khi model gọi một tool không có trong schema | Chưa chạy |
| Hôm nay có arrow Base nào đang `open` không | Không đọc KV Hood |
| Moralis còn 401 không; `ZEROX_API_KEY`, `FLASH_API_KEY`, `NEXT_PUBLIC_B20_ENABLED` có được set trên prod không | Không đọc env; không gọi các tool phụ thuộc Moralis |
| Slippage mặc định của 0x khi thẻ không gửi | Comment trong repo nói 1% nhưng chưa xác minh; chat không truyền giá trị này |
| Giới hạn sponsorship của CDP paymaster | Nằm trên CDP portal, không có trong repo |
| Model e2ee của Virtuals có gọi tool được không | Chưa chạy |
| Danh mục network của Venice crypto-RPC | Chưa gọi |
| Danh tính contract Relay `0x4cd00e387622c35bddb9b4c962c136462338bc31`; vì sao deposit id khác `requestId` | Chỉ đọc `eth_getCode` (8.628 byte); chưa xác minh trên Basescan |
| Lỗi APY Morpho đã ảnh hưởng tới khoản nạp thật nào chưa | Không có dữ liệu sử dụng; mặc định là Aave + Sepolia |
| Bankr thật sự ship đủ 7 tính năng không (Morpho "safest", LP range, omnichain) | Docs không có; tweet không có ngày; x.com trả 402 |
| Flash có tự áp geo restriction không; có cần `approveTx` không | Không có trong index `llms.txt` của Flash; chưa chạy |
| Storefront `x402.bankr.bot` của BlueAgent trả gì cho người mua; ai có quyền gỡ | Không trả tiền (cấm); tài khoản đó đã bị cấm |
| ShunTr quyết Chat đóng băng hay phát triển (D1/D28) | Plan và ý định mới đang mâu thuẫn; chỉ ShunTr quyết |
