"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import { Client, formatBRL, slugify } from "@/lib/types";

type SortKey = "name" | "totalPurchases" | "totalSpent" | "totalDebt" | "status" | "stamps";

export default function ClientesScreen() {
  const { data, addClient } = useApp();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [detailClient, setDetailClient] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? data.clients.filter((c) => c.name.toLowerCase().includes(q)) : data.clients;
  }, [data.clients, search]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      let av: string | number;
      let bv: string | number;
      switch (sortKey) {
        case "name":
          av = a.name.toLowerCase();
          bv = b.name.toLowerCase();
          break;
        case "totalPurchases":
          av = a.totalPurchases;
          bv = b.totalPurchases;
          break;
        case "totalSpent":
          av = a.totalSpent;
          bv = b.totalSpent;
          break;
        case "totalDebt":
          av = a.totalDebt;
          bv = b.totalDebt;
          break;
        case "status":
          av = a.status;
          bv = b.status;
          break;
        case "stamps":
          av = a.fidelityStamps % 10;
          bv = b.fidelityStamps % 10;
          break;
      }
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 1 ? -1 : 1));
    } else {
      setSortKey(key);
      setSortDir(1);
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === 1 ? " ▲" : " ▼";
  }

  // find latest client reference (in case data updated while dialog is open)
  const liveDetailClient = detailClient
    ? data.clients.find((c) => c.id === detailClient.id) ?? detailClient
    : null;

  return (
    <div className="page">
      <div className="page-title-row page-header">
        <h1>Clientes</h1>
        <button className="btn btn-primary" onClick={() => setNewDialogOpen(true)}>
          + Novo cliente
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

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="sortable" onClick={() => toggleSort("name")}>
                Nome{sortIndicator("name")}
              </th>
              <th className="sortable" onClick={() => toggleSort("totalPurchases")}>
                Compras{sortIndicator("totalPurchases")}
              </th>
              <th className="sortable" onClick={() => toggleSort("totalSpent")}>
                Total gasto{sortIndicator("totalSpent")}
              </th>
              <th className="sortable" onClick={() => toggleSort("totalDebt")}>
                Dívida{sortIndicator("totalDebt")}
              </th>
              <th className="sortable" onClick={() => toggleSort("status")}>
                Status{sortIndicator("status")}
              </th>
              <th className="sortable" onClick={() => toggleSort("stamps")}>
                Selos{sortIndicator("stamps")}
              </th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.totalPurchases}</td>
                <td>{formatBRL(c.totalSpent)}</td>
                <td>{formatBRL(c.totalDebt)}</td>
                <td>
                  <span className={`tag ${c.status === "Devedor" ? "tag-accent" : "tag-neutral"}`}>
                    {c.status}
                  </span>
                </td>
                <td>{c.fidelityStamps % 10}/10</td>
                <td>
                  <button className="btn btn-secondary btn-sm" onClick={() => setDetailClient(c)}>
                    Ver / Cartão
                  </button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={7} className="empty-state">
                  Nenhum cliente encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {newDialogOpen && (
        <NewClientDialog
          onClose={() => setNewDialogOpen(false)}
          onSave={async (name, matricula) => {
            if (await addClient(name, matricula)) setNewDialogOpen(false);
          }}
        />
      )}

      {liveDetailClient && (
        <ClientDetailDialog client={liveDetailClient} onClose={() => setDetailClient(null)} />
      )}
    </div>
  );
}

function NewClientDialog({
  onClose,
  onSave,
}: {
  onClose: () => void;
  onSave: (name: string, matricula: string) => void;
}) {
  const [name, setName] = useState("");
  const [matricula, setMatricula] = useState("");
  return (
    <Dialog onClose={onClose} title="Novo cliente" size="sm">
      <div className="field">
        <label>Nome</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Matrícula / Documento</label>
        <input className="input" value={matricula} onChange={(e) => setMatricula(e.target.value)} />
      </div>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={() => onSave(name, matricula)}>
          Salvar
        </button>
      </div>
    </Dialog>
  );
}

function ClientDetailDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const { data } = useApp();
  const stamps = client.fidelityStamps % 10;
  const sales = data.sales.filter((s) => s.clientId === client.id);

  function handleDownload() {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 400;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.fillStyle = "#f3f2f2";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = "#b68235";
    ctx.lineWidth = 3;
    ctx.strokeRect(12, 12, canvas.width - 24, canvas.height - 24);

    ctx.fillStyle = "#b68235";
    ctx.textAlign = "center";
    ctx.font = "16px Georgia, serif";
    ctx.fillText("CARTÃO FIDELIDADE", canvas.width / 2, 70);

    ctx.fillStyle = "#201f1d";
    ctx.font = "bold 34px Georgia, serif";
    ctx.fillText("Açaí do Ryan", canvas.width / 2, 115);

    ctx.font = "22px Georgia, serif";
    ctx.fillText(client.name, canvas.width / 2, 155);

    const total = stamps;
    const spacing = 28;
    const startX = canvas.width / 2 - (spacing * 9) / 2;
    const y = 210;
    for (let i = 0; i < 10; i++) {
      const x = startX + i * spacing;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.strokeStyle = "#b68235";
      ctx.lineWidth = 2;
      ctx.stroke();
      if (i < total) {
        ctx.fillStyle = "#b68235";
        ctx.fill();
      }
    }

    ctx.fillStyle = "#201f1d";
    ctx.font = "16px Georgia, serif";
    ctx.fillText(`${stamps}/10 compras para o próximo brinde`, canvas.width / 2, 260);
    ctx.fillText(`Total de compras: ${client.totalPurchases}`, canvas.width / 2, 290);

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cartao-fidelidade-${slugify(client.name)}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  return (
    <Dialog onClose={onClose} title={client.name} size="md">
      <div className="card-row" style={{ flexWrap: "wrap", gap: "var(--space-4)" }}>
        <span className="muted">{client.totalPurchases} compras</span>
        <span className="muted">{formatBRL(client.totalSpent)} gastos</span>
        <span className="muted">{formatBRL(client.totalDebt)} dívida</span>
      </div>

      <div className="loyalty-card">
        <span className="card-kicker">Cartão Fidelidade</span>
        <span className="card-title-lg">Açaí do Ryan</span>
        <span>{client.name}</span>
        <div className="stamp-row">
          {Array.from({ length: 10 }).map((_, i) => (
            <span key={i} className={`stamp ${i < stamps ? "filled" : ""}`} />
          ))}
        </div>
        <span className="muted">{stamps}/10 compras para o próximo brinde</span>
      </div>

      <button className="btn btn-secondary btn-block" onClick={handleDownload}>
        Baixar cartão como imagem
      </button>

      <div className="hr" />
      <span className="card-title" style={{ fontSize: 15 }}>
        Histórico de compras
      </span>
      {sales.length === 0 ? (
        <div className="empty-state">Nenhuma compra registrada.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
          {sales.map((s) => (
            <div className="card-row" key={s.id}>
              <span className="muted">
                {s.date} · {s.items.map((i) => i.name).join(", ")}
              </span>
              <span>{formatBRL(s.total)}</span>
            </div>
          ))}
        </div>
      )}
    </Dialog>
  );
}
