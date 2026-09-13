"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/context";
import { Dialog } from "../Dialogs";
import { Client, formatBRL } from "@/lib/types";
import {
  CARD_H,
  CARD_W,
  downloadBlob,
  drawLoyaltyCard,
  loyaltyFileName,
  renderLoyaltyCardBlob,
  shareLoyaltyCard,
} from "@/lib/loyalty-card";

type SortKey = "name" | "totalPurchases" | "totalSpent" | "totalDebt" | "status" | "stamps";

export default function ClientesScreen() {
  const { data, addClient, deleteClient, confirm, profile } = useApp();
  const isOwner = profile.role === "dono";
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
                  <span className={`tag ${c.status === "Devedor" ? "tag-warn" : "tag-good"}`}>
                    {c.status}
                  </span>
                </td>
                <td>{c.fidelityStamps % 10}/10</td>
                <td>
                  <div className="row-actions">
                    <button className="btn btn-secondary btn-sm" onClick={() => setDetailClient(c)}>
                      Ver / Cartão
                    </button>
                    {isOwner && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() =>
                          confirm(
                            c.totalPurchases > 0
                              ? `Excluir ${c.name}? As ${c.totalPurchases} compras continuam no histórico e no caixa, mas deixam de ficar ligadas a este cliente.`
                              : `Excluir ${c.name}?`,
                            () => void deleteClient(c.id)
                          )
                        }
                      >
                        Excluir
                      </button>
                    )}
                  </div>
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
  const { data, alert } = useApp();
  const stamps = client.fidelityStamps % 10;
  const sales = data.sales.filter((s) => s.clientId === client.id);

  const [busy, setBusy] = useState<null | "download" | "share">(null);
  const [shareHint, setShareHint] = useState<string | null>(null);
  const [waUrl, setWaUrl] = useState<string | null>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);

  const cardData = { name: client.name, stamps };

  useEffect(() => {
    if (previewRef.current) void drawLoyaltyCard(previewRef.current, { name: client.name, stamps });
  }, [client.name, stamps]);

  async function handleDownload() {
    setBusy("download");
    setShareHint(null);
    setWaUrl(null);
    try {
      const blob = await renderLoyaltyCardBlob(cardData);
      if (!blob) {
        alert("Não foi possível gerar a imagem do cartão.");
        return;
      }
      downloadBlob(blob, loyaltyFileName(client.name));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Called straight from the click — navigator.share() needs the user
   * gesture, and so does the window.open() in the desktop fallback.
   */
  async function handleShare() {
    setBusy("share");
    setShareHint(null);
    setWaUrl(null);
    try {
      const outcome = await shareLoyaltyCard(cardData);
      if (outcome.kind === "fallback") {
        setWaUrl(outcome.popupBlocked ? outcome.waUrl : null);
        setShareHint(
          outcome.popupBlocked
            ? "A imagem foi baixada. O navegador bloqueou a aba do WhatsApp — use o link abaixo e anexe a imagem à conversa."
            : "A imagem foi baixada e o WhatsApp abriu em outra aba. Escolha a conversa e anexe a imagem que acabou de baixar."
        );
      } else if (outcome.kind === "error") {
        alert(outcome.message);
      }
      // "shared" and "cancelled" need no message at all.
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog onClose={onClose} title={client.name} size="md">
      <div className="card-row" style={{ flexWrap: "wrap", gap: "var(--space-4)" }}>
        <span className="muted">{client.totalPurchases} compras</span>
        <span className="muted">{formatBRL(client.totalSpent)} gastos</span>
        <span className="muted">{formatBRL(client.totalDebt)} dívida</span>
      </div>

      {/* The preview IS the shared image — same draw call, so what the owner
          sees here is byte-for-byte what the customer receives. A separate
          CSS mock-up of the card would drift from it. */}
      <canvas
        ref={previewRef}
        aria-label={`Cartão fidelidade de ${client.name}: ${stamps} de 10 selos`}
        style={{
          display: "block",
          width: "100%",
          height: "auto",
          aspectRatio: `${CARD_W} / ${CARD_H}`,
          borderRadius: "var(--radius-lg)",
        }}
      />

      <div className="card-actions" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <button className="btn btn-secondary" onClick={handleDownload} disabled={busy !== null}>
          {busy === "download" ? "Gerando…" : "Baixar imagem"}
        </button>
        <button className="btn btn-accent" onClick={handleShare} disabled={busy !== null}>
          {busy === "share" ? "Preparando…" : "Enviar no WhatsApp"}
        </button>
      </div>

      {shareHint && (
        <div className="share-hint">
          {shareHint}
          {waUrl && (
            <>
              {" "}
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                Abrir WhatsApp
              </a>
            </>
          )}
        </div>
      )}

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
