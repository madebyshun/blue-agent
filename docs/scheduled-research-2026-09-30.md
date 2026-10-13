# Scheduled: hiện trạng, hạ tầng giao hàng, thị trường và thiết kế đề xuất (2026-09-30)

**Trạng thái:** tài liệu nghiên cứu, **không** đổi code, cron, giá, payment path hay dữ liệu nào. Chưa commit. Mọi quyết định chạm credit, payment, on-chain hoặc dữ liệu user đều ghi **ShunTr quyết**.

**Bản sửa sau critic (2026-09-30).** Bản này áp 22 góp ý của một lượt critic cùng ngày (G1–G22, ghi chú ở scratchpad `sched/critic.md`). Lượt critic kiểm lại các trích dẫn file:line tại HEAD và thấy khớp; các góp ý nằm ở thiết kế, billing, độ khớp với plan và tiêu chí chấp nhận. Thay đổi lớn nhất: cảnh báo Basis **không bao giờ** debit credit và chỉ giao theo licence (G1), thêm lỗi L13 (G2), đặc tả đường owner nội bộ cho run báo cáo (G3), và thêm mục 7.8 (ghi đồng thời, rollback, quan sát) và 7.9 (công suất). Chỗ nào không đóng được nằm ở mục 10.

**Phạm vi.** Tính năng "Scheduled" của `/app` (hôm nay nằm ở `/app/cron`), cách nó nối với Blue Chat, hạ tầng giao hàng có thể tái dùng, bản đồ `/app` cho nav năm mục, và thiết kế để Scheduled vừa là nơi Chat soạn lịch, vừa là đường giao cảnh báo Blue Hood Basis trên Base (8453).

**Căn cứ.** Code đọc bằng `git show HEAD:<path>` tại `5bd8c50f`, cũng là `origin/main` và là deployment Production mới nhất (GitHub deployment `success`, 2026-09-28T16:30:40Z). Probe production là GET tuần tự, không cookie, không body, 2026-09-30 từ 04:36Z tới 04:56Z; lượt critic lặp 7 GET lúc 05:17Z và lượt sửa lặp 5 GET lúc 05:25Z, đều khớp. Không POST, không tạo hay chạy task nào, không gọi tool có LLM. Ghi chú đầy đủ của từng nhánh nghiên cứu nằm ở scratchpad của phiên (`sched/code.md`, `verify-code.md`, `delivery.md`, `delivery-verify.md`, `app.md`, `market.md`); tài liệu này là bản tổng hợp và đã áp các đính chính của hai lượt kiểm chứng.

**Quy ước nguồn.**

| tag | nghĩa |
|---|---|
| `path:line` | đọc tại HEAD `5bd8c50f`. Đường dẫn không có tiền tố là dưới `apps/web/src/` |
| `[PROD hh:mmZ]` | GET production ngày 2026-09-30, giờ UTC |
| `[DERIVED]` | suy ra từ code hoặc từ phép tính trên số có nguồn, **chưa quan sát** ở production |
| `[PLAN …]` | `docs/plan-2026-09-29.md` (file untracked, chỉ có ở local) |
| `[INV §n]` | `docs/inventory-2026-09-29.md` (untracked) |
| `[O]` `[O-snip]` `[S]` `[U]` | nghiên cứu thị trường: trang chính thức đọc trực tiếp / trang chính thức chỉ thấy qua snippet tìm kiếm / nguồn thứ cấp / chưa kiểm chứng |
| `[USER 2026-09-30]` | yêu cầu của owner trong phiên này, relay qua harness workflow |
| `[LOCAL]` | thay đổi **chưa commit, chưa deploy** của người khác trong working tree (`api/flash`, `lib/flash`, `FlashTradeCard.tsx`, và bản sửa local của `api/chat/route.ts`, `api/chat/system-prompt.ts`, `chat/components/ToolCards.tsx`). Không file scheduler nào bị sửa local |

### Bối cảnh: Blue Hood Basis trên Base là gì

Theo plan hợp nhất ngày 2026-09-29, **Blue Hood Basis** là xương sống sản phẩm mới [PLAN §1 "Câu xương sống"]:

- **Đo cái gì.** Khoảng cách (basis, hay drift) giữa giá DEX của mỗi stock token Coinbase B20 trên **Base (8453)** và **Chainlink feed của chính token đó**, ghi theo ticker và theo session (regular, premarket, afterhours, weekend). Mỗi dòng có provenance (pool, block).
- **Trả lời câu nào.** "Token đang lệch bao nhiêu so với feed của chính nó, độ lệch đó hiếm cỡ nào với ticker này trong session này, các đợt tương tự kéo dài bao lâu, số này có tin được không" [PLAN §2.4]. Trả bằng fact (bps, percentile, dwell, tuổi oracle), **không** bằng chữ mua/chờ/execute (D31).
- **Giá trị nằm ở cuối tuần.** Trên 33 ngày, 9 ticker, 4,831 số đọc theo giờ: p95 |drift| ngày thường 0.369% (regular), 0.403% (premarket), 0.373% (afterhours), đều FAIL cổng "~50bps" của ShunTr; cuối tuần p95 1.226%, 79 số đọc ≥ 1%, 27 số đọc ≥ 2%, PASS [PLAN §2.3, V1]. Lý do: feed Coinbase không tick khi thị trường Mỹ đóng, nên drift cuối tuần là giá DEX so với giá chốt thứ Sáu, **không phải định giá sai** [PLAN §2.3, trích `b20-quote.ts:38-39`].
- **Ba bề mặt, 0 LLM:** `hood-basis` (id x402 mới, $0.05/call chỉ để khám phá và đo), licence thương mại $79/tháng, và Basis Book miễn phí hàng tháng [PLAN §1 "Sản phẩm"]. Hôm nay chưa bề mặt nào trong ba cái tồn tại; lớp "facts" miễn phí đang có là `/api/hood/dislocation` [PLAN §2.4].
- **Chỗ Scheduled bước vào.** ShunTr muốn licence có "webhook ngưỡng": ví dụ "theo dõi NVDAc mỗi 5 phút; khi basis vượt p95 của chính nó trong session này, gọi webhook", và Chat chỉ còn là nơi soạn schedule đầu tiên [PLAN S11, D1]. Plan xếp việc này vào **D28** vì Scheduled hôm nay chưa làm được (mục 2 bên dưới). Yêu cầu mới nhất của owner là **giữ và phát triển Scheduled cùng Chat** [USER 2026-09-30: "SCHEDULED cũng là thứ liên quan tới chat cần giữ lại và phát triền"], tức nghiêng về D28(a).
- **Ranh giới plan đặt cho Basis, áp vào Scheduled.** Plan ghi "Không bán Basis bằng credit Blue Chat" (`docs/plan-2026-09-29.md:420`), "không làm sản phẩm signal cho người dùng lẻ, vì stock token bị cấm với người US/CA/UK/CH" (`:193`), và tiêu chí của D28(a) là "task Basis không import LLM, không debit credit (test)" (`:829`, cùng ý ở `:977`). Vì vậy trong tài liệu này, cảnh báo Basis **chỉ giao theo licence** và **không bao giờ** ghi sự kiện ledger; cho ví lẻ hay không là Q12 của ShunTr. Phần Scheduled cho user thường, tới khi Q12 được quyết, là **báo cáo LLM định kỳ**.

---

## 1. Tóm tắt 10 dòng

1. Scheduled đang sống ở `app.blueagent.dev/cron` (nhãn nav "Scheduled"); `/app/scheduled` qua hai lần 301 rồi trả 404 [PROD 04:53Z].
2. Lịch chỉ có daily/weekly theo giờ HH:MM, không có điều kiện, không có đích giao ngoài app; kết quả chỉ là một `lastResult` ≤ 4,000 ký tự xem trên `/app/cron`.
3. Mỗi lần chạy là một lượt Blue Chat đầy đủ (model Virtuals theo tier + 55 tên tool Hub), luôn debit credit; cột COST chỉ tính giá model, nên task `/pick` hiện 50 cr trong khi tốn khoảng 450 cr [DERIVED].
4. Lỗi nặng nhất: ai cũng tính phí được vào ví bất kỳ qua `/api/cron/run` hoặc `/api/chat` (địa chỉ lấy từ body); ngoài ra có cửa sổ double-charge ở tick, tick và lệnh lưu của user ghi đè lẫn nhau nên task đã xoá có thể sống lại và trừ tiền tiếp (L13), task server "mồ côi" không thấy và không tắt được, task thứ 11 bị bỏ im lặng.
5. Chat không tạo, sửa hay xem được schedule; system prompt không nhắc Scheduled và còn bảo model rằng mọi lịch mua định kỳ "not available yet"; dòng "post results into Blue Chat" trên panel là sai.
6. Hạ tầng giao hàng có sẵn: sender Telegram + map ví→Telegram + `alert-drain` (*/2), nhưng bước link Telegram tin địa chỉ trong body; web push VAPID chỉ broadcast, không gắn ví; tại HEAD không có sender webhook hay email (Resend từng có và đã bị gỡ).
7. Thị trường: task chạy server-side mặc định, cadence LLM sàn 1 giờ, điều kiện luôn là luật bằng code, Telegram và webhook có chữ ký là chuẩn; người dùng trả tiền theo số cảnh báo và kênh, còn báo cáo LLM định kỳ được gói trong subscription.
8. Đề xuất: một scheduler, hai loại task: "báo cáo" (LLM, sàn 1 giờ, Chat soạn, debit owner qua đường nội bộ có danh tính) và "cảnh báo" (điều kiện bằng code, 0 LLM, **0 sự kiện ledger**, 5 phút, route và khoá riêng), giao in-app / Telegram / webhook theo chuẩn Standard Webhooks.
9. Template đầu tiên là basis cuối tuần trên Base 8453, **chỉ cho licensee**: bản 1 dùng ngưỡng |drift|, bản 2 dùng percentile ticker × session khi `hood-basis` có baseline. Tần suất bắn chưa đo cho tới script K5.
10. Thứ tự: sửa lỗi (P0 cỡ M trên nền W0-6 cỡ L, tuần 1) → cadence dưới ngày → điều kiện → đích giao → template Basis → giá báo cáo. P1–P5 ≈ 15 ngày Claude, **chưa gồm** P0 và W0-6, gấp khoảng 3.75× ngân sách D28 trong plan (≈ 4 ngày, W7–W8) [DERIVED: 15 / 4]; riêng lát licence ≈ 6 ngày, khoảng 1.5× ngân sách đó, **không vừa** [DERIVED: 6 / 4]. ShunTr phải chọn D28, xác nhận D1, chọn cách Chat soạn lịch, quyết cảnh báo Basis cho ví lẻ (Q12) và chế độ chạy mặc định (Q13).

---

## 2. Scheduled hôm nay: sự thật đo được

### 2.1 Địa chỉ, giao diện, lịch sử

| sự thật | bằng chứng |
|---|---|
| Không có route `/app/scheduled` | `blueagent.dev/app/scheduled` → 301 `app.blueagent.dev/scheduled` → 301 `blueagent.dev/scheduled` → 404 "This page could not be found" [PROD 04:53Z]. Không có thư mục `scheduled` trong `app/app/`; `middleware.ts:62` `"cron",         // the wallet's scheduled tasks (CronPanel)` |
| Tính năng ở `/app/cron` | `app.blueagent.dev/cron` → 200, 36,699 B, có `// SCHEDULED` và `No scheduled tasks yet` [PROD 04:40Z, 04:53Z] |
| Nav là link duy nhất tới nó | `app/app/AppShell.tsx:137` `{ id: "cron", href: "/cron", icon: IconCron }`; nhãn `lib/i18n/en.ts:151` `cron: "Scheduled"`. `git grep` không thấy link tuyệt đối nào tới `/cron`, `/app/cron` hay `/scheduled` trong `src/` và `public/` |
| Trang chỉ là vỏ | `app/app/cron/page.tsx:19-24` render `<ChatProvider><CronPanel /></ChatProvider>`. Comment `:3-4` "Reuses the same <CronPanel> the chat surface renders as a tab" đã sai từ khi tab bị gỡ ở `015e41f4` (2026-06-18) |
| Panel (608 dòng) có: form thêm task, dải NEXT 24 HOURS, bảng TASKS (TASK / SCHEDULE / NEXT RUN / LAST RESULT / MODE / COST), công tắc Background từng task, Pause/Resume, Run now, Delete, modal kết quả | `app/chat/components/CronPanel.tsx:27-30` (daily/weekly), `:32-36` (3 preset nhanh), `:226-231` (`<input type="time">`), `:287-336`, `:426-442`, `:566-608` |
| Form không chỉ là preset: có ô tên, giờ, prompt tự do, cộng 3 preset nhanh | `CronPanel.tsx:192-280`, `:32-35` |
| Lịch sử: sinh `5208e952` (2026-06-03); tab Chat bị gỡ `015e41f4` (06-18); quay lại thành `/app/cron` `b9f2c87d` (08-07); scheduler server-side `0cfed5c6` #387 (09-04, 12 file, +1510/−55) là commit **cuối chạm 5 file lõi**. Sau đó runner trình duyệt vẫn đổi: `ChatContext.tsx` được sửa ở `7fe7cf53` (09-05), `5302682a` (09-06) và `fddd30ef` (09-09, #418, thay nguồn của `walletAddr`/`walletReady`, chính là đầu vào của auto-run §2.6). `a3b7b6d7` (09-10) là commit tính năng UI cuối; commit cuối chạm `CronPanel.tsx` là `22013a12` (09-10, một sweep 14 file) | `git log HEAD -- <file>`; 5 file lõi (`user-tasks`, `scheduled-tasks`, `cron-schedule`, `chat/schedule`, `use-schedule-sync`) mỗi file đúng 1 commit; `git show fddd30ef -- apps/web/src/app/chat/ChatContext.tsx` có `+  const { address, isConnected, isReady: walletReady } = useWallet();` |
| Không có test | không file nào dưới `apps/web/scripts` import `scheduled-tasks` hay `cron-schedule` [INV §3], xác nhận lại ở lượt verify |

### 2.2 Mô hình dữ liệu và lịch

| sự thật | bằng chứng |
|---|---|
| Chỉ hai cadence | `lib/cron-schedule.ts:32` `export type Cadence = "daily" \| "weekly";` |
| Server ép mọi giá trị khác thành daily | `lib/scheduled-tasks.ts:142` `const schedule: Cadence = r.schedule === "weekly" ? "weekly" : "daily";` |
| Giờ sai → 09:00, múi giờ sai → UTC; không chọn được thứ trong tuần | `cron-schedule.ts:119-128`, `:108-116`; weekly bắn hôm nay nếu giờ còn tới, không thì +7 ngày [INV §3 Q1] |
| Bước nhảy nguyên ngày, bỏ qua cửa sổ đã lỡ | `cron-schedule.ts:156` `const step = task.schedule === "weekly" ? 7 : 1;`, `:175-179` |
| Bản ghi không có trường điều kiện, chu kỳ phút, đích giao hay lịch sử chạy | `ScheduledTask` ở `scheduled-tasks.ts:84-101`: id, label, schedule, time, tz, prompt, tier, active, nextAt, lastRun?, lastResult?, lastError?, pausedReason? |
| Giới hạn: 10 task/ví, prompt 2,000, nhãn 80, kết quả 4,000 ký tự | `scheduled-tasks.ts:70-74` |
| KV phía server không TTL | `crons:w:<wallet>` ghi bằng `kvSetOrThrow` không ttl (`:212`); `crons:owners` (SET) và `crons:next` (watermark, kẹp ≤ now+1h ở `:61`) cũng không TTL; khoá tick `crons:tick:lock` 360 s (`api/cron/user-tasks/route.ts:69`) |
| Bản sao phía trình duyệt | localStorage `blue_crons_v1_<addr>` (`app/chat/storage.ts:12`); tuỳ chọn mirror vào `workspace:<wallet>` |

### 2.3 Thực thi

| sự thật | bằng chứng |
|---|---|
| Mặc định chạy trong trình duyệt ("On open"), không theo giờ | `app/chat/ChatContext.tsx:480-487` chạy task đến hạn một lần mỗi lần `ChatProvider` mount; `storage.ts:131-137` `isDue` chỉ xét 24 h / 7 ngày, bỏ qua `time`, trả false cho task Background |
| Chỉ task "Background" chạy server-side, và phải ký SIWE trước | công tắc `CronPanel.tsx:426-442` → `schedule.enable` (`app/chat/use-schedule-sync.ts:195-213`) xin chữ ký SIWE nếu chưa đăng nhập, rồi PUT tập Background lên `/api/chat/schedule` |
| Tick server */5, cổng là `CRON_SECRET` | `apps/web/vercel.json` `/api/cron/user-tasks` `*/5 * * * *`; `user-tasks/route.ts:78-83` nhận `Bearer CRON_SECRET` hoặc `?secret=`; GET không auth → 401 [PROD 04:40Z, 04:50Z] |
| Tick chỉ lọc theo `active` và `nextAt` | `user-tasks/route.ts:181` `if (!task.active) continue;` `:182` `if (!Number.isFinite(task.nextAt) \|\| task.nextAt > now) continue;` |
| Tối đa 8 run mỗi tick cho **mọi** ví, mỗi run tới 95 s, trong khi `maxDuration = 300` | `:76` `const MAX_RUNS_PER_TICK = 8;`, `:106-113` abort 95 s, `:62` `export const maxDuration = 300;` → 8 × 95 = 760 s > 300 s [DERIVED] |
| Mỗi run POST `/api/cron/run` với `address: wallet`, rồi `/api/cron/run` gọi `/api/chat` với **một** tin nhắn user, timeout 90 s | `user-tasks/route.ts:106-113`; `api/cron/run/route.ts:139-150`; `/pick`, `/scan`, `/digest` được mở rộng thành lệnh gọi `hub_token_pick`, `hub_narrative`, `hub_ecosystem` (`:37-44`) |
| Tức là mỗi run = một lượt Blue Chat đầy đủ: model theo `tier`, đủ 55 tên tool Hub (trừ tier free), system prompt chuẩn | `api/chat/route.ts:3148-3149` `presetForTier?.model ?? VIRTUALS_CHAT_DEFAULT_MODEL`; `:2982`, `:3173` |
| Run bị cắt bớt: không có connector, skill, memory, web search; card hành động bị bỏ | `cron/run` chỉ gửi `messages`, `tier`, `address` (`:139-148`); `collectRun` chỉ giữ `delta.text` (`:110`) |
| Preset `search` (Venice `grok-4-3`) bị định tuyến sai sang nhánh Virtuals với model id của Venice; preset `free` không bị vì server ghim provider | `api/chat/route.ts:2916-2919` [DERIVED, chưa thử vì sẽ tốn tiền] |
| `nextAt` luôn tiến lên, kể cả khi lỗi, nên run lỗi không được thử lại | `user-tasks/route.ts:220` `task.nextAt = nextFireAt(task, Date.now());` |
| Hết credit (cả credit tin nhắn **lẫn** credit tool) sẽ tạm dừng task | `api/chat/route.ts:2283-2290` phát `insufficient_credits` với `kind: "tool"`; `cron/run/route.ts:106` bắt mọi sự kiện loại đó; `user-tasks/route.ts:200-209` đặt `active=false`. Đính chính của lượt verify: nhánh research đầu nói hết credit tool "không pause", sai |

### 2.4 Billing

| sự thật | bằng chứng |
|---|---|
| Debit theo địa chỉ trong body, không có session | `api/cron/run/route.ts:129` `const address = (body.address ?? "").trim();`; `api/chat/route.ts:2888` `if (address && INTERNAL_KEY && /^0x[a-fA-F0-9]{40}$/.test(address)) {` rồi debit; `/api/chat` chỉ rate-limit theo IP (`:2789`), không có `readSession` |
| `/api/cron/run` công khai theo thiết kế | `cron/run/route.ts:19-27` "PRIVILEGE: none. This route is reachable by anyone"; GET → 405 [PROD 04:40Z] (route tồn tại, chỉ nhận POST) |
| Giá một run = giá tin nhắn theo tier (hoàn nếu lượt rỗng) + giá mọi tool Hub trả phí mà model chọn gọi (debit **trước** khi handler chạy, không hoàn nếu handler lỗi) | `api/x402/[tool]/route.ts:303-315` rồi `:359-370` |
| UI hiển thị thiếu giá | `CronPanel.tsx:158`, `:358` chỉ dùng `creditCost(tier)`. Preset `/pick` gọi `token-pick-signal` giá `$0.20` = 400 cr trước giảm giá (`lib/credit-pricing.ts:26` 2000 cr/USDC, `toolCreditCost` `:135-143`), nên hiện 50 cr mà tốn ≈ 450 cr [DERIVED] |

### 2.5 Kết quả và cách user thấy

| sự thật | bằng chứng |
|---|---|
| Chỉ giữ kết quả **cuối** | `user-tasks/route.ts:197` `task.lastResult = outcome.text;`, `:214` lỗi cắt 300 ký tự; không có run log |
| Trình duyệt kéo kết quả một lần mỗi lần mở trang, không poll, không push | `use-schedule-sync.ts:104-149` |
| Không có kênh nào đẩy kết quả ra ngoài | chỉ có ghi `lastResult` ở server (`user-tasks:197`) và ở trình duyệt (`ChatContext.tsx:457-461`); tìm toàn repo không thấy sender nào đọc `crons:*` [verify-code §D] |
| Dòng chữ trên panel sai | `CronPanel.tsx:341` "Background tasks run server-side and post results into Blue Chat." Không code nào tạo tin nhắn chat từ một run. Dòng này chỉ hiện trên desktop (`hidden sm:block`) |

### 2.6 Lỗi (xếp theo mức nặng)

| # | lỗi | bằng chứng | hậu quả | độ chắc |
|---|---|---|---|---|
| L1 | Ai cũng tính phí được vào ví bất kỳ | `cron/run:129`, `:147`; `chat/route.ts:2888`; header `api/chat/schedule/route.ts:14-16` tự nhận `/api/chat` "accepts a client-supplied address" | `POST /api/cron/run {address: <ví nạn nhân>, tier: "deep"}` trừ credit của nạn nhân, cộng credit mọi tool mà model gọi | từ code; **không thử** vì sẽ tiêu tiền |
| L2 | `/api/cron/run` không có rate limit riêng; limit 30/phút của `/api/chat` tính theo `x-forwarded-for` của chặng server-to-server | `lib/rate-limit.ts:81-85` | L1 không bị giới hạn theo IP người gọi | [DERIVED] |
| L3 | Double-charge khi tick bị cắt giữa chừng | ghi trạng thái một lần mỗi ví **sau** vòng của ví đó (`user-tasks:223-235`); 760 s > 300 s | run đã debit nhưng `nextAt` chưa lưu, tick sau chạy lại | [DERIVED], chưa quan sát |
| L13 | Tick và lệnh lưu của user ghi đè lẫn nhau trên `crons:w:<wallet>` (lost update) | tick đọc cả bản ghi ở `user-tasks:160`, chạy tới 95 s mỗi task, rồi ghi **cả mảng** đã đọc ở `:225` (`writeOwnerTasks`, `scheduled-tasks.ts:206-212`); PUT cũng đọc ở `chat/schedule/route.ts:120` rồi ghi cả bản ghi ở `:133`; không có so phiên bản, không có khoá chung | **Chiều 1:** user xoá hoặc tạm dừng task X trong lúc tick đang chạy → bản ghi tick ghi xuống đưa X về `active` → X chạy và trừ tiền tiếp. Client không kéo lại (`use-schedule-sync.ts:105-107`, một lần mỗi ví) và không PUT lại (dấu vân tay `lastSent`, `:155`), nên user không thấy. **Chiều 2:** tick ghi giữa lúc PUT đọc và ghi → PUT mang `lastRun`/`lastResult` cũ (`scheduled-tasks.ts:157-158`) → kết quả đã trả tiền biến mất | [DERIVED], chưa quan sát |
| L4 | Task server "mồ côi" | client chỉ kéo bản server khi có ≥ 1 task Background local (`use-schedule-sync.ts:105`), bỏ qua PUT danh sách rỗng khi mới mount (`:159-163`), và không ai gọi `DELETE /api/chat/schedule` | xoá localStorage hoặc đổi trình duyệt: task server vẫn chạy và trừ tiền, UI không thấy, không tắt được | [DERIVED] |
| L5 | Task thứ 11 bị bỏ im lặng và không bao giờ chạy | server bỏ (`scheduled-tasks.ts:170`), trả `dropped` (`chat/schedule/route.ts:147`) mà client không đọc (`use-schedule-sync.ts:184-186`); local vẫn `background:true` nên trình duyệt cũng không chạy; panel vẫn hiện giờ chạy (`storage.ts:151-153`) | user tưởng có lịch, thực tế không | từ code |
| L6 | UI báo giá thiếu | §2.4 | user không lường được chi phí | từ code |
| L7 | Mở trang đúng lúc task vừa đến hạn làm mất lượt hôm đó | mỗi lần mount PUT lại, server tính lại `nextAt` (`scheduled-tasks.ts:157`, `:167`) | lượt chạy dời sang cửa sổ sau (cửa sổ thường ≤ 5 phút) | [DERIVED] |
| L8 | "Run now" timeout 60 s ở trình duyệt nhưng `cron/run` chờ tới 90 s | `ChatContext.tsx:437` | run dài bị tính tiền nhưng hiện lỗi, kết quả mất | [DERIVED] |
| L9 | Lý do tạm dừng luôn ghi "balance was 0", và phần chữ run đã tạo bị bỏ khi hết credit tool | `chat/route.ts:2039` gán cứng `balance: 0`; `cron/run:166-170` trả `result: ""` | thông báo sai, mất kết quả đã trả tiền | từ code |
| L10 | SADD lỗi bị nuốt | `lib/kv.ts:387-390` "Never throw"; `putSchedule` vẫn trả 200 | ví không được ghi danh cho tới lần mở trang Blue Chat kế tiếp (PUT chạy lại SADD). Đính chính của lượt verify: tự lành, không phải "không bao giờ chạy" | [DERIVED] |
| L11 | Định tuyến sai preset Venice | §2.3 | task preset `search` không có web search, model id lạ gửi tới Virtuals | [DERIVED] |
| L12 | Copy sai và comment cũ | `CronPanel.tsx:341`; `cron/page.tsx:3-4`; `SidebarTab` `"cron"` (`app/chat/types.ts:129`) là state chết | người đọc hiểu sai | từ code |

**Chưa rõ lỗi tự động chạy ở foreground rộng tới đâu.** Lượt verify cho rằng effect ở `ChatContext.tsx:481-487` đọc danh sách `crons` cũ lúc `walletReady` vừa thành true, nên danh sách của chính ví hiếm khi tự chạy; còn khi tải cứng trang với ví đang kết nối lại, các task đến hạn của **danh sách khách** có thể chạy và bị tính vào ví [DERIVED từ thứ tự effect React, chưa quan sát].

### 2.7 Bề mặt lân cận hứa "lịch" hoặc "cảnh báo" mà không giao

| bề mặt | điều nó hứa | thực tế | bằng chứng |
|---|---|---|---|
| `rh-stock-alert` ($0.10) | "Poller will notify when it crosses." | lưu `rh-alert:*` (có `webhook_url`), không code nào đọc | `api/x402/_handlers/rh-stock-alert.ts:112`, `:22` `webhook_url?: string;   // optional POST target for the cron`; `git grep rh-alert` chỉ thấy chỗ ghi. Plan: RETIRE (W0-5, #17) |
| DCA (`/api/dca/create`) | lịch hourly→weekly | executor chưa từng nằm trong `apps/web/vercel.json` (từng thêm nhầm vào `vercel.json` ở root, `5788f443`); route create tin `body.userAddress` | `lib/dca/types.ts:19`; GET `/api/dca/create` → 405 [PROD 04:56Z]. Plan: RETIRE (#38), ShunTr quyết |
| DCA executor (`/api/cron/dca-executor`): **rủi ro tiền, không chỉ copy** | chạy schedule DCA mỗi 5 phút | auth chấp nhận **sự có mặt** của header `x-vercel-cron`, header mà bất kỳ caller nào cũng gửi được, rồi chạy lệnh swap do keeper ký trên allowance USDC user đã approve [INV §1 "Two cron routes accept a header any caller can send", không thử vì chạm tiền]. Cùng lớp lỗi: `user-tasks` nhận secret qua query `?secret=` (`user-tasks/route.ts:81`), tức secret có thể nằm trong log URL. Hiện trạng rotate `CRON_SECRET` sau vụ Sentinel: **unknown** [PLAN W0-1] | `api/cron/dca-executor/route.ts:33-38`, `:36` `const isVercelCron = req.headers.has("x-vercel-cron");`. Plan: W0-1 (S1 tiền), điều kiện merge là ShunTr xác nhận đã rotate. **Hệ quả cho tài liệu này:** không route mới nào gác bằng `CRON_SECRET` (tick cảnh báo, drain giao hàng) được ship trước khi W0-1 merge và ShunTr xác nhận rotate; route mới chỉ nhận `Authorization: Bearer`, không nhận query, không nhận `x-vercel-cron` |
| `/docs/blue-hood` công khai | "Tasks: Scheduled agent jobs from 4 templates. Runs via cron + ERC-4337 session keys. Coming in Stage 3." | không có hệ thống đó | `app/docs/blue-hood/page.tsx:59`; trang 200 và chứa câu này [PROD 04:56Z] |
| `/app/tasks` | ComingSoon "Automated strategies — DCA, TP/SL, recurring buys — via scoped session keys." | placeholder | `app/app/tasks/page.tsx`; 200 [PROD 04:37Z] |
| [LOCAL] `flash_trade` | lệnh điều kiện (limit, stop-loss, DCA, TWAP) chạy trên hạ tầng của Definitive Flash, "chat does not run a background job" | chưa deploy; không đụng file scheduler nào. Rule 6g local mâu thuẫn với `system-prompt.ts:241` (không có DCA) và rule 6f vẫn giữ nguyên | `git diff HEAD -- apps/web/src/app/api/chat/system-prompt.ts` |

---

## 3. Scheduled và Chat hôm nay, và khoảng trống

### 3.1 Nối với nhau ở đâu

| câu hỏi | trả lời | bằng chứng |
|---|---|---|
| Scheduled có thuộc cây Chat không? | Có, về code: panel nằm ở `app/chat/components/`, lấy state qua `useChat()`, trang bọc `ChatProvider` | `CronPanel.tsx:117` `const { crons, addCron, updateCron, deleteCron, runCron, cronRunning, schedule, holderTier } = useChat();` |
| Chat tạo, sửa hay xem được schedule không? | **Không.** 55 tên tool trong `HUB_TOOLS` không có tên nào về lịch; `ToolCards.tsx` không có card cron/schedule; slash menu chỉ có `skill`; MCP (`lib/mcp-tools.ts`, `api/mcp`) không có tool lịch hay cảnh báo | `addCron(` chỉ có một caller: `CronPanel.tsx:132` |
| System prompt nói gì? | Cấm: `system-prompt.ts:241` "There is NO DCA / recurring-buy capability in Blue Agent. If the user asks to … set up any recurring purchase, say plainly that scheduled buys are not available yet." Rule 6f cùng ý (`:295`) | HEAD |
| Panel tự nói gì? | `CronPanel.tsx:525-528` "Blue Chat has no natural-language task parser, so a 'describe it in plain words' input would promise a feature that isn't there." | HEAD |
| User nói "theo dõi X" trong chat thì sao? | Map sang `blue_monitor`, một ảnh chụp một lần, không lưu, không chạy lại | `api/chat/route.ts:886-887` |
| Prompt của schedule dùng được tool giống chat không? | Phần lớn có: cùng pipeline `/api/chat`, cùng `HUB_TOOLS`, tính phí vào owner qua `X-Blue-User`. Trừ connector, skill, memory, web search, định tuyến Venice; card hành động bị bỏ | §2.3 |
| Kết quả có quay về Chat không? | Không. Chỉ `lastResult` trên `/app/cron` | §2.5 |
| Mở trang Chat có làm task chạy không? | Có thể: `ChatProvider` mount ở `/chat`, `/cron`, `/models`, `/skills` (và `PanelHost`); mỗi lần mount chạy task foreground đến hạn. Nav năm mục bỏ models/skills, nên user ở trong Hood sẽ không kích task foreground | `ChatContext.tsx:480-486`; §5 |

### 3.2 Khoảng trống để "Chat là nơi soạn lịch"

1. **Không có đường soạn.** Không tool, không card, không slash command, không rule prompt; `addCron` có trong context nên một card **có thể** gọi nó, nhưng chưa ai làm.
2. **Chat không có danh tính đã xác thực.** `/api/chat` không đọc session (§2.4), còn `/api/chat/schedule` chỉ nhận ví từ cookie SIWE (`chat/schedule/route.ts:51-66`). Vì vậy việc ghi lịch phải xảy ra ở trình duyệt, qua cookie, không phải từ server chat.
3. **Kết quả không quay về hội thoại.** Workspace không dùng được làm hộp thư: `scheduled-tasks.ts:38-45` tự ghi "reusing it is tempting and wrong", và `app/chat/workspace-sync.ts:18-21` nói bản server chỉ là gương của trình duyệt. Cần key riêng.
4. **Prompt cấm lịch.** `system-prompt.ts:241` và rule 6f phải sửa cùng commit với bất kỳ đường soạn nào, nếu không model sẽ vừa có tool vừa bị cấm dùng.
5. **Plan có ràng buộc ngược chiều.** Plan ghi "không thêm chat tool, không thêm MCP tool" [PLAN §1 "BlueAgent KHÔNG làm"], trong khi D1 muốn Chat thành nơi soạn schedule. Đây là quyết định của ShunTr (mục 9, Q3).

---

## 4. Hạ tầng giao hàng có sẵn để tái dùng

### 4.1 Bảng trạng thái

| kênh | có gì | sống ở prod? | gắn danh tính | điều kiện tiên quyết trước khi dùng cho Scheduled | cỡ |
|---|---|---|---|---|---|
| **In-app** (`lastResult`) | đã chạy | có | ví (SIWE) | thêm run log (key riêng, TTL) | S |
| **Telegram DM** | sender `lib/telegram/bot.ts:76-110` (HTML, timeout 10 s, "NEVER throws" `:67`, `esc()` `:115-117`); map ví→TG `tgUserForAddress` (`lib/blue-hood/watchlist.ts:480-485`); drain `api/cron/blue-hood/alert-drain` */2, lô mặc định 10, kẹp 1..25 (`:62`) | webhook GET 200 `{"ok":true,"webhook":"blue-hood-telegram"}` [PROD 04:49Z] (chỉ chứng minh đã deploy); drain 401 khi không auth [PROD 04:50Z] | **không**: `api/hood/tglink/route.ts:16-20` "the route trusts the `address` in the body"; `consumeTgLinkCode` ghi đè map ngược vô điều kiện (`watchlist.ts:474`); không có `/unlink` | bắt SIWE ở bước link, thêm unlink và xoá key cũ khi link lại; hàng đợi **riêng** (không đi chung `bh:alert:pending`) | M |
| **Web push** | VAPID `lib/blue-hood/push.ts`; health báo đủ public/private/subject [PROD 04:37Z, 04:49Z]; service worker `public/hood-sw.js` 200 trên `app.blueagent.dev` [PROD 04:39Z] | có (broadcast Hood) | **không**: `StoredPushSub` không có ví (`push.ts:26-31`); subscribe không auth (`api/hood/push/subscribe/route.ts:28-47`) | subscribe sau SIWE + map ví→endpoint; sender `pushToWallet` có timeout và TTL dài hơn 60 s (`:200`); payload kind mới trong `hood-sw.js` (`:38` bỏ mọi kind khác `hood.arrow`); **một** bản ghi endpoint cho cả hai opt-in, vì nút Enable của Hood hủy subscription cũ (`app/app/hood/inbox/EnableAlertsButton.tsx:210-232`) | M–L |
| **Inbox `/hood/inbox`** | chỉ là bookmark "đã đọc" chung | 200 | không: mọi client đều rơi về user `"public"` [PROD 04:50Z: `{"user":"public","last_read_at":"2026-09-21T18:35:00.662Z"}`, unread 103] | không đáng tái dùng; panel Scheduled đã là kênh in-app tốt hơn | — |
| **Bản ghi cảnh báo Hood** (`bh:alert:*`) | mẫu tốt: một record cho mọi kênh, id tất định (không replay), cờ đã-giao theo từng kênh | có | địa chỉ do caller tự khai (`/api/hood/alerts?address=`) | chép **mẫu**, không chép record hay `emitAlertsForArrow` (hình dạng arrow, và bị chặn theo health của engine Hood `alerts.ts:295-316`) | — |
| **Webhook ra URL của user** | **không có sender giao hàng** | — | — | viết mới theo Standard Webhooks (mục 7.7); guard SSRF hiện có `lib/mcp-client.ts:39-58` chỉ so chuỗi hostname, và phép so IPv6 `host === "::1"` (`:54`) không bao giờ khớp vì URL giữ ngoặc vuông (`new URL("http://[::1]/").hostname === "[::1]"`, đo local bằng node) | L |
| **Email** | không có ở HEAD. Từng có Resend: `d7b19321` (daily-brief, gỡ ở `da1e94b8`) và `sendWelcomeEmail` trong `api/market/subscribe` (gỡ ở `0970f124`, 2026-09-02). Tên env `RESEND_API_KEY`, `BRIEF_FROM_EMAIL`, `BRIEF_EMAIL_LIST` vẫn nằm trong bản pull env prod, 0 reader [INV :1281-1283] | — | server không đọc được email Privy (không có Privy server SDK; chỉ `NEXT_PUBLIC_PRIVY_APP_ID`) | **không trong lộ trình này.** Đường Resend cũ là bề mặt đã retire; dựng lại nó là điều luật retire trong CLAUDE.md cấm. Một kênh email, nếu có, là **quyết định bề mặt mới** của ShunTr (cần nguồn email đã xác minh và unsubscribe), không phải "khôi phục". Ba tên env trên là **env chết** (`git grep` tại HEAD dưới `apps/web/src`: 0 kết quả); gỡ khỏi Vercel là việc của ShunTr | — |
| **Thông báo Base App / Farcaster mini-app** | chỉ có receiver | `/api/farcaster/webhook` 200 [PROD 04:50Z] | fid, không phải ví | handler chỉ log loại sự kiện và cố ý không verify chữ ký (`api/farcaster/webhook/route.ts:16-20`, `:41-47`); cần lưu token, verify, map fid→ví, viết sender | L |

### 4.2 Rủi ro của hạ tầng Hood nếu đem dùng nguyên xi

- **Hàng đợi Telegram bị chặn đầu** [DERIVED]: drain luôn lấy 10 id đầu (`alerts.ts:415-416`), mọi lỗi non-2xx đều giữ lại để thử lại (`alert-drain:206-210`), không xử lý 429/403. 10 id hỏng vĩnh viễn ở đầu hàng làm kẹt hàng tới 7 ngày (TTL).
- **Mất cập nhật trên hàng đợi** [DERIVED]: hàng đợi là một mảng JSON sửa kiểu đọc rồi ghi, `kvMutate` tự ghi "NOT atomic" (`lib/kv.ts:275`); `brief-worker` (*/3) và `alert-drain` (*/2) trùng nhau mỗi 6 phút. Thêm Scheduled làm writer thứ ba sẽ nới rộng lỗi này.
- **Chặn theo health Hood**: nếu dùng chung `alert-drain`, cổng health (`alert-drain:219-229`) sẽ giữ mọi tin Scheduled mỗi khi engine Hood "mù".
- **Thông lượng**: 10 tin mỗi 2 phút là khoảng 300 DM/giờ (tối đa 750/giờ ở mức kẹp 25), dùng chung với bản sao firehose của mỗi arrow (`alerts.ts:376-378`).
- **Index push mất subscription** [DERIVED]: `pushArrowToAll` đọc index lúc đầu và ghi đè lúc cuối (`push.ts:164-169`, `:219`), subscription đăng ký giữa chừng rơi khỏi index.

### 4.3 Cách nối (điểm móc trong code)

1. **Thêm trường đích giao ở bốn whitelist**, vì mỗi chỗ dựng lại object theo từng trường và âm thầm bỏ trường lạ: `ScheduledTask` (`scheduled-tasks.ts:84-101`), `sanitizeTasks` (`:126-173`), `CronTask` (`app/chat/types.ts:86-125`), và `toPayload` phía trình duyệt (`use-schedule-sync.ts:67-72`, cộng phần merge GET `:121-135`).
2. **Xếp hàng giao sau khi ghi trạng thái thành công**, không phải tại `user-tasks/route.ts:197`: nếu ghi `writeOwnerTasks` (`:223-235`) lỗi, comment ở `:227-230` nói task "would fire again next tick — a double charge"; xếp hàng sớm sẽ thêm cả giao hai lần.
3. **Hàng đợi riêng** và **drain riêng**, tái dùng `sendMessage`, `esc`, `tgUserForAddress`, và trình tự đọc → gửi → đánh dấu → xoá của `alert-drain`. Hàng đợi **không** được là một mảng JSON sửa kiểu đọc-rồi-ghi như `bh:alert:pending` (§4.2, `lib/kv.ts:275` "NOT atomic"): mỗi sự kiện là một key `crons:deliver:<eventId>` tạo bằng `kvSetNX` (`lib/kv.ts:371`, có TTL), cộng `kvSAdd` id đó vào SET `crons:deliver:pending` (`:387`, SADD là nguyên tử). Cùng `eventId` xếp hàng hai lần thì lần sau thua `SETNX`, nên không giao hai lần; hai writer xếp hàng cùng lúc không làm mất nhau.
4. **Định dạng**: kết quả LLM là markdown, phải qua `esc()` cho `parse_mode: "HTML"`; 4,000 ký tự cộng tiêu đề có thể vượt giới hạn 4,096 ký tự của Telegram (tài liệu Bot API, không đo), nên cắt và kèm link về `/cron`.
5. **Mặc định riêng tư**: tin Telegram chỉ gồm tên task, một dòng fact và link; toàn văn là tuỳ chọn bật.

---

## 5. Bản đồ `/app` và nav năm mục

### 5.1 Khung chung

- Mọi trang `/app` render trong một shell: `app/app/layout.tsx:33` `return <AppShell toolCount={TOOL_COUNT}>{children}</AppShell>;`. Có 38 `page.tsx` được commit dưới `app/app/`.
- Nav là một mảng `NAV_GROUPS` (`AppShell.tsx:128-175`), 12 mục (11 href trong app + Docs), dùng chung cho rail desktop (`:380`) và drawer mobile (`:696`): một chỗ sửa đổi cả hai.
- Allowlist route: `APP_SEGMENTS` (`middleware.ts:27-112`); trên app host, segment lạ bị 301 sang host chính (`:412-415`), nên trang thiếu kết thúc bằng 404. App host `/` rewrite sang `/app/chat` (`:390-394`).
- **Không guard nào ghim nav**: không script nào nhắc `AppShell`/`NAV_GROUPS`, và `link-liveness-check.ts` cố ý chỉ kiểm link tuyệt đối. Một href nav trỏ vào route không tồn tại sẽ qua gate và 404 ở prod.

### 5.2 Năm mục của owner → route thật

| mục | route hôm nay | prod [04:36–04:37Z] | phải đổi gì |
|---|---|---|---|
| Hood | `/hood` | 200 | chuyển lên đầu; giữ sub-nav `app/app/hood/HoodSidebar.tsx:154-156` (Drift board, Inbox, Track record) |
| Scheduled | `/cron` | 200; `/scheduled` 404 | xem hai phương án bên dưới |
| Wallet | `/wallet` | 200 | không. Lưu ý `app/app/wallet/page.tsx:2` import `../bank/BankClient`, nên thư mục `bank` đã archive phải giữ |
| Usage | `/usage` | 200 | không; đã có nút Top up riêng (`app/app/usage/page.tsx:162-167`), bỏ Plans không làm mất đường nạp; sửa link "View plans" (`:157`) khi `/plans` retire |
| Chat | `/chat`, app host `/` | 200 | chỉ đổi thứ tự. `/` có chuyển sang Hood hay không là quyết định riêng (plan #58 chỉ đổi `homeUrl` của mini-app) |
| Docs → footer | `/docs/blue-chat` (`AppShell.tsx:172`) | 301 chéo host → 200 | gỡ khỏi `group_account`, thêm vào **cả hai** footer (desktop `:487-543`, drawer `:735-765`), dùng link tuyệt đối `https://blueagent.dev/docs/...` như `Home ↗` (`:498`) để bỏ bước 301 và để link-liveness nhìn thấy |

**URL của Scheduled.**

- **Phương án A (giữ `/cron`)**: không đổi gì; nhãn đã là "Scheduled". `/scheduled` vẫn 404.
- **Phương án B (URL chuẩn `/scheduled`)**: thêm `"scheduled"` vào `APP_SEGMENTS`; chuyển `app/app/cron` → `app/app/scheduled`; đổi href và khoá i18n `nav.cron` (`en.ts:151`, `zh.ts:148`); giữ `/cron` bằng một 301 viết dạng `pathname === "/cron" || pathname.startsWith("/cron/")` (dạng literal là dạng `link-liveness-check` đọc được vào tập redirect). `/api/cron/*` an toàn vì `/api` đi qua trước trên app host (`middleware.ts:368-373`). Phạm vi ảnh hưởng: link nội bộ duy nhất là `AppShell.tsx:137`, không có link tuyệt đối nào đã đăng. B sửa luôn một URL đang 404. Khuyến nghị: **B**, trong một commit **riêng** (P0-URL, §8), không gộp vào PR credit của P0, theo luật một fix một commit.

### 5.3 Bảy mục rời nav

| mục | xử lý | lưu ý |
|---|---|---|
| models | rời nav, trang đóng băng (#53, #60) | còn link từ `app/chat/components/SettingsModal.tsx:12` |
| dashboard | rời nav, trang **phải** còn (#59) | `/profile` culled-301 về nó (`middleware.ts:192-193`, có `culled-routes-check.ts`); `/alerts` redirect về nó |
| connectors | RETIRE cùng `/api/mcp-client` (#55) | bỏ link `app/app/dashboard/_views/OverviewView.tsx:483`, thêm redirect cho URL từng sống |
| skills | RETIRE (#54) | bỏ `SettingsModal.tsx:13`; chỉ gỡ khỏi `APP_SEGMENTS` thì `/skills` sẽ 301 sang host chính rồi sang `/soul` (`middleware.ts:427-432`), một trang không liên quan, nên cần redirect tường minh |
| plans | gỡ nav (#56), trang theo D8 | còn link từ `AccountMenu.tsx:61`, `usage/page.tsx:157`, `signup/page.tsx:366` |
| hub | theo D29 | URL vẫn sống: sitemap có 114 URL `/app/hub/<id>` |
| docs | xuống footer | như trên |

Theo luật link của plan, **mỗi mục rời nav đi trong cùng commit retire bề mặt của nó**, không làm một commit "đổi nav" riêng [PLAN #53]. Khi còn năm mục, `group_hub` và `group_account` rỗng nên nhãn nhóm (`en.ts:155-158`) phải sửa.

**Waitlist.** `WAITLIST_EXEMPT` (`middleware.ts:241`) có chat, hood, hub, wallet, signup nhưng **không** có cron/scheduled và usage. Nếu `APP_WAITLIST=1` bị bật, 2 trong 5 mục lõi sẽ 307 sang `/waitlist`. Thêm hai mục này cùng commit đổi nav.

### 5.4 Trang không nằm trong nav và chưa có quyết định

`/radar`, `/trade`, `/bridge`, `/tasks` (placeholder ComingSoon), `/signup`, `/rewards`, `/alerts`, `/hub/stats`, `/hub/registry/*`, `/hub/builders/[address]`, `/hood/inbox` (ở cấp trang). `/b20hub` và 5 trang con 404 từ ngày tạo (RETIRE #34). `/robinhood-router` công khai và ghi on-chain (RETIRE #39, ShunTr quyết). `/tasks` và `/docs/blue-hood:59` hứa một hệ thống lịch khác Scheduled, nên sửa hoặc gỡ cùng P0-URL.

---

## 6. Thị trường

### 6.1 Bảng benchmark

| sản phẩm | cadence | điều kiện | giao hàng | giá / giới hạn | nguồn |
|---|---|---|---|---|---|
| ChatGPT Tasks | một lần, ngày, tuần, tháng; "no more than once per hour" | từ 2026-08: "monitoring tasks" do LLM phán | in-app, push hoặc email | task hoạt động: Go 3, Plus 5, Business/Edu 10, Pro/Enterprise 15 (nguồn thứ cấp nói Business 15) | [O-snip] help.openai.com 10291617; [S] toolnavs; [O] community.openai.com/t/1394769 |
| Claude Cowork | giờ, ngày, ngày làm việc, tuần | không | mục "Scheduled" trong app | mọi gói trả phí; chạy "even when your computer is asleep" | [O] support.claude.com 13854387 |
| Claude Code routines | preset + cron qua CLI, sàn 1 giờ | trigger: lịch, API, sự kiện GitHub | tạo session; connector đẩy ra Slack… | 100 run lịch/giờ/tài khoản; tính vào usage của gói | [O] code.claude.com/docs/en/web-scheduled-tasks |
| Perplexity Tasks | tuỳ ý nhưng sàn 1 giờ | task không có; Price Alerts: giá mục tiêu hoặc % thay đổi, rồi LLM giải thích | email, in-app | 15 task mỗi hội thoại Computer; tốn credit Computer | [O-snip] perplexity.ai 11521526; [S] |
| Manus | ngày, tuần, giờ cố định | không | vào task, Project, web app | tính credit | [O] manus.im |
| Zapier | giờ/ngày/tuần/tháng, không cron; polling 15/2/1 phút theo gói | Filter/Paths (luật) | mọi app; webhook từ Pro | Pro từ $19.99/tháng (năm) | [O] zapier.com/pricing |
| n8n | cron có trường giây | IF/Switch (luật) | mọi node | €20/tháng cho 2.5K execution | [O] n8n.io/pricing |
| Nansen Smart Alerts | theo sự kiện, trễ < 5 s trên Base | **luật bằng code** (usdValue, netflow_1d…); LLM chỉ soạn luật | Telegram, Slack, Discord, webhook ký HMAC (`X-Nansen-Signature`) | Free 1 cảnh báo; **Pro $49/tháng (năm) hoặc $69, không giới hạn** | [O] docs.nansen.ai, academy.nansen.ai 9412804 |
| Arkham Alerts | theo sự kiện | lọc bằng code (entity, token, USD, chain) | email, Telegram, webhook | giá không công bố | [O] codex.arkm.com |
| Cielo | theo sự kiện | lọc theo ví/token | Telegram, Discord | 120 / 1,000 / 3,000 cảnh báo/giờ; Pro $59, Whale $199 | [O] docs.cielo.finance; giá [S] |
| TradingView | thời gian thực | luật (giá cắt, indicator, Pine) | app, push, email, webhook (gói trả phí) | cảnh báo giá 3 / 20 / 100 / 400 / 1,000 theo gói; $12.95 → $199.95 | [O] tradingview.com/pricing |
| cryptocurrencyalerting | thời gian thực | luật | email, SMS, push, Slack, Telegram, Discord, webhook (trả phí) | 3 / 20 / 120 / 300 cảnh báo ở $0 / $3.99 / $19.99 / $49 | [O] cryptocurrencyalerting.com/pricing.html |
| Chainlink Automation | cron hoặc log trigger | `checkUpkeep` bằng code | giao dịch on-chain | gas + premium % + ~80k gas; owner trả trước bằng LINK | [O] docs.chain.link |
| OpenZeppelin Monitor (OSS) | `cron_schedule` | biểu thức `value > 1000000` + script | Slack, Discord, email, Telegram, webhook ký `X-Signature` | miễn phí AGPL; Defender bản host đã tắt 2026-07-01 | [O] docs.openzeppelin.com, openzeppelin.com/news |
| Tenderly Alerts | theo sự kiện | event, state, balance, function call | email, Slack, Telegram, Discord, PagerDuty, webhook | liên hệ bán hàng | [O] tenderly.co/pricing |

### 6.2 Mức tối thiểu của thị trường

1. **Chạy server-side mặc định**, không cần bật công tắc: Claude, Perplexity, Manus, ChatGPT. Blue: trình duyệt là mặc định, server chỉ khi bật Background.
2. **Cadence preset từ giờ tới tháng; task LLM sàn 1 giờ** (ChatGPT, Claude, Perplexity đặt độc lập cùng một sàn). Cron chỉ là chuẩn ở công cụ cho builder/hạ tầng (n8n, Gumloop 1 phút, Chainlink CRE 30 s, OZ Monitor). Blue: chỉ daily/weekly.
3. **Giới hạn số task công bố rõ**, báo lỗi khi vượt. Blue: 10/ví, vượt thì bỏ im lặng.
4. **Giao ra ngoài app.** Crypto: Telegram gần như ai cũng có; webhook là chuẩn ở gói trả phí. Blue: chỉ in-app.
5. **Điều kiện luôn đánh giá bằng code**, không bao giờ để LLM phán ở mỗi tick. LLM chỉ đứng ở hai đầu: **soạn luật** (Nansen AI Smart Alerts) hoặc **giải thích sau khi bắn** (Perplexity Price Alerts). Ngoại lệ duy nhất tìm thấy là "monitoring tasks" của ChatGPT, sàn 1 giờ [S]. Blue: không có điều kiện; mỗi tick là một lượt LLM có debit.
6. **Pause, resume, chạy ngay, lịch sử chạy.** Blue: có ba cái đầu, không có lịch sử.

### 6.3 Người ta trả tiền cho cái gì

- **Cảnh báo điều kiện là đòn bẩy giá tường minh**, chia tầng theo số cảnh báo, số kênh, độ trễ: TradingView 3→1,000 cảnh báo; Nansen 1 → không giới hạn; Cielo theo cảnh báo/giờ; Zapier theo độ trễ polling.
- **Báo cáo LLM định kỳ được gói, không bán lẻ.** Không nhà cung cấp nào bán "một báo cáo định kỳ" như một dòng giá; nó bị giới hạn số lượng và trừ vào usage chung. Có cầu ở mức trần (5 slot Plus "fill fast" [O community]), và chi phí cao (OpenAI để Pulse ở gói $200 vì compute [S]).
- **Hai loại đang hội tụ về "điều kiện bằng code trước, LLM chỉ khi bắn"** (Perplexity Price Alerts, ChatGPT monitoring).
- **Neo giá cho một tầng "cảnh báo + webhook":** $4–20/tháng cho 20–120 cảnh báo có webhook; $49–69/tháng cho cảnh báo không giới hạn có webhook ký HMAC (Nansen Pro). Chainlink là neo trả-theo-lần duy nhất (gas + premium, trả trước), gần nhất với credit USDC theo lượt của Blue.
- **Không xác định**: không nguồn công khai nào so sánh doanh thu hay mức sẵn lòng trả giữa cảnh báo và báo cáo; kết luận "cảnh báo kiếm tiền tốt hơn" suy từ cách chia tầng [U].

### 6.4 Chuẩn webhook

- **Standard Webhooks** (spec đọc 2026-09-30 từ `github.com/standard-webhooks/standard-webhooks`): header `webhook-id`, `webhook-timestamp` (giây unix), `webhook-signature`; nội dung ký là `msg_id.timestamp.payload`; HMAC-SHA256 với secret 24–64 byte tiền tố `whsec_`, chữ ký dạng `v1,<base64>`; spec khuyên ed25519 (`v1a`) và khoá riêng cho từng endpoint; idempotency theo `webhook-id`; retry lũy tiến có jitter (ví dụ ngay, 5s, 5m, 30m, 2h, 5h, 10h, 14h, 20h, 24h ≈ 75.5 h); 2xx là thành công, 3xx là lỗi (không theo redirect), 410 là tắt endpoint, 429/502/504 là giảm tốc; timeout 15–30 s; proxy chống SSRF; báo user qua kênh khác và tắt endpoint khi lỗi kéo dài. Người dùng chuẩn gồm OpenAI, Anthropic, Twilio, Svix [O standardwebhooks.com].
- **Nhà cung cấp crypto tự chế**: Nansen ký thân request nhưng không có timestamp, nên replay không bị chặn; OZ Monitor ký `payload + timestamp`.
- **TradingView làm bên gửi** (nếu sau này Blue nhận): POST, huỷ nếu server xử lý quá 3 giây, chỉ cổng 80/443, 4 IP nguồn cố định, không ký; quy ước thực tế là secret nằm trong thân JSON [O tradingview.com/support/solutions/43000529348]. Hệ quả [U]: endpoint nhận phải xếp hàng rồi trả ngay, và không được tính phí địa chỉ nêu trong body.

---

## 7. Thiết kế đề xuất (không phải code)

### 7.1 Nguyên tắc

1. **Một scheduler, hai loại task.** Giữ khung tick hiện có (watermark, khoá đơn, ngân sách mỗi tick, đọc KV ba trạng thái, bỏ-qua-không-phát-lại, tạm dừng có lý do): đây là phần tái dùng tốt nhất của #387.
2. **Điều kiện đánh giá bằng code, không LLM**, đúng luật "verdict map cứng từ số trong code" của CLAUDE.md và đúng quy tắc "không gọi LLM trong đường tính basis" [PLAN §1].
3. **Cảnh báo Basis không bao giờ debit credit.** Không phải "chỉ tính khi bắn": một task cảnh báo `source: "hood.base"` ghi **0 sự kiện ledger** ở mọi nhánh (kiểm, bắn, unknown), có test ép. Đây là tiêu chí của chính plan (`plan-2026-09-29.md:829`, `:977`) và luật "Không bán Basis bằng credit Blue Chat" (`:420`). Thêm một lý do đo được: bất kỳ địa chỉ hợp lệ nào cũng nhận 500 credit miễn phí mỗi ngày UTC mà không cần chứng minh sở hữu [INV §4, `inventory-2026-09-29.md:958`], nên giá credit mỗi lần bắn thực chất là miễn phí khi nhân rộng.
4. **Quyền đến từ session hoặc từ khoá nội bộ, không bao giờ từ body.** Mọi ghi lấy ví từ cookie SIWE. Mọi debit lấy owner từ đúng một trong hai nguồn ở §7.6 (session SIWE, hoặc khoá nội bộ cộng header owner do tick đặt từ tên key KV).
5. **Thiếu dữ liệu thì im lặng và đếm là "unknown"** (trong heartbeat, §7.8; không ghi trạng thái mỗi tick), không bao giờ bắn, không bao giờ tính phí (quy tắc ba trạng thái ở `api/hood/dislocation/route.ts:16-26`: "a failed read NEVER produces a zero").
6. **Chain luôn tường minh**: điều kiện Basis mang `chain: "base"` bắt buộc; ticker không bao giờ tự định danh token (hard rule 1).
7. **Phép thử của owner**: "xoá sạch arrow Base thì surface còn đúng không?". Cảnh báo Basis đọc drift trực tiếp, không phụ thuộc arrow, và không đụng `DRIFT_MIN_ABS_PCT`, nên qua phép thử này.
8. **Không LLM ở bất kỳ đâu trên đường cảnh báo `hood.base`**, kể cả "giải thích khi bắn", kể cả ngoài licence. Plan: "Sản phẩm (3 bề mặt, 0 LLM)" (`plan-2026-09-29.md:144`) và "không gọi LLM trong đường tính basis" (`:192`); câu chữ của payload theo D31. Nếu có ngày mở, đó là quyết định của ShunTr, kèm bộ lọc từ cấm D31 thực thi bằng code chứ không bằng prompt.

### 7.2 Mô hình task mới

| trường | giá trị | ghi chú |
|---|---|---|
| `kind` | `"report"` \| `"alert"` | mới. Task cũ mặc định `report`. **Hai loại không chung một key**: báo cáo ở `crons:w:<wallet>` như hôm nay; cảnh báo ở nơi HEAD không bao giờ đọc (§7.8, lý do rollback). Cảnh báo **chỉ tồn tại ở server**: không có bản localStorage, `isDue` của trình duyệt trả false cho mọi `kind: "alert"`, và sanitizer của PUT `/api/chat/schedule` từ chối `kind: "alert"` (cảnh báo được tạo qua đường riêng, đã SIWE và, theo Q12, chỉ cho licensee), nên không có cảnh báo nào chạy ở chế độ trình duyệt |
| `cadence` | `{ every: "5m" \| "15m" \| "1h" \| "4h" \| "daily" \| "weekly", at?: "HH:MM", weekday?: 0..6, tz }` | `report` sàn **1h** (mức thị trường, và vì mỗi run là một lượt LLM có trả tiền); `alert` sàn **5m** (bằng chu kỳ poll Hood */5: kiểm nhanh hơn dữ liệu là vô ích). `weekday` sửa luôn chuyện không chọn được thứ |
| `condition` | chỉ với `alert`: `{ source: "hood.base", chain: "base", ticker, metric, op: ">=", value, sessions?: MarketSession[] }` | enum đóng, không có chữ tự do. `metric` bản 1: `abs_drift_pct` (có sẵn trong `bh:base:rows:latest`, `lib/blue-hood/types.ts:347` `BaseDeskLatest`); bản 2: `basis_percentile` (khi `hood-basis` có baseline). `MarketSession` = regular / premarket / afterhours / weekend / holiday (`types.ts:24`) |
| `trigger` | `{ mode: "edge", rearmBelow?: number, cooldownMin?: number }` | bắn **một lần mỗi lần vượt ngưỡng**, chỉ nạp lại khi giá trị xuống dưới `rearmBelow` (trễ tránh rung), cộng cooldown |
| `state` | lưu: `{ armed: boolean, lastFiredAt }`; không lưu: `lastValue`, `lastCheckedAt`, `lastUnknownReason` | server giữ, client không ghi được (theo mẫu `sanitizeTasks` hiện có), ở **key riêng** `crons:as:<alertId>`, không nằm trong spec. Chỉ ghi khi `armed` hoặc `lastFiredAt` **chuyển trạng thái**; `lastValue` và `lastCheckedAt` đổi mỗi tick nên nếu lưu thì mỗi tick đều ghi. Chúng chỉ nằm trong heartbeat tổng (§7.8, số đếm) |
| `delivery` | `{ inapp: true, telegram?: boolean, webhook?: { endpointId } }` | secret webhook lưu ở key riêng, không bao giờ trả về client sau khi tạo |
| `report` | chỉ với `report`: `{ prompt, tier, maxCredits }` | `maxCredits` là trần chi phí mỗi run (gồm tool); vượt thì dừng lượt |
| `runLog` | key riêng `crons:log:<wallet>:<id>`, N bản ghi cuối, có TTL | thay cho "chỉ giữ kết quả cuối". Cũng là nguồn của hộp thư Chat (§7.5) |

**Đọc KV hiệu quả, và không lặp lỗi blob.** Hôm nay tick đọc bản ghi của **từng** ví. Với cảnh báo 5 phút, watermark luôn đến hạn, nên nếu đánh giá cảnh báo trong vòng lặp hiện có thì mỗi tick đọc mọi ví: 288 tick/ngày × số ví [DERIVED], đúng "naive shape" mà header của route tự gọi là con đường dẫn tới bị suspend (`user-tasks/route.ts:13-16`). Bản nháp trước đề xuất **một blob JSON** `crons:alerts` cho mọi ví; bỏ, vì blob đó sẽ được sửa kiểu đọc-rồi-ghi bởi PUT của nhiều ví cùng lúc, đúng lỗi "NOT atomic" (`lib/kv.ts:275`) mà §4.2 phê bình ở hàng đợi Hood: hai ví lưu cùng lúc thì một cảnh báo bị mất, hoặc một cảnh báo đã xoá vẫn bắn. `KVClient` hôm nay có `sadd`/`srem`/`smembers`, `hincrby`, `hgetall`, nhưng **không** có `hset`/`hdel`, MGET hay list (`lib/kv.ts:99-111`). Hai cách đúng:

| cách | lưu | ghi khi user lưu | đọc mỗi tick cảnh báo [DERIVED] |
|---|---|---|---|
| (i) hash, **khuyến nghị** | hash `crons:alerts`, field = `<wallet>:<alertId>`, value = spec; hash là **nơi lưu duy nhất** của spec cảnh báo (không có bản sao thứ hai để lệch) | thêm helper nguyên tử `kvHSet`/`kvHDel` vào `lib/kv.ts` (`@upstash/redis` 1.38.0 đang cài có `hset`/`hdel` trong file `.d.ts` của nó, chỉ chưa được bọc vào `KVClient`); lưu một cảnh báo = một `HSET` field, xoá = một `HDEL` field; danh sách của một ví = `HGETALL` rồi lọc theo tiền tố ở server | 1 `HGETALL` + 1 `bh:base:rows:latest` = **2**, không đổi theo số ví; 576 lệnh/ngày |
| (ii) SET + key từng ví | SET `crons:alert-owners` (SADD/SREM) + key `crons:a:<wallet>` | ghi key của ví, rồi SADD | 1 `SMEMBERS` + N_ví-có-cảnh-báo + 1 = **2 + N**, tăng theo số ví |

Cộng: các lần ghi `crons:as:<alertId>` khi chuyển trạng thái (hiếm, §7.4). Ngân sách Upstash từng buộc gỡ lịch `research-loop` [CLAUDE.md], nên con số phải **đo trên preview** trước khi bật (plan D18, K11). Tiêu chí chấp nhận nằm ở P2 (§8).

### 7.3 Hai loại task

| | A. Báo cáo LLM định kỳ | B. Cảnh báo điều kiện (Basis) |
|---|---|---|
| ai dùng được | mọi ví đã ký SIWE | **chỉ licensee** (cấu hình tay trong KV ở bản đầu [PLAN §2.4(b)]); ví lẻ chờ Q12 |
| người soạn | Chat (composer) hoặc form `/app/cron` | template Basis trong `/app/cron` cho tài khoản licence, hoặc Claude/ShunTr ghi tay vào KV cho licensee đầu |
| cadence | 1h, 4h, daily, weekly | 5m, 15m, 1h |
| chạy gì | pipeline `/api/chat` như hôm nay, gọi bằng đường owner nội bộ đặc tả ở §7.6 (khoá nội bộ + header owner lấy từ tên key KV), không bao giờ qua `address` trong body | hàm thuần trong code: đọc snapshot Hood → so điều kiện → cập nhật `state`. **Không import LLM** (test ép) |
| khi nào tính phí | mỗi run: giá tier + tool, có `maxCredits`, kiểm số dư trước khi chạy | **không bao giờ** tính credit: 0 sự kiện ledger ở mọi nhánh (test ép). Tiền đến từ licence $79 (Q4) |
| payload | tên task, thời điểm, markdown kết quả (cắt theo kênh), link `/cron` | fact thuần: `chain`, `chain_id: 8453`, `ticker`, địa chỉ token từ registry, `drift_pct`, `session`, `oracle_updated_at`, tuổi oracle, ngưỡng, `snapshot_at`, provenance; không có chữ mua/chờ/execute (D31) |
| giao | in-app, Telegram (tóm tắt + link) | in-app, Telegram, webhook ký |
| ngân sách tick | ≤ 3 run LLM mỗi tick (W0-6(g): floor(300/95) = 3); công suất ở §7.9 | **route cron riêng** (ví dụ `/api/cron/schedule-alerts`, */5) với **khoá riêng**, chỉ đọc index cảnh báo (§7.2) và snapshot, thời gian chạy có trần; không nằm trong vòng lặp từng ví của `user-tasks` (`:159-239`) và không dùng khoá `crons:tick:lock` (`:67-69`, TTL 360 s), để một tick LLM dài không làm tick cảnh báo kế tiếp bỏ lượt |
| LLM sau khi bắn | — | **không có**, với mọi cảnh báo `hood.base`, licence hay không (nguyên tắc 8, §7.1). Bản nháp trước để ngỏ "giải thích khi bắn" (mẫu Perplexity) cho cảnh báo ngoài licence; bỏ |

**Độ trễ đủ cho basis cuối tuần.** Poll */5 cộng tick */5 cho độ trễ tối đa khoảng 10 phút, cộng tuổi tối đa của snapshot được chấp nhận. Đợt lệch > 1% trên Base có trung vị 8 điểm giờ liên tiếp [PLAN §2.3], nên 10 phút là khoảng 2% thời gian của một đợt trung vị [DERIVED: 10 / 480]. Lý lẽ này dùng được cho D32 (ghi mỗi phút có đáng không).

**Hằng số staleness: chọn một, ghim bằng test.** Repo có hai ngưỡng cho cùng một snapshot Base: `HEALTHY_MAX_AGE_S = 660` (`lib/blue-hood/health.ts:37`), mà `/api/hood/dislocation` dùng làm `STALE_AFTER_S` (`api/hood/dislocation/route.ts:115`); và `BASE_ROWS_MAX_AGE_MS = 12 * 60 * 1000` (`lib/blue-hood/kv-keys.ts:445`), mà `/api/hood/snapshot` (`route.ts:77`) và `hood-live` (`_handlers/hood-live.ts:185`) dùng. Bộ đánh giá đọc `bh:base:rows:latest` **qua cùng reader với dislocation** (P2), nên chọn **`HEALTHY_MAX_AGE_S` (660 s), import hằng số, không viết số 660 trong code**. Test: snapshot tuổi 660 s → có số; 661 s → `unknown`, không bắn; và một kiểm tra nguồn rằng `lib/schedule-conditions.ts` import `HEALTHY_MAX_AGE_S` chứ không khai báo ngưỡng riêng.

### 7.4 Template "Basis cuối tuần" (Base 8453)

- **Ai nhận:** chỉ licensee (§7.3, Q4, Q12). Venue B20 chỉ cho khu vực đủ điều kiện ngoài Mỹ [PLAN §2.4], và plan loại người dùng lẻ (`plan-2026-09-29.md:193`); licensee tự chịu jurisdiction của user họ (`:390`).
- **Bản 1 (sau P2 + webhook của P3):** ticker ∈ 9 ticker desk Base (NVDA, META, GOOGL, AAPL, AMZN, MSFT, MSTR, TSLA, SPCX [PLAN §2.4]); `sessions: ["weekend"]`; `metric: abs_drift_pct`, `value` mặc định 1.0; cadence 5m; edge trigger, nạp lại dưới 0.5.
  - **Tần suất bắn: chưa đo cho tới K5.** Bản nháp trước suy "MSTR bắn vài lần mỗi tháng" từ PLAN §2.3; suy như vậy là quá tay vì ba lẽ. (1) 9 đợt > 1% là **mẫu theo giờ, gộp mọi session**, "số đợt theo session chưa tách" (`plan-2026-09-29.md:319`), trong khi template chỉ xét cuối tuần, chạy mỗi 5 phút và nạp lại dưới 0.5, nên đếm đợt của plan và đếm lần bắn của template là hai đại lượng khác nhau. (2) Dữ liệu MSTR chỉ có **từ 2026-09-08** (`:322`), không phải đủ 33 ngày. (3) Script K5 (W1) mới là nơi chốt định nghĩa đợt và percentile (`:319-320`). Điều giữ được: 79/84 số đọc ≥ 1% rơi vào cuối tuần [PLAN §2.3], nên số lần kiểm gần như chắc chắn áp đảo số lần bắn; con số cụ thể là unknown.
  - **Giới hạn đã biết**: 38/771 giờ trong mẫu không có drift cho ticker nào (nhiều giờ là cuối tuần), trùng với gate staleness ~48 h của feed [PLAN §2.3, chưa chứng minh nhân quả]. Trong các giờ đó `drift_pct` là `null`, bộ đánh giá trả "unknown" và im lặng. **Không tự tính lại drift** từ `dex_usd`/`oracle_usd`, vì drift chỉ có một định nghĩa, ở poller (`api/hood/dislocation/route.ts:8` "EVERY NUMBER IS READ, NEVER RECOMPUTED"). Luật staleness theo session mới của plan (§2.4, trước W3) mới gỡ được giới hạn này.
- **Bản 2 (sau khi `hood-basis` mở, W4):** `metric: basis_percentile`, `value: 95`, baseline ticker × session point-in-time, đúng ví dụ của ShunTr "vượt p95 của chính nó trong session này". Payload thêm `percentile`, `baseline_n`, `baseline_source`.
- **Phương pháp luận ghi trong payload và trên trang template**: drift cuối tuần là giá DEX so với giá chốt thứ Sáu, không phải định giá sai; venue B20 chỉ cho khu vực đủ điều kiện ngoài Mỹ [PLAN §2.4]. Payload không có dòng chữ nào do LLM viết (nguyên tắc 8).
- **RH bị từ chối** cho tới khi F6/K1 đóng [PLAN §1].

### 7.5 Chat tạo, sửa và xem schedule

Ràng buộc: `/api/chat` không có danh tính (§3.2), nên **model không bao giờ tự ghi lịch**; model chỉ đề xuất, người dùng bấm, trình duyệt ghi qua cookie SIWE.

| thao tác | cách làm | ghi chú |
|---|---|---|
| **Tạo** | Bản 1 (không thêm chat tool): nút "Lên lịch" trên mỗi tin nhắn user (lấy đúng prompt đó) và slash `/schedule` trong ô nhập, cả hai mở form `/cron` đã điền sẵn. **Prompt không bao giờ nằm trong URL**: bản nháp trước nói "query string không chứa dữ liệu cá nhân" trong khi chính nó mang prompt của user, và prompt trong URL sẽ vào lịch sử trình duyệt, log Vercel và header Referer. Cách đúng: ghi bản nháp vào `sessionStorage` dưới một id ngẫu nhiên, mở `/cron?draft=<id>`, form đọc rồi **xoá** mục đó ngay. Bấm "Tạo" gọi `schedule.enable` (xin SIWE nếu chưa có, `use-schedule-sync.ts:195-213`) và tạo task với `background: true`; hôm nay `addCron` không đặt trường này (`ChatContext.tsx:397-410`) và PUT chỉ tải lên tập background (`use-schedule-sync.ts:96-97`, `:167-171`), nên thiếu bước này thì task Chat tạo ra sẽ là task trình duyệt: bỏ qua `time` (`storage.ts:131-137`) và tính phí qua địa chỉ trong body (`ChatContext.tsx:436`). Bản 2 (nếu ShunTr nới luật "không thêm chat tool"): một tool chỉ-render-card `schedule_draft`; model trả bản nháp có cấu trúc, code parse lỏng (bỏ fence, cắt `{`…`}`, try/catch), **kiểm lại bằng enum** (ticker trong registry, chain tường minh, cadence cho phép, sàn 1h cho report), card hiển thị bản nháp + giá thật, người dùng bấm "Tạo" → `schedule.enable` (SIWE) → `addCron({ …, background: true })` → PUT có cookie | bản 2 là cách Nansen làm ("AI soạn luật, code chạy luật") |
| **Sửa** | card nháp có `id` của task cũ; cùng luồng xác nhận | không cho model đổi `delivery.webhook` (chỉ đổi trong `/cron`) |
| **Xem** | card "Lịch của bạn" tự gọi `GET /api/chat/schedule` từ trình duyệt (cookie), không đi qua model | model không thấy kết quả của task trừ khi user dán vào |
| **Kết quả quay về chat** | **đọc run log, không thêm key thứ hai.** Bản nháp trước có key `crons:inbox:<wallet>` với một reader (P1b) nhưng không pha nào ghi nó. Sửa: Chat hiện dải "Kết quả lịch mới" đọc `crons:log:<wallet>:*` (do tick của P1 ghi, sau khi ghi trạng thái thành công) qua một route GET **chỉ lấy ví từ session SIWE**; con trỏ "đã đọc" lưu ở client. Không dùng workspace (`scheduled-tasks.ts:38-45`). Sửa `CronPanel.tsx:341` cho đúng sự thật trước khi làm | tiêu chí: route trả 401 khi không có session; không bao giờ trả mục của ví khác, kể cả khi query mang địa chỉ khác |
| **Prompt** | sửa `system-prompt.ts:241` và rule 6f cùng commit: "lịch báo cáo thì có; mua định kỳ thì không" | [LOCAL] rule 6g của người khác đang nằm chưa commit trong chính file này và mâu thuẫn với `:241`; P1b chỉ bắt đầu **sau** khi phần việc đó được commit hoặc bỏ, để không sửa chồng lên thay đổi của người khác |
| **MCP** | không thêm vào manifest 19 tool trong bản này | theo keep rule trong `lib/mcp-tools.ts` và quyết định giữ manifest ở 19 [CLAUDE.md] |

### 7.6 Billing

- **Báo cáo:** giữ giá hiện tại (tier + tool) nhưng: debit theo owner đã xác thực (W0-6(b)(e), đặc tả bên dưới); hoàn credit tool khi handler lỗi (W0-6(f)); trần `maxCredits` mỗi run; kiểm số dư trước khi chạy; UI hiện ước lượng **gồm** tool ("50 cr + tool, tối đa N cr").
- **Đường owner cho run báo cáo (đặc tả, trước đây bỏ ngỏ).** Bản nháp trước viết "tick gọi hàm chạy nội bộ" và "`/api/chat` chỉ debit ví của session", nhưng tick không có session, và cách duy nhất để chạy pipeline hôm nay là HTTP `/api/chat` (`cron/run/route.ts:139-150`). Danh tính tính phí của tool hôm nay đi bằng `X-Blue-Internal` + `X-Blue-User` (`api/chat/route.ts:1985-1990` → `api/x402/[tool]/route.ts:295-315`); request không có địa chỉ thì không debit và được phục vụ miễn phí (`api/chat/route.ts:2888`), còn request có khoá nội bộ mà không có user thì **miễn phí mọi tool trả phí** (`:1990-1994` `headers["X-Blue-Service"] = "internal";`, `:2875`). Luật đề xuất: `/api/chat` lấy owner **từ đúng một trong hai nguồn**:
  - (a) ví trong session SIWE (chat trình duyệt, nút Run now);
  - (b) `X-Blue-Internal === INTERNAL_SERVICE_KEY` **cộng** một header owner mà chỉ tick đặt, lấy từ **tên key KV** `crons:w:<wallet>` (`scheduled-tasks.ts:58`), không lấy từ nội dung bản ghi hay từ request nào khác. Khi (b) có owner, `/api/chat` đặt `X-Blue-User = owner` và **không bao giờ** rơi vào nhánh miễn phí `X-Blue-Service: internal`. Đây cùng mức tin cậy với hôm nay: ai có khoá nội bộ vốn đã debit được bất kỳ ví nào qua `X-Blue-User` ở route x402.
  - Không bao giờ lấy owner từ `address` trong body. **Điều kiện tiên quyết:** W0-6(a) fail-closed, vì hôm nay ledger lỗi hoặc thiếu khoá thì request được phục vụ miễn phí [INV §4, `inventory-2026-09-29.md:956`].
  - Tiêu chí: run của tick debit owner đúng giá chat + tool; POST công khai có `address` trong body, hoặc có header owner giả mà không có khoá → **không** debit địa chỉ đó; không session, không khoá → khách, tool trả phí trả 402.
- **Cảnh báo `hood.base`:** **0 sự kiện ledger**, ở mọi nhánh (kiểm, bắn, unknown), có test ép. Không có giá credit theo lần bắn, không có quota tháng bằng credit: cả hai là bán Basis bằng credit Blue Chat, điều plan cấm (`plan-2026-09-29.md:420`) và trái tiêu chí D28(a) (`:829`, `:977`). Doanh thu của cảnh báo Basis là licence (Q4 c). Nguồn điều kiện khác ngoài `hood.base` không có trong thiết kế này; nếu sau này thêm, giá của nó là quyết định riêng của ShunTr.
- **Licence Basis:** webhook ngưỡng cho licensee đầu tiên cấu hình tay trong KV, không có API tự đăng ký, không build meter seat trước D34 [PLAN §2.4(b), D34].

### 7.7 Bảo mật

| lớp | đề xuất | lỗi nó đóng |
|---|---|---|
| **SIWE + owner nội bộ** | mọi tạo/sửa/xoá qua `/api/chat/schedule` (đã có); `/api/cron/run` cho nút Run now đòi session và lấy ví từ session; tick gọi `/api/chat` bằng khoá nội bộ + header owner lấy từ tên key `crons:w:<wallet>`, không bao giờ bằng `address` trong body; `/api/chat` chỉ debit owner lấy từ hai nguồn đó (§7.6, W0-6(b)(e)) | L1, L2 |
| **Auth cron** | route cron mới (tick cảnh báo, drain giao hàng) chỉ nhận `Authorization: Bearer ${CRON_SECRET}`, fail-closed khi secret rỗng; không nhận `?secret=` (như `user-tasks/route.ts:81`), không nhận `x-vercel-cron` (như `dca-executor/route.ts:36`). Không route nào trong số đó ship trước khi W0-1 merge và ShunTr xác nhận đã rotate `CRON_SECRET` (§2.7) | secret lọt qua URL, header giả |
| **Link Telegram** | `api/hood/tglink` đòi session, từ chối `address` khác ví session; thêm `/unlink` (bot) và nút unlink (web); xoá key ngược cũ khi link lại | chiếm đoạt link, lộ kết quả riêng tư |
| **Ký webhook** | Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature` `v1,<HMAC-SHA256>` với secret `whsec_` riêng từng endpoint (ed25519 là bước sau); payload `{type, timestamp, data}`; id sự kiện tất định `<taskId>:<crossingId>` làm khoá idempotency | giả mạo, replay |
| **Gửi webhook an toàn** | chỉ HTTPS cổng 443; phân giải DNS rồi chặn dải private, loopback, link-local (gồm `169.254.169.254`) và IPv6 (sửa lỗi ngoặc vuông ở `mcp-client.ts:54`); `redirect: "manual"` (3xx là lỗi); timeout ≤ 15 s; retry lũy tiến có jitter, có trần; 410 tắt endpoint; tắt sau N lần lỗi và báo in-app | SSRF, treo tick |
| **Rate limit** | thêm limit riêng cho `/api/cron/run`; giữ PUT 20/phút/ví; trần số cảnh báo bật mỗi ví (công bố, báo lỗi khi vượt thay vì bỏ im lặng); trần số lần bắn mỗi task mỗi giờ; nút "gửi thử webhook" có limit | L2, L5, spam |
| **Hàng đợi** | hàng đợi giao riêng, xếp sau khi ghi trạng thái; mỗi sự kiện một key `kvSetNX(crons:deliver:<eventId>)` + `kvSAdd` vào SET pending (§4.3), không có mảng JSON đọc-rồi-ghi; drain riêng, không chịu cổng health Hood; không chặn đầu (bỏ qua id đang backoff; 429 thì lùi theo `retry_after` (trường của tài liệu Bot API, không đo), 403 "bot bị chặn" thì bỏ và báo in-app, không giữ ở đầu hàng) | double delivery, kẹt hàng, mất cập nhật |
| **Riêng tư** | Telegram mặc định chỉ tóm tắt + link; payload webhook của cảnh báo chỉ chứa fact công khai | lộ dữ liệu ví |
| **Watchlist Hood** | `/api/hood/watchlist` và `/api/hood/alerts` hiện tin địa chỉ trong query/body; bắt SIWE trước khi bất kỳ tính năng trả phí nào dựa vào chúng | sửa watch của ví khác |

### 7.8 Ghi đồng thời, rollback, quan sát

**Ghi đồng thời (đóng L13).**

- **Tick:** ngay trước mỗi lần ghi (sau **mỗi** run, theo W0-6(g)), đọc lại `crons:w:<wallet>` và chỉ vá, theo `id`, các trường scheduler sở hữu: `nextAt`, `lastRun`, `lastResult`, `lastError`, `pausedReason`, và `active = false` khi tạm dừng vì hết credit. Id không còn trong bản ghi vừa đọc thì bỏ qua (task đã bị xoá). Tick **không bao giờ** đặt `active = true`; nếu bản ghi vừa đọc có `active = false` thì giữ nguyên.
- **PUT:** giữ cách hiện có (đọc rồi mang trường của scheduler sang, `scheduled-tasks.ts:155-160`).
- **Cửa sổ còn lại:** giữa lần đọc lại và lần ghi, cỡ một round-trip KV thay vì tới 95 s [DERIVED]. Đóng hẳn bằng cách tách trạng thái chạy sang một key chỉ scheduler ghi (ví dụ hash `crons:s:<wallet>`, field = task id), làm cùng run log ở P1.
- **Cảnh báo:** spec nằm trong hash `crons:alerts`, trạng thái ở `crons:as:<alertId>` (§7.2), không bao giờ nằm trong bản ghi mà PUT của user ghi đè.
- **Tiêu chí:** fixture trong đó một PUT xoá task X giữa lần đọc và lần ghi của tick → sau tick, X không còn và chạy thêm **0** lần; PUT tạm dừng X trong cùng cửa sổ → X vẫn tạm dừng.

**Rollback.** Tick ở HEAD chạy mọi task `active` có `nextAt ≤ now` (`user-tasks/route.ts:180-192`) và đọc bản ghi **không qua whitelist trường** (`readOwnerTasks`, `scheduled-tasks.ts:188-198`); còn `sanitizeTasks` ở HEAD bỏ mọi task không có prompt (`:140` `if (!prompt) continue;               // a task with no prompt cannot run`). Nếu cảnh báo nằm chung `crons:w:<wallet>` rồi code bị revert về HEAD, cảnh báo có `prompt` và `nextAt` sẽ chạy như báo cáo LLM có trả tiền, còn cảnh báo không có prompt sẽ bị PUT kế tiếp xoá mất. Vì vậy:
- cảnh báo nằm trong hash `crons:alerts`, một namespace HEAD không bao giờ đọc, và spec cảnh báo không có trường `prompt` hay `nextAt`;
- `SCHEDULE_VERSION` (`scheduled-tasks.ts:109`, hôm nay `1`) lên `2` khi bản ghi báo cáo có thêm `kind`/`cadence`; bản ghi v1 đọc được không đổi hành vi (tiêu chí của P1);
- **tiêu chí:** chạy tick của HEAD trên một fixture có cảnh báo → `runTask` được gọi **0** lần.

**Quan sát.** Hôm nay tick chỉ trả tóm tắt trong response (`user-tasks/route.ts:241` `return { ...summary, nextAt: soonest };`), chỉ Vercel Cron thấy, không lưu ở đâu, nên câu hỏi đầu tiên ở mục 10 ("tick đã từng chạy chưa") không bao giờ trả lời được. P0 ghi heartbeat `crons:tick:last` = `{ at, status, ran, failed, paused, owners, queued, alerts_evaluated }`:
- **chỉ số đếm, không địa chỉ ví**, có TTL; một GET chỉ trả số đếm đọc được nó (chọn route là việc của PR); tick cảnh báo ghi heartbeat riêng của nó theo cùng mẫu;
- chi phí: thêm 1 lệnh ghi mỗi tick, kể cả tick rảnh, tức 288 lệnh/ngày ≈ 8.6k/tháng [DERIVED: 288 × 30], gấp đôi chi phí tick rảnh mà header route tự đặt ("ONE read", `:9-16`); đưa vào phép đo K11;
- **tiêu chí:** sau deploy, poll 1 giờ thấy `at` tiến mỗi 5 phút;
- heartbeat chỉ trả lời **từ lúc deploy về sau**; quá khứ vẫn unknown (mục 10).

### 7.9 Công suất

| sự thật | số |
|---|---|
| Trần run LLM mỗi tick | HEAD `MAX_RUNS_PER_TICK = 8` (`user-tasks/route.ts:76`); W0-6(g) hạ còn 3 → **36 run/giờ, 864 run/ngày cho tất cả user cộng lại** [DERIVED: 3 × 12; 36 × 24] |
| Bão hoà | sàn báo cáo 1 giờ, 10 task/ví → một ví đòi được 10 run/giờ → **4 ví** đủ làm đầy scheduler [DERIVED: 36 / 10 = 3.6] |
| Dồn giờ | preset mặc định đều ở giờ tròn (`CronPanel.tsx:33-35`: `09:00`, `09:00`, `08:00`; form mặc định `09:00`, `:126`). Giờ tính theo múi giờ của user, nên dồn theo từng múi giờ. N task cùng đến hạn thì task cuối trễ khoảng ceil(N / 3) × 5 phút; 36 task cùng lúc → trễ khoảng 60 phút [DERIVED] |
| Không công bằng | vòng lặp đi theo thứ tự `kvSMembers` trả về (`scheduled-tasks.ts:217-219`, `user-tasks/route.ts:159`); Redis không hứa thứ tự của SET, và không có con trỏ xoay vòng nào, nên vài ví đầu có thể ăn hết ngân sách [DERIVED] |

Đề xuất:
1. Trần số task báo cáo **dưới ngày** mỗi ví (con số là quyết định sản phẩm; gợi ý 2), công bố rõ, báo lỗi khi vượt.
2. Xoay vòng: mỗi tick bắt đầu từ ví kế tiếp (con trỏ lưu trong heartbeat), tối đa 1 run mỗi ví mỗi vòng trước khi ví nào được run thứ hai.
3. Hoặc tách thực thi: tick chỉ chọn các run đến hạn, mỗi run là một invocation riêng (mỗi cái có `maxDuration` riêng) với trần số run đồng thời; hoặc giữ 3/tick và **từ chối nhận** task dưới ngày mới khi tải dự báo vượt công suất.
4. UI hiện "Đang xếp hàng" khi `nextAt < now` mà chưa chạy.

**Tiêu chí:** load test trên preview với `runTask` giả (không LLM, không credit): N task đến hạn trên M ví → trễ tối đa ≤ một chu kỳ cadence cho tập đã nhận; không ví nào bị bỏ đói; UI hiện "Đang xếp hàng". Cảnh báo không chiếm công suất này (route riêng, §7.3).

---

## 8. Lộ trình theo pha

Cỡ việc theo plan: **S** ≤ ½ ngày, **M** 1–2 ngày, **L** 3–5 ngày; quy đổi S = 0.5, M = 1.5, L = 4 ngày [PLAN §5.0, §5.1]. Mọi pha chạm credit, payment hoặc webhook đi **branch + PR + preview Vercel, ShunTr merge**; gate ba lệnh `npx tsc --noEmit && npm test && npm run verify:build` từ `apps/web/`, báo ba kết quả riêng; sau khi push kiểm deployment tới `READY` [PLAN §5.0].

**Đối chiếu với năng lực.** Plan dành cho D28 khoảng 4 ngày (một mục L) ở W7–W8 (11-17 → 11-30), và các tuần đều đã vượt năng lực [PLAN §5.1].

- **P1–P5 ≈ 15 ngày** [DERIVED: 1.5 + 1.5 + 4.5 + 4.5 + 1.5 + 1.5], **chưa gồm** P0 (M ≈ 1.5, trên nền W0-6 cỡ L ≈ 4) và P0-URL (S ≈ 0.5). Bản nháp trước ghi 14.5 và ngầm tính cả phần sửa lỗi vào con số đó; sai ở cả hai chỗ. Con số tăng 0.5 vì index cảnh báo chuyển từ P1 sang P2 (P2 thành L + S), còn P1 vẫn là M (nhận thêm run log làm hộp thư và phần công suất §7.9).
- **Lát licence không vừa ngân sách D28.** Lát này gồm P2 (bộ đánh giá, route cảnh báo riêng, index: 4.5) cộng webhook cấu hình tay (ký Standard Webhooks, guard SSRF, retry có trần, hàng đợi idempotent; phần (c) và một phần (b) của P3: ≥ 1.5), tức **≈ 6 ngày, khoảng 1.5× ngân sách 4 ngày** [DERIVED: 6 / 4]. Bản nháp trước nói W7–W8 "đủ cho P2 cộng webhook tay"; sai, vì riêng P2 đã là L.
- **Phụ thuộc của lát licence.** Cần W0-1 đã merge và `CRON_SECRET` đã rotate (route cron mới, §7.7), và heartbeat của P0 (§7.8). **Không** cần đường owner nội bộ của run báo cáo (cảnh báo không debit), và không cần P1, vì index đã chuyển vào P2.

| pha | việc cụ thể | file chính | tiêu chí chấp nhận | cỡ | gắn với plan / thời điểm đề xuất |
|---|---|---|---|---|---|
| **P0. Sửa lỗi** | (1) `/api/cron/run` lấy ví từ session; tick gọi `/api/chat` bằng đường owner nội bộ §7.6 (W0-6(e)); W0-6(a) fail-closed là tiền đề. (2) ≤ 3 run LLM mỗi tick; lưu sau **mỗi** run bằng cách đọc lại và vá theo id (§7.8, đóng L13); task thứ 11 trả lỗi 4xx và client hiện lỗi (W0-6(g), đóng L3, L5). (3) client luôn kéo bản server khi đã đăng nhập, hiện task chỉ-có-trên-server, thêm "Tắt tất cả" gọi `DELETE` (L4). (4) hoàn credit tool khi handler lỗi (W0-6(f)). (5) chuyển tiếp `provider` hoặc chỉ cho tier Virtuals trong lịch (L11). (6) sửa lý do tạm dừng và giữ chữ đã tạo (L9); đồng bộ timeout Run now (L8). (7) sửa `CronPanel.tsx:341`, comment `cron/page.tsx:3-4`, cột COST ghi "+ tool" (L6, L12). (8) heartbeat `crons:tick:last` (§7.8). (9) hành vi của task trình duyệt sau (1), theo Q13. (10) test đầu tiên cho `cron-schedule` và `scheduled-tasks`. Đổi URL **không** nằm ở đây: xem P0-URL | `api/cron/run/route.ts`, `api/cron/user-tasks/route.ts`, `api/chat/route.ts` (nguồn owner), `lib/scheduled-tasks.ts`, `app/chat/use-schedule-sync.ts`, `app/chat/ChatContext.tsx`, `app/chat/components/CronPanel.tsx`, `api/x402/[tool]/route.ts`, `scripts/*-test.ts` mới | **(1)** fixture của W0-6: địa chỉ body khác session → 401; POST có header owner giả mà không có khoá → không debit địa chỉ đó; run của tick debit owner đúng giá chat + tool; không session, không khoá → khách, tool trả phí 402. **(2)** 4 task đến hạn trong một tick → 3 chạy, 1 chờ tick sau, không mất; PUT xoá X giữa lần đọc và lần ghi của tick → X không còn, chạy thêm 0 lần; task thứ 11 → lỗi hiện trên UI. **(3)** xoá localStorage rồi đăng nhập → thấy và tắt được task server. **(4)** handler throw → credit hoàn. **(5)** task tier `search` → hoặc request tới `/api/chat` mang provider của preset, hoặc sanitizer trả 4xx; không request nào gửi model id của Venice tới Virtuals. **(6)** lý do tạm dừng không còn số dư gán cứng 0 (in số dư thật, hoặc "không rõ số dư"); run hết credit tool vẫn giữ phần chữ đã tạo; timeout Run now phía client ≥ 90 s của `cron/run` cộng biên, ghim bằng kiểm tra hằng số. **(7)** kiểm tra nguồn: `CronPanel.tsx` không còn chuỗi "post results into Blue Chat"; task có tool trả phí hiện "+ tool" ở cột COST. **(8)** sau deploy, heartbeat tiến mỗi 5 phút trong 1 giờ. **(9)** ví đã kết nối nhưng chưa ký SIWE, có task trình duyệt đến hạn → mở trang không debit, không lỗi im lặng; panel hiện yêu cầu đăng nhập (nếu Q13 giữ chế độ trình duyệt) hoặc CTA "chuyển sang chạy trên server" (nếu Q13 chọn server mặc định) | M (phần scheduler) trên nền W0-6 cỡ L | W0-6 (a)(e)(f)(g), đã dời sang **W1: 10-06 → 10-12**; ShunTr quyết từng mục (credit metering) |
| **P0-URL. `/scheduled`** (commit riêng) | phương án B (§5.2): thêm `scheduled` vào `APP_SEGMENTS`, chuyển `app/app/cron` → `app/app/scheduled`, 301 cho `/cron`; `WAITLIST_EXEMPT` thêm `scheduled` và `usage` (§5.3); nếu Q10 gỡ `/app/tasks` (đang 200 [PROD 05:25Z]) thì 301 nó **trong cùng commit** | `middleware.ts`, `app/app/AppShell.tsx`, `lib/i18n/en.ts`, `lib/i18n/zh.ts`, thư mục trang | hôm nay [PROD 05:25Z]: `blueagent.dev/app/cron` → 301 `app.blueagent.dev/cron` → 200; `app.blueagent.dev/scheduled` → 301 `blueagent.dev/scheduled` → 404. Sau commit, theo từng host: `blueagent.dev/app/cron` → … → `app.blueagent.dev/scheduled` 200; `app.blueagent.dev/cron` → 301; `blueagent.dev/app/scheduled` → … → 200; với `APP_WAITLIST=1`, `/scheduled` và `/usage` không 307; `link-liveness-check` pass | S | tách khỏi P0 theo luật một fix một commit; không chạm credit nên không phải chờ W0-6 |
| **P1. Cadence dưới ngày + nền** | trường `kind` (mặc định `report`), `SCHEDULE_VERSION` 1 → 2 (§7.8); `cadence.every` 1h/4h cho report, chọn thứ cho weekly; `nextFireAt` bước theo phút, đúng DST; run log `crons:log:*` có TTL, tick ghi **sau** khi ghi trạng thái thành công, cộng route GET chỉ lấy ví từ session SIWE để đọc nó (hộp thư của Chat, §7.5); tách trạng thái chạy sang key chỉ scheduler ghi (§7.8); công suất §7.9 (trần task dưới ngày mỗi ví, xoay vòng, "Đang xếp hàng") | `lib/cron-schedule.ts`, `lib/scheduled-tasks.ts`, `app/chat/types.ts`, `use-schedule-sync.ts`, `CronPanel.tsx`, `api/cron/user-tasks/route.ts`, route run log mới | test `nextFireAt` qua mốc DST và qua múi giờ; sanitizer từ chối report < 1h thay vì ép về daily; bản ghi v1 đọc được không đổi hành vi; route run log trả 401 khi không có session và không bao giờ trả mục của ví khác; load test của §7.9 | M | sau Cổng 1 (10-13); đề xuất W5 (11-03 → 11-09) nếu ShunTr chấp nhận chi phí năng lực (Q2) |
| **P1b. Chat composer bản 1** | nút "Lên lịch" trên tin nhắn + slash `/schedule` mở form điền sẵn qua `sessionStorage` + `?draft=<id>` (§7.5); bấm "Tạo" gọi `schedule.enable` và đặt `background: true`; sửa `system-prompt.ts:241` và rule 6f cho khớp; dải "Kết quả lịch mới" trong Chat đọc run log qua route SIWE của P1 | `app/chat/components/ChatMessages.tsx`, `app/chat/components/ChatInput.tsx`, `app/chat/components/CronPanel.tsx`, `api/chat/system-prompt.ts` | từ một tin nhắn tạo được task trong ≤ 2 lần bấm; không URL nào chứa chữ của prompt, và `sessionStorage` không còn bản nháp sau khi form đọc; task tạo từ Chat có `background: true` và có trong `GET /api/chat/schedule`; kiểm tra nguồn: `api/chat/route.ts` không import `scheduled-tasks` và không gọi `/api/chat/schedule` (thay cho câu "model không bao giờ ghi lịch", câu không test được); prompt không còn câu cấm mâu thuẫn | M | nút + slash song song P1, dải kết quả sau P1; phụ thuộc D1 và Q3; chỉ bắt đầu **sau** khi rule 6g [LOCAL] của người khác được commit hoặc bỏ |
| **P2. Điều kiện bằng code** | `kind: "alert"`; spec trong hash `crons:alerts` (index, chuyển từ P1 sang), helper nguyên tử `kvHSet`/`kvHDel` trong `lib/kv.ts`; trạng thái ở `crons:as:<alertId>`, chỉ ghi khi chuyển trạng thái; schema `condition` enum đóng (`source: "hood.base"`, `chain: "base"` bắt buộc, metric `abs_drift_pct`); bộ đánh giá thuần đọc `bh:base:rows:latest` bằng cùng reader với `/api/hood/dislocation`, staleness = `HEALTHY_MAX_AGE_S` (§7.3); edge trigger + nạp lại + cooldown + lọc session; **route cron riêng** (ví dụ `/api/cron/schedule-alerts`, */5) có khoá riêng và chỉ nhận Bearer; 0 sự kiện ledger; chỉ ví trong danh sách licensee cấu hình tay được tạo cảnh báo `hood.base` | `lib/schedule-conditions.ts` mới, route cron mới, `lib/kv.ts`, `lib/scheduled-tasks.ts`, `apps/web/vercel.json` | **ledger:** điều kiện sai, đúng, unknown → 0 sự kiện ledger cả ba (test). **trigger:** vượt ngưỡng → bắn một lần; tick sau vẫn trên ngưỡng → không bắn lại; xuống 0.7 (chưa dưới `rearmBelow` 0.5) rồi lên lại → không bắn; xuống dưới 0.5 rồi vượt 1.0 → bắn lần hai; hai lần vượt trong `cooldownMin` → một lần bắn. **session:** task `sessions: ["weekend"]` gặp dòng `regular` vượt ngưỡng → không bắn. **unknown:** `drift_pct: null` → không bắn; snapshot 661 s → không bắn, 660 s → có số. **LLM:** test đồ thị import, module không import `callLLM` hay module LLM nào. **input:** chain thiếu → 4xx; ví ngoài danh sách licensee → 403. **đồng thời:** hai lần lưu cùng lúc từ hai ví → cả hai cảnh báo có trong index. **cô lập:** với 3 run LLM đang chạy ở `user-tasks`, heartbeat của tick cảnh báo vẫn tiến mỗi 5 phút. **KV:** số lệnh đọc mỗi tick cảnh báo đo trên preview, ghi vào PR, không tăng theo số ví. **rollback:** tick của HEAD trên fixture có cảnh báo → 0 lần `runTask` | L + S | lõi của lát licence; plan xếp W7; cần W0-1 đã merge và `CRON_SECRET` đã rotate |
| **P3. Đích giao** | (a) SIWE cho `tglink`, `/unlink`, xoá key cũ; (b) hàng đợi `kvSetNX(crons:deliver:<eventId>)` + SET `crons:deliver:pending` (§4.3) và drain riêng `/api/cron/schedule-deliver` (*/2, chỉ Bearer) tái dùng sender Telegram; (c) webhook Standard Webhooks, secret mỗi endpoint, guard SSRF sửa lỗi, retry có trần, tắt khi lỗi kéo dài; (d) in-app qua run log | `api/hood/tglink/route.ts`, `api/telegram/webhook/route.ts`, `lib/blue-hood/watchlist.ts`, drain mới, `lib/webhooks/*` mới, `lib/mcp-client.ts` (guard), `apps/web/vercel.json` | chữ ký kiểm được bằng thư viện tham chiếu của Standard Webhooks; `http://[::1]/`, `169.254.169.254`, redirect sang IP private đều bị chặn; cùng `eventId` xếp hàng hai lần → một key, một lần giao; xếp hàng sau khi ghi trạng thái; link Telegram bằng địa chỉ khác session → 401; **không chặn đầu:** fixture đầu hàng có 10 id luôn lỗi → id thứ 11 vẫn được giao trong cùng lượt; 429 của một người nhận không chặn các id khác; 403 → bỏ id đó, báo in-app, không thử lại; drain gọi bằng `?secret=` hoặc `x-vercel-cron` → 401; **(d):** một lần bắn hoặc một run báo cáo xuất hiện trong run log của đúng owner, đọc được qua route SIWE, không đọc được từ ví khác | L + S | D28(a); plan W7–W8. Licensee đầu: URL cấu hình tay trong KV [PLAN §2.4(b)]; cần W0-1 |
| **P4. Template Basis cuối tuần** (licence) | template bản 1 (§7.4) cho ví licensee, trong `/app/cron` và từ Chat; bản 2 chuyển sang `basis_percentile` khi `hood-basis` có baseline; payload fact thuần + phương pháp luận, không chữ nào do LLM viết | `CronPanel.tsx`, `lib/schedule-conditions.ts`, handler `hood-basis` (từ W3), fixture backtest mới | **backtest:** phát lại chuỗi theo giờ của `/api/hood/base-series` (archive Base từ 2026-08-28) qua bộ đánh giá với đúng tham số template (weekend, 1.0, nạp lại dưới 0.5); số kỳ vọng lấy từ **script K5 đã commit** chạy cùng luật trễ; ghim cả chuỗi lẫn số kỳ vọng làm fixture. **Không** so với "9 đợt" của PLAN §2.3 (mẫu gộp mọi session, `plan-2026-09-29.md:319`). Test không có chữ mua/chờ/execute; RH bị từ chối; mọi payload có `chain_id: 8453` và địa chỉ token; ví ngoài danh sách licensee không thấy template | M | sau P2 + P3 và sau K5 (W1); bản 2 sau W4 (`hood-basis` mở) và luật staleness theo session |
| **P5. Giá và trần của báo cáo** | ước lượng chi phí thật **gồm** tool và trần `maxCredits` trên UI; công bố trần số task và trần task dưới ngày; ledger ghi `ref` theo run id. Cảnh báo `hood.base` **không** có giá credit (licence, Q4) | `lib/credit-pricing.ts`, `CronPanel.tsx`, ledger | không double-charge cho cùng run id; trần hiện rõ; số trên UI khớp ledger; UI không có dòng giá credit nào cho cảnh báo `hood.base` | M | sau D9; licence nằm ngoài ledger chat, không build meter seat trước D34 |

---

## 9. Quyết định cho ShunTr

| # | quyết định | lựa chọn | hệ quả | khuyến nghị |
|---|---|---|---|---|
| Q1 | **D28**: bề mặt giao hàng | (a) mở rộng scheduler chung `/app/cron`; (b) webhook ngưỡng native trong Hood qua `alert-drain`; (c) chưa build | (a) việc lớn nhất, giữ mục nav "Scheduled", khớp yêu cầu "giữ và phát triển Scheduled cùng Chat"; phải sau W0-6. (b) nhỏ hơn, không đụng ledger chat, nhưng Scheduled chỉ còn là báo cáo LLM và nav không cần mục này. (c) nhanh nhất, licence $79 thiếu phần webhook đã hứa [PLAN D28] | **(a)**, và viết bộ đánh giá thành thư viện thuần để Hood cũng gọi được. Lưu ý sau G1: cảnh báo Basis chỉ cho licensee (Q4, Q12), nên lát licence của (a) và của (b) giống nhau về hình dạng: bộ đánh giá thuần + URL licensee cấu hình tay trong KV + webhook có chữ ký. Khác biệt của (a) nằm ở phần báo cáo và composer cho mọi ví, tức phần owner yêu cầu giữ [USER 2026-09-30] |
| Q2 | Năng lực | (i) chỉ lát licence (P2 + webhook tay, ≈ 6 ngày) ở W7–W8; (ii) làm đủ P1–P5 (≈ 15 ngày, chưa gồm P0), đẩy lùi việc khác; (iii) cắt lát licence cho vừa 4 ngày | (i) **không vừa** ngân sách 4 ngày của D28: ≈ 1.5× [DERIVED: 6 / 4], phải lấy thêm ≈ 2 ngày từ W7–W8 hoặc dời một mục khác; Scheduled cho user thường chậm tới tháng 12. (ii) Scheduled xong sớm hơn nhưng lấn Basis Book / outreach. (iii) chỗ duy nhất cắt được mà không bỏ an toàn là retry (gửi một lần, ghi lỗi), nhưng Standard Webhooks và licence $79 đều ngầm hứa retry | (i), nói rõ với ShunTr là cần ≈ 6 ngày chứ không phải 4; rồi P1/P1b ngay khi có chỗ trống |
| Q3 | Cách Chat soạn lịch (D1 + luật "không thêm chat tool") | (1) chỉ nút + slash, không tool mới; (2) một tool chỉ-render-card `schedule_draft`; (3) model in khối JSON nháp để client render | (1) an toàn, không đụng luật, nhưng không có "nói bằng lời"; (2) đúng tinh thần "Chat là composer", phải nới luật §1 và sửa prompt; (3) né chữ "tool" nhưng thực chất vẫn là tool, khó test | (1) trước, (2) khi D1 được xác nhận |
| Q4 | Giá cảnh báo Basis (`hood.base`) | chỉ còn **(c) trong licence $79**. Bản nháp trước có thêm (a) credit mỗi lần bắn và (b) quota tháng bằng credit; cả hai đã **bỏ cho `hood.base`** | (a) và (b) là bán Basis bằng credit Blue Chat, điều plan cấm (`plan-2026-09-29.md:420`) và trái tiêu chí D28(a) "không debit credit (test)" (`:829`, `:977`); thêm nữa, mọi địa chỉ nhận 500 credit miễn phí mỗi ngày [INV §4] nên giá credit mỗi lần bắn là miễn phí khi nhân rộng. (c) không đụng ledger chat | **(c)**. Cảnh báo Basis cho ví lẻ là câu hỏi riêng, Q12 |
| Q5 | Sàn cadence cho báo cáo LLM | 1h (thị trường) / 15m / daily như cũ | dưới 1h làm chi phí và tải tick tăng mạnh, đồng thời ngân sách tick chỉ 3 run | **1h** |
| Q6 | W0-6 từng mục (e)(f)(g) | làm / tạm dừng top-up thay thế | không có (e) thì L1 còn nguyên, không nên mở rộng Scheduled | làm (a)(e)(g) trước mọi pha khác; (e) phải kèm đường owner nội bộ của tick (§7.6), vì tick không có session |
| Q7 | Link Telegram cũ | giữ nguyên / bắt link lại sau khi có SIWE | giữ: map cũ có thể đã bị chiếm, không gửi kết quả riêng tư qua map đó; bắt link lại: mất vài người nhận hiện có (số lượng unknown) | chỉ gửi kết quả Scheduled tới link tạo **sau** khi có SIWE |
| Q8 | Email | không trong lộ trình này / một kênh email mới | đường Resend cũ là bề mặt đã retire, dựng lại nó là điều luật retire cấm; `RESEND_API_KEY`, `BRIEF_FROM_EMAIL`, `BRIEF_EMAIL_LIST` là env chết (0 reader tại HEAD) và gỡ khỏi Vercel là việc của ShunTr; một kênh email mới là **quyết định bề mặt mới**, cần nguồn email đã xác minh (server hiện không đọc được email Privy) và unsubscribe | **không trong lộ trình này** |
| Q9 | URL | A giữ `/cron` / B `/scheduled` | B sửa một URL đang 404, chi phí nhỏ | **B** |
| Q10 | Lời hứa lệch | sửa hoặc gỡ `/docs/blue-hood:59` ("4 templates… ERC-4337 session keys… Stage 3"), `/app/tasks`, `rh-stock-alert` (W0-5), DCA (#38) | để nguyên là đang hứa ba hệ thống lịch khác nhau cùng lúc. DCA không chỉ là lời hứa: executor của nó nhận header `x-vercel-cron` làm auth và tiêu allowance USDC của user (§2.7), nên phần đó thuộc W0-1 (S1 tiền), không đợi Q10 | copy (`/docs/blue-hood:59`, `/app/tasks`): trong P0-URL hoặc cùng commit W0-5; `rh-stock-alert`: W0-5; DCA: W0-1 / D4 |
| Q11 | Mục nav "Scheduled" | giữ / gỡ | plan chỉ giữ nếu D28 = (a) [PLAN #53]; yêu cầu mới của owner nói giữ | giữ, cập nhật plan cho khớp |
| Q12 | Cảnh báo Basis cho **ví lẻ** | (a) không, chỉ licensee; (b) có, kèm gate jurisdiction trong code | Plan loại hẳn: "không làm sản phẩm signal cho người dùng lẻ, vì stock token bị cấm với người US/CA/UK/CH" (`plan-2026-09-29.md:193`); venue B20 chỉ cho khu vực ngoài Mỹ [PLAN §2.4, `:390`]; và hôm nay "Không có gate jurisdiction nào trong code" (`:234`). (b) vì vậy cần một gate mới **và** một giá không bằng credit (Q4), tức hai việc mới trước khi bán được | **(a)**, theo plan; mở lại chỉ khi ShunTr đổi `:193` |
| Q13 | Chế độ chạy mặc định | (a) server-side mặc định, gỡ auto-run trong trình duyệt; (b) giữ trình duyệt mặc định, server khi bật Background | Hôm nay task mới là task trình duyệt (`CronPanel.tsx:132` không đặt `background`; `addCron` ở `ChatContext.tsx:397-410` cũng không): bỏ qua `time` (`storage.ts:131-137`) và tính phí qua địa chỉ trong body (`ChatContext.tsx:436`). Thị trường chạy server-side mặc định (§6.2 #1). Sau P0(1), `/api/cron/run` đòi session, nên auto-run (`ChatContext.tsx:480-487`) hỏng với ví đã kết nối mà chưa ký SIWE. (a) cần SIWE lúc tạo task và một CTA cho task cũ; (b) giữ hai đường chạy và hai kiểu tính phí, và cảnh báo không bao giờ chạy được ở chế độ trình duyệt | **(a)**; task trình duyệt cũ hiện CTA "chuyển sang chạy trên server", không tự chuyển (dữ liệu user) |

---

## 10. Không xác định được và lý do

| điều chưa biết | vì sao |
|---|---|
| Tick `user-tasks` đã từng chạy task thật ở production chưa, có bao nhiêu ví đã ghi danh | trạng thái nằm trong KV `crons:*` cần secret; không route công khai nào đọc; log runtime Vercel trả 403 [INV §3 Q4] Heartbeat của P0 (§7.8) chỉ trả lời **từ lúc deploy về sau**; khoảng 2026-09-04 → deploy đó vẫn không truy lại được (G13 chỉ đóng được một nửa) |
| L3 (double-charge), L7, L10, L13 (lost update) và lỗi tự chạy foreground đã xảy ra ở prod chưa | chỉ suy từ code; không có log |
| `maxDuration` mặc định của `/api/cron/run` | route không export; `vercel.json` không có khối `functions`; không có bằng chứng về mặc định của project |
| `/api/chat` có hoàn credit khi caller ngắt ở 90 s / 95 s không | chưa lần theo đường refund khi client abort |
| Virtuals trả gì khi task preset `search` gửi model id `grok-4-3` | thử sẽ tốn tiền |
| Egress của các lời gọi nội bộ có dùng chung một bucket rate limit 30/phút của `/api/chat` không | phụ thuộc IP egress của Vercel, không đo được bằng GET |
| Gói Vercel có cho cron mỗi phút không | đã biết */2 chạy được (`alert-drain`, `acp-poll` trong `apps/web/vercel.json`, deployment `success`), nên sàn */5 là do entry `user-tasks`; */1 chưa kiểm |
| Token/username bot Telegram có đặt ở prod không, webhook Telegram có trỏ về route này không, bao nhiêu ví đã link, bao nhiêu DM đã giao 7 ngày qua | cần bot token hoặc KV; GET webhook chỉ là smoke check tĩnh |
| Số subscriber web push, số `rh-alert:*` còn trong KV, số ví bật workspace sync | KV cần secret |
| Tài khoản Resend sau `RESEND_API_KEY` còn sống không, domain gửi nào đã verify | cần giá trị secret |
| Chi phí Upstash thật của tick cảnh báo 5 phút (index hash `crons:alerts`, §7.2) và của heartbeat mỗi tick (§7.8) | chưa đo; số trong §7.2 và §7.8 là [DERIVED]; tiêu chí của P2 bắt đo trên preview; plan đặt đo KV/RPC ở W1 (D32, D18, K11) |
| Tần suất bắn thật của template Basis | **chưa đo cho tới K5.** 9 đợt của PLAN §2.3 là mẫu theo giờ gộp mọi session (`plan-2026-09-29.md:319`), dữ liệu MSTR chỉ có từ 09-08 (`:322`), còn template chỉ xét cuối tuần, mỗi 5 phút, nạp lại dưới 0.5; script K5 (W1) chưa commit, nên số kỳ vọng cho backtest của P4 cũng chưa có |
| Giá thật của Cielo, Arkham; cadence và giới hạn của Manus, Lindy; văn bản chính thức về "monitoring tasks" của ChatGPT; Gelato Web3 Functions có thật đã tắt 2026-03-31 không | trang chính thức trả 403/429 hoặc không render; một số chỉ có nguồn thứ cấp hay nguồn của đối thủ |
| Người dùng trả cho cảnh báo nhiều hơn báo cáo bao nhiêu | không có dữ liệu công khai; chỉ suy từ cách chia tầng giá |
| Lưu lượng từng trang `/app` (để biết cái giá của việc bỏ mục nav) | không đọc analytics |
| D28, D1, luật "không thêm chat tool" sẽ được quyết thế nào | là quyết định của ShunTr; plan chưa cập nhật theo yêu cầu "giữ và phát triển Scheduled" |
| Hiện trạng rotate `CRON_SECRET` sau vụ Sentinel | plan ghi **unknown** [PLAN W0-1]; chỉ ShunTr kiểm được. Mọi route cron mới trong tài liệu này chờ câu trả lời này (§7.7) |
| Rule 6g [LOCAL] của người khác trong `system-prompt.ts` sẽ được commit hay bỏ, và khi nào | không phải việc của phiên này; P1b chờ nó (§7.5) |
| Thứ tự `SMEMBERS` của Upstash trên `crons:owners` có ổn định giữa các tick không | Redis không hứa thứ tự của SET; chưa đo, nên mức "bỏ đói" ở §7.9 là [DERIVED] |
| Giới hạn số invocation đồng thời của gói Vercel (cho phương án tách thực thi ở §7.9) | không đọc được cấu hình gói; chưa đo |
| Bao nhiêu ví đang có task trình duyệt (bị ảnh hưởng bởi P0(1) và Q13) | nằm trong localStorage của từng trình duyệt; server không thấy |
| 500 credit miễn phí mỗi ngày cho mọi địa chỉ [INV §4] còn tồn tại sau W0-6 không | W0-6 (b) chuyển debit sang session, nhưng hàng W0-6 không nói gì về khoản cấp miễn phí mỗi ngày; không ảnh hưởng tới cảnh báo Basis vì chúng không debit |
| Có bao nhiêu licensee và ai giữ danh sách licensee cấu hình tay | chưa có licensee nào; cơ chế là quyết định D34 của ShunTr |
