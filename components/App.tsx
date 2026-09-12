"use client";

import { useEffect, useMemo, useState } from "react";
import { emptyAppData } from "@/lib/storage";
import {
  AppContext,
  AppContextValue,
  EditSaleInput,
  FinalizeSaleInput,
  Screen,
} from "@/lib/context";
import {
  AppData,
  CartItem,
  CashOut,
  PaymentMethod,
  Product,
  Role,
  Theme,
} from "@/lib/types";
import {
  ActionResult,
  addClient as addClientAction,
  deleteCashOut as deleteCashOutAction,
  deleteProduct as deleteProductAction,
  deleteSale as deleteSaleAction,
  editSale as editSaleAction,
  finalizeSale as finalizeSaleAction,
  loadAppData,
  registerFiadoPayment as registerFiadoPaymentAction,
  saveCashOut as saveCashOutAction,
  saveProduct as saveProductAction,
} from "@/lib/server/actions";
import Nav from "./Nav";
import { AlertDialog, ConfirmDialog } from "./Dialogs";
import DashboardScreen from "./screens/Dashboard";
import VendasScreen from "./screens/Vendas";
import ProdutosScreen from "./screens/Produtos";
import ClientesScreen from "./screens/Clientes";
import FiadoScreen from "./screens/Fiado";
import CaixaScreen from "./screens/Caixa";

let uidCounter = 0;
function uid(prefix: string): string {
  uidCounter += 1;
  return `${prefix}-${Date.now()}-${uidCounter}-${Math.random().toString(36).slice(2, 7)}`;
}

const OWNER_SCREENS: Screen[] = ["dashboard", "produtos", "caixa"];
const THEME_STORAGE_KEY = "acai-ryan-theme";

export default function App() {
  const [data, setData] = useState<AppData>(() => emptyAppData());
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>("light");
  const [role, setRoleState] = useState<Role>("dono");
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  // Theme is pure client-side UI preference — never sent to Postgres.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark") setThemeState(stored);
    } catch {
      // ignore privacy-mode / quota errors
    }
  }, []);

  // Real data now comes from Supabase via the loadAppData Server Action.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const initial = await loadAppData();
        if (!cancelled) setData(initial);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Falha ao carregar dados.");
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

  function applyResult(result: ActionResult): boolean {
    if (result.ok) {
      setData(result.data);
      return true;
    }
    alertFn(result.error);
    return false;
  }

  function setRole(r: Role) {
    setRoleState(r);
    if (r === "funcionario" && OWNER_SCREENS.includes(screen)) {
      setScreen("vendas");
    }
  }

  function toggleTheme() {
    setThemeState((prev) => {
      const next: Theme = prev === "dark" ? "light" : "dark";
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // ignore
      }
      return next;
    });
  }

  function alertFn(message: string) {
    setAlertMessage(message);
  }

  function confirmFn(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }

  // ---------- Cart (transient, never persisted until "Finalizar Venda") ----------
  function addToCart(product: Product) {
    setCart((prev) => {
      const existing = prev.find((c) => c.productId === product.id);
      if (existing) {
        return prev.map((c) =>
          c.productId === product.id ? { ...c, quantity: c.quantity + 1 } : c
        );
      }
      return [
        ...prev,
        { cartId: uid("cart"), productId: product.id, name: product.name, price: product.price, quantity: 1 },
      ];
    });
  }

  function updateCartLine(cartId: string, changes: Partial<Pick<CartItem, "quantity" | "price">>) {
    setCart((prev) =>
      prev.map((c) => (c.cartId === cartId ? { ...c, ...changes } : c))
    );
  }

  function removeCartLine(cartId: string) {
    setCart((prev) => prev.filter((c) => c.cartId !== cartId));
  }

  function clearCart() {
    setCart([]);
  }

  // ---------- Sales ----------
  async function finalizeSale(input: FinalizeSaleInput): Promise<boolean> {
    const result = await finalizeSaleAction({
      cart: input.cart.map((c) => ({ name: c.name, price: c.price, quantity: c.quantity })),
      clientName: input.clientName,
      method: input.method,
      fiadoDueDate: input.fiadoDueDate,
      notes: input.notes,
      now: Date.now(),
    });
    return applyResult(result);
  }

  async function editSale(input: EditSaleInput): Promise<void> {
    const result = await editSaleAction({ ...input, now: Date.now() });
    applyResult(result);
  }

  async function deleteSale(saleId: string): Promise<void> {
    const result = await deleteSaleAction(saleId);
    applyResult(result);
  }

  // ---------- Products ----------
  async function saveProduct(product: Omit<Product, "id"> & { id?: string }): Promise<boolean> {
    if (!product.name.trim()) {
      alertFn("Digite o nome do produto.");
      return false;
    }
    const result = await saveProductAction(product);
    return applyResult(result);
  }

  async function deleteProduct(id: string): Promise<void> {
    const result = await deleteProductAction(id);
    applyResult(result);
  }

  // ---------- Clients ----------
  async function addClient(name: string, matricula: string): Promise<boolean> {
    if (!name.trim()) {
      alertFn("Digite o nome do cliente.");
      return false;
    }
    const result = await addClientAction(name, matricula);
    return applyResult(result);
  }

  // ---------- Fiado ----------
  async function registerFiadoPayment(fiadoId: string, amount: number, method: PaymentMethod): Promise<boolean> {
    if (!(amount > 0)) {
      alertFn("Digite um valor válido.");
      return false;
    }
    const result = await registerFiadoPaymentAction({ fiadoId, amount, method, now: Date.now() });
    return applyResult(result);
  }

  // ---------- Caixa ----------
  async function saveCashOut(cashOut: Omit<CashOut, "id"> & { id?: string }): Promise<boolean> {
    if (!cashOut.description.trim()) {
      alertFn("Digite uma descrição.");
      return false;
    }
    if (!(cashOut.amount > 0)) {
      alertFn("Digite um valor válido.");
      return false;
    }
    const result = await saveCashOutAction(cashOut);
    return applyResult(result);
  }

  async function deleteCashOut(id: string): Promise<void> {
    const result = await deleteCashOutAction(id);
    applyResult(result);
  }

  const value: AppContextValue = useMemo(
    () => ({
      data,
      loadError,
      role,
      setRole,
      screen,
      setScreen,
      theme,
      toggleTheme,
      cart,
      addToCart,
      updateCartLine,
      removeCartLine,
      clearCart,
      finalizeSale,
      editSale,
      deleteSale,
      saveProduct,
      deleteProduct,
      addClient,
      registerFiadoPayment,
      saveCashOut,
      deleteCashOut,
      confirm: confirmFn,
      alert: alertFn,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, loadError, role, screen, cart, theme]
  );

  if (!loaded) {
    return <div className="page">Carregando…</div>;
  }

  return (
    <AppContext.Provider value={value}>
      <Nav />
      {loadError && (
        <div className="page">
          <div className="empty-state">
            Não foi possível carregar os dados do Supabase: {loadError}
          </div>
        </div>
      )}
      {!loadError && (
        <>
          {screen === "dashboard" && role === "dono" && <DashboardScreen />}
          {screen === "vendas" && <VendasScreen />}
          {screen === "produtos" && role === "dono" && <ProdutosScreen />}
          {screen === "clientes" && <ClientesScreen />}
          {screen === "fiado" && <FiadoScreen />}
          {screen === "caixa" && role === "dono" && <CaixaScreen />}
        </>
      )}

      {confirmState && (
        <ConfirmDialog
          message={confirmState.message}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => {
            const fn = confirmState.onConfirm;
            setConfirmState(null);
            fn();
          }}
        />
      )}
      {alertMessage && (
        <AlertDialog message={alertMessage} onClose={() => setAlertMessage(null)} />
      )}
    </AppContext.Provider>
  );
}
