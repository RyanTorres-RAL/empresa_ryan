"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import { Product, formatBRL } from "@/lib/types";

export default function ProdutosScreen() {
  const { data, deleteProduct, confirm } = useApp();
  const [search, setSearch] = useState("");
  const [dialogProduct, setDialogProduct] = useState<Product | "new" | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data.products;
    return data.products.filter((p) => p.name.toLowerCase().includes(q));
  }, [data.products, search]);

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
    </div>
  );
}

function ProductDialog({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { saveProduct, confirm } = useApp();
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState<"Açaí" | "Sorvete">(product?.category ?? "Açaí");
  const [size, setSize] = useState(product?.size ?? "");
  const [price, setPrice] = useState(String(product?.price ?? ""));
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

  function handleSave() {
    const ok = saveProduct({
      id: product?.id,
      name,
      category,
      size,
      price: Number(price) || 0,
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
