"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { loadData, saveData } from "@/lib/storage";
import {
  AppContext,
  AppContextValue,
  EditSaleInput,
  FinalizeSaleInput,
  Screen,
  findClientByNameCI,
  findFiadoBySaleId,
} from "@/lib/context";
import {
  AppData,
  CartItem,
  CashOut,
  Client,
  Fiado,
  PAYMENT_DISPLAY,
  Product,
  Role,
  Sale,
  SaleItem,
  Theme,
  emptyBreakdown,
  formatDateBR,
  formatMonthBR,
  labelToPaymentMethod,
} from "@/lib/types";
import { seedData } from "@/lib/storage";
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

export default function App() {
  const [data, setData] = useState<AppData>(() => seedData());
  const [loaded, setLoaded] = useState(false);
  const [role, setRoleState] = useState<Role>("dono");
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [confirmState, setConfirmState] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const [alertMessage, setAlertMessage] = useState<string | null>(null);

  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    setData(loadData());
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", data.theme);
    }
  }, [data.theme]);

  function commit(next: AppData) {
    setData(next);
    saveData(next);
  }

  function setRole(r: Role) {
    setRoleState(r);
    if (r === "funcionario" && OWNER_SCREENS.includes(screen)) {
      setScreen("vendas");
    }
  }

  function toggleTheme() {
    const next: Theme = dataRef.current.theme === "dark" ? "light" : "dark";
    commit({ ...dataRef.current, theme: next });
  }

  function alertFn(message: string) {
    setAlertMessage(message);
  }

  function confirmFn(message: string, onConfirm: () => void) {
    setConfirmState({ message, onConfirm });
  }

  // ---------- Cart ----------
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
  function finalizeSale(input: FinalizeSaleInput): boolean {
    const { cart: cartItems, clientName, method, fiadoDueDate, notes } = input;

    if (cartItems.length === 0) {
      alertFn("Adicione itens ao carrinho.");
      return false;
    }
    if (!clientName.trim()) {
      alertFn("Digite o nome do cliente.");
      return false;
    }
    if (!method) {
      alertFn("Escolha a forma de pagamento.");
      return false;
    }

    const d = dataRef.current;
    const now = new Date();
    const nowMs = Date.now();

    let client = findClientByNameCI(d.clients, clientName);
    let clients = d.clients;
    if (!client) {
      client = {
        id: uid("client"),
        name: clientName.trim(),
        matricula: "",
        totalPurchases: 0,
        totalSpent: 0,
        totalDebt: 0,
        status: "Adimplente",
        fidelityStamps: 0,
        fidelityRewardsClaimed: 0,
        createdAt: nowMs,
        lastPurchaseDate: "",
      };
      clients = [...clients, client];
    }

    const saleItems: SaleItem[] = cartItems.map((c) => ({
      id: uid("item"),
      name: c.name,
      unitPrice: c.price,
      quantity: c.quantity,
      total: c.price * c.quantity,
    }));
    const total = saleItems.reduce((s, i) => s + i.total, 0);
    const breakdown = emptyBreakdown();
    breakdown[method] = total;

    const sale: Sale = {
      id: uid("sale"),
      date: formatDateBR(now),
      month: formatMonthBR(now),
      clientName: client.name,
      clientId: client.id,
      items: saleItems,
      quantity: saleItems.length,
      total,
      paymentBreakdown: breakdown,
      mainPaymentMethod: PAYMENT_DISPLAY[method],
      status: method === "fiado" ? "Pendente" : "Pago",
      notes: notes.trim(),
      createdAt: nowMs,
    };

    const updatedClient: Client = {
      ...client,
      totalPurchases: client.totalPurchases + 1,
      totalSpent: client.totalSpent + total,
      fidelityStamps: client.fidelityStamps + 1,
      lastPurchaseDate: sale.date,
      totalDebt: method === "fiado" ? client.totalDebt + total : client.totalDebt,
      status: method === "fiado" ? "Devedor" : client.status,
    };

    clients = clients.map((c) => (c.id === updatedClient.id ? updatedClient : c));

    let fiados = d.fiados;
    if (method === "fiado") {
      const due = fiadoDueDate ?? nowMs + 7 * 24 * 60 * 60 * 1000;
      const fiado: Fiado = {
        id: uid("fiado"),
        clientId: updatedClient.id,
        clientName: updatedClient.name,
        saleId: sale.id,
        amount: total,
        amountPaid: 0,
        dueDate: due,
        paid: false,
        createdAt: nowMs,
      };
      fiados = [...fiados, fiado];
    }

    commit({ ...d, sales: [sale, ...d.sales], clients, fiados });
    return true;
  }

  function editSale(input: EditSaleInput) {
    const d = dataRef.current;
    const sale = d.sales.find((s) => s.id === input.saleId);
    if (!sale) return;

    const oldTotal = sale.total;
    const oldMethod = labelToPaymentMethod(sale.mainPaymentMethod);
    const newTotal = input.total;
    const newMethod = input.method;

    const breakdown = emptyBreakdown();
    breakdown[newMethod] = newTotal;

    const updatedSale: Sale = {
      ...sale,
      total: newTotal,
      paymentBreakdown: breakdown,
      mainPaymentMethod: PAYMENT_DISPLAY[newMethod],
      notes: input.notes,
      status: newMethod === "fiado" ? "Pendente" : "Pago",
    };

    let clients = d.clients;
    let fiados = d.fiados;
    const client = sale.clientId ? clients.find((c) => c.id === sale.clientId) : undefined;

    if (client) {
      let totalSpent = client.totalSpent + (newTotal - oldTotal);
      let totalDebt = client.totalDebt;
      let status = client.status;

      const wasFiado = oldMethod === "fiado";
      const isFiado = newMethod === "fiado";
      const existingFiado = findFiadoBySaleId(d.fiados, sale.id);

      if (wasFiado && !isFiado) {
        if (existingFiado) {
          const remaining = existingFiado.amount - existingFiado.amountPaid;
          totalDebt = Math.max(0, totalDebt - remaining);
          fiados = fiados.filter((f) => f.id !== existingFiado.id);
        }
        if (totalDebt <= 0) {
          totalDebt = 0;
          status = "Adimplente";
        }
      } else if (!wasFiado && isFiado) {
        const newFiado: Fiado = {
          id: uid("fiado"),
          clientId: client.id,
          clientName: client.name,
          saleId: sale.id,
          amount: newTotal,
          amountPaid: 0,
          dueDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
          paid: false,
          createdAt: Date.now(),
        };
        fiados = [...fiados, newFiado];
        totalDebt = totalDebt + newTotal;
        status = "Devedor";
      } else if (wasFiado && isFiado) {
        const delta = newTotal - oldTotal;
        if (existingFiado) {
          fiados = fiados.map((f) =>
            f.id === existingFiado.id ? { ...f, amount: f.amount + delta } : f
          );
        }
        totalDebt = Math.max(0, totalDebt + delta);
        status = totalDebt <= 0 ? "Adimplente" : "Devedor";
      }

      const updatedClient: Client = { ...client, totalSpent, totalDebt, status };
      clients = clients.map((c) => (c.id === updatedClient.id ? updatedClient : c));
    }

    const sales = d.sales.map((s) => (s.id === sale.id ? updatedSale : s));
    commit({ ...d, sales, clients, fiados });
  }

  function deleteSale(saleId: string) {
    const d = dataRef.current;
    const sale = d.sales.find((s) => s.id === saleId);
    if (!sale) return;

    let clients = d.clients;
    let fiados = d.fiados;
    const client = sale.clientId ? clients.find((c) => c.id === sale.clientId) : undefined;

    if (client) {
      let totalPurchases = Math.max(0, client.totalPurchases - 1);
      let totalSpent = Math.max(0, client.totalSpent - sale.total);
      let fidelityStamps = Math.max(0, client.fidelityStamps - 1);
      let totalDebt = client.totalDebt;
      let status = client.status;

      const existingFiado = findFiadoBySaleId(d.fiados, sale.id);
      if (existingFiado) {
        const remaining = existingFiado.amount - existingFiado.amountPaid;
        totalDebt = Math.max(0, totalDebt - remaining);
        fiados = fiados.filter((f) => f.id !== existingFiado.id);
        status = totalDebt <= 0 ? "Adimplente" : "Devedor";
      }

      const updatedClient: Client = { ...client, totalPurchases, totalSpent, fidelityStamps, totalDebt, status };
      clients = clients.map((c) => (c.id === updatedClient.id ? updatedClient : c));
    }

    const sales = d.sales.filter((s) => s.id !== saleId);
    commit({ ...d, sales, clients, fiados });
  }

  // ---------- Products ----------
  function saveProduct(product: Omit<Product, "id"> & { id?: string }): boolean {
    if (!product.name.trim()) {
      alertFn("Digite o nome do produto.");
      return false;
    }
    const d = dataRef.current;
    if (product.id) {
      const products = d.products.map((p) =>
        p.id === product.id ? { ...p, ...product, id: product.id! } : p
      );
      commit({ ...d, products });
    } else {
      const newProduct: Product = { ...product, id: uid("prod") };
      commit({ ...d, products: [...d.products, newProduct] });
    }
    return true;
  }

  function deleteProduct(id: string) {
    const d = dataRef.current;
    commit({ ...d, products: d.products.filter((p) => p.id !== id) });
  }

  // ---------- Clients ----------
  function addClient(name: string, matricula: string): boolean {
    if (!name.trim()) {
      alertFn("Digite o nome do cliente.");
      return false;
    }
    const d = dataRef.current;
    const newClient: Client = {
      id: uid("client"),
      name: name.trim(),
      matricula: matricula.trim(),
      totalPurchases: 0,
      totalSpent: 0,
      totalDebt: 0,
      status: "Adimplente",
      fidelityStamps: 0,
      fidelityRewardsClaimed: 0,
      createdAt: Date.now(),
      lastPurchaseDate: "",
    };
    commit({ ...d, clients: [...d.clients, newClient] });
    return true;
  }

  // ---------- Fiado ----------
  function registerFiadoPayment(fiadoId: string, amount: number, method: import("@/lib/types").PaymentMethod): boolean {
    if (!(amount > 0)) {
      alertFn("Digite um valor válido.");
      return false;
    }
    const d = dataRef.current;
    const fiado = d.fiados.find((f) => f.id === fiadoId);
    if (!fiado) return false;

    const amountPaid = fiado.amountPaid + amount;
    const remaining = fiado.amount - amountPaid;
    const paid = remaining <= 0.009;
    const updatedFiado: Fiado = {
      ...fiado,
      amountPaid,
      paid,
      paidAt: paid ? Date.now() : fiado.paidAt,
    };
    const fiados = d.fiados.map((f) => (f.id === fiadoId ? updatedFiado : f));

    let clients = d.clients;
    if (fiado.clientId) {
      const client = clients.find((c) => c.id === fiado.clientId);
      if (client) {
        const totalDebt = Math.max(0, client.totalDebt - amount);
        const status = totalDebt <= 0 ? "Adimplente" : "Devedor";
        clients = clients.map((c) => (c.id === client.id ? { ...c, totalDebt, status } : c));
      }
    }

    const payment = {
      id: uid("fiadopay"),
      fiadoId,
      clientId: fiado.clientId,
      clientName: fiado.clientName,
      amount,
      method,
      date: formatDateBR(new Date()),
      createdAt: Date.now(),
    };

    commit({ ...d, fiados, clients, fiadoPayments: [...d.fiadoPayments, payment] });
    return true;
  }

  // ---------- Caixa ----------
  function saveCashOut(cashOut: Omit<CashOut, "id"> & { id?: string }): boolean {
    if (!cashOut.description.trim()) {
      alertFn("Digite uma descrição.");
      return false;
    }
    if (!(cashOut.amount > 0)) {
      alertFn("Digite um valor válido.");
      return false;
    }
    const d = dataRef.current;
    if (cashOut.id) {
      const cashOuts = d.cashOuts.map((c) =>
        c.id === cashOut.id ? { ...c, ...cashOut, id: cashOut.id! } : c
      );
      commit({ ...d, cashOuts });
    } else {
      const newCashOut: CashOut = { ...cashOut, id: uid("cashout") };
      commit({ ...d, cashOuts: [...d.cashOuts, newCashOut] });
    }
    return true;
  }

  function deleteCashOut(id: string) {
    const d = dataRef.current;
    commit({ ...d, cashOuts: d.cashOuts.filter((c) => c.id !== id) });
  }

  const value: AppContextValue = useMemo(
    () => ({
      data,
      role,
      setRole,
      screen,
      setScreen,
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
    [data, role, screen, cart]
  );

  if (!loaded) {
    return <div className="page">Carregando…</div>;
  }

  return (
    <AppContext.Provider value={value}>
      <Nav />
      {screen === "dashboard" && role === "dono" && <DashboardScreen />}
      {screen === "vendas" && <VendasScreen />}
      {screen === "produtos" && role === "dono" && <ProdutosScreen />}
      {screen === "clientes" && <ClientesScreen />}
      {screen === "fiado" && <FiadoScreen />}
      {screen === "caixa" && role === "dono" && <CaixaScreen />}

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
