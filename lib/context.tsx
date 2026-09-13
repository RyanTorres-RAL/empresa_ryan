"use client";

import { createContext, useContext } from "react";
import {
  AppData,
  CartItem,
  CashOut,
  PaymentMethod,
  Product,
  SessionProfile,
  Theme,
} from "./types";

export type Screen =
  | "dashboard"
  | "vendas"
  | "produtos"
  | "clientes"
  | "fiado"
  | "caixa"
  | "usuarios";

export interface FinalizeSaleInput {
  cart: CartItem[];
  clientName: string;
  method: PaymentMethod;
  fiadoDueDate?: number;
  notes: string;
}

export interface EditSaleInput {
  saleId: string;
  total: number;
  method: PaymentMethod;
  notes: string;
}

export interface AppContextValue {
  data: AppData;
  loadError: string | null;
  /**
   * Who is signed in, resolved on the server from Supabase Auth +
   * crm_profiles. Read-only on purpose: the old "Dono / Funcionário" toggle
   * is gone, roles come from the database and are re-checked by every Server
   * Action, so changing this in the browser would buy nobody anything.
   */
  profile: SessionProfile;
  screen: Screen;
  setScreen: (s: Screen) => void;
  theme: Theme;
  toggleTheme: () => void;

  cart: CartItem[];
  addToCart: (product: Product) => void;
  updateCartLine: (cartId: string, changes: Partial<Pick<CartItem, "quantity" | "price">>) => void;
  removeCartLine: (cartId: string) => void;
  clearCart: () => void;

  // All the mutations below now round-trip to the Postgres-backed Server
  // Actions in lib/server/actions.ts, so they're async: each resolves once
  // the write (and a fresh reload of `data`) has completed.
  finalizeSale: (input: FinalizeSaleInput) => Promise<boolean>;
  editSale: (input: EditSaleInput) => Promise<void>;
  deleteSale: (saleId: string) => Promise<void>;

  saveProduct: (product: Omit<Product, "id"> & { id?: string }) => Promise<boolean>;
  deleteProduct: (id: string) => Promise<void>;
  /**
   * Manual stock correction, owner-only on the server. `delta` is signed:
   * +10 for "fiz mais", -2 for "quebrei". The decrement that follows a sale is
   * not this — it happens inside finalizeSale and works for employees too.
   */
  adjustProductStock: (id: string, delta: number) => Promise<boolean>;

  addClient: (name: string, whatsapp: string) => Promise<boolean>;
  updateClient: (id: string, name: string, whatsapp: string) => Promise<boolean>;
  deleteClient: (id: string) => Promise<void>;

  registerFiadoPayment: (fiadoId: string, amount: number, method: PaymentMethod) => Promise<boolean>;

  saveCashOut: (cashOut: Omit<CashOut, "id"> & { id?: string }) => Promise<boolean>;
  deleteCashOut: (id: string) => Promise<void>;

  confirm: (message: string, onConfirm: () => void) => void;
  alert: (message: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppContext.Provider");
  return ctx;
}

// Note: findClientByNameCI/findFiadoBySaleId used to live here for the
// client-side reducer in components/App.tsx. That business logic now runs
// inside the Server Actions (lib/server/actions.ts), against Postgres, so
// these helpers moved there too (see the comments in finalizeSale/editSale).
