export type PaymentMethod = "dinheiro" | "pix" | "debito" | "credito" | "va" | "fiado";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Cartão de Débito",
  credito: "Cartão de Crédito",
  va: "Cartão Alimentação",
  fiado: "Fiado",
};

// Historical quirk: a finalized sale's mainPaymentMethod string for "pix"
// is stored as "Pix" (capital P, lowercase ix), not "PIX" like the dropdown
// option label. This is baked into existing stored sale records and the
// edit-sale flow relies on mapping the display label back to the key, so it
// is reproduced here deliberately.
export const PAYMENT_DISPLAY: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "Pix",
  debito: "Cartão de Débito",
  credito: "Cartão de Crédito",
  va: "Cartão Alimentação",
  fiado: "Fiado",
};

/**
 * Compact labels for chart axes. "Cartão de Débito" and "Cartão de Crédito"
 * both truncate to "Cartão de…" in a bar-chart gutter on a phone, which is
 * worse than no label — these stay distinct at ~80px. Full names are still
 * used everywhere the row has the width for them (tooltips, table views,
 * every other screen).
 */
export const PAYMENT_SHORT: Record<PaymentMethod, string> = {
  dinheiro: "Dinheiro",
  pix: "PIX",
  debito: "Débito",
  credito: "Crédito",
  va: "Alimentação",
  fiado: "Fiado",
};

export function labelToPaymentMethod(label: string): PaymentMethod | null {
  const entry = Object.entries(PAYMENT_DISPLAY).find(([, v]) => v === label);
  if (entry) return entry[0] as PaymentMethod;
  const entry2 = Object.entries(PAYMENT_LABELS).find(([, v]) => v === label);
  if (entry2) return entry2[0] as PaymentMethod;
  return null;
}

export function emptyBreakdown(): Record<PaymentMethod, number> {
  return { dinheiro: 0, pix: 0, debito: 0, credito: 0, va: 0, fiado: 0 };
}

export interface Product {
  id: string;
  name: string;
  category: "Açaí" | "Sorvete";
  size: string;
  price: number;
  complements: string[];
  /**
   * Units ready to sell.
   *
   * MAY BE NEGATIVE, deliberately. A sale is never blocked for lack of stock —
   * the owner would rather record the real sale than argue with the counter
   * while a customer waits — so a negative value simply means the count drifted
   * and needs recounting. It is a flag, not an error state, and the UI renders
   * it in the danger colour so it cannot be missed.
   */
  stock: number;
}

export interface Client {
  id: string;
  name: string;
  /**
   * Digits only, country code included: "5562995757130". Empty when unknown,
   * which is the normal case for a walk-up customer. See lib/phone.ts — that
   * module owns normalising, formatting and the wa.me link built from this.
   */
  whatsapp: string;
  totalPurchases: number;
  totalSpent: number;
  totalDebt: number;
  status: "Adimplente" | "Devedor";
  fidelityStamps: number;
  fidelityRewardsClaimed: number;
  createdAt: number;
  lastPurchaseDate: string; // dd/mm/yyyy
}

export interface SaleItem {
  id: string;
  name: string;
  unitPrice: number;
  quantity: number;
  total: number;
}

export interface Sale {
  id: string;
  date: string; // dd/mm/yyyy
  month: string; // e.g. "agosto de 2026"
  clientName: string;
  clientId: string | null;
  items: SaleItem[];
  quantity: number; // number of distinct line items
  total: number;
  paymentBreakdown: Record<PaymentMethod, number>;
  mainPaymentMethod: string; // display label
  status: "Pago" | "Pendente";
  notes: string;
  createdAt: number;
}

export interface Fiado {
  id: string;
  clientId: string | null;
  clientName: string;
  saleId: string;
  amount: number;
  amountPaid: number;
  dueDate: number;
  paid: boolean;
  paidAt?: number;
  createdAt: number;
}

export interface FiadoPayment {
  id: string;
  fiadoId: string;
  clientId: string | null;
  clientName: string;
  amount: number;
  method: PaymentMethod;
  date: string; // dd/mm/yyyy
  createdAt: number;
}

export interface CashOut {
  id: string;
  amount: number;
  description: string;
  date: string; // dd/mm/yyyy
  createdAt: number;
}

export interface CartItem {
  cartId: string;
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export type Theme = "light" | "dark";

// Note: theme is deliberately NOT part of AppData. AppData is the slice of
// state backed by Postgres (Supabase); theme is pure UI preference that
// stays client-side (see components/App.tsx), same as before.
export interface AppData {
  products: Product[];
  clients: Client[];
  sales: Sale[];
  fiados: Fiado[];
  fiadoPayments: FiadoPayment[];
  cashOuts: CashOut[];
}

export type Role = "dono" | "funcionario";

export const ROLE_LABELS: Record<Role, string> = {
  dono: "Dono",
  funcionario: "Funcionário",
};

/**
 * The signed-in person, resolved on the server from Supabase Auth plus their
 * crm_profiles row (see lib/server/auth.ts). The client receives this
 * read-only — the role is never chosen in the browser.
 */
export interface SessionProfile {
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

/** Result of an auth/user Server Action that returns no data payload. */
export type SimpleResult = { ok: true } | { ok: false; error: string };

/** A row of the owner-only "Usuários" screen. */
export interface ManagedUser {
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: number;
}

/** Result of the owner-only user-management Server Actions. */
export type UsersResult = { ok: true; users: ManagedUser[] } | { ok: false; error: string };

/**
 * pt-BR money: "R$ 1.234,56".
 *
 * This used to be `n.toFixed(2).replace(".", ",")`, which produced
 * "R$ 10612,00" — comma decimal but no thousands separator, so any figure
 * over a thousand had to be counted digit by digit. The Dashboard's headline
 * numbers made that impossible to ignore; grouping is what pt-BR actually
 * means, so it is fixed here rather than only in the charts, and every screen
 * gets it. The "R$ " prefix stays a plain space (Intl's currency style uses a
 * non-breaking space, which copies out oddly).
 */
export function formatBRL(n: number): string {
  const safe = Number.isFinite(n) ? n : 0;
  return (
    "R$ " +
    safe.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  );
}

/** Whole number, pt-BR grouped: 1234 -> "1.234". Used for chart axis ticks. */
export function formatNumberBR(n: number): string {
  return Math.round(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** "12%" / "1,4%" — percentages stay short enough to sit beside a bar. */
export function formatPercentBR(fraction: number): string {
  if (!Number.isFinite(fraction)) return "0%";
  const pct = fraction * 100;
  const digits = pct > 0 && pct < 10 ? 1 : 0;
  return `${pct.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatDateBR(d: Date): string {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function formatMonthBR(d: Date): string {
  return `${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

export function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "cliente";
}
