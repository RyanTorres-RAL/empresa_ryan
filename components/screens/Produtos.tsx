"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import StockBadge from "../StockBadge";
import { Product, formatBRL } from "@/lib/types";

export default function ProdutosScreen() {
  const { data, deleteProduct, adjustProductStock, confirm } = useApp();
  const [search, setSearch] = useState("");
  const [dialogProduct, setDialogProduct] = useState<Product | "new" | null>(null);
  const [stockProduct, setStockProduct] = useState<Product | null>(null);
  /** Which card is mid-write, so the ± buttons cannot be double-tapped. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.products;
    return data.products.filter((p) => p.name.toLowerCase().includes(q));
  }, [data.products, search]);

  // The dialog must follow the data: after a ±1 the products array is replaced,
  // so a captured object would show a stale count behind the open dialog.
  const liveStockProduct = stockProduct
    ? data.products.find((p) => p.id === stockProduct.id) ?? null
    : null;

  async function quickAdjust(product: Product, delta: number) {
    setBusyId(product.id);
    try {
      await adjustProductStock(product.id, delta);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="page">
      <div className="page-title-row page-header">
        <h1>Produtos</h1>
        <button className="btn btn-primary" onClick={() => setDialogProduct("new")}>
          + Novo produto
        </button>
      </div>

      <div className="field" style={{ maxWidth: 320 }}>
        <input
          className="input"
          placeholder="Buscar por nome…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="grid grid-products">
        {filtered.map((p) => (
          <div className="card" key={p.id}>
            <span className="tag tag-outline" style={{ alignSelf: "flex-start" }}>
              {p.category}
            </span>
            <span className="card-title">{p.name}</span>
            <span className="muted">
              {p.size} · {formatBRL(p.price)}
            </span>
            {p.complements.length > 0 && (
              <span className="muted" style={{ fontSize: 13 }}>
                Complementos: {p.complements.join(", ")}
              </span>
            )}

            {/* Stock, with the two fastest corrections one tap away. Anything
                bigger than a unit goes through the Estoque dialog. */}
            <div className="stock-row">
              <StockBadge stock={p.stock} />
              <div className="stock-controls">
                <button
                  className="btn btn-secondary btn-sm stock-step"
                  onClick={() => void quickAdjust(p, -1)}
                  disabled={busyId === p.id}
                  aria-label={`Tirar 1 do estoque de ${p.name}`}
                >
                  −1
                </button>
                <button
                  className="btn btn-secondary btn-sm stock-step"
                  onClick={() => void quickAdjust(p, 1)}
                  disabled={busyId === p.id}
                  aria-label={`Somar 1 ao estoque de ${p.name}`}
                >
                  +1
                </button>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setStockProduct(p)}
                  disabled={busyId === p.id}
                >
                  Estoque
                </button>
              </div>
            </div>

            <div className="card-actions">
              <button className="btn btn-secondary btn-sm" onClick={() => setDialogProduct(p)}>
                Editar
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={() =>
                  confirm(`Excluir o produto "${p.name}"?`, () => deleteProduct(p.id))
                }
              >
                Excluir
              </button>
            </div>
          </div>
        ))}
      </div>

      {dialogProduct && (
        <ProductDialog
          product={dialogProduct === "new" ? null : dialogProduct}
          onClose={() => setDialogProduct(null)}
        />
      )}

      {liveStockProduct && (
        <StockDialog product={liveStockProduct} onClose={() => setStockProduct(null)} />
      )}
    </div>
  );
}

/**
 * Bulk stock correction: a quantity plus a direction, with the resulting count
 * spelled out before anything is written. Deliberately not a "set the total to
 * N" field — the owner counts what changed ("fiz mais 10", "quebrei 2"), and a
 * signed adjustment cannot silently wipe out a sale that landed meanwhile.
 */
function StockDialog({ product, onClose }: { product: Product; onClose: () => void }) {
  const { adjustProductStock, alert } = useApp();
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [qty, setQty] = useState("1");
  const [busy, setBusy] = useState(false);

  const amount = Math.trunc(Math.abs(Number(qty))) || 0;
  const delta = direction === "add" ? amount : -amount;
  const next = product.stock + delta;

  async function handleSave() {
    if (amount <= 0) {
      alert("Digite uma quantidade maior que zero.");
      return;
    }
    setBusy(true);
    try {
      if (await adjustProductStock(product.id, delta)) onClose();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog onClose={onClose} title={`Estoque · ${product.name}`} size="sm">
      <div className="card-row">
        <span className="muted">Agora</span>
        <StockBadge stock={product.stock} />
      </div>

      <div className="hr" />

      <div className="field">
        <label>O que aconteceu?</label>
        <div className="filter-chips">
          <button
            className={`filter-chip ${direction === "add" ? "filter-chip-active" : ""}`}
            onClick={() => setDirection("add")}
          >
            Entrou (fiz mais)
          </button>
          <button
            className={`filter-chip ${direction === "remove" ? "filter-chip-active" : ""}`}
            onClick={() => setDirection("remove")}
          >
            Saiu (quebrei / perdi)
          </button>
        </div>
      </div>

      <div className="field">
        <label>Quantidade</label>
        <input
          className="input"
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
        />
        <div className="filter-chips" style={{ marginTop: "var(--space-2)" }}>
          {[1, 2, 5, 10, 20].map((n) => (
            <button
              key={n}
              className={`filter-chip ${amount === n ? "filter-chip-active" : ""}`}
              onClick={() => setQty(String(n))}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Say the outcome in advance, in the same badge the card will show. */}
      <div className="card-row stock-preview">
        <span className="muted">Vai ficar</span>
        <StockBadge stock={next} />
      </div>
      {next < 0 && (
        <div className="share-hint">
          Isso deixa o estoque negativo. Pode salvar assim mesmo — o número fica marcado em
          vermelho para você recontar depois.
        </div>
      )}

      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={busy}>
          {busy ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </Dialog>
  );
}

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { saveProduct, confirm } = useApp();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState<"Açaí" | "Sorvete">(product?.category ?? "Açaí");
  const [size, setSize] = useState(product?.size ?? "");
  const [price, setPrice] = useState(String(product?.price ?? ""));
  const [stock, setStock] = useState(String(product?.stock ?? 0));
  const [complements, setComplements] = useState<string[]>(product?.complements ?? []);
  const [newComplement, setNewComplement] = useState("");

  function handleAddComplement() {
    const v = newComplement.trim();
    if (!v) return;
    setComplements((prev) => [...prev, v]);
    setNewComplement("");
  }

  function handleRemoveComplement(idx: number) {
    confirm(`Remover o complemento "${complements[idx]}"?`, () => {
      setComplements((prev) => prev.filter((_, i) => i !== idx));
    });
  }

  async function handleSave() {
    const ok = await saveProduct({
      id: product?.id,
      name,
      category,
      size,
      price: Number(price) || 0,
      // On an edit the server ignores this and keeps the live count — see the
      // comment in saveProduct. Sent anyway so the shape stays honest.
      stock: product ? product.stock : Math.trunc(Number(stock)) || 0,
      complements,
    });
    if (ok) onClose();
  }

  return (
    <Dialog onClose={onClose} title={product ? "Editar produto" : "Novo produto"} size="sm">
      <div className="field">
        <label>Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field-row">
        <div className="field">
          <label>Categoria</label>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value as "Açaí" | "Sorvete")}>
            <option value="Açaí">Açaí</option>
            <option value="Sorvete">Sorvete</option>
          </select>
        </div>
        <div className="field">
          <label>Tamanho</label>
          <input className="input" value={size} onChange={(e) => setSize(e.target.value)} placeholder="Ex: 300ml" />
        </div>
        <div className="field">
          <label>Preço</label>
          <input className="input" type="number" step={0.5} value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
      </div>

      {/* Opening count on create. On edit the count is shown but not editable
          here: it changes with every sale, so a stale value typed into this
          form would roll those sales back. The Estoque button on the card is
          the one place that moves it. */}
      {product ? (
        <div className="field">
          <label>Estoque</label>
          <div className="card-row" style={{ justifyContent: "flex-start", gap: "var(--space-3)" }}>
            <StockBadge stock={product.stock} />
            <span className="muted" style={{ fontSize: 13 }}>
              Use o botão “Estoque” no card para ajustar.
            </span>
          </div>
        </div>
      ) : (
        <div className="field">
          <label>Estoque inicial</label>
          <input
            className="input"
            type="number"
            step={1}
            inputMode="numeric"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
          />
          <span className="field-hint">Quantos você já tem prontos. Pode deixar 0.</span>
        </div>
      )}

      <div className="hr" />
      <span className="card-title" style={{ fontSize: 15 }}>
        Complementos deste produto
      </span>
      <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap", margin: "var(--space-2) 0" }}>
        {complements.length === 0 && <span className="muted">Nenhum complemento.</span>}
        {complements.map((c, idx) => (
          <span key={`${c}-${idx}`} className="tag tag-neutral" style={{ gap: 6 }}>
            {c}
            <button
              onClick={() => handleRemoveComplement(idx)}
              style={{ border: "none", background: "none", cursor: "pointer", color: "inherit", fontWeight: 700, padding: 0 }}
              aria-label={`Remover ${c}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="field-row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Novo complemento</label>
          <input
            className="input"
            value={newComplement}
            onChange={(e) => setNewComplement(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAddComplement();
              }
            }}
          />
        </div>
        <button className="btn btn-secondary" onClick={handleAddComplement}>
          Adicionar
        </button>
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
