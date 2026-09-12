import { AppData, PaymentMethod, emptyBreakdown } from "./types";

export interface MoneyInRecord {
  date: string; // dd/mm/yyyy
  amount: number;
  createdAt: number;
}

/** Money actually received: sale upfront amounts (total minus whatever went to fiado)
 * plus fiado payments collected later. */
export function computeMoneyInRecords(data: AppData): MoneyInRecord[] {
  const records: MoneyInRecord[] = [];
  for (const sale of data.sales) {
    const upfront = sale.total - (sale.paymentBreakdown.fiado || 0);
    if (upfront > 0) {
      records.push({ date: sale.date, amount: upfront, createdAt: sale.createdAt });
    }
  }
  for (const fp of data.fiadoPayments) {
    records.push({ date: fp.date, amount: fp.amount, createdAt: fp.createdAt });
  }
  return records;
}

export function computeSaldoEmCaixa(data: AppData): number {
  const moneyIn = computeMoneyInRecords(data).reduce((s, r) => s + r.amount, 0);
  const moneyOut = data.cashOuts.reduce((s, c) => s + c.amount, 0);
  return moneyIn - moneyOut;
}

export function computeEntradasSaidas30(data: AppData): { entradas: number; saidas: number } {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const entradas = computeMoneyInRecords(data)
    .filter((r) => r.createdAt >= cutoff)
    .reduce((s, r) => s + r.amount, 0);
  const saidas = data.cashOuts
    .filter((c) => c.createdAt >= cutoff)
    .reduce((s, c) => s + c.amount, 0);
  return { entradas, saidas };
}

export interface EntradaPorDia {
  date: string;
  amount: number;
  latestCreatedAt: number;
}

export function computeEntradasPorDia(data: AppData): EntradaPorDia[] {
  const map = new Map<string, EntradaPorDia>();
  for (const r of computeMoneyInRecords(data)) {
    const existing = map.get(r.date);
    if (existing) {
      existing.amount += r.amount;
      existing.latestCreatedAt = Math.max(existing.latestCreatedAt, r.createdAt);
    } else {
      map.set(r.date, { date: r.date, amount: r.amount, latestCreatedAt: r.createdAt });
    }
  }
  return Array.from(map.values()).sort((a, b) => b.latestCreatedAt - a.latestCreatedAt);
}

export function computeFiadoPendente(data: AppData): number {
  return data.fiados
    .filter((f) => !f.paid)
    .reduce((s, f) => s + Math.max(0, f.amount - f.amountPaid), 0);
}

export function computeTicketMedio(data: AppData): number {
  if (data.sales.length === 0) return 0;
  return data.sales.reduce((s, sale) => s + sale.total, 0) / data.sales.length;
}

export function computeSalesTotalSince(data: AppData, sinceMs: number): number {
  return data.sales
    .filter((s) => s.createdAt >= sinceMs)
    .reduce((s, sale) => s + sale.total, 0);
}

export function computePaymentMethodTotals(data: AppData): Record<PaymentMethod, number> {
  const totals = emptyBreakdown();
  for (const sale of data.sales) {
    for (const key of Object.keys(totals) as PaymentMethod[]) {
      totals[key] += sale.paymentBreakdown[key] || 0;
    }
  }
  return totals;
}

export function computeTopClients(data: AppData, limit = 5) {
  return [...data.clients]
    .sort((a, b) => b.totalPurchases - a.totalPurchases)
    .slice(0, limit);
}
