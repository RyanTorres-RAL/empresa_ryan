import "server-only";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AppData,
  CashOut,
  Client,
  Fiado,
  FiadoPayment,
  PaymentMethod,
  Product,
  Sale,
  SaleItem,
  emptyBreakdown,
} from "@/lib/types";
import { dbDateToBR, dbDateToLocalMidnightMs, tsToMs } from "./dates";

/**
 * Maps snake_case Supabase rows onto the app's existing camelCase types
 * (lib/types.ts) so every screen/component keeps working unchanged. Postgres
 * `numeric` columns come back from PostgREST as strings (to avoid float
 * precision loss), hence the Number()/toNumber() coercions throughout.
 */

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapProduct(row: any): Product {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    size: row.size ?? "",
    price: toNumber(row.price),
    complements: row.complements ?? [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapClient(row: any): Client {
  return {
    id: row.id,
    name: row.name,
    matricula: row.matricula ?? "",
    totalPurchases: row.total_purchases ?? 0,
    totalSpent: toNumber(row.total_spent),
    totalDebt: toNumber(row.total_debt),
    status: row.status ?? "Adimplente",
    fidelityStamps: row.fidelity_stamps ?? 0,
    fidelityRewardsClaimed: row.fidelity_rewards_claimed ?? 0,
    createdAt: tsToMs(row.created_at),
    lastPurchaseDate: dbDateToBR(row.last_purchase_date),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSaleItem(row: any): SaleItem {
  return {
    id: row.id,
    name: row.name,
    unitPrice: toNumber(row.unit_price),
    quantity: row.quantity ?? 0,
    total: toNumber(row.total),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapBreakdown(raw: any): Record<PaymentMethod, number> {
  const breakdown = emptyBreakdown();
  if (raw && typeof raw === "object") {
    for (const key of Object.keys(breakdown) as PaymentMethod[]) {
      if (key in raw) breakdown[key] = toNumber(raw[key]);
    }
  }
  return breakdown;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSale(row: any, items: SaleItem[]): Sale {
  return {
    id: row.id,
    date: dbDateToBR(row.sale_date),
    month: row.month_label ?? "",
    clientName: row.client_name ?? "",
    clientId: row.client_id ?? null,
    items,
    quantity: row.quantity ?? items.length,
    total: toNumber(row.total),
    paymentBreakdown: mapBreakdown(row.payment_breakdown),
    mainPaymentMethod: row.main_payment_method ?? "",
    status: row.status ?? "Pago",
    notes: row.notes ?? "",
    createdAt: tsToMs(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFiado(row: any): Fiado {
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? "",
    saleId: row.sale_id ?? "",
    amount: toNumber(row.amount),
    amountPaid: toNumber(row.amount_paid),
    dueDate: dbDateToLocalMidnightMs(row.due_date),
    paid: !!row.paid,
    paidAt: row.paid_at ? tsToMs(row.paid_at) : undefined,
    createdAt: tsToMs(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapFiadoPayment(row: any): FiadoPayment {
  return {
    id: row.id,
    fiadoId: row.fiado_id ?? "",
    clientId: row.client_id ?? null,
    clientName: row.client_name ?? "",
    amount: toNumber(row.amount),
    method: (row.method ?? "dinheiro") as PaymentMethod,
    date: dbDateToBR(row.payment_date),
    createdAt: tsToMs(row.created_at),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapCashOut(row: any): CashOut {
  return {
    id: row.id,
    amount: toNumber(row.amount),
    description: row.description ?? "",
    date: dbDateToBR(row.out_date),
    createdAt: tsToMs(row.created_at),
  };
}

/**
 * Loads the full current state (products, clients, sales-with-items,
 * fiados, fiado payments, cash-outs) from Supabase, shaped into the app's
 * existing AppData type. Used both for the initial client load and to
 * return a fresh snapshot after every mutation (see lib/server/actions.ts).
 */
export async function loadAppDataInternal(): Promise<AppData> {
  const supabase = getSupabaseServerClient();

  const [productsRes, clientsRes, salesRes, saleItemsRes, fiadosRes, fiadoPaymentsRes, cashOutsRes] =
    await Promise.all([
      supabase.from("crm_products").select("*").order("created_at", { ascending: true }),
      supabase.from("crm_clients").select("*").order("created_at", { ascending: true }),
      supabase.from("crm_sales").select("*").order("created_at", { ascending: false }),
      supabase.from("crm_sale_items").select("*"),
      supabase.from("crm_fiados").select("*").order("created_at", { ascending: true }),
      supabase.from("crm_fiado_payments").select("*").order("created_at", { ascending: true }),
      supabase.from("crm_cash_outs").select("*").order("created_at", { ascending: true }),
    ]);

  for (const res of [productsRes, clientsRes, salesRes, saleItemsRes, fiadosRes, fiadoPaymentsRes, cashOutsRes]) {
    if (res.error) {
      throw new Error(`Falha ao carregar dados do Supabase: ${res.error.message}`);
    }
  }

  const itemsBySale = new Map<string, SaleItem[]>();
  for (const row of saleItemsRes.data ?? []) {
    const list = itemsBySale.get(row.sale_id) ?? [];
    list.push(mapSaleItem(row));
    itemsBySale.set(row.sale_id, list);
  }

  return {
    products: (productsRes.data ?? []).map(mapProduct),
    clients: (clientsRes.data ?? []).map(mapClient),
    sales: (salesRes.data ?? []).map((row) => mapSale(row, itemsBySale.get(row.id) ?? [])),
    fiados: (fiadosRes.data ?? []).map(mapFiado),
    fiadoPayments: (fiadoPaymentsRes.data ?? []).map(mapFiadoPayment),
    cashOuts: (cashOutsRes.data ?? []).map(mapCashOut),
  };
}
