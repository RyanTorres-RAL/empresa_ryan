import {
  AppData,
  PaymentMethod,
  Sale,
  emptyBreakdown,
  formatDateBR,
  startOfDay,
} from "./types";

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

/* ===========================================================================
   Dashboard: period filtering + chart aggregation
   ---------------------------------------------------------------------------
   All of this runs CLIENT-SIDE over the already-loaded AppData. Nothing here
   touches the server / Supabase: the Dashboard's period filter is a pure
   re-slice of data the browser already has, so changing the range costs a
   render, not a round-trip.

   Which timestamp counts? A sale carries both `date` (dd/mm/yyyy — the
   BUSINESS day, what the owner sees in the Vendas list) and `createdAt` (when
   the row was written). Period filtering and day/week/month bucketing use the
   business day, so a sale backdated to yesterday lands on yesterday. Only the
   hour-of-day bucketing (a single-day range) falls back to `createdAt`,
   because the business date carries no time-of-day.
   ========================================================================= */

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse dd/mm/yyyy into a local-midnight Date. Returns null if malformed. */
export function parseDateBR(value: string): Date | null {
  const m = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\s*$/.exec(value || "");
  if (!m) return null;
  const dd = Number(m[1]);
  const mm = Number(m[2]);
  const yyyy = Number(m[3]);
  const d = new Date(yyyy, mm - 1, dd);
  // Rejects 31/02/2026 and friends, which Date would silently roll over.
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Add n calendar days and snap to midnight — DST-safe, unlike n * DAY_MS. */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** The business day a dated record belongs to, as local-midnight ms. */
function recordDayMs(date: string, createdAt: number): number {
  const parsed = parseDateBR(date);
  if (parsed) return parsed.getTime();
  return startOfDay(new Date(createdAt)).getTime();
}

export type PeriodPresetId = "hoje" | "7d" | "30d" | "90d" | "custom";

export interface PeriodRange {
  /** Local midnight of the first day, inclusive. */
  startMs: number;
  /** Local midnight of the day AFTER the last day — exclusive. */
  endMs: number;
  /** Calendar days covered, always >= 1. */
  days: number;
  /** pt-BR description used in tile sub-labels, e.g. "últimos 30 dias". */
  label: string;
}

export interface CustomPeriodInput {
  /** yyyy-mm-dd, as produced by <input type="date">. */
  from: string;
  to: string;
}

const PRESET_DAYS: Record<Exclude<PeriodPresetId, "custom">, number> = {
  hoje: 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const PRESET_LABEL: Record<Exclude<PeriodPresetId, "custom">, string> = {
  hoje: "hoje",
  "7d": "últimos 7 dias",
  "30d": "últimos 30 dias",
  "90d": "últimos 90 dias",
};

function parseInputDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!m) return null;
  const yyyy = Number(m[1]);
  const mm = Number(m[2]);
  const dd = Number(m[3]);
  const d = new Date(yyyy, mm - 1, dd);
  if (d.getFullYear() !== yyyy || d.getMonth() !== mm - 1 || d.getDate() !== dd) {
    return null;
  }
  d.setHours(0, 0, 0, 0);
  return d;
}

function rangeFrom(start: Date, endExclusive: Date, label: string): PeriodRange {
  const startMs = start.getTime();
  const endMs = endExclusive.getTime();
  return {
    startMs,
    endMs,
    days: Math.max(1, Math.round((endMs - startMs) / DAY_MS)),
    label,
  };
}

/**
 * Resolve the filter row's selection into a concrete range. An incomplete or
 * malformed custom range falls back to the 30-day default rather than
 * rendering an empty dashboard — the owner sees numbers while still typing
 * the second date.
 */
export function buildPeriodRange(
  preset: PeriodPresetId,
  custom: CustomPeriodInput,
  now: Date = new Date(),
): PeriodRange {
  const today = startOfDay(now);

  if (preset === "custom") {
    let from = parseInputDate(custom.from);
    let to = parseInputDate(custom.to);
    if (from && to) {
      // Inverted range: read it as the period the owner meant, not as empty.
      if (from.getTime() > to.getTime()) [from, to] = [to, from];
      const lastDay = to;
      const label =
        from.getTime() === lastDay.getTime()
          ? formatDateBR(from)
          : `${formatDateBR(from)} a ${formatDateBR(lastDay)}`;
      return rangeFrom(from, addDays(lastDay, 1), label);
    }
    const end = addDays(today, 1);
    return rangeFrom(addDays(end, -30), end, PRESET_LABEL["30d"]);
  }

  const end = addDays(today, 1);
  const n = PRESET_DAYS[preset];
  return rangeFrom(addDays(end, -n), end, PRESET_LABEL[preset]);
}

/** True when the custom inputs are incomplete/backwards — drives the UI hint. */
export function describeCustomIssue(custom: CustomPeriodInput): string | null {
  const from = parseInputDate(custom.from);
  const to = parseInputDate(custom.to);
  if (!from || !to) return "Escolha as duas datas para ver o período personalizado.";
  if (from.getTime() > to.getTime()) {
    return "A data inicial é maior que a final — invertemos o período.";
  }
  return null;
}

export function salesInRange(data: AppData, range: PeriodRange): Sale[] {
  return data.sales.filter((s) => {
    const t = recordDayMs(s.date, s.createdAt);
    return t >= range.startMs && t < range.endMs;
  });
}

export interface PeriodStats {
  faturamento: number;
  vendas: number;
  ticketMedio: number;
  /** Money actually received in the period (upfront + fiado paid off). */
  entradas: number;
}

export function computePeriodStats(data: AppData, range: PeriodRange): PeriodStats {
  const sales = salesInRange(data, range);
  const faturamento = sales.reduce((s, sale) => s + sale.total, 0);
  const entradas = computeMoneyInRecords(data)
    .filter((r) => {
      const t = recordDayMs(r.date, r.createdAt);
      return t >= range.startMs && t < range.endMs;
    })
    .reduce((s, r) => s + r.amount, 0);
  return {
    faturamento,
    vendas: sales.length,
    ticketMedio: sales.length > 0 ? faturamento / sales.length : 0,
    entradas,
  };
}

export function computePaymentMethodTotalsInRange(
  data: AppData,
  range: PeriodRange,
): Record<PaymentMethod, number> {
  const totals = emptyBreakdown();
  for (const sale of salesInRange(data, range)) {
    for (const key of Object.keys(totals) as PaymentMethod[]) {
      totals[key] += sale.paymentBreakdown[key] || 0;
    }
  }
  return totals;
}

/* --------------------------- revenue over time --------------------------- */

export type BucketUnit = "hora" | "dia" | "semana" | "mes";

export interface RevenueBucket {
  key: string;
  /** Short label for the x-axis. */
  label: string;
  /** Full label for the tooltip and the table view. */
  fullLabel: string;
  value: number;
}

export interface RevenueSeries {
  unit: BucketUnit;
  /** e.g. "por dia" — used in the chart subtitle. */
  unitLabel: string;
  buckets: RevenueBucket[];
  total: number;
  max: number;
}

/**
 * Bucket width follows the range length, so the headline chart never degrades
 * into 90 slivers at one end or two fat bars at the other:
 *
 *   <=   2 days  -> hora    (a single day would otherwise be one lonely point)
 *   <=  45 days  -> dia     (7 / 30 land here — one mark per day)
 *   <= 180 days  -> semana  (90 days -> ~13 marks instead of 90)
 *    > 180 days  -> mes     (a year -> 12 marks)
 */
export function pickBucketUnit(days: number): BucketUnit {
  if (days <= 2) return "hora";
  if (days <= 45) return "dia";
  if (days <= 180) return "semana";
  return "mes";
}

const UNIT_LABEL: Record<BucketUnit, string> = {
  hora: "por hora",
  dia: "por dia",
  semana: "por semana",
  mes: "por mês",
};

const WEEKDAY_SHORT = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MONTH_SHORT = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];
const MONTH_LONG = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

function shortDate(d: Date): string {
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Monday-anchored week start. */
function startOfWeek(d: Date): Date {
  const r = startOfDay(new Date(d));
  const shift = (r.getDay() + 6) % 7; // Monday = 0
  return addDays(r, -shift);
}

function finish(unit: BucketUnit, buckets: RevenueBucket[]): RevenueSeries {
  let total = 0;
  let max = 0;
  for (const b of buckets) {
    total += b.value;
    if (b.value > max) max = b.value;
  }
  return { unit, unitLabel: UNIT_LABEL[unit], buckets, total, max };
}

export function computeRevenueSeries(data: AppData, range: PeriodRange): RevenueSeries {
  const unit = pickBucketUnit(range.days);
  const sales = salesInRange(data, range);
  const start = new Date(range.startMs);
  const lastDay = addDays(new Date(range.endMs), -1);

  if (unit === "hora") {
    const hours = new Array<number>(24).fill(0);
    for (const s of sales) {
      const h = new Date(s.createdAt).getHours();
      if (h >= 0 && h < 24) hours[h] += s.total;
    }
    const active: number[] = [];
    hours.forEach((v, i) => {
      if (v > 0) active.push(i);
    });
    let lo = active.length > 0 ? Math.min(...active) : 8;
    let hi = active.length > 0 ? Math.max(...active) : 20;
    // Never fewer than 6 slots, or a busy hour looks like the whole day.
    while (hi - lo < 5 && (lo > 0 || hi < 23)) {
      if (lo > 0) lo--;
      if (hi - lo < 5 && hi < 23) hi++;
    }
    const buckets: RevenueBucket[] = [];
    for (let h = lo; h <= hi; h++) {
      buckets.push({
        key: `h-${h}`,
        label: `${h}h`,
        fullLabel: `${String(h).padStart(2, "0")}h às ${String((h + 1) % 24).padStart(2, "0")}h`,
        value: hours[h],
      });
    }
    return finish(unit, buckets);
  }

  if (unit === "dia") {
    const byDay = new Map<string, number>();
    for (const s of sales) {
      const k = dayKey(new Date(recordDayMs(s.date, s.createdAt)));
      byDay.set(k, (byDay.get(k) || 0) + s.total);
    }
    const buckets: RevenueBucket[] = [];
    // Walk every calendar day so a day with no sales renders as a real zero,
    // not as a gap the eye reads as "we skipped it".
    for (let d = new Date(start); d.getTime() < range.endMs; d = addDays(d, 1)) {
      const k = dayKey(d);
      buckets.push({
        key: k,
        label: shortDate(d),
        fullLabel: `${WEEKDAY_SHORT[d.getDay()]}, ${formatDateBR(d)}`,
        value: byDay.get(k) || 0,
      });
    }
    return finish(unit, buckets);
  }

  if (unit === "semana") {
    const buckets: RevenueBucket[] = [];
    const index = new Map<string, RevenueBucket>();
    for (let w = startOfWeek(start); w.getTime() < range.endMs; w = addDays(w, 7)) {
      // Clip the first and last weeks to the range, and say so in the tooltip
      // so a short edge week is never read as a real slump.
      const from = w.getTime() < range.startMs ? start : w;
      const toExclusive = addDays(w, 7);
      const to = toExclusive.getTime() > range.endMs ? lastDay : addDays(toExclusive, -1);
      const b: RevenueBucket = {
        key: dayKey(w),
        label: shortDate(from),
        fullLabel: `Semana de ${formatDateBR(from)} a ${formatDateBR(to)}`,
        value: 0,
      };
      buckets.push(b);
      index.set(b.key, b);
    }
    for (const s of sales) {
      const k = dayKey(startOfWeek(new Date(recordDayMs(s.date, s.createdAt))));
      const b = index.get(k);
      if (b) b.value += s.total;
    }
    return finish(unit, buckets);
  }

  // mes
  const buckets: RevenueBucket[] = [];
  const index = new Map<string, RevenueBucket>();
  const spansYears = start.getFullYear() !== lastDay.getFullYear();
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor.getTime() < range.endMs) {
    const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
    const b: RevenueBucket = {
      key,
      label: spansYears
        ? `${MONTH_SHORT[cursor.getMonth()]}/${String(cursor.getFullYear()).slice(2)}`
        : MONTH_SHORT[cursor.getMonth()],
      fullLabel: `${MONTH_LONG[cursor.getMonth()]} de ${cursor.getFullYear()}`,
      value: 0,
    };
    buckets.push(b);
    index.set(key, b);
    cursor.setMonth(cursor.getMonth() + 1);
  }
  for (const s of sales) {
    const d = new Date(recordDayMs(s.date, s.createdAt));
    const b = index.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (b) b.value += s.total;
  }
  return finish(unit, buckets);
}

/* ------------------------------ what sells ------------------------------- */

export interface ProductRank {
  key: string;
  name: string;
  revenue: number;
  quantity: number;
}

export interface TopProducts {
  rows: ProductRank[];
  /** How many distinct products sold in the period, before the top-N cut. */
  distinct: number;
  /** Revenue of everything outside `rows` — shown in the table view. */
  outrosRevenue: number;
}

export function computeTopProductsInRange(
  data: AppData,
  range: PeriodRange,
  limit = 6,
): TopProducts {
  const byName = new Map<string, ProductRank>();
  for (const sale of salesInRange(data, range)) {
    for (const item of sale.items || []) {
      const name = (item.name || "").trim() || "Sem nome";
      const key = name.toLowerCase();
      const revenue = Number.isFinite(item.total)
        ? item.total
        : (item.unitPrice || 0) * (item.quantity || 0);
      const existing = byName.get(key);
      if (existing) {
        existing.revenue += revenue;
        existing.quantity += item.quantity || 0;
      } else {
        byName.set(key, { key, name, revenue, quantity: item.quantity || 0 });
      }
    }
  }
  const all = Array.from(byName.values()).sort((a, b) => b.revenue - a.revenue);
  const rows = all.slice(0, limit);
  const outrosRevenue = all.slice(limit).reduce((s, r) => s + r.revenue, 0);
  return { rows, distinct: all.length, outrosRevenue };
}

export interface ClientRank {
  key: string;
  name: string;
  revenue: number;
  sales: number;
}

/**
 * Top clients recomputed FROM THE SALES in the period. Client.totalSpent is a
 * lifetime running total, so it cannot answer "who spent most in September".
 */
export function computeTopClientsInRange(
  data: AppData,
  range: PeriodRange,
  limit = 5,
): ClientRank[] {
  const byClient = new Map<string, ClientRank>();
  for (const sale of salesInRange(data, range)) {
    const name = (sale.clientName || "").trim();
    if (!name) continue;
    const key = sale.clientId || `name:${name.toLowerCase()}`;
    const existing = byClient.get(key);
    if (existing) {
      existing.revenue += sale.total;
      existing.sales += 1;
    } else {
      byClient.set(key, { key, name, revenue: sale.total, sales: 1 });
    }
  }
  return Array.from(byClient.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}
