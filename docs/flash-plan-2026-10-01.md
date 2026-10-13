# Plan tích hợp Flash (Definitive) — 2026-10-01

**Căn cứ:**
- Tài liệu Flash, đọc ngày 2026-10-01 từ `flash.definitive.fi/docs/llms-full.txt` (262 KB).
- Trao đổi với Definitive ngày 2026-09-28 (Jai, Daphne, Carlos).
- Code dở trong checkout chính (`main`, chưa commit, viết ngày 2026-09-28).
- Code HEAD `174f1bd2`.

Số nào chưa đo thì ghi **ước tính**.

---

## 0. Tóm tắt

**Flash là gì.** API giao dịch nâng cao, non-custodial. Hỗ trợ các loại lệnh market, limit, stop, stop-loss, take-profit, TWAP và bracket (TP/SL gắn vào một lệnh vào). Có cả **Base 8453 và Robinhood Chain 4663**, cùng 11 chain EVM khác và Solana.

**Giá trị cho BlueAgent.** Lệnh chờ chạy **khi người dùng offline**. Automation hiện nay chỉ chuẩn bị sẵn card trade, nên người dùng phải có mặt để ký (`lib/watches`, "it never trades on its own"). Với Flash, người dùng ký trước **một lần**. Flash giữ lệnh off-chain và khớp đúng lúc điều kiện xảy ra, tiền nằm trong ví cho tới khi khớp. Đây là phần thiếu lớn nhất của tầng Thực thi.

**Use case ban đầu đã bỏ.** Trong tin nhắn ngày 28/09, use case là "Hood flag drift → đặt stop-loss". Arrow đã **đóng băng từ 2026-09-30** (`ARROWS_FROZEN`), nên plan này không dựa vào arrow.

**Đề xuất:**
- Không merge code dở như hiện tại. Mục 3 liệt kê các chỗ sai so với tài liệu và thiếu so với kiến trúc 5 tầng.
- Viết lại trên branch `feat/flash` cắt từ `main`, theo 3 phase ở mục 5.
- Phase 1 khoảng **2–3 ngày** (ước tính).

---

## 1. Fact về Flash (từ tài liệu, 2026-10-01)

| Hạng mục | Fact |
|---|---|
| Chain | Base và Robinhood Chain đều có. Cross-chain chỉ áp dụng cho lệnh `market`. |
| Luồng EVM | `POST /quote` → (approve nếu có `evm.approveTx`) → ký EIP-712 `evm.orderTypedData` → `POST /order` → `orderId` |
| Non-custodial | **Approve một lần cho mỗi token** (mặc định là **unlimited**). **Ký riêng từng lệnh**: chữ ký cố định token, số lượng, người nhận và deadline. Flash giữ lệnh off-chain, khi khớp thì kéo tiền, swap và trả về ví trong cùng một transaction. Huỷ bằng chữ ký EIP-191. |
| ⚠️ Chữ ký **không** chứa số lượng nhận tối thiểu | Bảo vệ giá nằm ở engine off-chain của Flash: `maxSlippage` hoặc `maxPriceImpact`. Lệnh limit thì giá limit là ràng buộc. |
| ⚠️ Stop-loss mặc định `maxPriceImpact` **50%** | Phải tự đặt giá trị rõ ràng nếu không muốn bán tháo ở giá rất xấu. |
| Native ETH | Không chi trực tiếp được: quote trả về `wrap.evmTx` (ETH → WETH), gửi xong mới submit lệnh. Nhận về ETH native thì được. |
| Smart wallet | Hỗ trợ EIP-1271 (Privy, Coinbase Smart Wallet). EOA đã gắn EIP-7702 phải ký qua smart-account flow, ký ECDSA trần sẽ bị từ chối. |
| Phí Definitive | 10 bps, giá khuyến mãi tới hết **12/2026** |
| Phí integrator | `flashIntegratorFeeBps` (chuỗi, phải giống nhau ở quote và order), cộng thêm vào phí Definitive. Tiền dồn vào **Flash Portfolio** trong tài khoản Definitive, rút về fee wallet. |
| Base builder code | `erc8021AttributionCode` gửi ở `POST /order`. Đăng ký code trên base.dev, dùng cho Base builder grant. |
| Rate limit | **5 request/giây cho mỗi endpoint, tính theo API key**. Cả app dùng chung một key. |
| Huỷ do phí | `REASON_EXECUTION_COST_EXCEEDS_LIMIT` khi gas + phí vượt 30% giá trị lệnh. Definitive khuyên test trên prod với lệnh **$5–10**. |
| Trạng thái lệnh | PENDING, ACCEPTED, PARTIALLY_FILLED (còn huỷ được), FILLED, CANCELLED, REJECTED, TERMINATED. Có `closeReason`. Theo dõi qua `GET /orders`, `GET /orders/{id}` hoặc WebSocket. |
| Khác | Sửa giá lệnh đang chờ (update), huỷ hàng loạt tối đa 25 lệnh, streaming quote, post-trade fills, minimal authorization (`forceMinimalAllowance` + Permit2). |

---

## 2. Gắn vào 5 tầng

| Tầng | Flash thêm gì | Dùng lại cái có sẵn |
|---|---|---|
| Nhận thức | — | — |
| **Phán đoán** | Mọi quote đều chạy qua `preTradeCheck` trước. BLOCK thì không gọi Flash. WARN thì card bắt tick xác nhận, giống thẻ swap. | `lib/pre-trade-check.ts`, `PreTradeBanner` |
| **Thẩm quyền** | Route quote/order/cancel lấy ví từ **SIWE session**, không lấy từ body. Người dùng tự ký EIP-712 và EIP-191. | `lib/acting-wallet.ts`, `useEnsureSession` (ví nhúng ký ngầm từ `174f1bd2`) |
| **Thực thi** | limit, stop-loss, take-profit, TWAP, bracket, chạy khi người dùng offline. Sau này có thêm cross-chain market. | card trong Chat, `ToolCards` |
| **Trách nhiệm** | Action record cho mỗi lệnh. Đồng bộ trạng thái vào Activity (filled / cancelled / rejected + `closeReason`). | `lib/actions.ts`, `lib/activity.ts`, `/api/timeline` |

---

## 3. Code dở (checkout chính, 2026-09-28) so với tài liệu

**Các file:** `lib/flash/client.ts`, `api/flash/{quote,order,cancel}`, `FlashTradeCard.tsx` (340 dòng), tool chat `flash_trade` (+64 dòng trong `route.ts`).

**Sai so với API:**
1. Trường điều kiện kích hoạt: code dùng `trigger: {notionalPrice, triggerType}`, API dùng **`triggers: [{ notionalPrice | crossPrice, triggerType }]`**.
2. Giá trị `triggerType`: code dùng `"higher"`, API dùng **`"upper"`**.
3. `orderType`: code có `"dca"` (không tồn tại) và `"bracket"` (không đặt trực tiếp được, phải dùng `attachedBracket`). Code thiếu `"stop"`.
4. Thiếu xử lý `wrap.evmTx` (chi ETH native), `evm.permitTypedData`/`evmPermitSignature` (luồng Permit2) và `setupTxs`.
5. Không đặt `maxPriceImpact`, nên stop-loss chạy với mặc định 50%.

**Thiếu so với kiến trúc hiện tại:**
6. `/api/flash/*` **không có auth**: ai cũng gọi được, tiêu hạn mức 5 req/s chung của key, và đặt `funderAddress` tuỳ ý.
7. Không có pre-trade check, không có action record, không ghi vào Activity.
8. Không có danh sách lệnh đang mở và trạng thái lệnh. Người dùng đặt lệnh xong thì không thấy lệnh đâu, không huỷ được trong app.
9. Resolve token qua `resolveChainToken` của Hood, nên chỉ dùng được token trong registry. Token crypto thường bị loại.
10. Code dở nằm trên `main` của checkout chính, chưa commit, sẽ conflict khi `git pull`.

**Hướng xử lý:** commit code dở thành một WIP commit trên branch riêng (không stash) để giữ lịch sử, rồi viết lại trên `feat/flash`.

---

## 4. Thiết kế

**Server**
- `lib/flash/client.ts`: chỉ chạy server.
  - Kiểu dữ liệu sinh từ `flash.definitive.fi/v1/openapi.json`.
  - Khi gặp 429, đọc `RateLimit-Reset` rồi thử lại một lần.
  - Không bao giờ gửi key ra browser.
- `POST /api/flash/quote`:
  - Ví lấy từ SIWE session, làm `funderAddress`.
  - Chạy `preTradeCheck` trước; BLOCK thì trả về lý do và không gọi Flash.
  - Đặt `maxSlippage` / `maxPriceImpact` mặc định do code quyết định, không để LLM chọn.
  - Gửi `flashIntegratorFeeBps` (nếu ShunTr bật).
- `POST /api/flash/order`:
  - `funderAddress` phải trùng ví trong session.
  - Echo nguyên văn `evmOrderTypedData`, phí và `quoteId`.
  - Thêm `erc8021AttributionCode` nếu có builder code.
  - Tạo action record.
- `GET /api/flash/orders`: liệt kê lệnh của ví trong session, có phân trang.
- `POST /api/flash/cancel`: chuyển tiếp chữ ký EIP-191 do người dùng ký. Có thể thêm batch cancel.
- Đồng bộ trạng thái:
  - Đọc `GET /orders` khi người dùng mở Scheduled.
  - Cron 5 phút sẵn có kiểm tra các lệnh còn mở **của những ví có lệnh**, và ghi `order_filled` / `order_cancelled` vào feed.
  - Cần tính ngân sách rate limit và KV trước khi bật cron.

**Client**
- Tool chat `prepare_order` (limit / stop-loss / take-profit / TWAP, có tuỳ chọn bracket).
  - Tên phải qua được `action-card-inventory-check`.
  - Giá, số lượng và điều kiện phải do người dùng nói ra; LLM không tự đặt.
- `FlashOrderCard`, chạy từng bước:
  1. Pre-trade check.
  2. Approve, nếu quote có `approveTx`.
  3. Wrap, nếu chi ETH.
  4. Ký lệnh.
  5. Submit.
  6. Hiện trạng thái.

  Card ghi rõ:
  - phí tổng (`fees.estimatedFeeNotional`, gồm 10 bps của Definitive + phí integrator);
  - hạn của lệnh;
  - "Flash giữ lệnh off-chain; tiền ở trong ví đến khi khớp";
  - mức bảo vệ giá.
- Scheduled thêm tab **Orders**: lệnh đang mở, sửa giá, huỷ.

**Copy**
- Không nói "Blue Agent tự giao dịch". Viết: "Flash executes your signed order when the price is hit".
- Không gọi stock token là "shares".
- Mọi con số đi kèm tên chain.

---

## 5. Các phase

| Phase | Phạm vi | Cỡ (ước tính) |
|---|---|---|
| **P0 — quyết định** | Các câu hỏi ở mục 7. Đưa `FLASH_API_KEY` lên Vercel (production). | — |
| **P1** | limit, stop-loss, take-profit. Một chain (Base hoặc RH). Chỉ chi ERC-20, chưa chi ETH native. Gồm card trong Chat, tab Orders, huỷ lệnh, pre-trade check, action record và test. | ≈ 2–3 ngày |
| **P2** | Bracket gắn vào lệnh market/limit, TWAP, chi ETH qua wrap, sửa giá. Automation thêm lựa chọn "đặt lệnh chờ trên Flash" bên cạnh "chuẩn bị card". Đồng bộ trạng thái vào Activity. | ≈ 2–3 ngày |
| **P3** | Cross-chain market Base ↔ RH, đo so với Relay bridge + swap. Cho agent dùng qua MCP; muốn thêm tool thì phải qua keep rule trong `lib/mcp-tools.ts`, hoặc mở rộng builder có sẵn. Streaming quote. | để sau |

---

## 6. Test (P1)

- Test trên prod với lệnh **$5–10**, theo khuyến nghị của Definitive. Không có sandbox.
- Các loại ví:
  - ví nhúng Privy (EOA, ký ngầm);
  - EOA ngoài (MetaMask);
  - Coinbase Smart Wallet (EIP-1271);
  - EOA đã gắn 7702: cần báo lỗi rõ ràng.
- Các tình huống:
  - pre-trade BLOCK → không gọi quote;
  - WARN → phải tick;
  - lệnh limit chưa khớp → hiện trong tab Orders;
  - huỷ → CANCELLED;
  - stop-loss có trigger đã bị vượt ngay lúc đặt → `REASON_ORDER_TRIGGERED_ON_ENTRY`;
  - lệnh quá nhỏ → `REASON_EXECUTION_COST_EXCEEDS_LIMIT`.
- Guard thêm vào `npm test`:
  - request khớp schema OpenAPI (dùng fixture);
  - route không chạy khi không có session;
  - LLM không tự đặt giá.

---

## 7. Cần ShunTr quyết

1. **Phí integrator.** Có thu không, và bao nhiêu bps? Đây là **đường tiền**. Tiền vào Flash Portfolio, rút về một fee wallet. Ví nào giữ phí? Lưu ý `0x0295…` vừa là treasury x402 vừa là ví buyer ACP (xem CLAUDE.md).
2. **Base builder code (ERC-8021).** Có đăng ký trên base.dev không? Code này để được tính vào Base builder grant, không ảnh hưởng giá.
3. **Approve.** Dùng unlimited như mặc định của Flash, hay `forceMinimalAllowance` + Permit2 (an toàn hơn, thêm một lần ký)? Khuyến nghị: **minimal**.
4. **Phase 1 chạy chain nào trước:** Base hay Robinhood Chain?
5. **Stop-loss:** `maxPriceImpact` mặc định bao nhiêu? Khuyến nghị: thấp hơn nhiều so với mức 50% của Flash, ví dụ 5–10%, và ghi rõ trên card.
6. **Rate limit.** Có xin Definitive nâng mức trên 5 req/s không?
7. **Code dở trên `main`.** Đồng ý commit nó thành một WIP commit trên branch riêng?

---

## 8. Rủi ro

- **Phụ thuộc bên thứ ba cho lệnh đang chờ.** Nếu Flash ngừng hoạt động hoặc BlueAgent gỡ tích hợp, lệnh mở vẫn còn trên Flash. Theo luật chống bỏ rơi, khi gỡ phải giữ lại đường huỷ lệnh, hoặc chỉ người dùng sang app Definitive.
- **Approve unlimited.** Nếu engine của Flash bị xâm nhập, chữ ký vẫn giới hạn số lượng theo từng lệnh, nhưng allowance thì còn nguyên. Vì vậy khuyến nghị câu 7.3.
- **Bảo vệ giá nằm off-chain.** Chữ ký không cam kết số lượng nhận tối thiểu, nên phải ghi điều này trên card thay vì nói "an toàn tuyệt đối".
- **Tiêu hết rate limit.** Một người spam quote làm nghẽn cả app. Cần giới hạn theo từng ví (`lib/rate-limit.ts`).
- **Stock token.** Lệnh chờ trên stock token vẫn chạy qua pre-trade check. Riêng B20 có thể bị chính sách của issuer chặn chuyển.
