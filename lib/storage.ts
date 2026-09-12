import { AppData } from "./types";
import { seedProducts, seedClients, seedSales } from "./seed";

const STORAGE_KEY = "acai-ryan-crm-v1";
const SCHEMA_VERSION = 1;

export function seedData(): AppData {
  return {
    schemaVersion: SCHEMA_VERSION,
    products: seedProducts,
    clients: seedClients,
    sales: seedSales,
    fiados: [],
    fiadoPayments: [],
    cashOuts: [],
    theme: "light",
  };
}

export function loadData(): AppData {
  if (typeof window === "undefined") return seedData();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedData();
    const parsed = JSON.parse(raw) as AppData;
    if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) return seedData();
    return {
      schemaVersion: SCHEMA_VERSION,
      products: parsed.products ?? seedProducts,
      clients: parsed.clients ?? [],
      sales: parsed.sales ?? [],
      fiados: parsed.fiados ?? [],
      fiadoPayments: parsed.fiadoPayments ?? [],
      cashOuts: parsed.cashOuts ?? [],
      theme: parsed.theme ?? "light",
    };
  } catch {
    return seedData();
  }
}

export function saveData(data: AppData): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // ignore quota / privacy-mode errors
  }
}
