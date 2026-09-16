"use client";

// Blue Bank orders + invoices — localStorage-backed payment requests settled in
// B20 USDC via transferWithMemo (Memo.memo === stringToHex(orderId) flips a
// request pending → paid).
//
// Gated behind NEXT_PUBLIC_B20_ENABLED. This comment used to say "until B20
// mainnet (June 25)", which read as "the gate opens on that date". It does not:
// the gate is an env var, and it is NOT SET in production (measured 2026-09-06
// against all 42 production vars). B20 itself has been active on Base mainnet
// since well before then — the ActivationRegistry says so on-chain — so the two
// facts are independent and the date explained neither.
//
// While the flag is off, `markPaid` is unreachable: its only two call sites (the
// Memo watcher in OrdersPanel and the Pay button on /pay/[address]) both return
// early on !B20_ENABLED. Orders can be created and shared; nothing can move one
// out of Pending. Say that in any copy you write about this — do not describe it
// as settlement that is merely "coming".
//
// #254 (2026-09-16) makes the second of those call sites worse than gated: it is
// UNREACHABLE. `/pay[/…]` is archived in middleware and 301s to /chat, so the
// payer's button cannot be rendered at all, flag or no flag. The Memo watcher is
// the only path left. And "shared" above no longer means a link — see the note
// where `payLink()` used to be, below.

export const B20_ENABLED = process.env.NEXT_PUBLIC_B20_ENABLED === "true";

// The canonical B20 USDC token on Base. Intentionally NOT hardcoded — it is read
// from env (NEXT_PUBLIC_B20_USDC) and stays empty until a verified address is set,
// so a guessed/placeholder address can never be paid. The Pay button checks this
// is a real address before sending; the Memo watcher reads logs from it.
export const B20_USDC = (process.env.NEXT_PUBLIC_B20_USDC ?? "").trim();

export type OrderKind = "order" | "invoice";
export type OrderStatus = "pending" | "paid";

export interface Order {
  id: string;            // order-<ts> | INV-<ts>
  kind: OrderKind;
  amount: number;        // USDC
  description?: string;
  client?: string;       // invoice only
  dueDate?: string;      // invoice only — yyyy-mm-dd
  payTo?: string;        // merchant wallet — where B20 USDC settles
  status: OrderStatus;
  txHash?: string;
  createdAt: number;
  paidAt?: number;
}

const KEY = "blueagent:orders";
const isClient = typeof window !== "undefined";

export function loadOrders(): Order[] {
  if (!isClient) return [];
  try { const r = JSON.parse(localStorage.getItem(KEY) || "[]"); return Array.isArray(r) ? r : []; }
  catch { return []; }
}
export function saveOrders(list: Order[]): void {
  if (!isClient) return;
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 200))); } catch { /* blocked */ }
}
export function createOrder(input: {
  kind?: OrderKind; amount: number; description?: string; client?: string; dueDate?: string; payTo?: string;
}): Order {
  const kind = input.kind ?? "order";
  const order: Order = {
    id: `${kind === "invoice" ? "INV" : "order"}-${Date.now()}`,
    kind,
    amount: input.amount,
    description: input.description?.trim() || undefined,
    client: input.client?.trim() || undefined,
    dueDate: input.dueDate || undefined,
    payTo: input.payTo?.trim() || undefined,
    status: "pending",
    createdAt: Date.now(),
  };
  saveOrders([order, ...loadOrders()]);
  return order;
}
export function findOrder(id: string): Order | null {
  return loadOrders().find((o) => o.id === id) ?? null;
}
export function removeOrder(id: string): void {
  saveOrders(loadOrders().filter((o) => o.id !== id));
}
export function markPaid(id: string, txHash?: string): void {
  saveOrders(loadOrders().map((o) => (o.id === id ? { ...o, status: "paid", txHash, paidAt: Date.now() } : o)));
}

// `payLink()` stood here and is GONE (#254, 2026-09-16). It returned
// `${origin}/pay/${id}?to=…&amount=…&for=…` — and middleware 301s that to /chat
// with the id stripped, so the self-contained query string it went to such
// trouble to build arrived at a page with no idea what to do with it. Its one
// caller (OrdersPanel's "copy pay link") copies the request as TEXT now.
//
// Deleted rather than left unused, deliberately. A dead-link builder that still
// compiles is an invitation: the next person who needs a share affordance finds
// a function named `payLink`, wires it up, and the bug returns wearing its old
// name. `scripts/archived-routes-check.ts` now fails the build if any source
// file mints a `/pay/` URL while middleware still archives that prefix.
//
// If BlueBank's public payment surface is un-archived, this is NOT the first
// thing to restore — see the note in `app/app/bank/BankClient.tsx` where
// `sharePayLink()` was (it records why a straight repoint would have been a
// chain-confusion bug), and the recipe AND ORDER in `src/middleware.ts`.

/** Order/invoice ids are slugs; addresses are 0x… — lets /pay/[address] branch. */
export function isOrderId(s: string): boolean {
  return /^(order|INV)-\d+$/i.test(s);
}

export function ordersToCsv(list: Order[]): string {
  const head = "id,kind,amount_usdc,status,description,client,due_date,created,tx";
  const rows = list.map((o) =>
    [o.id, o.kind, o.amount, o.status, o.description ?? "", o.client ?? "", o.dueDate ?? "",
     new Date(o.createdAt).toISOString(), o.txHash ?? ""]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
  );
  return [head, ...rows].join("\n");
}
