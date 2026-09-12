"use client";

import { createContext, useContext } from "react";
import {
  AppData,
  CartItem,
  CashOut,
  Client,
  Fiado,
  PaymentMethod,
  Product,
  Role,
  Sale,
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
  role: Role;
  setRole: (r: Role) => void;
  screen: Screen;
  setScreen: (s: Screen) => void;
  toggleTheme: () => void;

  cart: CartItem[];
  addToCart: (product: Product) => void;
  updateCartLine: (cartId: string, changes: Partial<Pick<CartItem, "quantity" | "price">>) => void;
  removeCartLine: (cartId: string) => void;
  clearCart: () => void;

  finalizeSale: (input: FinalizeSaleInput) => boolean;
  editSale: (input: EditSaleInput) => void;
  deleteSale: (saleId: string) => void;

  saveProduct: (product: Omit<Product, "id"> & { id?: string }) => boolean;
  deleteProduct: (id: string) => void;

  addClient: (name: string, matricula: string) => boolean;

  registerFiadoPayment: (fiadoId: string, amount: number, method: PaymentMethod) => boolean;

  saveCashOut: (cashOut: Omit<CashOut, "id"> & { id?: string }) => boolean;
  deleteCashOut: (id: string) => void;

  confirm: (message: string, onConfirm: () => void) => void;
  alert: (message: string) => void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppContext.Provider");
  return ctx;
}

export function findClientByNameCI(clients: Client[], name: string): Client | undefined {
  const target = name.trim().toLowerCase();
  return clients.find((c) => c.name.trim().toLowerCase() === target);
}

export function findFiadoBySaleId(fiados: Fiado[], saleId: string): Fiado | undefined {
  return fiados.find((f) => f.saleId === saleId && !f.paid);
}
