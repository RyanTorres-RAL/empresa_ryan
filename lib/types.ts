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
}

export interface Client {
  id: string;
  name: string;
  matricula: string;
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

export interface AppData {
  schemaVersion: number;
  products: Product[];
  clients: Client[];
  sales: Sale[];
  fiados: Fiado[];
  fiadoPayments: FiadoPayment[];
  cashOuts: CashOut[];
  theme: Theme;
}

export type Role = "dono" | "funcionario";

export function formatBRL(n: number): string {
  return "R$ " + n.toFixed(2).replace(".", ",");
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
