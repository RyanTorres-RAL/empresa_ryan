"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import StockBadge from "../StockBadge";
import {
  PAYMENT_DISPLAY,
  PAYMENT_LABELS,
  PaymentMethod,
  Product,
  Sale,
  formatBRL,
  labelToPaymentMethod,
  startOfDay,
} from "@/lib/types";

const PAYMENT_OPTIONS: PaymentMethod[] = ["dinheiro", "pix", "debito", "credito", "va", "fiado"];

function cartTotal(cart: { price: number; quantity: number }[]) {
  return cart.reduce((s, c) => s + c.price * c.quantity, 0);
}
function cartQty(cart: { quantity: number }[]) {
  return cart.reduce((s, c) => s + c.quantity, 0);
}

/** One product the cart is about to push below zero. */
interface StockShortfall {
  name: string;
  have: number;
  selling: number;
  after: number;
}

export default function VendasScreen() {
  const { data, cart, addToCart, updateCartLine, removeCartLine, clearCart, finalizeSale, confirm, alert } = useApp();
  const [fecharOpen, setFecharOpen] = useState(false);
  const [historicoOpen, setHistoricoOpen] = useState(false);

  /**
   * Which products this cart would take below zero, and by how much.
   *
   * Nothing here blocks anything — the sale is always allowed to go through.
   * It exists so the person at the counter is TOLD, in the dialog and again on
   * the confirm, before they finalize.
   */
  const shortfalls = useMemo<StockShortfall[]>(() => {
    const wanted = new Map<string, number>();
    for (const line of cart) {
      wanted.set(line.productId, (wanted.get(line.productId) ?? 0) + line.quantity);
    }
    const out: StockShortfall[] = [];
    for (const [productId, selling] of wanted) {
      const product = data.products.find((p) => p.id === productId);
      if (!product) continue;
      const after = product.stock - selling;
      if (after < 0) out.push({ name: product.name, have: product.stock, selling, after });
    }
    return out;
  }, [cart, data.products]);

  const [clientName, setClientName] = useState("");
  const [method, setMethod] = useState<PaymentMethod | "">("");
  const [fiadoDueDate, setFiadoDueDate] = useState("");
  const [notes, setNotes] = useState("");

  function openFechar() {
    setFecharOpen(true);
  }

  function handleAdicionar(product: Product) {
    addToCart(product);
    openFechar();
  }

  function resetForm() {
    setClientName("");
    setMethod("");
    setFiadoDueDate("");
    setNotes("");
  }

  async function doFinalizar() {
    const due = fiadoDueDate ? new Date(fiadoDueDate + "T00:00:00").getTime() : undefined;
    const ok = await finalizeSale({ cart, clientName, method: method as PaymentMethod, fiadoDueDate: due, notes });
    if (ok) {
      clearCart();
      resetForm();
      setFecharOpen(false);
    }
  }

  async function handleFinalizar() {
    if (cart.length === 0) {
      alert("Adicione itens ao carrinho.");
      return;
    }
    if (!clientName.trim()) {
      alert("Digite o nome do cliente.");
      return;
    }
    if (!method) {
      alert("Escolha a forma de pagamento.");
      return;
    }

    // Low stock never stops a sale — it asks once, in plain words, and takes
    // "Confirmar" for an answer. The count is what is wrong, not the sale.
    if (shortfalls.length > 0) {
      const lines = shortfalls
        .map((s) => `• ${s.name}: tem ${s.have}, vendendo ${s.selling} → fica ${s.after}`)
        .join("\n");
      confirm(
        `Esta venda deixa o estoque negativo:\n\n${lines}\n\nA venda vai ser registrada normalmente. Depois é só conferir esses produtos e acertar a quantidade na aba Produtos.`,
        () => void doFinalizar()
      );
      return;
    }

    await doFinalizar();
  }

  return (
    <div className="page">
      <div className="page-title-row page-header">
        <div>
          <h1>Nova Venda</h1>
        </div>
        <button className="btn btn-secondary" onClick={() => setHistoricoOpen(true)}>
          Histórico de vendas
        </button>
      </div>

      <div className="grid grid-products">
        {data.products.map((p) => (
          <div className="card" key={p.id}>
            <span className={`tag tag-outline`} style={{ alignSelf: "flex-start" }}>
              {p.category}
            </span>
            <span className="card-title">{p.name}</span>
            <span className="muted">{formatBRL(p.price)}</span>
            {/* The quantity sits IN the card, where the eye already is when
                deciding whether to sell this one — not in a floating panel
                fighting the cart button for the bottom-right corner. */}
            <div className="stock-row">
              <StockBadge stock={p.stock} />
            </div>
            <div className="card-actions">
              <button className="btn btn-primary btn-block" onClick={() => handleAdicionar(p)}>
                Adicionar
              </button>
            </div>
          </div>
        ))}
      </div>

      {!fecharOpen && cart.length > 0 && (
        <button className="btn btn-primary fab" onClick={openFechar}>
          Carrinho · {cartQty(cart)} · {formatBRL(cartTotal(cart))}
        </button>
      )}

      {fecharOpen && (
        <Dialog onClose={() => setFecharOpen(false)} title="Fechar Venda" size="lg">
          {cart.length === 0 ? (
            <div className="empty-state">O carrinho está vazio.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
              {cart.map((line) => (
                <div className="card" key={line.cartId}>
                  <div className="card-row">
                    <span className="card-title">{line.name}</span>
                    <span>{formatBRL(line.price * line.quantity)}</span>
                  </div>
                  <div className="cart-line-controls">
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Qtd.</label>
                      <input
                        className="input"
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          updateCartLine(line.cartId, {
                            quantity: Math.max(1, Number(e.target.value) || 1),
                          })
                        }
                      />
                    </div>
                    <div className="field" style={{ marginBottom: 0 }}>
                      <label>Preço unit.</label>
                      <input
                        className="input"
                        type="number"
                        step={0.5}
                        value={line.price}
                        onChange={(e) =>
                          updateCartLine(line.cartId, { price: Number(e.target.value) || 0 })
                        }
                      />
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() =>
                        confirm(`Remover "${line.name}" do carrinho?`, () => removeCartLine(line.cartId))
                      }
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="hr" />
          <div className="card-row">
            <span className="card-title-lg">Total</span>
            <span className="stat-value">{formatBRL(cartTotal(cart))}</span>
          </div>
          <div className="hr" />

          <div className="field">
            <label>Cliente</label>
            <input
              className="input"
              list="client-names"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do cliente"
            />
            <datalist id="client-names">
              {data.clients.map((c) => (
                <option key={c.id} value={c.name} />
              ))}
            </datalist>
          </div>

          <div className="field">
            <label>Forma de pagamento</label>
            <select
              className="input"
              value={method}
              onChange={(e) => setMethod(e.target.value as PaymentMethod)}
            >
              <option value="">Selecione…</option>
              {PAYMENT_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABELS[m]}
                </option>
              ))}
            </select>
          </div>

          {method === "fiado" && (
            <div className="field">
              <label>Vencimento</label>
              <input
                className="input"
                type="date"
                value={fiadoDueDate}
                onChange={(e) => setFiadoDueDate(e.target.value)}
              />
            </div>
          )}

          <div className="field">
            <label>Observações</label>
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Opcional"
            />
          </div>

          {/* Shown before the button is pressed, not only on the confirm, so
              the person can still change the quantity while they are here. */}
          {shortfalls.length > 0 && (
            <div className="stock-warning" role="status">
              <span className="stock-warning-title">Atenção ao estoque</span>
              <ul className="stock-warning-list">
                {shortfalls.map((s) => (
                  <li key={s.name}>
                    <strong>{s.name}</strong>: tem {s.have}, vendendo {s.selling} → fica{" "}
                    <span className="num stock-warning-after">{s.after}</span>
                  </li>
                ))}
              </ul>
              <span className="stock-warning-note">
                Pode vender assim mesmo. Depois é só recontar esses produtos na aba Produtos.
              </span>
            </div>
          )}

          <div className="dialog-actions">
            <button className="btn btn-secondary" onClick={() => setFecharOpen(false)}>
              Continuar comprando
            </button>
            <button className="btn btn-primary" onClick={handleFinalizar}>
              Finalizar Venda
            </button>
          </div>
        </Dialog>
      )}

      {historicoOpen && <HistoricoDialog onClose={() => setHistoricoOpen(false)} />}
    </div>
  );
}

type FiltroHistorico = "hoje" | "2dias" | "personalizado";

function HistoricoDialog({ onClose }: { onClose: () => void }) {
  const { data, deleteSale, confirm } = useApp();
  const [filtro, setFiltro] = useState<FiltroHistorico>("hoje");
  const [de, setDe] = useState("");
  const [ate, setAte] = useState("");
  const [editingSale, setEditingSale] = useState<Sale | null>(null);

  const filtered = useMemo(() => {
    const now = new Date();
    let min: number | null = null;
    let max: number | null = null;

    if (filtro === "hoje") {
      min = startOfDay(now).getTime();
    } else if (filtro === "2dias") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      min = startOfDay(yesterday).getTime();
    } else {
      if (de) min = new Date(de + "T00:00:00").getTime();
      if (ate) max = new Date(ate + "T23:59:59").getTime();
    }

    return data.sales.filter((s) => {
      if (min !== null && s.createdAt < min) return false;
      if (max !== null && s.createdAt > max) return false;
      return true;
    });
  }, [data.sales, filtro, de, ate]);

  return (
    <Dialog onClose={onClose} title="Histórico de vendas" size="lg">
      <div className="field">
        <label>Período</label>
        <select className="input" value={filtro} onChange={(e) => setFiltro(e.target.value as FiltroHistorico)}>
          <option value="hoje">Hoje</option>
          <option value="2dias">Últimos 2 dias</option>
          <option value="personalizado">Personalizado</option>
        </select>
      </div>

      {filtro === "personalizado" && (
        <div className="field-row">
          <div className="field">
            <label>De</label>
            <input className="input" type="date" value={de} onChange={(e) => setDe(e.target.value)} />
          </div>
          <div className="field">
            <label>Até</label>
            <input className="input" type="date" value={ate} onChange={(e) => setAte(e.target.value)} />
          </div>
        </div>
      )}

      <div className="hr" />

      {filtered.length === 0 ? (
        <div className="empty-state">Nenhuma venda no período.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {filtered.map((sale) => (
            <div className="card" key={sale.id}>
              <div className="card-row">
                <span className="muted" style={{ fontSize: 12 }}>
                  {sale.date} · {sale.mainPaymentMethod}
                </span>
                <span className="stat-value" style={{ fontSize: 16 }}>
                  {formatBRL(sale.total)}
                </span>
              </div>
              <span className="card-title">{sale.clientName}</span>
              <span className="muted">{sale.items.map((i) => i.name).join(", ")}</span>
              {sale.notes && <span className="muted">{sale.notes}</span>}
              <div className="card-actions">
                <button className="btn btn-secondary btn-sm" onClick={() => setEditingSale(sale)}>
                  Editar
                </button>
                <button
                  className="btn btn-danger btn-sm"
                  onClick={() =>
                    confirm("Excluir esta venda?", () => deleteSale(sale.id))
                  }
                >
                  Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editingSale && <EditSaleDialog sale={editingSale} onClose={() => setEditingSale(null)} />}
    </Dialog>
  );
}

function EditSaleDialog({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const { editSale, alert } = useApp();
  const [total, setTotal] = useState(String(sale.total));
  const [method, setMethod] = useState<PaymentMethod>(
    labelToPaymentMethod(sale.mainPaymentMethod) ?? "dinheiro"
  );
  const [notes, setNotes] = useState(sale.notes);

  async function handleSave() {
    const value = Number(total);
    if (!(value > 0)) {
      alert("Digite um valor válido.");
      return;
    }
    await editSale({ saleId: sale.id, total: value, method, notes });
    onClose();
  }

  return (
    <Dialog onClose={onClose} title="Editar venda" size="sm">
      <div className="field">
        <label>Valor total</label>
        <input className="input" type="number" step={0.5} value={total} onChange={(e) => setTotal(e.target.value)} />
      </div>
      <div className="field">
        <label>Forma de pagamento</label>
        <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
          {PAYMENT_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>Observações</label>
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={handleSave}>
          Salvar
        </button>
      </div>
    </Dialog>
  );
}
