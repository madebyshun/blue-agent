# Rà soát skill/tool Blue Agent — 2026-10-04

**Câu hỏi:** tool nào có giá trị mà API sàn công khai (DexScreener, GeckoTerminal, DefiLlama) không cho, tool nào chỉ bọc lại?
**Cách đo:** đọc code từng handler trong `apps/web/src/app/api/x402/_handlers/` (origin/main `ac988400`), cộng số lượt gọi trọn đời từ `https://blueagent.dev/api/usage`.

## Số đo

- Catalog `AGENT_TOOLS`: **114** tool.
- Lượt gọi trọn đời (x402 + MCP + Hub cộng lại): **234**. **101/119** id có 0 lượt.
  Top: `token-price` 143 · `honeypot-check` 37 · `liquidity-depth` 14 · `gas-tracker` 8 · `blue-registry` 7.
  ⚠️ Bộ đếm KHÔNG gồm Blue Chat (chat chạy tool in-process qua `runInternalTool`, không `incr usage:<id>`), nên số này là cận dưới cho các tool chat dùng.
- Nguồn chết đang bị gọi: Moralis (401, plan paused), Aeon KV (hết hạn từ khi cron tắt 2026-09-05), Etherscan v2 account module trên Base (`txlist`/`tokentx` trả "Free API access is not supported for this chain" với HTTP 200, code nuốt lỗi).

## Phân loại (theo code, không theo mô tả)

| Lớp | Số | Nghĩa |
|---|---|---|
| CORE | 17 | Có verdict/đọc on-chain/registry mà API sàn không có |
| KEEP | 22 | Hữu ích, có tính toán thật, có chồng chéo |
| THIN | ~25 | Chủ yếu chuyển tiếp feed công khai |
| LLM-FLUFF | ~33 | Văn bản/điểm số do LLM sinh, không có dữ liệu thật |
| DEAD | ~17 | Phụ thuộc Moralis/Aeon/arrow đóng băng, hoặc tính năng không bao giờ chạy |

(THIN/FLUFF/DEAD có chồng nhau — vd tool Aeon vừa DEAD vừa FLUFF.)

### CORE — giữ, đây là sản phẩm
Base: `honeypot-check`, `risk-gate`, `contract-trust`, `quick-safety`, `safe-trending`, `b20-inspect`, `key-exposure`, `agent-readiness`, `hood-live`
RH 4663: `rh-rwa-verify`, `rh-token-scan`, `rh-stock-arb`, `rh-stock-swap-quote`, `rh-stock-swap-prepare`, `rh-stock-holdings`, `rh-stock-new-listings`, `rh-stock-beacon-check`

### KEEP — giữ, một số nên gộp
`blue-doctor`, `b20-check`, `liquidity-depth`, `dex-flow`, `lp-analyzer`, `founder-check`, `repo-health`, `token-pick-signal`, `deep-analysis` (verdict hiện do LLM chấm — nên chuyển sang code), `blue-audit` (chỉ khi có địa chỉ), `blue-registry`, `blue-compose`, `rh-stock-token`, `rh-rwa-index`, `rh-stock-quote`, `rh-stock-liquidity`, `rh-stock-movers`, `rh-stock-swap-route`, `rh-stock-pnl` (tên sai: không có PnL), `rh-portfolio-rebalance`, `rh-sector-basket`, `rh-rwa-dca` (calldata thật, lịch thì chết)

### Lỗi trung thực — sửa ngay, không chờ dọn
1. 🔴 `rh-stock-alert` ($0.10) — ghi `rh-alert:*` vào KV nhưng **không code nào đọc key đó**: người mua trả tiền cho alert không bao giờ bắn. Phải chọn: nối vào hệ watches đang chạy, hoặc retire (luật "payment path không sống lâu hơn sản phẩm"). **ShunTr quyết.**
2. 🔴 `base-activity-score` ($0.05) — Moralis chết thì trả **HTTP 200 với score 0 "Newcomer"** → người mua trả đủ tiền cho số giả. Vi phạm "x402 fail loud".
3. `rh-rwa-dca` — `schedule` không có cron đọc `rh-dca:*`; mô tả phải nói rõ chỉ trả lần mua đầu.
4. `rh-stock-pnl` — không có PnL/giá vốn như tên gọi.
5. Etherscan account module chết im lặng → `getWalletSnapshot` trả số đếm transfer rỗng như thể ví không có giao dịch.

### Đề xuất RETIRE (ShunTr quyết — đổi/xoá tên đã publish làm vỡ client)
**DEAD (Moralis):** `wallet-holdings`, `wallet-risk`, `token-distribution`, `base-activity-score`, `whale-tracker`, `whale-copy-signal`, `aml-screen`, `airdrop-check`, `token-alpha` (nửa nguồn chết)
**DEAD (Aeon KV) + LLM:** `roadmap-validator`, `pitch-intelligence`, `fundraise-timing`, `gtm-brief`, `stack-recommender`, `investor-memo`, `community-sentiment`, `thread-intelligence`, `community-growth-playbook`, `multi-agent-workflow`, `launch-simulator-1/2/3`
**DEAD (arrow đóng băng):** `hood-track-record` (giữ làm hồ sơ công khai được, nhưng không còn cập nhật)
**LLM-FLUFF khác:** `b20-analyze` (chuyển cờ activation vào `b20-inspect`), `base-alpha`, `narrative-pulse`, `narrative-position`, `ecosystem-digest`, `market-fit`, `token-launch-readiness`, `competitor-scan`, `protocol-health`, `scam-detector` (bản LLM yếu hơn `quick-safety`), `agent-collab-match`, `agent-score`, `agent-performance`, `builder-deep-dd`, `base-grant-finder`, `grant-evaluator` ($5!), `blue-research`, `blue-simulate`, `blue-deploy`, `rh-stock-report`
**THIN (gọi thẳng API sàn là đủ):** `token-price`*, `pool-scan`, `new-pools`, `gas-tracker`*, `base-pulse`, `blue-stream`, `blue-analytics`, `blue-monitor`, `token-momentum-scanner`, `base-token-scan`, `narrative-scan`, `defi-yield-scan`, `defi-opportunity`, `cross-protocol-yield`, `base-protocol-comparison`, `protocol-risk-monitor`, `rh-stock-ohlc`, `rh-stock-flow`, `rh-stock-holders`, `rh-stock-correlations` (Pearson trên mức giá, sai phương pháp), `rh-stock-search`, `rh-stock-agent-brief`, `rh-bridge-route`, `rh-usdg-route`, `rh-rwa-embed-kit`, `rh-rwa-readme`, `rh-rwa-pricing-kit`

\* `token-price` là tool được gọi nhiều nhất (143) và có ở MCP/ESP32 — THIN nhưng đang có người dùng ⇒ giữ tạm, hoặc gộp vào một tool "token facts" có thêm verdict.

5 lệnh console (`blue-idea/build/audit/ship/raise`) là LLM-only nhưng là nội dung của sản phẩm, không thuộc đợt này.

## Skill thật có giá trị nên build

1. **`pre-trade-check`** — `lib/pre-trade-check.ts` (PASS/WARN/BLOCK: impostor, honeypot, tax, B20 issuer policy, RH oracle gap, pool-không-phải-token) là kiểm tra mạnh nhất repo có, nhưng **không có trong catalog**: chỉ nằm trong `blue_swap_tx`/`blue_send_tx`/`blue_bridge_tx` và route `/api/pretrade-check`. Agent dùng ví khác (Coinbase Agentic Wallets, OpenClaw, ACP) không gọi được nó độc lập. Đây là "lớp an toàn cho agent".
2. **PnL + giá vốn thật** (Base + RH) từ Blockscout transfer logs + lịch sử action đã đối chiếu — chưa ai có, thay `rh-stock-pnl` tên sai.
3. **Approval scanner** — liệt kê allowance đang mở của một ví (logs `Approval` qua Blockscout) + dựng tx revoke chưa ký. `risk-gate` đã decode approve/permit; thiếu nửa "ví này đang hở gì".
4. **Cross-venue spread** cho cổ phiếu token Base ↔ RH — endpoint đã có, chưa thành tool.
5. **Alert bắn thật** — thay `rh-stock-alert` bằng hệ watches đang chạy.

## Gộp cụm trùng (sau khi retire)
- An toàn token: `pre-trade-check` (verdict) + `risk-gate` (calldata) + `contract-trust` (nguồn) — `honeypot-check`/`quick-safety` thành alias.
- RH lookup: `rh-stock-token` ⊃ `rh-stock-quote` + `rh-stock-search`.
- Swap RH: `rh-stock-swap-quote` + `rh-stock-swap-prepare` (+ route bên trong).
