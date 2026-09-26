# @blueagent_ — trình tự ra mắt trên X

> Viết 2026-09-26. Tài khoản `@blueagent_` **chưa public bất kỳ post nào**, trong khi
> API và MCP đã live nhiều tháng. Doc này tồn tại vì lần drafting đầu tiên đã mở màn
> bằng *"we cut the MCP manifest from 85 tools to 18"* — một **update** về sản phẩm mà
> người đọc còn chưa biết là có tồn tại, chứ đừng nói là đang chạy. Toàn bộ thứ tự dưới
> đây là để cái lỗi đó không lặp lại.
>
> Ba doc cũ (`twitter-personality.md`, `twitter-storyline.md`, `x-bot-plan.md`) viết cho
> handle `@blueagent` (không gạch dưới), gọi Blue Agent là "AI ops agent for Blocky Studio",
> và mô tả sản phẩm Base-only. Cả ba đều **stale** so với thực tế hiện tại. Chưa xoá, nhưng
> đừng lấy voice từ đó.

---

## 1. Nguyên tắc: ba tầng, không nhảy cóc

| Tầng | Câu hỏi người đọc đang hỏi | Nội dung |
|---|---|---|
| 1. **Tồn tại** | "Cái này là gì?" | Blue Agent là gì, mấy chain, mấy mặt sản phẩm |
| 2. **Dùng được** | "Gọi nó kiểu gì? Có thật không?" | 1 dòng install, 1 dòng curl trả về 402 thật |
| 3. **Update** | "Có gì mới?" | 85 → 18, fix DexScreener, tool mới |

Update chỉ đọc được khi người đọc đã có mốc so sánh. Với một tài khoản 0 post, mọi thứ
thuộc tầng 3 đều rơi vào hư không.

---

## 2. Sự thật đã ĐO, dùng làm nguyên liệu copy

Đo ngày 2026-09-26 trên production, không lấy từ doc. Đo lại trước khi đăng nếu quá 1 tuần.

**MCP**

- `POST https://blueagent.dev/api/mcp` với `{"jsonrpc":"2.0","id":1,"method":"tools/list"}`
  trả SSE (`event: message`), **18 tool**.
- Lệnh cài, lấy từ chính `--help` của CLI:
  `claude mcp add --transport http blue-agent https://blueagent.dev/api/mcp`
- Cursor / Claude Desktop, đúng như `/docs/mcp` đang publish:
  `{"mcpServers":{"blue-agent":{"url":"https://blueagent.dev/api/mcp"}}}`
- Plugin path: `claude plugin marketplace add madebyshun/blue-agent` rồi
  `claude plugin install blue-agent`.

**x402 API**

- Catalog **110 tool** tại `/api/x402/<id>`.
- `POST /api/x402/token-pick-signal` → `HTTP/2 402`, `x402Version 2`,
  `network "eip155:8453"`, `asset 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` (USDC Base),
  `amount "200000"` (6 decimals = 0.20 USDC), `payTo 0x02950ad38ada1d599375bd447e080cd404809205`,
  `maxTimeoutSeconds 120`.
- `/api/catalog` public: *"Pay per call in USDC over x402. No API key, no signup."*

**Chain — đây là phần dễ viết sai nhất**

| Bề mặt | Chain |
|---|---|
| `blue_swap_tx`, `blue_send_tx` | Base 8453 **và** RH 4663, `chain` bắt buộc, không default |
| `blue_bridge_tx` | Bridge hai chiều Base 8453 ⇄ RH 4663, qua Relay |
| Blue Hood | **Hai desk**, một trên mỗi chain |
| `blue_registry` | "Covers Base 8453 and Robinhood Chain 4663" |
| `hub_token_price`, `pool_scan`, `gas_tracker`, `honeypot`, `risk_gate`, `contract_trust`, `wallet_risk`, `liquidity_depth`, `wallet_holdings` | **Base 8453 only**, ghi rõ trong từng tool |
| `b20_encode_payment` | Base 8453 only |
| **Thanh toán x402** | **Base 8453 only**, USDC EIP-3009 |

`TxChain` trong `src/lib/tx-chains.ts` là closed union đúng 2 giá trị.
`GtChain` trong `src/lib/market-data.ts` cũng vậy.

🔴 **Không viết chữ "multi-chain".** Hai lý do: nó ngụ ý nhiều hơn 2 chain (không có
Ethereum, Arbitrum, Solana — viết vào là bịa), và nó là tính từ rỗng đúng loại mà luật
*prove don't announce* cấm. Gọi thẳng tên hai chain **chính là** bằng chứng.

**Kích thước manifest** (cho tầng 3, chưa dùng ngay)

- 18 tool hiện tại: 19,040 bytes ≈ 4,760 token.
- 85 tool trước khi cắt: 30,327 bytes ≈ 7,582 token.
- ⚠️ CLAUDE.md ghi 32,160 bytes cho bản 85 tool. Tôi đo ra 30,327. Chênh lệch có thể do
  serialization khác (kèm envelope JSON-RPC). **Dùng con số tự đo, hoặc bỏ con số đi**,
  đừng copy số của CLAUDE.md mà chưa biết nó đo bằng cách nào.

---

## 3. Luật copy (áp cho mọi draft dưới đây)

- **Tiếng Anh, toàn bộ.**
- **Không em dash.**
- **Không bao giờ link `blueagent.dev/hub`.**
- **Mọi con số phải đi kèm chain.** "0.20 USDC" sai, "0.20 USDC on Base 8453" đúng.
- **Prove, don't announce.** Cấm honesty-claim làm slogan: "no hallucination", "real data",
  "accurate". Thay tính từ bằng tên nguồn (DexScreener, DefiLlama, Moralis, Basescan)
  hoặc bằng một lệnh người đọc tự chạy được.
- **Người mua là một AGENT**, không phải con người click chuột. Viết cho cái thứ gọi API.
- **Không "first" / "only"** hay bất kỳ tuyên bố novelty nào.
- **ShunTr đăng. Claude draft rồi bàn giao, không tự post.**

---

## 4. Tuần 1 — tầng "tồn tại" + "dùng được"

Năm post. Thứ tự này không đổi được.

### Post 1 (ghim)

```
Blue Agent is an agent-facing layer on Base 8453 and Robinhood Chain 4663.

Three surfaces:
- onchain tools an agent calls and pays for per request
- market intel on tokenized stocks, one desk per chain,
  with every call graded in public
- transactions you sign in your own wallet, on either chain

No API key. No signup. No custody.

blueagent.dev
```

Bản thay thế nếu thấy dòng đầu dài:

```
Blue Agent is an agent-facing layer for onchain work.
Two live chains: Base 8453 and Robinhood Chain 4663.
```

### Post 2 — MCP, cửa vào rẻ nhất (free, không cần ví)

```
Blue Agent runs as an MCP server.

claude mcp add --transport http blue-agent https://blueagent.dev/api/mcp

18 tools land in your agent. Live reads on Base 8453: token price,
wallet holdings, pool scan, gas cost per action. Contract safety checks
that run before a transaction, not after. Unsigned calldata for swaps
and transfers on Base 8453 or Robinhood Chain 4663, and a bridge
between them.

Claude Code, Cursor, Claude Desktop.
```

Reply ngay dưới, cho người dùng Cursor / Desktop:

```
Cursor and Claude Desktop take the same server as JSON:

{"mcpServers":{"blue-agent":{"url":"https://blueagent.dev/api/mcp"}}}
```

### Post 3 — x402 API, người đọc tự verify trong một dòng

```
The tool catalog is an HTTP API your agent pays for by itself.

curl -i -X POST https://blueagent.dev/api/x402/token-pick-signal -d '{}'

That returns 402 with the terms inline: 0.20 USDC on Base 8453, a fixed
payTo address, 120 seconds to settle. Your agent signs it, retries with
the payment header, gets the result. 110 tools behind the same shape.

Run the curl. The 402 is the documentation.
```

Đây là post mạnh nhất cả loạt. Nó không tuyên bố gì, nó đưa lệnh để người đọc tự bắt
được response thật. Con số `0.20 USDC on Base 8453` **không được đổi**: payment rail chỉ
có Base, kể cả khi tool đọc chain khác.

### Post 4 — một task chạy hết vòng

```
End to end, on one question.

Your agent is asked whether a Base 8453 token is safe to buy.

Honeypot and contract-trust checks answer free over MCP. If it wants the
full thesis it calls blue_call, hits a 402, signs 0.20 USDC on Base 8453
from its own wallet, and gets the signal back.

You approved a budget, not a key.
```

### Post 5 — hai chain, tự chứng minh

```
NVDA, META and GOOGL exist as tokenized stocks on both Base 8453 and
Robinhood Chain 4663. Same ticker, different token, no shared state.

So every Blue Agent tool takes the chain explicitly. There is no default,
because a default is how a Base read answers a Robinhood question.

If your agent does not know which chain, it asks. It does not guess.
```

Post này mạnh hơn mọi câu "we are multi-chain", vì nó nêu một hệ quả cụ thể mà chỉ ai
thật sự chạy hai chain mới gặp phải.

---

## 5. Tuần 2 trở đi — tầng proof, vẫn chưa phải update

- **Blue Hood**: link `blueagent.dev/track`, nói rõ grade cả win lẫn loss.
- **Một tool, một output thật**: screenshot kèm tên nguồn dữ liệu. Không kèm tính từ.
- **Non-custodial**: execution tool trả unsigned calldata. Không giữ key, không broadcast,
  không pull được tiền. Đây là claim kiểm chứng được, không phải honesty-claim.

---

## 6. Chỉ sau đó mới tới tầng update

**Update A — cắt manifest 85 → 18.** Lúc này mới đọc được, vì người ta đã biết manifest là gì.

```
We cut the MCP manifest from 85 tools to 18.

The 85-tool version spent thousands of tokens of context before reading
the user's question. Capability did not move: all 110 tools stay live at
/api/x402/, reached through blue_registry and blue_call.

A manifest is a context budget, not an inventory.
```

**Update B — fix side-selection của DexScreener.** Bug thật, đo được: USDC có 30 pair trên
Base 8453 và 6 pair sâu nhất đều là quote-side, nên `pairs[0]` trả về AERO khi được hỏi USDC.

---

## 7. Chưa đăng

- **`@blueagent/skill` trên npm**: version `1.0.0`–`1.1.3` còn stranded phía trên `latest`
  (`0.4.1`). Ai cài theo `^1.0.0` sẽ nhận build tiền-cắt quảng cáo 31 tool. **Đừng quảng bá
  npm path** cho tới khi ShunTr quyết deprecate. `npm deprecate` là hành động trên public
  registry, không tự chạy.
- **ACP `No Policy`**: nợ bảo mật, giữ ngoài mọi copy public.
- **`blueagent.dev/hub`**: không link, trong bất kỳ post nào.

---

## 8. Phải đo lại trước khi đăng

- 🔴 **Số của Blue Hood trượt giữa các lần đọc.** Bốn lần đọc cùng một ngày cho `graded`
  240 → 238 → 234 → 237 và `tests_run` 25 → 24, vì feed bị cap ở `ARROW_HYDRATED_MAX=250`
  trong khi index có 532. **Đừng đóng băng một phần trăm vào tweet.** Nếu muốn có số thì
  đo lại ngay trước khi đăng và in kèm `analyzed` + `window_note`.
- 🔴 **`chain:base` tuyệt đối không in phần trăm** (n=2). Dưới ngưỡng chỉ được in dạng
  `n of needed`.
- ⚠️ **Con số RAG-MCP "43% → under 14%"** trong CLAUDE.md **chưa được verify độc lập**.
  Không đưa vào bất kỳ post nào cho tới khi tra được nguồn gốc.
- ⚠️ **Byte count của manifest 85 tool**: xem mục 2. Tự đo hoặc bỏ số.
