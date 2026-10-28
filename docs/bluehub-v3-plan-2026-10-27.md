# Blue Hub v3: Base Agent Exchange, có số liệu tự đo

Ngày 2026-10-27. Plan, chưa build. Mọi bước cần ShunTr duyệt (xem mục 7).
Nguồn ý tưởng: bài "Tolly Agent Exchange" (@TollyLabs, 2026-10-24) và ba ảnh chụp sản phẩm của họ
(Agent Exchange, Create an agent, ảnh bìa).

---

## 1. Vì sao làm lại, và lần này khác gì

**Tầm nhìn Blue Hub ban đầu** là "App Store cho tool multi-agent": builder đăng ký repo,
thanh toán x402, chia doanh thu. Kết quả thực tế:
- builder registry (SIWE + KV) có **0 builder**;
- phần chia doanh thu chưa bao giờ được build;
- cổng nhận tool bên ngoài đã đóng ở #493;
- Hub giờ là catalog 65 tool của riêng mình, bị ẩn khỏi giao diện từ 2026-09-30.

**Bài học từ Tolly: marketplace không lớn lên bằng form đăng ký.** Tolly làm khác Hub cũ ở hai việc:
1. **Tự lấp đầy trang từ dữ liệu công khai.** Họ index sẵn ERC-8004, Virtuals và ACP
   (khoảng 1.858 agent), nên ngày đầu đã có nội dung, không phải chờ ai đăng ký.
2. **Thứ kéo người xem là số liệu tự đo**, không phải danh sách:
   - doanh thu x402 30 ngày ghi "measured";
   - feedback ERC-8004;
   - số ví trả tiền;
   - lưu lượng test của team được tách ra và công khai riêng.

Sau đó họ mới mở chiều cung: trang "Create an agent" mint ERC-8004, tạo ví ERC-6551,
và tự xuất hiện trong danh bạ.

**Blue Hub v3 = cùng công thức đó, trên Base 8453**, với đúng nguyên tắc cũ của repo:
số đến từ nguồn thật, thiếu dữ liệu thì ghi "unknown", không đoán.

---

## 2. Số đo ngày 2026-10-27 (nền cho mọi quyết định bên dưới)

| Nguồn | Đo được | Ý nghĩa |
|---|---|---|
| ERC-8004 Identity, Base 8453 (`0x8004A169…a432`) | id cao nhất khoảng **1,137,872**. Lấy mẫu 120 id rải đều: **103/108 do `centralcity.ai` mint hàng loạt**, chỉ **1/108 khai `x402Support`**, 1/108 có MCP | Index thẳng registry sẽ ra **hơn 90% rác**. ERC-8004 chỉ dùng làm **lớp danh tính và uy tín** gắn vào provider thật, không dùng làm danh sách chính |
| x402 Bazaar của CDP (`/x402/discovery/resources`) | **84,777 resource**. Trong 1.000 resource đầu: 1.127 accept trên `eip155:8453`, **416 ví payTo khác nhau, 388 host** | Đây mới là **nguồn cung x402 thật trên Base** và là nguồn chính của danh bạ |
| ACP Virtuals (`api.acp.virtuals.io`) | Search API chạy được không cần đăng nhập. Mỗi agent có `walletAddress`, `offerings` và giá | Nguồn phụ: agent nhận job có escrow |
| Blue Agent | ERC-8004 #1137821. Lượt trả phí: 1 (ví team). Job ACP: 5 (cả 5 từ ví team) | Mục "Listed" ngày đầu **chưa có người mua bên ngoài**. Xem cổng G1 ở mục 6 |

Mình chưa đo hai thứ, và sẽ đo ở phase P0:
- Gom 84,777 resource lại thì được bao nhiêu provider (theo payTo) trên Base.
- Đọc log USDC cho vài trăm ví payTo tốn bao nhiêu request.

---

## 3. Thiết kế

### 3.1 Đơn vị gốc: "provider", định danh bằng ví payTo trên Base
Mọi nguồn được nối về cùng một ví nhận tiền:
- **Bazaar:** resource gom theo `payTo` (và host).
- **ERC-8004:** nối vào khi `getAgentWallet(id)` hoặc `payTo` trong file đăng ký trùng ví đó.
  Nối được thì provider có danh tính và điểm feedback.
- **ACP:** nối qua `walletAddress`.

Không nối được thì để trống. Không đoán liên kết theo tên (bài học #280: khớp theo tên là cách hàng giả lọt vào).

### 3.2 "Measured": doanh thu x402 30 ngày, tính bằng code
Chỉ đếm **USDC chuyển tới payTo bằng `transferWithAuthorization` (EIP-3009)**, tức kiểu settle của x402.
USDC chuyển tới bằng cách khác không được đếm. Ba quy tắc:
- Mỗi con số kèm chain, khoảng thời gian và chữ "measured".
- Ví của **team Blue Agent** được tách ra như cách Tolly làm. Với provider khác, mình không biết ví nào là ví test của họ, nên ghi là "gross x402 inflow". Không trừ gì theo phỏng đoán.
- Nguồn đọc: Blockscout có `BLOCKSCOUT_API_KEY` (đã có, vì gọi không key bị 429), hoặc `getLogs` trên RPC. **Không dùng `base.blockscout.com` để đếm ví ERC-4337**, vì nó không index UserOp (đã đo 2026-09-27).

### 3.3 Uy tín
- Feedback ERC-8004 đọc bằng `getSummary`.
  **Chỉ đếm feedback từ những ví đã từng trả tiền cho provider đó** (lọc theo log ở 3.2). Spec ERC-8004 tự thừa nhận dễ bị Sybil, và phòng thủ duy nhất có ý nghĩa là "rating có thanh toán đi kèm".
- Điểm tin cậy cho tool của Blue Agent giữ công thức Wilson hiện có (`lib/service-score.ts`).
  Với provider bên ngoài, mình chỉ thấy được thanh toán, không thấy lượt gọi lỗi, nên **không chấm điểm**. Chỉ hiện số liệu.

### 3.4 Chống rác
- Danh sách mặc định chỉ hiện provider **có ít nhất 1 thanh toán x402 trong 30 ngày**. Một nút "Include inactive" để xem phần còn lại.
- Agent ERC-8004 không có payTo, hoặc payTo không có thanh toán nào, không vào danh sách chính.
- **Không có exemption list.** Theo CLAUDE.md, một danh sách miễn trừ trông như "đã review" và từng che mất cửa x402 thứ hai.

---

## 4. Các phase

### P0. Research spike (2 ngày, chưa ship gì) → báo số cho ShunTr
- Gom toàn bộ resource Bazaar về `payTo` trên Base: có bao nhiêu provider.
- Với 30 provider mẫu, đo doanh thu x402 30 ngày bằng 3.2, và đo số request cần dùng.
- Ước lượng chi phí KV (Upstash, nhớ ngân sách #148) và chi phí cron.
- Chốt cách lọc: bao nhiêu provider còn lại sau khi lọc ở 3.4.

**Kết quả:** một bảng số. Nếu ít hơn khoảng 30 provider có thanh toán thật, hoặc chi phí đọc log vượt ngân sách, **dừng hoặc thu nhỏ phạm vi**.

### P1. Danh bạ chỉ đọc: `/hub` (gỡ ẩn Hub)
Bố cục theo Tolly, trong khung giao diện của app (font JetBrains Mono):
- **Bốn ô số liệu đầu trang:** doanh thu agent, provider đang hoạt động, lượt thanh toán và ví trả tiền, tất cả 30 ngày, trên Base 8453. Dưới các ô có một dòng ghi nguồn của từng con số và **lưu lượng test của team, tính riêng**.
- **"Listed on Blue Agent":** các tool của mình lấy từ receipt book, có trust score và ERC-8004 #1137821.
- **Bảng provider:** tên, host, nguồn (Bazaar, ERC-8004, ACP), doanh thu 30 ngày (measured), số ví trả tiền, feedback đã lọc, số dịch vụ.
- Có ô tìm kiếm, bộ lọc nguồn, sắp xếp theo mức hoạt động.
- Cron index chạy một lần mỗi ngày (không chạy theo giờ, vì ngân sách Upstash). Cron viết theo kiểu `kvGetProbe`: đọc lỗi thì hiện "—", không bao giờ hiện 0.

**Retire cùng commit:** builder registry cũ (SIWE + KV), route và link quảng cáo của nó.
Dữ liệu KV cũ được giữ lại, không xoá.

### P2. Hồ sơ provider + router
- `/hub/[payTo]`: danh sách dịch vụ và giá (từ Bazaar), doanh thu theo ngày, receipt có link Basescan, ERC-8004, ACP offerings.
- Mở rộng `/api/services/scores` thành `/api/hub/providers`, một API cho máy đọc, có lọc theo khả năng, giá và mức hoạt động.
- `blue_registry` và `blue_call` trả thêm provider bên ngoài **chỉ khi gọi được bằng x402 chuẩn**. Thanh toán vẫn do ví của người gọi tự ký, như `blue_call` hiện nay; mình **không giữ tiền, không ký thay**.

### P3. "Create an agent on Base" (chiều cung)
Chỉ mở khi đạt cổng G2.
- Form gồm tên, mô tả, icon, endpoint (MCP, A2A hoặc API) và công tắc x402.
- File đăng ký nhúng vào NFT dưới dạng **`data:` URI** (base64 JSON), nên **mình không host hay kiểm duyệt nội dung của ai**.
- Các bước, người dùng tự ký từ ví Blue Chat: mint ERC-8004, (tuỳ chọn) tạo ví ERC-6551, rồi `setAgentWallet`.
- Trang cảnh báo rõ: **ai giữ NFT thì giữ luôn ví**.
- Ngay bản đầu cũng có trang **quản lý agent của chính mình** (sửa URI, đặt ví nhận tiền, chuyển NFT) cho #1137821. Phần này cần dù P3 có mở cho người ngoài hay không.

### P4. Job board mở (đăng việc)
Chỉ làm khi có nhu cầu thật. Thanh toán bằng **escrow ACP có sẵn**, không tự viết escrow.
Phần này đụng đường thanh toán, nên cần ShunTr duyệt riêng.

### Không làm
- Token hoá agent và chia doanh thu cho người giữ token: phần này thuộc Quadra, và có rủi ro pháp lý kiểu chứng khoán.
- Bất kỳ hình thức custody nào: mình không giữ khoá, không ký thay người dùng.
- Index Arc hay chain khác: Hub v3 chỉ làm Base 8453. RH 4663 chỉ thêm khi có nguồn x402 trên đó.

---

## 5. Thứ tự và ước lượng

| Phase | Kích thước | Phụ thuộc |
|---|---|---|
| P0 spike | ~2 ngày | không |
| P1 danh bạ | ~1 tuần, 3–4 PR | P0 đạt |
| P2 hồ sơ + router | ~1 tuần | P1 |
| P3 create agent | ~1 tuần | G2 |
| P4 job board | chưa ước lượng | nhu cầu thật + ShunTr duyệt |

Mỗi PR qua gate (`tsc` · `npm test` · `verify:build`). Sau khi merge thì xác nhận Vercel `READY`.

---

## 6. Cổng (đừng bỏ qua)

- **G0, sau P0:** có ít nhất ~30 provider Base có thanh toán x402 thật trong 30 ngày, và chi phí index nằm trong ngân sách. Không đạt thì dừng.
- **G1, trước khi quảng bá P1:** mục "Listed on Blue Agent" phải tách team và người ngoài, **và** có ít nhất 1 ví bên ngoài đã trả tiền. Một sàn mà agent đầu bảng chỉ có ví team mua sẽ phản tác dụng.
- **G2, trước khi mở P3 cho người ngoài:** khoảng 10 ví bên ngoài đã trả tiền, hoặc có ít nhất 3 người hỏi cách tạo agent.

---

## 7. Quyết định cần ShunTr

1. **Tên và vị trí:** gỡ ẩn `/hub` và dùng tên "Blue Hub", hay đặt tên mới ("Base Agent Exchange")?
2. **Tách lượt test của team** trên /app/services và Hub. Ngày 2026-10-27 bạn đã yêu cầu gộp; plan này đề xuất quay lại cách tách và công khai như Tolly.
3. **Ngân sách:** một cron index mỗi ngày (Upstash + Blockscout). Bạn có chấp nhận chi phí này không? Con số cụ thể có sau P0.
4. **Retire builder registry cũ** trong commit P1: đồng ý không?
5. **ERC-6551 ở P3:** có đưa vào không, hay chỉ ERC-8004 kèm ví người dùng tự chọn?
6. **NFT #1137821** đang nằm ở ví demo `0x00fd…746f`, mà khoá ví này đang lưu dạng chữ thường trong cấu hình MCP. Có chuyển NFT sang ví sạch trước khi quảng bá không? Và có đặt `agentWallet` thành `0x0295…` không? Việc thứ hai cần ví Privy ký, và là thay đổi đường nhận tiền.

---

## 8. Rủi ro

- **Dữ liệu rỗng:** nếu G0 không đạt, danh bạ sẽ trống. P0 tồn tại chính là để biết điều này trước khi build.
- **Đọc sai doanh thu:** một ví payTo có thể nhận USDC không phải từ x402. Đã giảm bằng cách chỉ đếm `transferWithAuthorization`, và luôn ghi "gross".
- **Cạnh tranh:** 8004scan và QuickNode explorer làm danh bạ danh tính miễn phí. Khác biệt của mình là **doanh thu x402 tự đo trên Base**, không phải danh sách.
- **Đường thanh toán:** P2 chạm `blue_call`. Giữ nguyên quy tắc: không bypass, không custody, người gọi tự ký.
- **Hub bị bỏ rơi lần nữa:** đã có 7 surface bị bỏ rơi trong lịch sử repo. Nếu không vượt G0 hoặc G1, đừng ship nửa vời rồi để chạy không ai bảo trì.

---

## 9. P0: kết quả đo một phần (2026-10-27, đang làm dở)

- Bazaar: tải đủ **84,777 resource**, ra **1.813 ví payTo khác nhau trên Base 8453**. Con số này vượt xa cổng G0 về phía cung. Resource mẫu có `lastUpdated` 2026-10-11.
- Đọc log thanh toán:
  - `mainnet.base.org`: "request limit reached" ngay từ khoảng 500 block → không dùng được để index.
  - `base.drpc.org` free: báo không hỗ trợ khoảng trên 10k block, thực tế lỗi cả với 500 block.
  - `base-rpc.publicnode.com`: CHẠY được. Lấy Transfer USDC tới 20 ví trong 500 block ra **1.099 log** (1,2s); 200 ví trong 5.000 block ra **9.533 log** (2,4s). Giới hạn **20.000 kết quả mỗi query**, nên với 1.000 ví phải chia nhỏ khoảng block.
- Dữ liệu cho thấy khối lượng thật lớn. Cron cần chạy tăng dần mỗi ngày (khoảng 43.200 block/ngày), chia theo lô ví × lô block.
- Còn lại của P0:
  - (a) Lọc chỉ lấy thanh toán x402: khớp Transfer với event `AuthorizationUsed` trong cùng tx.
  - (b) Đo 30 ngày cho 30 provider mẫu.
  - (c) Ước lượng số request/ngày và chi phí KV.

### P0 xong (2026-10-28)
- Một ngày block Base (43.200 block), quét toàn bộ 1.813 payTo: **110.658 lần chuyển USDC, 110.062 lần là settle EIP-3009; 777 seller được trả tiền; tổng $3.821; 341 seller có từ 2 ví trả tiền trở lên.** Cổng G0 ĐẠT.
- Chi phí: 439 lệnh RPC, khoảng 5 phút cho mỗi ngày dữ liệu → cron chạy tăng dần theo con trỏ, mỗi lần một cửa sổ 2.000 block.
- Hiện thực: `lib/hub/exchange.ts`, `/api/cron/hub-index` (mỗi 10 phút) và `/api/cron/hub-providers` (mỗi ngày).
