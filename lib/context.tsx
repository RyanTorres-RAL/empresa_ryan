"use client";

import { createContext, useContext } from "react";
import {
  AppData,
  CartItem,
  CashOut,
  PaymentMethod,
  Product,
  Role,
  Theme,
} from "./types";

export type Screen =
  | "dashboard"
  | "vendas"
  | "produtos"
  | "clientes"
  | "fiado"
  | "caixa";

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
  role: Role;
  setRole: (r: Role) => void;
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

  addClient: (name: string, matricula: string) => Promise<boolean>;

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
