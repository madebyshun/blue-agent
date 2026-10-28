# Tolly: nghiên cứu sản phẩm và đề xuất cho Blue Agent (2026-10-28)

Nguồn: đọc trực tiếp tollylabs.com (Markets, Token page, Analytics, Launch v3/v4, Guide) và
agent.tollylabs.com (Agents, Jobs, Discovered, Analytics, Create agent, Sell services, x402 Services,
My Usage, Following, Docs) ngày 2026-10-28, cùng ảnh chụp và bài launch của @TollyLabs.

## 1. Tolly có hai nửa

### Nửa TOKEN (tollylabs.com): terminal giao dịch + launchpad trên Arc
| Trang | Làm gì |
|---|---|
| Markets | Toàn bộ token trên Arc (6.336), xếp theo volume/mcap/liquidity, sparkline 24h, nút Quick Buy $25, chế độ Lanes/Cards/Radar/Bubbles |
| Map (Opportunity Map) | Nhóm token theo nhịp: Surging/Rising/Steady/Easing/Fading, net flow 6h, đường ví "bán A rồi mua B" |
| Trade Studio (token page) | Chart nến, giao dịch trực tiếp, Holders, Holder Map, ô swap (Market/Limit/Bridge), thông tin deployer và strategy |
| Analytics | Volume trọn đời $40,6M, 279k giao dịch; sơ đồ flywheel phí; sổ đốt token (63,9M TOLLY = 6,39% supply); "furnace" mua và đốt |
| Launch v3 | Tên, ticker, logo, link, first buy; "fixed supply, permanent liquidity, no migration" |
| Launch v4 | Chọn quote asset (USDC, EURC, GBPA, cirBTC; stocks "coming soon"); **creator taxes** 0–10% mỗi chiều mua/bán; chia thuế cho Creator/Dividend/Buy & burn TOLLY/Buy & burn token; **Agent share**; tuỳ chọn khoá vĩnh viễn; first buy tối đa 3% supply |
| Portfolio | Holdings, Rewards, Points |
| Guide | Tài liệu đầy đủ: facts vs interpretation vs unknown, 3 ngôn ngữ, themes |

Phí 1% của mỗi pool chia 64 creator / 12 holder / 10 protocol / 9 mua-đốt TOLLY / 5 mua-đốt chính token.
Phí ở chiều bán (trả bằng token) bị đốt hết.

### Nửa AGENT (agent.tollylabs.com): sàn agent + x402
| Trang | Làm gì |
|---|---|
| Agents | Mục "Listed on TOLLY" (đã verify, số tự đo), tiếp theo là ERC-8004 trên Arc + Virtuals + ACP |
| Discovered | Seller x402 từ Bazaar trên **mọi chain** (2.675 seller, 1.126 đang hoạt động); doanh thu là **ước tính** (lượt gọi × giá niêm yết) |
| Analytics "Pumpamentals" | Seller theo chain (Base: 1.117 active, ~$26,8K/30d ước tính); leaderboard theo doanh thu, tăng trưởng, số ví, lượt dùng, ACP |
| Agent profile | 4 tick (Operator control, Domain control, Endpoint reachable, Completed paid work), 8 ô số liệu, Token Economy, Live Activity, Hire Agent (modal chọn dịch vụ rồi "Buy for $0.006") |
| Jobs | Làm trước, trả khi mở khoá, không escrow, Tolly thu 10% |
| Create agent | NFT ERC-8004 + **ví ERC-6551** + liên kết ví (3 giao dịch) + "TOLLY skill" |
| Sell services | Đăng nhập bằng chữ ký, **chứng minh domain** bằng `/.well-known/tolly-agent.json`, **import từ `/.well-known/x402`**, gọi thử từng dịch vụ (USDC, đúng ví, giá cố định) rồi mới lên trang |
| x402 Services | Catalog của Tolly, mỗi dịch vụ có "Try it"; có Quickstart, Receipts, My Usage |
| My Usage | Đăng nhập bằng ví (ký message), xem mọi lượt mua 90 ngày, receipt, hoàn tiền |
| Following | Theo dõi agent |
| Docs | Cho người mua, Jobs, cho builder, MCP & API, Fees & refunds, FAQ |

Mua qua Tolly (routed) thì có phí công khai và hoàn tiền tự động.

## 2. Blue Agent đang ở đâu (sau PR #512)

| Tolly | Blue Agent | Ghi chú |
|---|---|---|
| Agents / Listed | ✅ `/exchange` (Listed on Blue Agent) | Chỉ có Blue Agent trong mục Listed |
| Discovered | ✅ `/exchange`, **chỉ Base** | Doanh thu **đo trên chain**, không ước tính. Đây là điểm hơn Tolly |
| Analytics | ✅ `/exchange/analytics` | Chưa có leaderboard, chưa có ACP |
| Agent profile | ✅ `/exchange/agent/<id>` (#512) | Chưa có nút Hire/Run |
| Jobs | ✅ `/jobs`, 0% phí, nộp bằng chữ ký | |
| Create agent | ✅ `/exchange/create` | Chưa có ví ERC-6551 |
| Tokenize + holder share | ✅ `/exchange/tokenize` + RevenueShare (stake) | Không có thuế tuỳ chọn, không có burn |
| Sell services (verify) | ❌ | Mới có probe tự động |
| My Usage | ❌ | Đã có spend-log theo ví |
| Following | ❌ | Có thể dùng lại watches của Scheduled |
| Hire / Run từ trang | ❌ | Chạm đường thanh toán |
| Markets / Trade Studio / Portfolio | ❌ | Đây là phần của **Quadra**, đừng làm trùng |
| Docs agent economy | ❌ | Mới có `llms.txt` |

**Lợi thế cần giữ và nói rõ trong bài:** Base là chain lớn nhất trên chính bảng của Tolly
(1.117/2.675 seller), và doanh thu Base trên Blue Agent là **số đo** từ settle EIP-3009, không phải
lượt gọi × giá. Không có số đo nào được trình bày như ước tính, và ngược lại.

## 3. Đề xuất build, theo thứ tự

### Đợt 1: hoàn thiện nửa AGENT (đọc dữ liệu là chính, rủi ro thấp)
1. **Sell services (listing có xác minh).** Đăng nhập SIWE, chứng minh domain bằng `/.well-known/blueagent-agent.json`, import dịch vụ từ `/.well-known/x402` của seller, gọi thử từng cái (USDC trên Base, đúng ví, giá cố định), rồi đưa lên mục "Listed on Blue Agent". Đủ 4 tick như Tolly. Không giữ tiền ai.
2. **My Usage.** Đăng nhập bằng ví, xem lịch sử mua x402 và MCP kèm receipt Basescan, xem job đã đăng và đã mở khoá.
3. **Hire / Run trên trang agent.** Modal chọn dịch vụ rồi ký x402 **thẳng tới ví seller**, dùng `lib/x402-sign-client` sẵn có, không routed, không phí. ⚠️ Đây là đường thanh toán tới ví bên thứ ba, nên cần ShunTr duyệt.
4. **Leaderboards trên Analytics.** Doanh thu, tăng trưởng 7 ngày, số ví, lượt dùng, cùng nguồn ACP (đọc từ `api.acp.virtuals.io`).
5. **Following.** Theo dõi agent, rồi nhận cảnh báo qua Scheduled khi agent có doanh thu hoặc job mới.
6. **Docs `/docs/agent-economy`.** Cho người mua, cho builder, Jobs, Fees (0%), FAQ, MCP & API.

### Đợt 2: nửa TOKEN, chỉ cho token của agent (không làm lại terminal của Quadra)
7. **Agent coins.** `/exchange/coins` liệt kê mọi token launch trên Quadra v3 (đọc event `Launched`), kèm agent sở hữu, giá, mcap, liquidity, volume, sparkline và trạng thái "stakers share fees".
8. **Portfolio.** Token agent đang giữ, đang stake, phần claimable ở mọi share contract, kèm nút claim tất cả.
9. **Trang coin** `/exchange/coin/<token>`: thêm chart, giao dịch gần đây và holder (đọc từ chain). Phần swap mở sang app Quadra (cần URL công khai của Quadra) hoặc dùng `swap_prepare` nếu nó route được pool v4 có hook. Phải kiểm tra trước.

### Cần quyết định trước (không build tự ý)
- **Thuế tuỳ chọn + flywheel mua-đốt** kiểu Tolly v4: cần contract Quadra mới, là việc của Quadra và quyết định của ShunTr.
- **Ví ERC-6551 cho agent**: là chuyện custody/ví, ShunTr quyết.
- **Mua qua Blue Agent có phí và hoàn tiền tự động** (routed như Tolly): là custody, không làm khi chưa có quyết định.
- **Mở rộng Exchange sang chain khác** (Solana, Polygon…): chỉ khi có cách **đo**, không dùng ước tính của Bazaar.
