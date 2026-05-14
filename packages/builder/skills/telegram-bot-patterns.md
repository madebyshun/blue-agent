# Telegram Bot Patterns

Grounding for `blue build` — Telegram bots with onchain actions on Base.

Bot API patterns, polling vs webhook, command handlers, wallet integration, rate limiting, and production patterns.

---

## 1. Bot Architectures

### Polling vs Webhook

```
Polling (development):
  Bot repeatedly asks Telegram: "Any new messages?"
  Simple to set up — no public URL needed
  Delay: 1-5 seconds
  Use for: Local development, testing
  
  getUpdates loop:
  while (true) {
    const updates = await bot.getUpdates({ offset: lastUpdateId + 1 });
    for (const update of updates) processUpdate(update);
    await sleep(1000);
  }

Webhook (production):
  Telegram sends POST to your server on every message
  Instant delivery (< 100ms)
  Requires: Public HTTPS URL + SSL certificate
  Use for: Production deployments
  
  Your server at https://mybot.vercel.app/api/webhook
  Telegram POSTs here → you respond within 30 seconds
```

### Setting Up Webhook

```typescript
import TelegramBot from "node-telegram-bot-api";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;

// Production: webhook mode
const bot = new TelegramBot(BOT_TOKEN, { webHook: true });

// Register webhook URL with Telegram
await bot.setWebHook("https://mybot.vercel.app/api/webhook");

// Next.js API route
export async function POST(request: Request) {
  const body = await request.json();
  bot.processUpdate(body);  // Let bot-api process the update
  return new Response("OK");  // Must respond quickly — Telegram retries if no response
}

// Development: polling mode
// const bot = new TelegramBot(BOT_TOKEN, { polling: true });
```

---

## 2. grammY — Modern Bot Framework

grammY is the recommended TypeScript-first bot framework.

### Installation & Setup

```typescript
import { Bot, Context, InlineKeyboard, Keyboard } from "grammy";
import { run } from "@grammyjs/runner";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// Command handler
bot.command("start", async (ctx) => {
  await ctx.reply(
    `Hello @${ctx.from?.username}! 👋\n\nI'm Blue Agent Bot. Here's what I can do:`,
    {
      reply_markup: new InlineKeyboard()
        .text("💰 Check Balance", "balance")
        .row()
        .text("🔄 Swap Tokens", "swap")
        .text("📊 View Tasks", "tasks")
        .row()
        .url("🌐 Open App", "https://app.blueagent.xyz"),
    }
  );
});

// Callback query handler (inline button presses)
bot.callbackQuery("balance", async (ctx) => {
  await ctx.answerCallbackQuery();  // Required — removes loading spinner
  const address = await getUserAddress(ctx.from!.id);
  const balance = await getBalance(address);
  await ctx.editMessageText(`💰 Your balance: ${formatEther(balance)} ETH`);
});

// Start bot (polling for dev, webhook for prod)
if (process.env.NODE_ENV === "production") {
  // Use webhook
  bot.api.setWebhook(process.env.WEBHOOK_URL!);
} else {
  // Use long polling
  bot.start();
}
```

---

## 3. Command Structure

### Standard Bot Commands

```typescript
// Register commands with Telegram (shows in / menu)
await bot.api.setMyCommands([
  { command: "start", description: "Start the bot" },
  { command: "balance", description: "Check your wallet balance" },
  { command: "address", description: "Get your wallet address" },
  { command: "send", description: "Send tokens to someone" },
  { command: "tasks", description: "Browse open tasks" },
  { command: "help", description: "Show help" },
]);

// /balance — check wallet
bot.command("balance", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) return;
  
  const address = await getOrCreateWallet(userId);
  const [ethBalance, usdcBalance] = await Promise.all([
    publicClient.getBalance({ address }),
    getERC20Balance(USDC_ADDRESS, address),
  ]);
  
  await ctx.reply(
    `💰 *Your Wallet Balance*\n\n` +
    `Address: \`${address}\`\n\n` +
    `ETH: ${formatEther(ethBalance)} ETH\n` +
    `USDC: ${formatUnits(usdcBalance, 6)} USDC`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("📋 Copy Address", `copy_${address}`)
        .url("🔍 View on Basescan", `https://basescan.org/address/${address}`),
    }
  );
});

// /send @username 10 USDC
bot.command("send", async (ctx) => {
  const args = ctx.match?.split(" ");  // e.g., "@alice 10 USDC"
  
  if (!args || args.length < 3) {
    return ctx.reply(
      "Usage: /send @username <amount> <token>\n" +
      "Example: /send @alice 10 USDC"
    );
  }
  
  const [recipient, amountStr, token] = args;
  const amount = parseFloat(amountStr);
  
  if (isNaN(amount) || amount <= 0) {
    return ctx.reply("❌ Invalid amount");
  }
  
  // Show confirmation before sending
  await ctx.reply(
    `⚠️ *Confirm Transfer*\n\n` +
    `To: ${recipient}\n` +
    `Amount: ${amount} ${token}\n\n` +
    `Are you sure?`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✅ Confirm", `confirm_send_${recipient}_${amount}_${token}`)
        .text("❌ Cancel", "cancel"),
    }
  );
});
```

---

## 4. Wallet Integration

### Custodial Bot Wallet (Simplest)

```typescript
// Bot holds private keys for users (custodial model)
// Simple but requires trust in the bot operator

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createWalletClient, http } from "viem";
import { base } from "viem/chains";
import * as crypto from "crypto";

// Generate deterministic wallet for each Telegram user
function generateUserWallet(telegramUserId: number): `0x${string}` {
  // Deterministic: same userId → same private key
  // NEVER store raw private key — derive from master secret
  const masterSecret = process.env.WALLET_MASTER_SECRET!;
  const privateKey = crypto
    .createHmac("sha256", masterSecret)
    .update(telegramUserId.toString())
    .digest("hex") as `0x${string}`;
  return `0x${privateKey}`;
}

async function getUserWalletClient(telegramUserId: number) {
  const privateKey = generateUserWallet(telegramUserId);
  const account = privateKeyToAccount(privateKey);
  return createWalletClient({
    account,
    chain: base,
    transport: http(process.env.BASE_RPC_URL),
  });
}

// Execute transaction on behalf of user
async function sendTokens(
  fromUserId: number,
  toAddress: Address,
  amount: bigint
): Promise<Hex> {
  const walletClient = await getUserWalletClient(fromUserId);
  return walletClient.writeContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: "transfer",
    args: [toAddress, amount],
  });
}
```

### WalletConnect Integration (Non-Custodial)

```typescript
// User connects their own wallet via WalletConnect
// Bot generates signing requests, user approves on phone

import { WalletConnectModal } from "@walletconnect/modal";

// Generate WalletConnect pairing URI
async function generateWalletConnectUri(userId: number): Promise<string> {
  const { uri, approval } = await signClient.connect({
    requiredNamespaces: {
      eip155: {
        methods: ["eth_sendTransaction", "personal_sign"],
        chains: ["eip155:8453"],  // Base
        events: ["accountsChanged"],
      },
    },
  });
  
  // Store approval promise indexed by userId
  pendingConnections.set(userId, approval);
  
  return uri!;  // Show this as QR code or deep link
}

// In bot: send QR code image
bot.command("connect", async (ctx) => {
  const uri = await generateWalletConnectUri(ctx.from!.id);
  
  // Generate QR code
  const qrImage = await generateQR(uri);
  await ctx.replyWithPhoto(qrImage, {
    caption: "📱 Scan with MetaMask or Coinbase Wallet to connect\n\nOr click the link below:",
    reply_markup: new InlineKeyboard()
      .url("Open in Wallet", `https://metamask.app.link/wc?uri=${encodeURIComponent(uri)}`),
  });
});
```

---

## 5. State Management

### Conversation Flows

```typescript
import { conversations, createConversation } from "@grammyjs/conversations";

// Multi-step conversation: /send flow
async function sendFlow(conversation: Conversation, ctx: Context) {
  // Step 1: Ask for recipient
  await ctx.reply("Who do you want to send to? (Enter address or @username)");
  const recipientMsg = await conversation.waitFor("message:text");
  const recipient = recipientMsg.message.text;
  
  // Step 2: Ask for amount
  await ctx.reply("How much USDC?");
  const amountMsg = await conversation.waitFor("message:text");
  const amount = parseFloat(amountMsg.message.text);
  
  if (isNaN(amount)) {
    await ctx.reply("❌ Invalid amount. Starting over.");
    return;
  }
  
  // Step 3: Confirm
  await ctx.reply(
    `Sending ${amount} USDC to ${recipient}. Confirm?`,
    {
      reply_markup: new InlineKeyboard()
        .text("✅ Yes", "confirm")
        .text("❌ No", "cancel"),
    }
  );
  
  const confirmCtx = await conversation.waitForCallbackQuery(["confirm", "cancel"]);
  
  if (confirmCtx.callbackQuery.data === "cancel") {
    await ctx.reply("Cancelled.");
    return;
  }
  
  // Execute
  await ctx.reply("⏳ Sending...");
  const txHash = await executeTransfer(ctx.from!.id, recipient, amount);
  await ctx.reply(`✅ Sent! [View on Basescan](https://basescan.org/tx/${txHash})`, {
    parse_mode: "Markdown",
  });
}

bot.use(conversations());
bot.use(createConversation(sendFlow));

bot.command("send", async (ctx) => {
  await ctx.conversation.enter("sendFlow");
});
```

### Session Storage

```typescript
import { session } from "grammy";
import { RedisAdapter } from "@grammyjs/storage-redis";

interface SessionData {
  walletAddress?: string;
  pendingTx?: { to: string; amount: number; token: string };
  language: "en" | "vi" | "zh";
  onboardingStep: number;
}

// Redis-backed session (survives restarts)
const redisAdapter = new RedisAdapter({ instance: redis });

bot.use(session({
  initial: (): SessionData => ({
    language: "en",
    onboardingStep: 0,
  }),
  storage: redisAdapter,
}));

// Access session in handlers
bot.command("start", async (ctx) => {
  ctx.session.onboardingStep = 1;
  const address = ctx.session.walletAddress ?? "Not set";
  await ctx.reply(`Your address: ${address}`);
});
```

---

## 6. Rate Limiting

Telegram limits: 30 messages/second globally, 1 message/second per chat.

```typescript
import Bottleneck from "bottleneck";

// Rate limiter: 1 message per second per chat, 30/sec total
const limiter = new Bottleneck({
  reservoir: 30,              // Total tokens
  reservoirRefreshAmount: 30, // Refill 30 every second
  reservoirRefreshInterval: 1000,
  maxConcurrent: 10,
  minTime: 34,               // ~29 messages/sec (leave buffer)
});

// Wrap all bot.api.sendMessage calls
const rateLimitedSend = (chatId: number, text: string, options?: object) =>
  limiter.schedule(() => bot.api.sendMessage(chatId, text, options));

// Handle flood errors gracefully
bot.catch((err) => {
  const { ctx, error } = err;
  
  if (error.error_code === 429) {
    // Flood control exceeded — Telegram tells you how long to wait
    const retryAfter = error.parameters?.retry_after ?? 60;
    console.log(`Rate limited. Retry after ${retryAfter}s`);
    setTimeout(() => {
      ctx.reply("(Message delayed due to rate limits)");
    }, retryAfter * 1000);
  }
});
```

---

## 7. Security Patterns

### Bot Token Protection

```typescript
// ❌ Never expose bot token in client code or logs
console.log(process.env.TELEGRAM_BOT_TOKEN);  // ❌ Don't do this

// ✅ Server-side only — bot logic runs on server
// ✅ Webhook validation — verify requests come from Telegram

// Validate webhook requests (prevent spoofed updates)
import { createHmac } from "crypto";

function validateWebhookSecret(
  secretToken: string,
  telegramSecretHeader: string
): boolean {
  // Set webhook with secret: bot.setWebhook(url, { secret_token: "my-secret" })
  // Telegram includes X-Telegram-Bot-Api-Secret-Token header
  return secretToken === telegramSecretHeader;
}

// In Next.js route handler:
export async function POST(request: Request) {
  const secretToken = request.headers.get("x-telegram-bot-api-secret-token");
  if (!validateWebhookSecret(process.env.WEBHOOK_SECRET!, secretToken!)) {
    return new Response("Unauthorized", { status: 401 });
  }
  // Process update...
}
```

### Admin-Only Commands

```typescript
const ADMIN_USER_IDS = [
  123456789,  // Replace with actual admin Telegram IDs
  987654321,
];

function requireAdmin(handler: (ctx: Context) => Promise<void>) {
  return async (ctx: Context) => {
    if (!ctx.from || !ADMIN_USER_IDS.includes(ctx.from.id)) {
      await ctx.reply("❌ This command is admin-only.");
      return;
    }
    await handler(ctx);
  };
}

bot.command("broadcast", requireAdmin(async (ctx) => {
  const message = ctx.match;
  await broadcastToAllUsers(message);
  await ctx.reply(`✅ Broadcasted to all users`);
}));
```

### Preventing Bot Abuse

```typescript
// Anti-spam: limit interactions per user per minute
const userCooldowns = new Map<number, number>();
const COOLDOWN_MS = 3000;  // 3 seconds between commands

function checkCooldown(userId: number): boolean {
  const lastAction = userCooldowns.get(userId) ?? 0;
  const now = Date.now();
  
  if (now - lastAction < COOLDOWN_MS) {
    return false;  // Still on cooldown
  }
  
  userCooldowns.set(userId, now);
  return true;
}

// Middleware: apply to all commands
bot.use(async (ctx, next) => {
  const userId = ctx.from?.id;
  if (!userId) return next();
  
  if (!checkCooldown(userId)) {
    await ctx.reply("⏳ Please slow down.");
    return;
  }
  
  return next();
});
```

---

## 8. Notification System

```typescript
// Send proactive notifications to users
// Example: notify when their task is approved

async function notifyTaskApproved(
  telegramUserId: number,
  taskTitle: string,
  reward: number
): Promise<void> {
  try {
    await bot.api.sendMessage(
      telegramUserId,
      `✅ *Task Approved!*\n\n` +
      `Your submission for "${taskTitle}" was approved.\n\n` +
      `💰 ${reward} USDC has been sent to your wallet.`,
      {
        parse_mode: "Markdown",
        reply_markup: new InlineKeyboard()
          .url("View Transaction", `https://basescan.org/tx/...`),
      }
    );
  } catch (error) {
    // User may have blocked the bot
    if (error.error_code === 403) {
      console.log(`User ${telegramUserId} blocked the bot`);
      await db.update("users", { telegram_notifications: false }, { telegram_id: telegramUserId });
    }
  }
}
```

---

## 9. Deployment Patterns

### Vercel Edge Functions

```typescript
// vercel.json
{
  "functions": {
    "api/webhook.ts": {
      "maxDuration": 30  // Telegram requires response within 30s
    }
  }
}

// api/webhook.ts
import { Bot, webhookCallback } from "grammy";

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);
// ... register handlers ...

export const POST = webhookCallback(bot, "std/http");  // Edge runtime compatible
```

### Worker Pattern (Long-running Tasks)

```typescript
// For tasks that take longer than 30s (e.g., AI generation):
// 1. Respond to Telegram immediately
// 2. Offload to background job
// 3. Send result when ready

bot.command("analyze", async (ctx) => {
  const userInput = ctx.match;
  const jobId = await queueAnalysisJob(ctx.from!.id, userInput);
  
  // Respond immediately (within 30s Telegram limit)
  await ctx.reply(`⏳ Analyzing... Job ID: ${jobId}\nI'll message you when it's done.`);
});

// Worker process (runs separately)
async function processAnalysisJob(jobId: string): Promise<void> {
  const job = await db.find("jobs", jobId);
  const result = await runAIAnalysis(job.input);  // May take minutes
  
  // Send result to user
  await bot.api.sendMessage(job.telegramUserId, `✅ Analysis complete:\n\n${result}`);
}
```

---

## 10. Base-Native Bot Features

### Inline Tasks + Task Hub

```typescript
// Browse and accept tasks directly in Telegram
bot.command("tasks", async (ctx) => {
  const tasks = await getOpenTasks({ limit: 5 });
  
  const keyboard = new InlineKeyboard();
  for (const task of tasks) {
    keyboard.text(`${task.title} — ${task.reward} USDC`, `task_${task.id}`).row();
  }
  keyboard.text("📋 View All Tasks", "all_tasks");
  
  await ctx.reply(
    "🔍 *Open Tasks*\n\n" + tasks.map((t, i) => 
      `${i + 1}. ${t.title}\n💰 ${t.reward} USDC | ⏰ ${t.deadline}`
    ).join("\n\n"),
    {
      parse_mode: "Markdown",
      reply_markup: keyboard,
    }
  );
});

bot.callbackQuery(/^task_(.+)$/, async (ctx) => {
  const taskId = ctx.match[1];
  const task = await getTask(taskId);
  
  await ctx.editMessageText(
    `📋 *${task.title}*\n\n` +
    `${task.description}\n\n` +
    `💰 Reward: ${task.reward} USDC\n` +
    `⏰ Deadline: ${task.deadline}\n` +
    `👥 Slots: ${task.filledSlots}/${task.maxSlots}`,
    {
      parse_mode: "Markdown",
      reply_markup: new InlineKeyboard()
        .text("✋ Accept Task", `accept_${taskId}`)
        .text("← Back", "tasks"),
    }
  );
});
```

---

## Common Mistakes

❌ **Storing bot token in code** — use environment variables. Rotate immediately if leaked.

❌ **Not answering callback queries** — forgetting `ctx.answerCallbackQuery()` = loading spinner forever.

❌ **Responding after 30 seconds** — Telegram retries, causing duplicate processing. Ack fast, process async.

❌ **Not handling blocked users** — `error_code 403` when sending to users who blocked bot. Catch and disable notifications.

❌ **Polling in production** — slow, inefficient. Use webhook on any deployment.

✅ **Use grammY over node-telegram-bot-api** — better TypeScript support, conversation flows, middleware.

✅ **Implement session expiry** — don't let sessions grow unboundedly. TTL on Redis keys.

✅ **Log all onchain transactions** — txHash + userId + timestamp for debugging and support.

---

## Resources

- grammY: `grammy.dev`
- grammY conversations plugin: `grammy.dev/plugins/conversations`
- Telegram Bot API: `core.telegram.org/bots/api`
- BotFather (create bot): `t.me/BotFather`
- grammY storage adapters: `github.com/grammyjs/storages`
- Related skills: `frames-miniapps.md`, `agent-wallet-security.md`
- CLI: `blue build "Telegram bot on Base"`, `blue build "Telegram trading bot"`
