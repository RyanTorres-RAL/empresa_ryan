/**
 * The app's UI has always worked with dd/mm/yyyy display strings and
 * millisecond epoch numbers (see lib/types.ts formatDateBR/formatMonthBR).
 * Postgres stores these as `date` and `timestamptz` columns instead. These
 * helpers convert between the two so the rest of the app (types, calc.ts,
 * every screen) never has to change shape.
 */

const MONTHS_PT = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

export function brDateFromMs(ms: number): string {
  const d = new Date(ms);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

export function monthLabelFromMs(ms: number): string {
  const d = new Date(ms);
  return `${MONTHS_PT[d.getMonth()]} de ${d.getFullYear()}`;
}

/** ms epoch -> Postgres `date` literal (yyyy-mm-dd), using the local calendar date. */
export function msToDbDate(ms: number): string {
  const d = new Date(ms);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** ms epoch -> Postgres `timestamptz` literal. */
export function msToDbTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/** Postgres `date` (yyyy-mm-dd) -> the app's dd/mm/yyyy display string. */
export function dbDateToBR(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const [yyyy, mm, dd] = dateStr.split("-");
  if (!yyyy || !mm || !dd) return "";
  return `${dd}/${mm}/${yyyy}`;
}

/** The app's dd/mm/yyyy string -> Postgres `date` literal (yyyy-mm-dd). */
export function brDateToDb(dateBR: string): string {
  const [dd, mm, yyyy] = dateBR.split("/");
  if (!dd || !mm || !yyyy) return dateBR;
  return `${yyyy}-${mm}-${dd}`;
}

/** Postgres `timestamptz` -> ms epoch. */
export function tsToMs(ts: string | null | undefined): number {
  if (!ts) return 0;
  const ms = Date.parse(ts);
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * Postgres `date` (yyyy-mm-dd) -> ms epoch at local midnight. This matches
 * how the rest of the app already turns a date-only value (e.g. an
 * <input type="date">) into a timestamp (new Date(value + "T00:00:00")).
 */
export function dbDateToLocalMidnightMs(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const ms = new Date(`${dateStr}T00:00:00`).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}
