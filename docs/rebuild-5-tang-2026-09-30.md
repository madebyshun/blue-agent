# Rebuild BlueAgent theo 5 tầng — rà soát và thu gọn

**Ngày:** 2026-09-30. **Hướng của ShunTr:**
- Rebuild theo 5 tầng: Nhận thức · Phán đoán · Thẩm quyền · Thực thi · Trách nhiệm.
- **Không build mới, chỉ thu gọn.** Mỗi hạng mục chỉ có bốn lựa chọn: giữ, sửa lỗi, ẩn, gỡ.
- **Tầng Thực thi chỉ gồm swap / send / bridge trên Base 8453 và Robinhood Chain 4663.**

**Căn cứ:**
- Code tại HEAD `5bd8c50f`, bằng `origin/main`.
- Các probe an toàn trên prod ngày 2026-09-30.
- `docs/inventory-2026-09-29.md`, `docs/chat-audit-2026-09-30.md`, `docs/scheduled-research-2026-09-30.md`, `docs/plan-2026-09-29.md`.

Tài liệu này **thay phần "Rebuild R1"** trong `docs/rebuild-2026-09-30.md`. R1 có nhiều hạng mục build mới, như `hood-basis`, chân DEX on-chain, Basis Book và Scheduled P1–P5; các hạng mục đó không còn trong hướng này. Số nào không đo thì ghi **ước tính**.

**Quyết định đã chốt trước khi rà:**
- Hub không cắt, chỉ ẩn khỏi nav. Chat vẫn dùng 44 tool Hub.
- Moralis được thay bằng Blockscout ở Phase 2 (D6(c)).

---

## 0. BlueAgent sau khi thu gọn

Nav còn 5 mục, mỗi mục là "nhà" của một tầng. Chat là cửa vào chung:

| Nav | Tầng | Gồm |
|---|---|---|
| **Hood** | Nhận thức + Trách nhiệm | Desk Base (moat), desk RH (chỉ ghi), archive, arrows, track record |
| **Scheduled** (`/cron`) | Phán đoán | Báo cáo LLM daily/weekly, không có advice; inbox; Telegram |
| **Wallet** | Thực thi + Thẩm quyền | Swap/send/bridge Base + RH, đăng nhập ký ví (Privy + SIWE) |
| **Usage** | Trách nhiệm | Credit, lịch sử chi tiêu |
| **Chat** | Cửa vào | 44 tool Hub + thẻ ký |

- **Chat là bề mặt chính** (ShunTr chốt 2026-09-30). Người dùng khám phá, đánh giá và giao dịch chủ yếu trong Chat. Hood là **tính năng build thêm**: board cổ phiếu token, và dữ liệu oracle so với DEX cho bước kiểm tra trước giao dịch.
- **Ẩn:** Hub, models, connectors, skills, plans, dashboard.
- **Docs:** chuyển xuống footer.
- **Redirect về trang thật:** `/trade`, `/bridge`, `/tasks`, `/radar`, `/alerts`.

---

## 0b. Nối 5 tầng thành một vòng (đề xuất 2026-09-30)

Sau khi cắt bớt, các tầng không còn nối với nhau. Phần này nối chúng bằng **một hành động** (swap, send hoặc bridge). Hành động đó đi qua đủ 5 tầng, và mang theo **một bản ghi hành động** (`action_id`) suốt vòng:

```
 (1a) KHÁM PHÁ ──► (1b) ĐÁNH GIÁ ──► (2) PHÁN ĐOÁN ──► (3) THẨM QUYỀN ──► (4) THỰC THI ──► (5) TRÁCH NHIỆM
 trending Base,    giá, thanh khoản,  kiểm tra trước    SIWE xác định ví;  swap/send/bridge  bản ghi hành động:
 movers/listing    holder, an toàn    giao dịch bằng    BLOCK khoá nút ký; Base + RH, minOut quote so với thực
 RH, dòng tiền,    token; stock       code: PASS/WARN/  WARN phải xác      theo quote; user  nhận, slippage,
 pool mới; kèm     token: DEX so với  BLOCK, lý do là   nhận; user tự ký   tự ký → tx hash   phí, kết quả kiểm
 nút "Swap"        oracle (Hood)      fact
       ▲                                                                                        │
       └──── lịch sử hành động + số dư ví (Wallet/Usage) + meter công khai ◄───────────────────┘
```

**Cửa vào của vòng.** Bằng chứng: rà Nhận thức theo nội dung ở §4b.
- **Chat.** User hỏi "đang trending gì trên Base/RH" → gọi tool khám phá → mỗi dòng kết quả có nút **Swap** điền sẵn token (lấy địa chỉ từ registry/pool) → đi tiếp vòng.
- **MCP (agent).** Agent khám phá qua `blue_call` (ví dụ `safe-trending`, `rh-stock-movers`) → kết quả có sẵn chain và địa chỉ token → gọi builder (có kiểm tra) → agent tự ký.
- **Board Hood.** Mỗi ticker có nút **Swap** trung tính, đi qua kiểm tra. Nút này không phải "Review & Sign" của arrow, vốn đã tắt.

| Bước | Tầng | Dùng lại cái có sẵn |
|---|---|---|
| 1a | Nhận thức: khám phá | Base: `safe-trending`, `token-momentum-scanner`, `dex-flow`, `new-pools`, `narrative-pulse`. RH: `rh-stock-movers`, `rh-stock-new-listings`, `rh-stock-search`, `rh-rwa-index`, `rh-stock-flow` |
| 1b | Nhận thức: đánh giá | `token-price`, `liquidity-depth`, `pool-scan`, `base-token-scan`, `b20-inspect`/`b20-check`, `hood-live` + `/api/hood/dislocation` (oracle so với DEX, tuổi oracle), `rh-stock-quote`/`rh-stock-liquidity`/`rh-token-scan`, `rwa-registry`, B20 registry, `api/swap/quote`, `robinhood/swap/quote`, quote trong `bridge-prepare`; số dư ví (`check_wallet`, `api/wallet/*`) |
| 2 | Phán đoán | Verdict map bằng code của 4 tool an toàn (sau W0-19); cảnh báo `HIGH_COST` của bridge; sàn minOut; kiểm `isB20`, `decimals` và `symbol` |
| 3 | Thẩm quyền | `lib/session.ts` (SIWE), Privy |
| 4 | Thực thi | 5 thẻ và 3 builder MCP |
| 5 | Trách nhiệm | `api/robinhood/receipt`, receipt từ RPC Base, `spend:<payer>` |

**Vì sao vòng này trả lời được nhận định "arrow không có giá trị".** Dữ liệu Hood về oracle so với DEX được dùng **ngay lúc user swap một stock token** (bước 1–2), không còn phát ra như một tín hiệu. Tầng Trách nhiệm cũng chuyển sang ghi **giao dịch thật** của user, thay vì chấm điểm dự đoán.

**Cho agent (MCP).** Builder trả kết quả kiểm tra và `action_id` ngay trong response. Không thêm tên tool MCP nào, theo luật giữ manifest.

**Phần build mới, và là phần duy nhất, chỉ để nối** (ước tính):

| Mã | Việc | Cỡ |
|---|---|---|
| G0 | **Khám phá → hành động:** kết quả của tool khám phá (trong Chat và MCP) và mỗi ticker trên board Hood mang sẵn chain + địa chỉ token, kèm nút **Swap** điền sẵn thẻ. Thêm 5 tool khám phá RH đã có (`rh-stock-movers`, `rh-stock-new-listings`, `rh-stock-search`, `rh-stock-quote`, `rh-rwa-index`) và `safe-trending` vào tool Chat. Đây là việc nối dây, không phải tool mới | ≈ 1,5–2 ngày |
| G1 | Bản ghi hành động trong KV, khoá theo ví SIWE. Gắn `action_id` ở 4 route prepare/quote, cập nhật từ receipt (Base qua RPC, RH qua `api/robinhood/receipt`) | ≈ 2 ngày |
| G2 | Hàm dùng chung `preTradeCheck(chain, loại, token, số lượng, ví)`, ghép từ các kiểm tra có sẵn và trả PASS/WARN/BLOCK bằng code. Gọi từ 5 thẻ và 3 builder MCP | ≈ 2–3 ngày |
| G3 | Lịch sử hành động trong Wallet/Usage, đọc qua SIWE | ≈ 1 ngày |
| G4 | Meter công khai lấy từ bản ghi hành động (số hành động, slippage thực tế trung vị, số lần BLOCK), thay cho số liệu arrow | ≈ 0,5–1 ngày |

**Phụ thuộc.**
- G1 cần SIWE (§2).
- G2 cần: W0-19 (§3), và sửa ticker từ registry cùng minOut (§1). Không có geo gate và không có dòng công bố (§7 #1).
- G2 dùng dữ liệu Hood RH chỉ sau khi F6 xong. Trước đó, kiểm tra stock token RH trả UNKNOWN, tức WARN.

---

## 1. Thực thi

**Hiện trạng.**
- Đủ 5 chức năng đã có và đang chạy.
- Backend được dùng chung giữa Chat, Wallet và MCP: `api/swap/quote` (0x), và `api/robinhood/{swap/quote, router/swap-prepare, router/send-prepare, router/bridge-prepare}` (Relay).
- Người dùng chỉ dùng qua một trang, `/wallet`, render `BankClient` (3.495 dòng).

| Chức năng | Tool trong Chat | Thẻ | Tool MCP |
|---|---|---|---|
| Swap Base | `prepare_swap` | `ConvertPanel` → `bank/SwapCard` | `blue_swap_tx` |
| Swap RH | `robinhood_swap` | `bank/RhSwapCard` (ETH↔token), `chat/RobinhoodSwapCard` (token↔token) | `blue_swap_tx` |
| Send Base/RH | `prepare_send`, `robinhood_send` | `bank/WalletSendCard` | `blue_send_tx` |
| Bridge Base↔RH | `robinhood_bridge` | `BankBridgeCard` → `RobinhoodBridgeCard` | `blue_bridge_tx` |

**Ba loại tài sản trong vòng giao dịch.** ShunTr lưu ý ngày 2026-09-30: stock token **không phải cổ phiếu Mỹ**, nên phải phân biệt để build cho đúng. Cả hai registry đã có sẵn trường để phân biệt.

| Loại | Là gì (theo docs của issuer) | Nhận diện (chỉ qua registry, không bao giờ theo tên) | Kiểm tra trước giao dịch (G2) | Đường swap | Nhãn trên thẻ |
|---|---|---|---|---|---|
| **Token crypto thường** (Base/RH) | Token ERC-20 | Không nằm trong hai registry dưới | Honeypot, contract, thanh khoản, price impact | 0x (Base) / pool RH | Tên và symbol token |
| **Stock token Robinhood Chain** | **Debt security do Robinhood Assets (Jersey) phát hành**, theo dõi giá một cổ phiếu hoặc ETF Mỹ; chào bán theo prospectus/Final Terms; không phải cổ phần Mỹ | `rwa-registry` (`kind: "stock"`/`"etf"`, `issuer: "RHJ"`), có 181 stock và 22 ETF | Có trong registry; Chainlink còn tươi; DEX so với oracle; phiên thị trường (cuối tuần oracle đóng băng) | `RobinhoodSwapRouter`/pool RH | "Stock token (Robinhood, Jersey), theo dõi <TICKER>" |
| **B20 tokenized stock trên Base** | Token của Coinbase: claim với cổ phiếu do SPV giữ; chuẩn B20 có thể giới hạn người nắm giữ bằng policy on-chain | Base registry (`isB20`, `decimals == 8`, `symbol == "<TICKER>c"`, đối chiếu `base.org/stocks`) | Như trên, cộng cảnh báo "policy của issuer có thể chặn chuyển" | 0x / Aerodrome | "B20 tokenized stock (Coinbase), theo dõi <TICKER>" |

**Hệ quả khi build:**
- Không nơi nào trong copy gọi token là "cổ phiếu Mỹ" hay "shares".
- Mọi thẻ, builder và G2 đều **tra registry trước** để biết đang xử lý loại nào.
- Mỗi loại dùng một bộ kiểm tra riêng.
- Không có dòng công bố hay link điều khoản trong thẻ (§7 #1, ShunTr chốt). Nhãn chỉ nêu loại token và issuer.

**Sửa:**
1. Ticker RH được đổi ra địa chỉ bằng pool đầu tiên có tên khớp → phải lấy từ `rwa-registry`. Chỗ lỗi: `api/chat/route.ts:1711`.
2. Builder MCP cho swap RH có `amountOutMinimum = 0` → dùng minOut theo quote cộng slippage. Chỗ lỗi: `api/mcp/route.ts:619-636`.
3. `/api/paymaster` không có auth → gate bằng SIWE, hoặc tắt.
4. `bank/SwapCard.tsx:107-111`:
   - nhận mọi địa chỉ token;
   - không truyền slippage;
   - không hiện phí 0x 0,15%.
5. `blue_send_tx` không cảnh báo khi gửi cho chính mình; `b20_encode_payment` không assert `isB20`.
6. Lịch sử giao dịch trong Wallet đang đi qua Moralis đã chết → chuyển sang Blockscout ở Phase 2.

**Gỡ / ẩn:**
- **Keeper DCA**, gỡ trong một commit: `api/dca/*` (5 route), `cron/dca-executor`, `lib/dca/*`, `DcaCard`, tool `blue_dca`. Cùng commit, gỡ luôn `cron/b20hub-distribute`.
- **Code chết:** `RobinhoodSendCard.tsx` (được import nhưng không render ở đâu), `BaseProtocolCharts`/`BaseTokensCard`/`BaseTvlChart` (0 chỗ import), `api/robinhood/prepare` (0 caller).
- **Tắt** nút "Review & Sign" của Hood (`ReviewSignPanel` → `api/hood/trade/*`).
- **Ẩn hoặc chặn** `/robinhood-router`: trang deploy contract nội bộ đang công khai.
- **Ẩn:** `prepare_yield` (APY hiển thị là của vault khác), `hub_b20_manage`.
- **Gộp** hai thẻ swap RH làm một, ở Phase 2.

---

## 2. Thẩm quyền

**Hiện trạng.**
- Privy và SIWE đã có sẵn (`lib/session.ts`), nhưng **chỉ 3 route dùng `readSession`**.
- Các route credit nội bộ (`spend`/`topup`/`refund`) đã khoá bằng `INTERNAL_SERVICE_KEY`.
- Các **cửa công khai** thì tin `address` client gửi lên:
  - Chat: `route.ts:2888`;
  - `cron/run`;
  - nhánh credit của x402;
  - `credits/claim` (không cần chữ ký);
  - `credits/purchase` (tính mọi USDC chuyển vào treasury, kể cả settlement x402).
- **Trạng thái riêng của user cũng tin `address`:** `hood/alerts`, `watchlist`, `user-action`, `tglink`, `wallet/spend(-summary)`.
- **Khoá ký phía server:**
  - `B20HUB_KEEPER_PRIVATE_KEY`, và DCA (`KEEPER_MASTER_KEY`, `GAS_TOP_UP_PRIVATE_KEY`): hai route này chấp nhận header `x-vercel-cron`, ai cũng giả được;
  - ACP seller (`ACP_SIGNER_PRIVATE_KEY`);
  - ACP buyer: đây chính là `PAY_TO` `0x0295`, tức treasury đồng thời là ví nóng.

**Nguyên tắc:**
- Mọi hành động làm đổi trạng thái hoặc tính tiền đều phải biết ví là ai **qua phiên SIWE**.
- Chỉ user ký mới chuyển được tiền của user.
- Server **không giữ khoá ký** nào để động vào tiền.

**Sửa / gỡ:**
1. Áp `readSession` cho khoảng 10 route vừa nêu (W0-6).
2. `credits/purchase` chỉ nhận tx top-up thật. Tạm dừng top-up tới khi sửa xong.
3. Gỡ khoá ký của keeper DCA và B20HUB, cùng commit với tầng Thực thi.
4. **ACP buyer: ✅ giữ nguyên** (ShunTr chốt 2026-09-30, lựa chọn (c)). Chấp nhận rủi ro: `0x0295` vừa là ví buyer ACP có signer server, vừa là ví nhận doanh thu. Lúc chốt, ví đang giữ **4,825 USDC + 0,0001 ETH** (đọc qua Blockscout). **Phải xét lại trước G4 (meter công khai) và trước khi mời pilot**, tức khi bắt đầu có người dùng trả tiền thật. Không unset env `ACP_BUYER_*`. Nếu sau này muốn ngừng, dùng thứ tự an toàn dưới đây:
   - **(a)** ShunTr sao lưu `ACP_BUYER_SIGNER_PRIVATE_KEY` offline, hoặc xác nhận vẫn điều khiển được ví qua Privy. Lý do: `0x0295` đang nhận toàn bộ doanh thu x402 và top-up, nên xoá env mà không có bản sao có thể **mất quyền rút tiền**.
   - **(b)** Hoặc làm D2 trước: chuyển `PAY_TO` sang một ví chỉ nhận tiền.
   - **(c)** Sau đó mới unset các env ACP/DCA trên Vercel.
5. Mọi cron chỉ nhận Bearer `CRON_SECRET`. ShunTr xác nhận đã rotate.
6. **Cố ý không làm:** Spend Permissions, uỷ quyền, keeper.

---

## 3. Phán đoán

**Hiện trạng.**
- **Rule engine** (`lib/blue-hood/rule-engine.ts`) viết luật bằng code:
  - drift: thị trường đóng và |lệch| ≥ 2%, chấm sau 6 giờ;
  - arb: thị trường mở và ≥ 1%, chấm sau 4 giờ;
  - bỏ qua pool TVL < $5k hoặc volume 24h bằng 0.
- **Arrow RH vẫn đang phát:** 134 arrow kể từ 2026-09-18, arrow mới nhất lúc 09:44Z hôm nay (`/api/hood/arrows`).
- **4 tool an toàn có verdict do LLM quyết** (W0-19, đã mở code xác nhận):
  - `risk-gate.ts:172-174`: map verdict từ `risk_score` do LLM nghĩ ra; thiếu điểm thì mặc định 50 → CAUTION;
  - `honeypot-check.ts:326`: boolean `is_honeypot` của LLM lật được verdict;
  - `contract-trust.ts:216-221`: LLM tự chọn SAFE/CAUTION/RED_FLAG;
  - `quick-safety.ts:48`: không có điểm thì lấy verdict của upstream.
- `hub_token_pick` trả BUY kèm entry/sizing.
- **Scheduled:** chỉ có preset daily/weekly; có preset `/pick`; UI báo 50 credit nhưng thực tế khoảng 450.
- `rh-stock-alert` và `rh-rwa-dca` thu tiền cho việc không code nào làm.

**Nguyên tắc.** Chỉ phát ra hai thứ:
1. Arrow tính bằng code, có chấm điểm công khai.
2. Fact.

Không có verdict do LLM chọn, và không có advice.

**Sửa / tắt:**
1. **Đóng băng toàn bộ arrow, cả RH lẫn Base.** Nhận định của ShunTr ngày 2026-09-30: không ai trade dựa trên chênh lệch, nên arrow không tạo ra giá trị. Việc cụ thể:
   - tắt phát arrow bằng cờ;
   - bỏ lịch cron `brief-worker` (cron này gọi LLM, tốn phí);
   - ngừng gửi arrow qua `alert-drain`;
   - ẩn `/track` và mục arrow trên board.

   Poller và archive vẫn chạy: dữ liệu vẫn được ghi, gần như không tốn công.
2. W0-19: verdict map bằng code, chỉ từ tín hiệu đo được. Thiếu dữ liệu thì trả UNKNOWN. LLM chỉ viết lời giải thích.
3. `hub_token_pick` chỉ trả fact, hoặc tắt (D31).
4. Scheduled: sửa lỗi P0; bỏ preset `/pick`; hiện đúng giá credit.
5. Tắt `rh-stock-alert` và `rh-rwa-dca` (throw, không thu tiền).
6. Redirect `/tasks` và `/radar` (đều "Coming Soon") về `/cron`; `/alerts` về `/hood/inbox`.

---

## 4. Nhận thức

**Hiện trạng.**
- Desk Hood khoẻ: `/api/hood/health` báo `healthy`, snapshot cách đây 302 giây.
- Chân oracle là Chainlink đọc on-chain. **Chân DEX của cả hai desk lấy qua aggregator** (`dexPrice` trong `lib/robinhood/rwa-price.ts` → DexScreener, GeckoTerminal).
- Desk RH dính bug F6 và dữ liệu nhiễm từ 2026-09-18.
- Archive Base: từ 2026-08-28, không TTL, có `oracle_updated_at` gốc.

**Catalog 114 tool, đo trên prod:**

| Nhóm | Số tool | Trong Chat |
|---|---|---|
| Sống | 67 | 23 |
| Source-code Etherscan (free) + LLM, hoặc chỉ LLM | 14 | 7 |
| `key-exposure` (endpoint account của Etherscan, Base cần gói trả phí) | 1 | 0 |
| RH qua Blockscout (bị 403 khi probe từ máy đo) | 4 | 0 |
| Moralis chết | 9 | 4 |
| Aeon (6 không có writer, 9 có thể được job ngoài repo nuôi) | 15 | 8 |
| Chỉ tính toán | 4 | 0 |

**Nguyên tắc.** Chỉ đưa ra những gì đo được lúc gọi, hoặc đã lưu có provenance. Không đo được thì trả UNKNOWN.

**Sửa:**
1. Chẩn đoán F6 trong `rwa-price`/`rwa-market`. Giả thuyết: USDG bị định giá ×1,052.
2. Cách ly RH: cờ provenance; `spread` trả `null` cho ticker bị ảnh hưởng.
3. Moralis → Blockscout, gồm cả `key-exposure` (Phase 2).
4. 15 tool Aeon: khi không có dữ liệu thì báo "không có dữ liệu Aeon" thay vì để LLM tự bịa.
5. Kiểm Blockscout RH từ Vercel.

---

## 4b. Nhận thức: rà theo nội dung (bổ sung 2026-09-30)

Lần rà ở §4 mới xếp theo sức khoẻ upstream. Phần này xếp **114 tool trên prod** (`/api/catalog`) theo **nội dung BlueAgent nhìn thấy**, kèm việc tool có hiện ra hay không:
- **Chat:** tool có trong `TOOL_ENDPOINT` (`api/chat/route.ts:1115`).
- **MCP:** 10 tên `hub_*` trong manifest.
- **UI:** các nơi còn lại. Xác định bằng cách tìm trong code đã commit.

Số "sống" lấy theo [INV §2b].

| Nội dung | Số tool | Sống | Chat | MCP | UI / ghi chú |
|---|---|---|---|---|---|
| **Khám phá Base** (trending, momentum, dòng tiền, pool mới, narrative, whale) | 17 | 12 | 10 | 0 | `base-alpha`, `base-pulse`, `new-pools` chỉ hiện trong Hub UI, nên **ẩn Hub là mất lối vào cho người dùng**. `safe-trending` chỉ gọi được qua x402/`blue_call`. `whale-*` và `token-alpha`: Moralis chết |
| **Đánh giá token Base** (giá, pool, thanh khoản, holder) | 5 | 4 | 1 | 3 | `token-distribution`: Moralis chết |
| **Robinhood: khám phá + đánh giá** (movers, new listings, search, quote, OHLC, liquidity, flow, holders…) | 12 | 8 | **0** | **0** | **Không hiện ở Chat, MCP hay trang nào**; chỉ x402. Chat swap được token RH nhưng không khám phá được token RH |
| **An toàn và rủi ro** (honeypot, contract, risk gate, scam, AML, protocol risk…) | 14 | 5 | 9 | 4 | 4 tool có verdict do LLM quyết (W0-19); `aml-screen`, `wallet-risk`: Moralis chết |
| **Cổ phiếu token** (Hood, B20, oracle, RH stock) | 13 | 10 | 2 | 1 | Desk RH dính F6 |
| **Ví / danh mục** | 3 | **0** | 1 | 1 | Cả 3 chết theo Moralis, cùng `api/wallet/*` Base (Phase 2 → Blockscout) |
| **DeFi / yield** | 5 | 5 | 2 | 0 | Ngoài vòng swap/send/bridge |
| **Builder / founder + nội dung** (grant, pitch, GTM, repo, 5 lệnh core…) | 34 | ~15 | **17** | 0 | **Ngoài vòng giao dịch.** Chiếm 17/42 tool Hub trong Chat |
| **Hạ tầng giao dịch và chẩn đoán** (`rh-stock-swap-*`, `rh-usdg-route`, `rh-bridge-route`, `rh-portfolio-rebalance`, `rh-sector-basket`, `gas-tracker`, `blue-doctor`…) | 11 | 10 | 0 | 1 | `rh-stock-swap-quote`/`prepare`/`route` là **một cửa Thực thi thứ tư** (bán qua x402), cũng phải qua G2. `rh-rwa-dca`, `rh-stock-alert`: đã tắt |
| **Tổng** | **114** | | **42** | | Chat có thêm 2 tool miễn phí ngoài catalog, thành 44 |

**Bộ tool "hữu ích" theo từng bề mặt, sau các quyết định ngày 2026-09-30.** Hữu ích nghĩa là thuộc vòng Khám phá → Đánh giá → Kiểm tra → Thực thi, hoặc là tool tra cứu, **và** đang sống.

| Bề mặt | Trước | Sau | Thay đổi |
|---|---|---|---|
| **Chat** (bề mặt chính) | 55 | **39** | 55 − 15 − 2 − 5 + 6 = 39:<br>• rút 15 tool builder, trong đó có cả 8 tool Aeon của Chat;<br>• ✅ rút 2 tool DeFi, `hub_defi_opportunity` và `hub_protocol_compare` (ShunTr chốt 2026-09-30);<br>• tạm rút 5 tool (`hub_airdrop`, `hub_aml`, `hub_whale_signal`, `hub_whale_tracker`, `hub_key_exposure`) cho tới khi xong Blockscout;<br>• thêm 6 tool khám phá.<br>`hub_token_pick` chỉ trả fact. Phase 2 nếu đưa lại 5 tool ví thì Chat lên 44, lúc đó xét lại |
| **MCP host** `/api/mcp` | 19 | 19 | Giữ. Đây là bề mặt duy nhất cho agent: builder giao dịch, an toàn, Hood |
| **Skill npm** `@blueagent/skill` | 49 | — | Đề xuất deprecate (§7 #20) |
| **Catalog x402** | 114 | 114 (ẩn) | Giữ theo quyết định Hub; tool hỏng thì tạm tắt từng id |

**Ngoài catalog:**
- board `/hood` và các route `api/hood/*`;
- `api/wallet/*`;
- tool đọc trong Chat: `check_wallet`, `check_memo`, `check_authorization`, `hub_token_price`, `hub_crypto_rpc`;
- `lib/wallet/base-token-discovery.ts`, dùng bởi `wallet/balance`/`holdings`.

**Trang "khám phá" chưa từng được làm:** `/radar` chỉ là "Coming Soon".

**Kết luận thu gọn cho Nhận thức:**
1. **Trong vòng:** 1a Khám phá (Base + RH), 1b Đánh giá, An toàn (sau W0-19), Cổ phiếu token (Hood Base; RH sau F6), Ví (sau Blockscout).
2. **Ngoài vòng, giữ ẩn và không đầu tư thêm:** Builder/founder + nội dung (34 tool), DeFi/yield (5).
3. **Nối:** G0 đưa khám phá RH và `safe-trending` vào Chat, và gắn nút Swap vào kết quả khám phá.
4. **Cửa x402 `rh-stock-swap-*`:** gắn G2 như 3 builder MCP.
5. **Chưa đo:** độ chính xác của từng tool khám phá. Tool trả số từ DexScreener/GeckoTerminal ở thời điểm gọi, chưa có kiểm chứng.

---

## 5. Trách nhiệm

**Hiện trạng.**
- **Track record** (`/api/hood/cohorts`):
  - `n = 247`, trên cửa sổ 250 arrow mới nhất (`feed_capped = true`) trong tổng index khoảng 532, nhưng `window_basis` vẫn ghi `all_time`;
  - 131 arrow đã chấm trong số đó là arrow RH phát sau 2026-09-18.
- **Meter công khai** (`/api/stats/public`):
  - `settlement.count = 2`, trong khi chain có 20;
  - mục `launches` luôn bằng 0 (phần còn lại của luồng launch đã gỡ);
  - `revenueEst $5,51` là ước tính.
- **Guard `action-card-inventory-check`** đang giữ các file B20HUB, trong khi trang B20HUB trả 404 trên prod.
- **Bộ đếm dislocation** được ghi ở 12 chỗ nhưng đọc ở 0 chỗ.
- **Có 44 guard CI**, và archive-watch báo lỗi qua Telegram.

**Nhận định 2026-09-30.** Track record chỉ chấm điểm arrow, mà arrow không có người dùng. Vì vậy tầng Trách nhiệm **chuyển trọng tâm** sang ghi lại những gì liên quan tới **giao dịch và tiền**: meter, biên nhận, lịch sử giao dịch.

**Sửa:**
1. Track record: **đóng băng, không làm W0-20.** Thêm ghi chú "ngừng cập nhật từ 2026-09-30; cửa sổ là 250 arrow mới nhất", để trang không còn claim sai "all_time". Dữ liệu arrow giữ nguyên.
2. ~~Loại arrow RH khỏi track record~~. Không còn cần, vì arrow đã đóng băng.
3. `/api/stats/public`: đọc settlement từ chain, hoặc ghi rõ phạm vi; bỏ mục `launches`; ghi rõ `revenueEst` là ước tính.
4. Sửa guard B20HUB trong cùng commit gỡ B20HUB (luật retire).
5. Đọc bộ đếm dislocation bằng một script ops, loại lượt gọi của chính mình.
6. **Sổ của tầng Thực thi.** Khôi phục lịch sử giao dịch trong Wallet qua Blockscout (Phase 2, việc đã chốt), và giữ biên nhận x402/credit hiện có (`spend:<payer>`). Không build sổ mới.

---

## 6. Thứ tự làm (ước tính ≈ 27–30 ngày Claude, khoảng 6 tuần: 19–21 ngày sửa lỗi, cộng 8–9 ngày dây nối G0–G4)

> Bảng dưới là lịch **sửa lỗi**. Dây nối G1–G4 (§0b) chen vào **tuần 4**, sau khi SIWE, W0-19 và các sửa ở tầng Thực thi đã xong. Nhận thức và Trách nhiệm chuyển sang **tuần 5**.

| Tuần | Việc | ShunTr làm |
|---|---|---|
| **1: Cầm máu** | Gỡ DCA và `b20hub-distribute` cùng khoá ký; gate paymaster; tạm dừng top-up; **đóng băng arrow và bỏ lịch `brief-worker`**; tắt các tool hỏng (9 Moralis, 2 tool RH "ma", `hub_token_pick`); tắt Review & Sign; chặn `/robinhood-router`; ẩn Hub; redirect | ~~Rotate `CRON_SECRET`~~ ✅ đã xong (2026-09-30); unset env DCA sau khi gỡ keeper (env ACP giữ nguyên); tắt storefront Bankr cũ (đã gỡ khỏi repo) |
| **2: Thẩm quyền** | SIWE cho khoảng 10 route; sửa `credits/purchase`; Scheduled P0 | Duyệt trên preview |
| **3: Thực thi + Phán đoán** | Sửa 5 lỗi tầng Thực thi; W0-19; `hub_token_pick` chỉ trả fact; giá credit và preset của Scheduled | Chốt quyết định stock token |
| **4: Nối 5 tầng** | G0: khám phá → nút Swap (Chat, MCP, board Hood), thêm khám phá RH và `safe-trending` vào Chat; G1: bản ghi hành động; G2: `preTradeCheck` trong 5 thẻ, 3 builder MCP và cửa x402 `rh-stock-swap-*` | Chốt ngưỡng BLOCK (#14), tool Chat (#17) |
| **5: Nhận thức + Trách nhiệm** | G3: lịch sử hành động; G4: `/stats/public` lấy từ bản ghi hành động và từ settlement on-chain; chẩn đoán F6; cách ly RH; null path cho Aeon; guard; script đếm | — |
| **Phase 2** | Moralis → Blockscout (gồm `key-exposure`); gộp hai thẻ swap RH; sửa 18 chỗ prompt hứa quá (W0-13); làm phần chặn stock token nếu anh chọn (a) | — |

**Mọi commit đều phải qua gate:** `npx tsc --noEmit && npm test && npm run verify:build`, báo ba kết quả riêng, và Vercel `READY`. Các thay đổi chạm payment path hoặc credit đi qua branch + PR để ShunTr duyệt.

---

## 7. Quyết định cho ShunTr

| # | Tầng | Quyết định | Khuyến nghị |
|---|---|---|---|
| 1 | Thực thi | Tokenized assets (stock token RH, B20 trên Base): có chặn theo quốc gia không | ✅ **ShunTr chốt 2026-09-30: không chặn theo quốc gia, không build geo gate.** Bằng chứng từ issuer (đọc 2026-09-30):<br>• `docs.robinhood.com/chain/stock-tokens`: Stock Tokens *"may not be offered, sold, or delivered, directly or indirectly, in the United States or to… U.S. persons"*, và bị giới hạn ở Canada, UK, Thuỵ Sĩ.<br>• `docs.base.org` (tokenized stocks on Base): *"only available to persons in eligible jurisdictions outside of the U.S."*<br>Giới hạn này đến từ **điều khoản chào bán của issuer**, không phụ thuộc vào cách gọi tên. **Dòng công bố trong thẻ swap: ✅ không thêm** (ShunTr chốt 2026-09-30). Lý do: *"BlueAgent build trên blockchain, không phải build cổ phiếu Mỹ"* |
| 2 | Thực thi | `BankClient`: giữ hay ẩn QR scan-to-pay, onramp, orders | ✅ **Ẩn cho gọn** (ShunTr chốt 2026-09-30) |
| 3 | Thực thi / Thẩm quyền | Paymaster: gate SIWE, hay tắt | ✅ **Gate** (ShunTr chốt 2026-09-30) |
| 4 | Thẩm quyền | Credit miễn phí 500 cr/ngày: giữ (qua SIWE, một lần/ví/ngày), hay bỏ | ✅ **Giữ, qua SIWE, một lần mỗi ví mỗi ngày** (ShunTr chốt 2026-09-30) |
| 5 | Thẩm quyền | ACP buyer: ngừng hẳn | Ngừng |
| 6 | Thẩm quyền | Xác nhận đã rotate `CRON_SECRET` | ✅ **Đã xong** (ShunTr xác nhận 2026-09-30) |
| 7 | Phán đoán | Arrow: **đóng băng** (tắt phát, giữ archive), hay **gỡ hẳn** rule engine, grader và `/track` (gỡ trong một commit, theo luật retire) | ✅ **Đóng băng trước** (ShunTr chốt 2026-09-30: arrow không có giá trị) |
| 8 | Phán đoán | `hub_token_pick` và `/pick`: chỉ trả fact, hay gỡ | Chỉ trả fact |
| 9 | Phán đoán | Scheduled chỉ sửa lỗi (P0), không phát triển thêm | Xác nhận |
| 10 | Nhận thức | Job Aeon ngoài repo: giữ, hay tắt | ✅ **Tắt** (ShunTr chốt 2026-09-30). Sau khi tắt, 9 tool "Aeon?" chuyển thành Aeon rỗng. Cả 15 tool Aeon trả "không có dữ liệu" (§4 mục 4), và không còn tool nào trong số đó nằm trong Chat |
| 11 | Trách nhiệm | ~~Loại arrow RH khỏi track record~~ | Không còn cần (arrow đóng băng) |
| 12 | Trách nhiệm | `/api/stats/public`: đọc từ chain, hay ẩn mục settlement | Đọc từ chain |
| 13 | Trách nhiệm | Route ACP (`/api/acp/*`): gỡ cùng offering | Gỡ |
| 14 | Phán đoán (G2) | Khi nào trả BLOCK | ✅ **Theo khuyến nghị** (ShunTr chốt 2026-09-30). Chỉ BLOCK khi có bằng chứng: honeypot đo được; stock token không có trong registry; phí bridge vượt ngưỡng. Còn lại là WARN. Không có lý do "quốc gia" (xem #1) |
| 15 | Trách nhiệm (G1) | Quyền riêng tư của bản ghi hành động | Riêng tư theo ví, chỉ đọc được qua SIWE; chỉ công bố số tổng hợp |
| 16 | Toàn bộ | Thước đo thành công mới | Số ví khác nhau, không phải của mình, có ít nhất một hành động hoàn tất qua BlueAgent |
| 17 | Nhận thức (G0) | Đưa 5 tool khám phá RH và `safe-trending` (đều đã có) vào tool Chat. Việc này lệch luật cũ "không thêm chat tool" | ✅ **ShunTr chốt 2026-09-30: thêm** |
| 18 | Nhận thức | Sau khi ẩn Hub, người dùng khám phá ở đâu: chỉ Chat + board Hood, hay làm trang "Khám phá" (`/radar`, tức build mới) | ✅ **ShunTr chốt 2026-09-30: chỉ Chat + board Hood. Chat là bề mặt chính; Hood là tính năng build thêm** |
| 19 | Nhận thức | 34 tool builder/founder (17 tool có trong Chat): giữ trong Chat, hay rút khỏi tool Chat (vẫn còn trong catalog và x402) | ✅ **ShunTr chốt 2026-09-30: rút 15 tool khỏi Chat**, giữ `blue_registry` và `blue_compose`. 15 tool này vẫn còn trong catalog và gọi được qua x402/`blue_call` |
| 20 | Toàn bộ | Skill npm `@blueagent/skill` 0.4.1 (49 tên): chỉ 13 tên thuộc vòng hoặc là tool tra cứu; 0 tool giao dịch, 0 tool RH, 0 tool Hood; 27 tên là builder/console; 3 tên chết theo Moralis | ✅ **ShunTr chốt 2026-09-30: deprecate trên npm**, trỏ sang MCP host `https://blueagent.dev/api/mcp`, vốn đã có swap/send/bridge, an toàn và Hood. Deprecate luôn các bản 1.x bị kẹt. ShunTr chạy `npm deprecate` (hành động trên registry công khai). Sau đó Claude gỡ `packages/skill` trong một commit, cập nhật `dead-tool-check` (F1/F2), `docs-truth-check` và các chỗ ghi "49" |
