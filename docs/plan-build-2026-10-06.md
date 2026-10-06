# Plan build Blue Agent — 2026-10-06

**Định hướng giữ nguyên:** "AI finance that shows its work" — một vòng 5 tầng
**Nhận thức → Phán đoán → Thẩm quyền → Thực thi → Ghi nhận**, Chat là bề mặt chính, agent đi cùng vòng qua MCP, thiết bị (BlueBot Mac, BlueCube ESP32) là cửa sổ đọc. Non-custodial: user ký mọi giao dịch.

**Luật lọc mọi việc build:** *nó có làm một swap/send/bridge đi qua vòng này an toàn hơn, rõ hơn, hoặc được ghi lại tốt hơn không?* Không thì không build.

**Căn cứ:** `docs/skill-audit-2026-10-04.md` (rà 114 tool + research thị trường), `docs/rebuild-5-tang-2026-09-30.md`, bài 5 tầng 2026-10-01, research agentic trading + loại AI agent (2026-10-04). Thời lượng là **ước tính**.

---

## Quyết định cần ShunTr chốt (chặn các phase)

| # | Câu hỏi | Đề xuất | Chặn |
|---|---|---|---|
| D1 | Giữ "agent không bao giờ tự giao dịch" (A) hay mở tự động có hạn mức (B)? | **A bây giờ.** B để Phase 3, sau khi có lớp an toàn | Phase 3 |
| D2 | Tool đang thu tiền cho thứ không có (Moralis chết, Aeon chết, `rh-stock-alert`): retire hay halt? | **Retire** — luật "payment path không sống lâu hơn sản phẩm". Tool ngoài vòng còn sống: **ẩn**, giữ "Hub không cắt" | Phase 0 |
| D3 | Nới "không build mới" cho 3 skill an toàn (nằm trong vòng, không thêm bề mặt)? | **Có** | Phase 1 |
| D4 | Cho tool giải mã chữ ký vào MCP (slot thứ 20)? | **Có** — agent phải gọi trước khi ký mà không cần được nhắc (luật giữ manifest, mệnh đề b) | Phase 1 |
| D5 | Hạ giá nhóm tool an toàn ($0.10–0.20 → gần thị trường ~$0.01, hoặc free như `pre-trade-check`)? | Có, sau khi đo lại usage có cả Chat | Phase 2 |
| D6 | Tách ví treasury x402 khỏi ví ACP buyer `0x0295…` | Làm trước mọi phí giao dịch | Phase 3 |

---

## Phase 0 — Dọn và đo (tuần này, không build mới)

| Việc | Tầng | Cỡ | Ghi chú |
|---|---|---|---|
| 0.1 Push `chore/skill-audit` (`pre-trade-check` $0.00 + `base-activity-score` fail loud), xác nhận Vercel READY | Phán đoán | đã xong code | Gate đã xanh 2026-10-04; cần `git pull` + gate lại vì main đã đi tiếp |
| 0.2 **Đếm usage cả Chat** — thêm surface `chat` vào `lib/usage-daily.ts`, ghi ở `callHubTool` | Ghi nhận | ≈ 0,5 ngày | Không có số này thì mọi quyết định giữ/bỏ chỉ dựa vào x402+MCP+Hub (234 lượt trọn đời) |
| 0.3 Retire tool thu tiền cho thứ không có (theo D2): `rh-stock-alert`, nhóm Moralis (`wallet-risk`, `token-distribution`, `whale-tracker`, `whale-copy-signal`, `aml-screen`, `airdrop-check`, `token-alpha`), nhóm Aeon (`roadmap-validator`, `pitch-intelligence`, `fundraise-timing`, `gtm-brief`, `stack-recommender`, `investor-memo`, `community-sentiment`, `thread-intelligence`, `community-growth-playbook`, `multi-agent-workflow`, `launch-simulator-1/2/3`) | — | ≈ 1 ngày | Mỗi nhóm 1 commit: route + catalog + giá + link + chat tool. `wallet-holdings`, `base-activity-score` chờ Blockscout (Phase 2) — đã fail loud, không thu tiền |
| 0.4 Ẩn tool ngoài vòng khỏi Chat/`blue_registry` mặc định (founder, narrative LLM, scoring agent, content) | — | ≈ 0,5 ngày | Vẫn gọi được qua `/api/x402/<id>` — đúng quyết định "Hub không cắt" |
| 0.5 Sửa mô tả sai: `rh-rwa-dca` (chỉ trả lần mua đầu), `rh-stock-pnl` (không có PnL), `rh-stock-correlations` (Pearson trên mức giá) | — | ≈ 0,5 ngày | Copy phải nói đúng thứ tool làm |
| 0.6 Việc treo của user: `CONNECTOR_TOKEN_KEY` + redeploy + thử Sign in with Coinbase | Nhận thức | user làm | Connector chỉ đọc |

**Xong Phase 0 khi:** catalog không còn tool nào thu tiền cho output không có nguồn; usage đo được ở cả 4 surface.

---

## Phase 1 — Lớp an toàn trước khi ký (≈ 2–2,5 tuần)

Ba skill, đều là phần còn thiếu của vòng — Phán đoán cho `send`, Thẩm quyền cho chữ ký và quyền đã cấp. Mỗi skill có: hàm trong `lib/`, thẻ/khối trong Chat, field trong response của builder MCP, id catalog.

| Thứ tự | Skill | Tầng | Cỡ | Nguồn dữ liệu (đã đo) | Khác bản miễn phí ở đâu |
|---|---|---|---|---|---|
| 1.1 | **Kiểm tra người nhận** trong `preTradeCheck` cho `kind: send` — địa chỉ giống địa chỉ từng giao dịch (poisoning), người nhận là contract / có 7702 delegation, cờ sanctioned | Phán đoán | ≈ 2–3 ngày | Blockscout lịch sử (Base), RPC `eth_getCode`, GoPlus `address_security` (free, 8453 + 4663) | So với **lịch sử của chính người gửi**; chạy sẵn trong thẻ send và `blue_send_tx`. WARN, không BLOCK, trừ khi có cờ |
| 1.2 | **"Ký cái này sẽ làm gì"** — mô phỏng tx (`eth_simulateV1` + `traceTransfers`) và giải mã chữ ký EIP-712 Permit / Permit2 / 7702 authorization → PASS/WARN/BLOCK bằng code | Thẩm quyền | ≈ 4–5 ngày | `eth_simulateV1` chạy trên `mainnet.base.org` (đo); cần RPC provider cho prod | Không ai trả **verdict** cho chữ ký off-chain; Permit là nhóm thiệt hại lớn nhất trong vụ ≥$1M năm 2025 |
| 1.3 | **Audit quyền ví + revoke tự ký** — ERC-20, NFT `setApprovalForAll`, Permit2, đọc lại `allowance()` sống, 7702 delegation, USD đang hở (tính bằng code), calldata revoke gộp | Thẩm quyền | ≈ 4–5 ngày | Blockscout `getLogs` theo topic, full lịch sử ~1–6 s (đo) | GoPlus free chỉ có list ERC-20 và hụt dữ liệu Base (ví `0x0295…` trả rỗng); revoke đúng câu "chỉ giữ đường để user huỷ và thu hồi" |

**Hiện ở đâu:** Chat (thẻ), Wallet (mục "Quyền đã cấp"), MCP (field trong builder + D4), BlueBot (thông báo khi ví link có approval rủi ro — đọc qua token `read`), BlueCube (một dòng trạng thái, nếu hợp).

**Đo thành công:** số WARN/BLOCK mà 1.1/1.2 bắn ra trên meter công khai (G4), số revoke user ký. Không đo bằng "số tool".

---

## Phase 2 — Dữ liệu thật hơn và ghi nhận tốt hơn (≈ 2 tuần)

| Việc | Tầng | Cỡ | Ghi chú |
|---|---|---|---|
| 2.1 Blockscout thay Moralis (đã chốt D6(c)) → sống lại `wallet-holdings`, `base-activity-score`, `check_wallet` đầy đủ | Nhận thức | ≈ 3–4 ngày | RH Blockscout 403 với script ⇒ RH đọc qua RPC |
| 2.2 Sửa đường mua B20 trên Base qua Aerodrome Slipstream (0x từ chối B20 "legal restrictions") | Thực thi | ≈ 3–4 ngày | Lỗi đang chặn một nửa vòng cổ phiếu token Base |
| 2.3 Alert ra ngoài app: Telegram / webhook / BlueBot push | Ghi nhận | ≈ 2–3 ngày | Dùng hệ watches đang chạy, không dựng hệ thứ hai |
| 2.4 Gộp cụm an toàn: `honeypot-check`, `quick-safety` → alias của `pre-trade-check`; quyết giá theo D5 | Phán đoán | ≈ 1–2 ngày | Đổi tên đã publish = ShunTr quyết; alias giữ client cũ chạy |
| 2.5 Gộp cụm feed trùng (GeckoTerminal trending ×8) còn 1–2 tool có thêm verdict (`safe-trending`, `token-pick-signal`) | Nhận thức | ≈ 1–2 ngày | Bài học ESP32: tool đọc chỉ có giá trị khi trả chain + địa chỉ + kiểm tra |

---

## Phase 3 — Chỉ khi D1 = B: tự động có hạn mức (≥ 3–4 tuần)

Thứ tự bắt buộc, không đảo:
1. D6 tách treasury.
2. Lớp chính sách server: hạn mức theo lệnh/ngày, allowlist token, trần price impact, nút dừng.
3. Lệnh có điều kiện không giữ key (đánh giá CoW trên Base trước Flash).
4. Spend Permissions: automation tự hoàn tất trong hạn mức user ký, vẫn qua `preTradeCheck` + 1.2.

---

## Không build (đã research)

- **PnL / giá vốn** — Zerion bán FIFO PnL $0.01 qua x402, có cả Base và RH; tự làm dễ ra số sai.
- **Spread Base ↔ RH làm tool riêng** — endpoint đã có (`64014c82`).
- **Sanctions / 7702 thành tool riêng** — gộp vào 1.1 và 1.3.
- **Tool chỉ đọc lại DexScreener/GeckoTerminal/DefiLlama** — thiết bị/agent gọi thẳng được.
- **Tool LLM không có dữ liệu** (narrative, founder, scoring agent) — chỉ ẩn, không phát triển thêm.
- **Bề mặt mới** (trang khám phá, app mới), geo gate, đòn bẩy, LP, yield autopilot.

## Phân phối, chạy song song

- Mỗi skill Phase 1 ship → draft tweet theo luật copy (chứng minh bằng receipt, số kèm chain).
- Đăng ký ERC-8004 cho Blue Agent với endpoint thật; liệt kê `pre-trade-check` trên x402 Bazaar.
- BlueBot launch; BlueCube dùng tool của chính Blue Agent.

## Lịch ước tính

| Tuần | Việc |
|---|---|
| 1 | Phase 0 + 1.1 |
| 2 | 1.2 |
| 3 | 1.3 + 2.4 |
| 4–5 | 2.1, 2.2, 2.3, 2.5 |
| sau đó | Phase 3 nếu D1 = B |

---

## Trạng thái — 2026-10-07 (nhánh `chore/skill-audit`, chưa push)

| Task | Trạng thái | Ghi chú |
|---|---|---|
| 0.1 | ✅ code xong | push + kiểm tra Vercel READY là việc của ShunTr |
| 0.2 | ✅ | surface `chat` trong usage meter |
| 0.3 | ✅ | 13 tool Aeon (đang bán thật) + 6 tool đã halt retire → catalog 96 |
| 0.4 | ✅ | 10 tool ngoài vòng ẩn khỏi Chat; `hub_b20_analyze` giữ |
| 0.5 | ✅ | correlations dùng log returns; mô tả `rh-rwa-dca` sửa; `rh-stock-pnl` vốn đã trung thực |
| 0.6 | ⏳ ShunTr | `CONNECTOR_TOKEN_KEY` |
| 1.1 | ✅ live | kiểm tra người nhận trong `preTradeCheck` |
| 1.2 | ✅ live | `sign-check` + MCP slot 20 (`hub_sign_check`) |
| 1.3 | ✅ code, ⚠️ live chưa đủ | `approval-audit` + thẻ Revoke + tab Approvals. Blockscout `module=logs` keyless chặn IP sau ~10 request ⇒ **cần `BLOCKSCOUT_API_KEY` (PRO, free 5 rps)** |
| 2.1 | ✅ live | `wallet-holdings` (checkWallet) + `wallet-risk` (GoPlus + explorer + chain) sống lại |
| 2.2 | ✅ live (simulate) | Base B20 qua Aerodrome Slipstream, địa chỉ đã xác minh on-chain |
| 2.3 | ✅ | alert → Telegram cho ví đã link; `/alerts off|on`. Webhook: chưa (cần research SSRF) |
| 2.4 | ✅ live | `pre_trade` thêm vào honeypot-check + quick-safety (không phá client) |
| 2.5 | ✅ phần Chat | `hub_pool_scan` (MCP) giữ — đổi tên đã publish = ShunTr quyết |

Catalog cuối: **98** (90 paid, 8 free). MCP: **20**.
