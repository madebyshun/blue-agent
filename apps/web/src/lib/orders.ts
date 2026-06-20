"use client";

// Blue Bank orders + invoices — localStorage-backed payment requests settled in
// B20 USDC via transferWithMemo (Memo.memo === stringToHex(orderId) flips a
// request pending → paid). Gated behind NEXT_PUBLIC_B20_ENABLED until B20
// mainnet (June 25); the on-chain settlement/listener is wired when enabled.

export const B20_ENABLED = process.env.NEXT_PUBLIC_B20_ENABLED === "true";

export type OrderKind = "order" | "invoice";
export type OrderStatus = "pending" | "paid";

export interface Order {
  id: string;            // order-<ts> | INV-<ts>
  kind: OrderKind;
  amount: number;        // USDC
  description?: string;
  client?: string;       // invoice only
  dueDate?: string;      // invoice only — yyyy-mm-dd
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
  kind?: OrderKind; amount: number; description?: string; client?: string; dueDate?: string;
}): Order {
  const kind = input.kind ?? "order";
  const order: Order = {
    id: `${kind === "invoice" ? "INV" : "order"}-${Date.now()}`,
    kind,
    amount: input.amount,
    description: input.description?.trim() || undefined,
    client: input.client?.trim() || undefined,
    dueDate: input.dueDate || undefined,
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

/** Shareable public payment link, e.g. blueagent.dev/pay/order-1719…  */
export function payLink(id: string): string {
  const origin = isClient ? window.location.origin : "https://blueagent.dev";
  return `${origin}/pay/${id}`;
}

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
